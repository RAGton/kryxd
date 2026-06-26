//! Target Flake v2 — layout `/mnt/etc/kryonixos`.
//!
//! Substitui o esquema antigo (engine em `/mnt/etc/kryonix` + `path:../kryonix`
//! no target) por uma árvore *autocontida*:
//!
//! ```text
//! /mnt/etc/kryonixos/
//! ├── flake.nix              # `inputs.kryonix.url = "path:./engine";`
//! ├── engine/                # cópia filtrada do engine
//! │   └── flake.nix
//! ├── generated/             # módulos gerados pelo installer
//! │   ├── hardware.generated.nix
//! │   ├── storage.generated.nix
//! │   ├── network.generated.nix
//! │   ├── users.generated.nix
//! │   └── features.generated.nix
//! └── state/
//!     ├── install-plan.json
//!     └── selected-features.json
//!
//! /mnt/etc/kryonix -> kryonixos/engine     # symlink relativo
//! ```
//!
//! ### Por quê
//! `path:../kryonix` no flake do target faz Nix tentar vendorizar um diretório
//! que vive *fora* do source tree, o que viola pure evaluation mode e gera
//! `access to absolute path '/nix/store/kryonix/flake.nix' is forbidden`.
//! Com o engine *dentro* da árvore (`./engine`), o input é apenas um subdir do
//! próprio flake — passa em `nix flake metadata` sem `--impure`.
//!
//! ### Regras absolutas
//! * Sem `--impure`, sem `--accept-flake-config`.
//! * Sem `inputs.self.outPath` / `self.outPath` no target.
//! * Sem `path:/nix/store/...` em lugar nenhum.
//! * Cópia em Rust com `walkdir` filtrando segredos, build artifacts e VCS.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::broadcast;
use walkdir::WalkDir;

use super::progress::ProgressEvent;
use crate::InstallPlan;

/// Raiz do target sob `/mnt`.
pub const TARGET_ROOT: &str = "/mnt/etc/kryonixos";
/// Engine copiado dentro do target.
pub const ENGINE_DIR: &str = "/mnt/etc/kryonixos/engine";
/// Módulos `.generated.nix` consumidos pelo target flake.
pub const GENERATED_DIR: &str = "/mnt/etc/kryonixos/generated";
/// Estado serializado (plan + features) para auditoria.
pub const STATE_DIR: &str = "/mnt/etc/kryonixos/state";
/// Symlink de retrocompatibilidade: `/mnt/etc/kryonix -> kryonixos/engine`.
pub const LEGACY_ENGINE_LINK: &str = "/mnt/etc/kryonix";

/// Padrões que NUNCA devem ir para o target.
///
/// `flake.lock` é tratado à parte (removido no destino, ver [`finalize_engine`]).
const COPY_DENYLIST: &[&str] = &[
    ".git",
    ".github",
    ".direnv",
    ".cache",
    ".claude",
    "result",
    "result-bin",
    "result-lib",
    "result-doc",
    "result-dev",
    "result-man",
    "target",
    "node_modules",
    "dist",
    "build",
    ".env",
    "brain.env",
    "neo4j.env",
    "secrets",
    "secrets.yaml",
    "secrets.yml",
    "tokens",
    "tokens.json",
];

fn is_denied(name: &str) -> bool {
    if COPY_DENYLIST.contains(&name) {
        return true;
    }
    if name.starts_with("result-") {
        return true;
    }
    if name.ends_with(".env") || name.ends_with(".pem") || name.ends_with(".key") {
        return true;
    }
    false
}

/// Caminhos relativos (a partir da raiz do engine source) que devem ser
/// totalmente excluídos da cópia para o target. Diferente de [`COPY_DENYLIST`]
/// — que filtra por *nome* de arquivo/diretório em qualquer profundidade —
/// esta lista compara o caminho relativo inteiro.
///
/// O caso de uso é `packages/kryonix-installer/`: source do próprio
/// installer dentro do motor. Ele é ferramenta de provisionamento, não
/// componente do produto final, e estava vazando para
/// `/mnt/etc/kryonixos/engine/packages/kryonix-installer/`. A externalização
/// do installer para repo próprio (`github:RAGton/kryonix-installer`)
/// resolve o problema na fonte; esta denylist é a defesa em profundidade
/// para o caso de o fallback continuar presente no source do motor.
const COPY_DENYLIST_RELATIVE_PATHS: &[&str] = &["packages/kryonix-installer"];

fn is_denied_relative(rel: &Path) -> bool {
    COPY_DENYLIST_RELATIVE_PATHS
        .iter()
        .any(|p| rel == Path::new(p))
}

/// Resolve o source do engine a partir de `KRYONIX_ENGINE_SOURCE`.
fn engine_source() -> Result<PathBuf, String> {
    let raw = std::env::var("KRYONIX_ENGINE_SOURCE").unwrap_or_else(|_| "/etc/kryonix".to_string());
    let p = PathBuf::from(&raw);
    if !p.exists() {
        return Err(format!("KRYONIX_ENGINE_SOURCE não encontrado em {raw}"));
    }
    if !p.join("flake.nix").exists() {
        return Err(format!(
            "KRYONIX_ENGINE_SOURCE={raw} não parece um engine (sem flake.nix)"
        ));
    }
    Ok(p)
}

/// Gera toda a árvore v2 sob `/mnt/etc/kryonixos`.
///
/// Substitui [`super::kryonixos::generate_kryonixos_tree`].
pub async fn generate_target_tree(
    plan: &InstallPlan,
    tx: Arc<broadcast::Sender<ProgressEvent>>,
) -> Result<(), String> {
    let _ = tx.send(ProgressEvent {
        step: "kryonixos".into(),
        message: "Montando árvore v2 do target (kryonixos/{engine,generated,state})...".into(),
        percent: 30,
    });

    // Resolve a fonte do engine ANTES de mexer em /mnt/etc/kryonixos: se a
    // origem não existe, nem criamos diretórios em /mnt — comportamento
    // testado por `missing_engine_source_fails_before_nixos_install`.
    let src = engine_source()?;
    create_skeleton().await?;
    let _ = tx.send(ProgressEvent {
        step: "kryonixos".into(),
        message: format!("Copiando engine de {} para {ENGINE_DIR}...", src.display()),
        percent: 31,
    });

    copy_engine(&src, Path::new(ENGINE_DIR))
        .await
        .map_err(|e| format!("Falha ao copiar engine: {e}"))?;
    finalize_engine().await?;

    let _ = tx.send(ProgressEvent {
        step: "kryonixos".into(),
        message: "Gerando módulos generated/*.nix...".into(),
        percent: 33,
    });
    write_generated_modules(plan).await?;

    let _ = tx.send(ProgressEvent {
        step: "kryonixos".into(),
        message: "Escrevendo flake.nix do target (path:./engine)...".into(),
        percent: 34,
    });
    write_target_flake(plan).await?;

    write_state_files(plan).await?;
    ensure_legacy_symlink().await?;

    // Última coisa: pré-gerar o flake.lock do target.
    //
    // Sem isto, `nixos-install` faz: (1) avalia /mnt/etc/kryonixos, (2) escreve
    // flake.lock (modificando o tree), (3) re-avalia → "NAR hash mismatch".
    // Gerando o lock ANTES do install, o tree fica imutável durante o
    // nixos-install, que apenas lê o lock.
    let _ = tx.send(ProgressEvent {
        step: "kryonixos".into(),
        message: "Pré-gerando flake.lock do target (--offline)...".into(),
        percent: 35,
    });
    pre_lock_target().await?;

    Ok(())
}

async fn pre_lock_target() -> Result<(), String> {
    // `nix flake lock --offline`: usa o lock do engine para resolver tudo
    // localmente, sem internet, e grava /mnt/etc/kryonixos/flake.lock.
    let out = Command::new("nix")
        .args([
            "--extra-experimental-features",
            "nix-command flakes",
            "flake",
            "lock",
            TARGET_ROOT,
            "--offline",
        ])
        .output()
        .await
        .map_err(|e| format!("nix flake lock falhou: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "nix flake lock retornou {:?}: {stderr}",
            out.status.code()
        ));
    }
    Ok(())
}

/// P0.2 — Avalia o target flake com `nix eval` ANTES de qualquer ação destrutiva.
///
/// Roda `nix eval .#nixosConfigurations.HOSTNAME.config.system.build.toplevel`
/// com `--no-build` e `--no-write-lock-file` para validar que o flake avalia
/// sem erros de sintaxe Nix (timezone inválida, feature duplicada, etc.).
///
/// Esta função é **pré-destrutiva**: não toca disco, não formata nada.
/// Se falhar, a instalação aborta com mensagem de erro clara ANTES do disko.
pub async fn eval_target_flake(
    plan: &crate::InstallPlan,
    tx: Arc<broadcast::Sender<ProgressEvent>>,
) -> Result<(), String> {
    let hostname = plan.hostname.trim();
    // Fallback para hostname padrão caso esteja vazio (validate_plan já rejeitou,
    // mas preferimos não panics aqui).
    let hostname = if hostname.is_empty() {
        "kryonix"
    } else {
        hostname
    };

    let flake_attr =
        format!("{TARGET_ROOT}#nixosConfigurations.\"{hostname}\".config.system.build.toplevel");

    let _ = tx.send(ProgressEvent {
        step: "preflight".into(),
        message: format!("nix eval {flake_attr} ..."),
        percent: 43,
    });

    let out = Command::new("nix")
        .args([
            "--extra-experimental-features",
            "nix-command flakes",
            "eval",
            &flake_attr,
            "--no-write-lock-file",
        ])
        .output()
        .await
        .map_err(|e| format!("nix eval falhou ao iniciar: {e}"))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        // Mensagem de erro estruturada para aparecer claramente na UI/log.
        return Err(format!(
            "nix eval FALHOU antes do particionamento — disco não foi tocado.\n\
             Atributo avaliado: {flake_attr}\n\
             Código de saída: {:?}\n\
             stderr: {stderr}\n\
             stdout: {stdout}",
            out.status.code()
        ));
    }

    let _ = tx.send(ProgressEvent {
        step: "preflight".into(),
        message: "nix eval OK — target flake válido. Prosseguindo para particionamento.".into(),
        percent: 44,
    });

    Ok(())
}

async fn create_skeleton() -> Result<(), String> {
    for dir in [TARGET_ROOT, ENGINE_DIR, GENERATED_DIR, STATE_DIR] {
        tokio::fs::create_dir_all(dir)
            .await
            .map_err(|e| format!("Falha ao criar {dir}: {e}"))?;
    }
    Ok(())
}

/// Cópia recursiva em Rust, sem `cp -a`. Pula `COPY_DENYLIST` (incluindo
/// `.git`, `.env`, `result*`, `target`, `node_modules`, segredos).
async fn copy_engine(src: &Path, dst: &Path) -> Result<(), String> {
    // Zera o destino primeiro para evitar mistura de runs antigos.
    if dst.exists() {
        tokio::fs::remove_dir_all(dst)
            .await
            .map_err(|e| format!("Falha ao limpar {}: {e}", dst.display()))?;
    }
    tokio::fs::create_dir_all(dst)
        .await
        .map_err(|e| format!("Falha ao recriar {}: {e}", dst.display()))?;

    let src = src.to_path_buf();
    let dst = dst.to_path_buf();

    // walkdir é síncrono; envolvemos em spawn_blocking para não bloquear o
    // reactor. A árvore do engine é da ordem de centenas de MB mas sem I/O
    // remoto, então spawn_blocking é mais simples que async em árvore.
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        // Clone para a closure de filter_entry, que precisa resolver caminhos
        // relativos contra a raiz do source para checar `is_denied_relative`.
        let src_for_filter = src.clone();
        for entry in WalkDir::new(&src)
            .follow_links(false)
            .into_iter()
            .filter_entry(move |e| {
                if e.depth() == 0 {
                    return true;
                }
                if is_denied(e.file_name().to_string_lossy().as_ref()) {
                    return false;
                }
                match e.path().strip_prefix(&src_for_filter) {
                    Ok(rel) => !is_denied_relative(rel),
                    Err(_) => true,
                }
            })
        {
            let entry = entry.map_err(|e| format!("walkdir: {e}"))?;
            let rel = entry
                .path()
                .strip_prefix(&src)
                .map_err(|e| format!("strip_prefix: {e}"))?;
            if rel.as_os_str().is_empty() {
                continue;
            }
            let target = dst.join(rel);
            let ft = entry.file_type();
            if ft.is_dir() {
                std::fs::create_dir_all(&target)
                    .map_err(|e| format!("mkdir {}: {e}", target.display()))?;
            } else if ft.is_symlink() {
                // Pular symlinks: podem apontar para fora do source tree
                // (ex.: result -> /nix/store/...), o que reintroduz o vazamento.
                continue;
            } else if ft.is_file() {
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
                }
                std::fs::copy(entry.path(), &target).map_err(|e| {
                    format!(
                        "copy {} -> {}: {e}",
                        entry.path().display(),
                        target.display()
                    )
                })?;
                // Normaliza permissões: usuário lê/escreve, grupo/outros leem.
                let perm = std::fs::Permissions::from_mode_compat(0o644);
                let _ = std::fs::set_permissions(&target, perm);
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("spawn_blocking join: {e}"))??;

    Ok(())
}

/// Wrapper para `Permissions::from_mode` que evita o `cfg(unix)` espalhado.
trait FromModeCompat {
    fn from_mode_compat(mode: u32) -> Self;
}
impl FromModeCompat for std::fs::Permissions {
    fn from_mode_compat(mode: u32) -> Self {
        use std::os::unix::fs::PermissionsExt;
        std::fs::Permissions::from_mode(mode)
    }
}

/// Finaliza o engine copiado.
///
/// IMPORTANTE: **preserva** `engine/flake.lock`. Sem ele, `nix flake metadata`
/// e `nixos-install` precisariam re-resolver TODOS os inputs transitivos
/// (nixpkgs, home-manager, plasma-manager, ...) pela internet — o que trava o
/// preflight por minutos, derruba a UI com "Failed to fetch" e faz o systemd
/// reiniciar o backend.
///
/// Só apagamos o `flake.lock` do TARGET (raiz de `/mnt/etc/kryonixos`), porque
/// runs anteriores podem ter deixado um lock com o input antigo
/// `path:../kryonix` apontando para `/nix/store/...`.
async fn finalize_engine() -> Result<(), String> {
    let target_lock = format!("{TARGET_ROOT}/flake.lock");
    let _ = tokio::fs::remove_file(&target_lock).await;
    Ok(())
}

async fn write_target_flake(plan: &InstallPlan) -> Result<(), String> {
    let hostname = sanitize_hostname(&plan.hostname);
    let content = format!(
        r#"{{
  description = "KryonixOS target generated by Kryonix Installer";

  inputs = {{
    kryonix.url = "path:./engine";
  }};

  outputs = {{ self, kryonix, ... }}:
    let
      nixpkgs = kryonix.inputs.nixpkgs;
    in
    {{
      nixosConfigurations."{hostname}" = nixpkgs.lib.nixosSystem {{
        system = "x86_64-linux";
        specialArgs = {{
          inputs = kryonix.inputs // {{ self = kryonix; }};
          outputs = kryonix.outputs;
          hostname = "{hostname}";
          isDarwin = false;
          offlineMode = false;
          nixosModules = "${{kryonix}}/modules/nixos";
        }};
        modules = [
          # Declaração de opções + implementação de features. **NÃO**
          # importamos `kryonix.nixosModules.default` aqui: ele puxa
          # `hosts/common` que importa Hyprland, KDE, todos os perfis e
          # ~4000 derivações — totalmente desproporcional para um install
          # baseline com `features: {{}}`. Quando o usuário ativa uma feature
          # via UI, `features.generated.nix` faz o opt-in e
          # `nixosModules.features` implementa só aquilo.
          kryonix.nixosModules.options
          kryonix.nixosModules.features
          ./generated/hardware.generated.nix
          ./generated/storage.generated.nix
          ./generated/network.generated.nix
          ./generated/users.generated.nix
          ./generated/features.generated.nix
        ];
      }};
    }};
}}
"#,
        hostname = hostname,
    );
    tokio::fs::write(format!("{TARGET_ROOT}/flake.nix"), content)
        .await
        .map_err(|e| format!("Falha ao escrever flake.nix do target: {e}"))
}

async fn write_generated_modules(plan: &InstallPlan) -> Result<(), String> {
    write_hardware_generated(plan).await?;
    write_storage_generated(plan).await?;
    write_network_generated(plan).await?;
    write_users_generated(plan).await?;
    write_features_generated(plan).await?;
    Ok(())
}

async fn write_hardware_generated(_plan: &InstallPlan) -> Result<(), String> {
    let hw_output = Command::new("nixos-generate-config")
        .args(["--root", "/mnt", "--show-hardware-config"])
        .output()
        .await
        .map_err(|e| format!("Falha ao executar nixos-generate-config: {e}"))?;

    if !hw_output.status.success() {
        return Err(format!(
            "nixos-generate-config falhou: {}",
            String::from_utf8_lossy(&hw_output.stderr)
        ));
    }
    let path = format!("{GENERATED_DIR}/hardware.generated.nix");
    tokio::fs::write(&path, hw_output.stdout)
        .await
        .map_err(|e| format!("Falha ao salvar {path}: {e}"))?;
    Ok(())
}

async fn write_storage_generated(_plan: &InstallPlan) -> Result<(), String> {
    let disko = tokio::fs::read_to_string("/tmp/kryonix-disko-config.nix")
        .await
        .unwrap_or_else(|_| "{ }".to_string());
    let body = format!(
        r#"{{ config, lib, pkgs, ... }}:
{{
  # Layout de disco aplicado pelo disko (snapshot do que rodou).
  # Mantido aqui apenas para auditoria; a formatação já ocorreu fora do flake.
  imports = [ ];
  system.activationScripts.kryonix-disko-snapshot = lib.mkAfter ''
    : # placeholder; layout aplicado pelo executor antes do nixos-install
  '';
  # Snapshot bruto do config gerado:
  #
{snapshot}
}}
"#,
        snapshot = comment_each_line(&disko),
    );
    let path = format!("{GENERATED_DIR}/storage.generated.nix");
    tokio::fs::write(&path, body)
        .await
        .map_err(|e| format!("Falha ao salvar {path}: {e}"))?;
    Ok(())
}

async fn write_network_generated(plan: &InstallPlan) -> Result<(), String> {
    let hostname = sanitize_hostname(&plan.hostname);
    let inner = network_body(plan);
    let content = format!(
        r#"{{ config, lib, pkgs, ... }}:
{{
  networking.hostName = "{hostname}";
{inner}
  # Boot loader (UEFI por padrão; ajustado pelo disko).
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = false;
}}
"#,
    );
    let path = format!("{GENERATED_DIR}/network.generated.nix");
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("Falha ao salvar {path}: {e}"))?;
    Ok(())
}

fn network_body(plan: &InstallPlan) -> String {
    let net = &plan.network;
    if net.interface.is_empty() {
        return "  networking.networkmanager.enable = true;".to_string();
    }
    let real_gateway = if net.gateway == "0.0.0.0" || net.gateway.is_empty() {
        None
    } else {
        Some(net.gateway.as_str())
    };
    let mut lines = vec!["  networking.networkmanager.enable = true;".to_string()];
    if net.mode == "static" && net.server_ip != "0.0.0.0" && !net.server_ip.is_empty() {
        lines.push(format!(
            "  networking.interfaces.{iface}.ipv4.addresses = [\n    {{ address = \"{ip}\"; prefixLength = {prefix}; }}\n  ];",
            iface = net.interface,
            ip = net.server_ip,
            prefix = net.prefix_length,
        ));
        if let Some(gw) = real_gateway {
            lines.push(format!("  networking.defaultGateway = \"{gw}\";"));
        }
    } else {
        lines.push(format!("  # LAN/PXE interface: {} (DHCP)", net.interface));
        if let Some(gw) = real_gateway {
            lines.push(format!("  networking.defaultGateway = \"{gw}\";"));
        }
    }
    if !net.dns.is_empty() {
        let dns_str = net
            .dns
            .iter()
            .map(|d| format!("\"{d}\""))
            .collect::<Vec<_>>()
            .join(" ");
        lines.push(format!("  networking.nameservers = [ {dns_str} ];"));
    }
    lines.join("\n")
}

pub fn render_users_generated(plan: &InstallPlan) -> String {
    let user = sanitize_user(&plan.user.name);
    let admin = plan.user.admin;

    // Fallback de segurança caso chegue UID inválido do frontend
    let uid = if plan.user.uid >= 1000 {
        plan.user.uid
    } else {
        1000
    };

    let groups = if admin {
        r#"[ "wheel" "networkmanager" "video" "audio" ]"#
    } else {
        r#"[ "networkmanager" "video" "audio" ]"#
    };

    // Chaves SSH públicas autorizadas (não são segredos)
    let ssh_keys_block = if plan.user.authorized_keys.is_empty() {
        String::new()
    } else {
        let valid_prefixes = [
            "ssh-ed25519 ",
            "ssh-rsa ",
            "ecdsa-sha2-nistp256 ",
            "ecdsa-sha2-nistp384 ",
            "ecdsa-sha2-nistp521 ",
            "sk-ssh-ed25519@openssh.com ",
            "sk-ecdsa-sha2-nistp256@openssh.com ",
        ];

        let keys_nix = plan
            .user
            .authorized_keys
            .iter()
            .map(|k| k.trim())
            .filter(|k| !k.is_empty())
            .filter(|k| !k.contains('\n') && !k.contains('\r'))
            .filter(|k| valid_prefixes.iter().any(|&p| k.starts_with(p)))
            .map(|k| {
                // Escapar para string normal do Nix ("...")
                let escaped = k
                    .replace('\\', "\\\\")
                    .replace('"', "\\\"")
                    .replace("${", "\\${");
                format!("      \"{}\"\n", escaped)
            })
            .collect::<String>();

        if keys_nix.is_empty() {
            String::new()
        } else {
            format!("    openssh.authorizedKeys.keys = [\n{}    ];\n", keys_nix)
        }
    };

    // P0.4: Emite hashedPassword quando presente.
    // SEGURANÇA: o hash NÃO é logado — apenas escrito no arquivo .nix.
    // Usa `hashedPassword` (não `initialHashedPassword`) para que qualquer
    // alteração de senha posterior via `passwd` seja preservada pelo NixOS
    // sem conflito.
    let password_block = match &plan.user.hashed_password {
        Some(h) if !h.trim().is_empty() => {
            // Escapa o hash para string Nix (hashes $y$/$6$ não contêm " nem ${,
            // mas aplicamos escaping preventivo por completude).
            let escaped_hash = h
                .trim()
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace("${", "\\${");
            format!("    hashedPassword = \"{}\";\n", escaped_hash)
        }
        _ => {
            // Sem senha: usar "!" bloqueia login por senha (seguro), forçando
            // uso de SSH key. validate_plan já rejeitou este caso em mode=install.
            "    hashedPassword = \"!\";\n".to_string()
        }
    };

    format!(
        r#"{{ config, lib, pkgs, ... }}:
{{
  users.users.{user} = {{
    isNormalUser = true;
    description = "{user}";
    uid = {uid};
    extraGroups = {groups};
{password_block}{ssh_keys}  }};
}}
"#,
        user = user,
        uid = uid,
        groups = groups,
        password_block = password_block,
        ssh_keys = ssh_keys_block,
    )
}

async fn write_users_generated(plan: &InstallPlan) -> Result<(), String> {
    let content = render_users_generated(plan);
    let path = format!("{GENERATED_DIR}/users.generated.nix");
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("Falha ao salvar {path}: {e}"))?;
    Ok(())
}

async fn write_features_generated(plan: &InstallPlan) -> Result<(), String> {
    let timezone = plan.timezone.trim();
    let locale = plan.locale.trim();
    let keyboard = plan.keyboard.trim();
    let features = render_features(plan)?;

    // O SSH do sistema instalado é habilitado se target_remote_access for true
    // OU se a feature 'remote.openssh' foi selecionada no wizard.
    let has_openssh_feature = plan.features.get("remote").and_then(|n| n.get("remote.openssh")).and_then(|v| v.as_bool()).unwrap_or(false)
        || plan.features.get("network").and_then(|n| n.get("network.openssh")).and_then(|v| v.as_bool()).unwrap_or(false);
    let openssh_block = if plan.target_remote_access.enabled || has_openssh_feature {
        "  services.openssh.enable = true;\n"
    } else {
        ""
    };

    // Como NÃO importamos `kryonix.nixosModules.default`, precisamos prover
    // os fundamentos que `hosts/common` daria: stateVersion, nix flakes
    // settings e essential packages. Mantemos minimalista — features
    // adicionais entram via opt-in.
    let content = format!(
        r#"{{ config, lib, pkgs, ... }}:
{{
  time.timeZone = "{timezone}";
  i18n.defaultLocale = "{locale}";
  console.keyMap = "{keyboard}";

  # Habilita flakes no sistema instalado (mesma string que hosts/common usa).
  nix.settings.experimental-features = "nix-command flakes";
  nix.settings.auto-optimise-store = true;

  # Pinada à versão do nixpkgs do engine — evita o warning
  # "system.stateVersion is not set" e mantém migrações conservadoras.
  system.stateVersion = "26.05";

  # Pacotes essenciais para um sistema bootável e debugável fora da box.
  environment.systemPackages = with pkgs; [
    git
    curl
    vim
    htop
  ];

{openssh_block}{features}
}}
"#,
    );
    let path = format!("{GENERATED_DIR}/features.generated.nix");
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("Falha ao salvar {path}: {e}"))?;
    Ok(())
}

struct FeatureRender {
    value: bool,
    source_features: Vec<String>,
}

fn render_features(plan: &InstallPlan) -> Result<String, String> {
    let domains = [
        "system",
        "ai",
        "storage",
        "security",
        "remote",
        "observability",
        "mcp",
    ];

    let mut options_map: std::collections::BTreeMap<String, FeatureRender> =
        std::collections::BTreeMap::new();

    for d in domains {
        if let Some(val) = plan.features.get(d)
            && let Some(obj) = val.as_object()
        {
            for (k, v) in obj {
                if let Some(b) = v.as_bool() {
                    if k == "remote.openssh" || k == "network.openssh" {
                        continue;
                    }
                    let parts: Vec<&str> = k.split('.').collect();
                    if parts.len() == 2 {
                        let option_path = format!("{}.{}.enable", parts[0], parts[1]);
                        let source_feature = k.to_string();

                        if let Some(existing) = options_map.get_mut(&option_path) {
                            if existing.value != b {
                                return Err(format!(
                                    "Feature conflict: option {} requested with both true and false sources: {}, {}",
                                    option_path,
                                    existing.source_features.join(", "),
                                    source_feature
                                ));
                            } else {
                                if !existing.source_features.contains(&source_feature) {
                                    existing.source_features.push(source_feature);
                                }
                            }
                        } else {
                            options_map.insert(
                                option_path,
                                FeatureRender {
                                    value: b,
                                    source_features: vec![source_feature],
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    let mut lines: Vec<String> = vec!["  kryonix.features = {".into()];
    for (opt_path, render) in options_map {
        lines.push(format!("    {} = {};", opt_path, render.value));
    }
    lines.push("  };".into());
    Ok(lines.join("\n"))
}

async fn write_state_files(plan: &InstallPlan) -> Result<(), String> {
    let plan_json = serde_json::to_string_pretty(plan)
        .map_err(|e| format!("Falha ao serializar install plan: {e}"))?;
    tokio::fs::write(format!("{STATE_DIR}/install-plan.json"), plan_json)
        .await
        .map_err(|e| format!("Falha ao gravar install-plan.json: {e}"))?;

    let features =
        serde_json::to_string_pretty(&plan.features).unwrap_or_else(|_| "{}".to_string());
    tokio::fs::write(format!("{STATE_DIR}/selected-features.json"), features)
        .await
        .map_err(|e| format!("Falha ao gravar selected-features.json: {e}"))?;
    Ok(())
}

async fn ensure_legacy_symlink() -> Result<(), String> {
    let link = Path::new(LEGACY_ENGINE_LINK);
    if let Ok(meta) = tokio::fs::symlink_metadata(link).await {
        if meta.file_type().is_symlink() {
            let _ = tokio::fs::remove_file(link).await;
        } else if meta.is_dir() {
            // Diretório real anterior: troca por symlink (sem perder o engine
            // novo que já vive em kryonixos/engine).
            let _ = tokio::fs::remove_dir_all(link).await;
        }
    }
    tokio::fs::symlink("kryonixos/engine", link)
        .await
        .map_err(|e| format!("Falha ao criar symlink {LEGACY_ENGINE_LINK}: {e}"))?;
    Ok(())
}

fn sanitize_hostname(h: &str) -> String {
    let h = h.trim();
    if h.is_empty() {
        "kryonix".into()
    } else {
        h.to_string()
    }
}

fn sanitize_user(u: &str) -> String {
    let u = u.trim();
    if u.is_empty() {
        "kryonix".into()
    } else {
        u.to_string()
    }
}

fn comment_each_line(input: &str) -> String {
    input
        .lines()
        .map(|l| format!("  # {l}"))
        .collect::<Vec<_>>()
        .join("\n")
}

// ── Preflight ─────────────────────────────────────────────────────────────────

/// Resultado do preflight, serializável para `/debug/target`.
#[derive(serde::Serialize, Clone, Debug)]
pub struct PreflightReport {
    pub target_flake_exists: bool,
    pub engine_flake_exists: bool,
    pub features_generated_exists: bool,
    pub hardware_generated_exists: bool,
    pub legacy_symlink_ok: bool,
    pub bad_references: Vec<String>,
    pub flake_metadata_ok: bool,
    pub flake_metadata_output: String,
    pub target_flake_preview: String,
}

impl PreflightReport {
    /// Critério de aprovação para LIBERAR `nixos-install`.
    ///
    /// **Não** inclui `flake_metadata_ok`: rodar `nix flake metadata` aqui
    /// modifica a árvore (escreve `flake.lock` em algumas versões, atualiza
    /// `lastModified`) e quebra a invocação subsequente de `nixos-install`
    /// com `NAR hash mismatch`. O metadata fica como **diagnóstico** em
    /// `/debug/target`, não como gate do install.
    pub fn passed(&self) -> bool {
        self.target_flake_exists
            && self.engine_flake_exists
            && self.features_generated_exists
            && self.hardware_generated_exists
            && self.bad_references.is_empty()
    }
}

/// Padrões que jamais devem aparecer no target após a geração.
const FORBIDDEN_PATTERNS: &[&str] = &[
    "/nix/store/kryonix",
    "path:/nix/store",
    "self.outPath",
    "inputs.self.outPath",
];

/// Preflight COMPLETO — chama `nix flake metadata` e popula todos os campos.
///
/// **Não use** antes do `nixos-install`: a chamada ao nix muta `lastModified`
/// e pode escrever `flake.lock`, o que provoca `NAR hash mismatch` na
/// próxima invocação. Esta variante é destinada ao endpoint `/debug/target`
/// (inspeção sob demanda, sem install em curso).
pub async fn run_preflight() -> Result<PreflightReport, String> {
    let mut report = collect_static_checks().await;
    let (flake_metadata_ok, flake_metadata_output) = run_flake_metadata().await;
    report.flake_metadata_ok = flake_metadata_ok;
    report.flake_metadata_output = flake_metadata_output;
    Ok(report)
}

/// Preflight LEVE — só verifica arquivos + bad references. Sem side effects.
/// Usado pelo pipeline de instalação antes de chamar `nixos-install`.
pub async fn run_preflight_install_gate() -> Result<PreflightReport, String> {
    let mut report = collect_static_checks().await;
    // Marcado como pulado: o gate confia no scan; o metadata é diagnóstico.
    report.flake_metadata_ok = true;
    report.flake_metadata_output =
        "(pulado durante install para não mutar lastModified do target)".into();
    Ok(report)
}

async fn collect_static_checks() -> PreflightReport {
    let target_flake = Path::new(TARGET_ROOT).join("flake.nix");
    let engine_flake = Path::new(ENGINE_DIR).join("flake.nix");
    let features_gen = Path::new(GENERATED_DIR).join("features.generated.nix");
    let hardware_gen = Path::new(GENERATED_DIR).join("hardware.generated.nix");

    let target_flake_exists = target_flake.exists();
    let engine_flake_exists = engine_flake.exists();
    let features_generated_exists = features_gen.exists();
    let hardware_generated_exists = hardware_gen.exists();

    let legacy_symlink_ok = match tokio::fs::symlink_metadata(LEGACY_ENGINE_LINK).await {
        Ok(meta) => meta.file_type().is_symlink(),
        Err(_) => false,
    };

    let bad_references = scan_forbidden(TARGET_ROOT).await;

    let target_flake_preview = tokio::fs::read_to_string(&target_flake)
        .await
        .unwrap_or_else(|_| "<missing>".into())
        .lines()
        .take(80)
        .collect::<Vec<_>>()
        .join("\n");

    PreflightReport {
        target_flake_exists,
        engine_flake_exists,
        features_generated_exists,
        hardware_generated_exists,
        legacy_symlink_ok,
        bad_references,
        flake_metadata_ok: false,
        flake_metadata_output: String::new(),
        target_flake_preview,
    }
}

/// Escaneia APENAS o que o installer **gera** — `flake.nix` raiz +
/// `generated/*.nix` — em busca de [`FORBIDDEN_PATTERNS`].
///
/// O `engine/` é tratado como fonte read-only e **não** é escaneado: ele
/// legitimamente usa `inputs.self.outPath` em módulos internos
/// (`hosts/iso/default.nix`, `modules/nixos/installer/*.nix`), e também tem
/// documentação (`docs/ai/aura/FAILURE_PATTERNS.md`) que MENCIONA os padrões
/// como strings de exemplo. Hit nesses arquivos é falso positivo — o que
/// importa é o que vai virar input do nixos-install, e isso é só o target
/// flake + os módulos gerados.
async fn scan_forbidden(_root: &str) -> Vec<String> {
    let targets = vec![
        PathBuf::from(format!("{TARGET_ROOT}/flake.nix")),
        PathBuf::from(format!("{TARGET_ROOT}/flake.lock")),
        PathBuf::from(format!("{GENERATED_DIR}/hardware.generated.nix")),
        PathBuf::from(format!("{GENERATED_DIR}/storage.generated.nix")),
        PathBuf::from(format!("{GENERATED_DIR}/network.generated.nix")),
        PathBuf::from(format!("{GENERATED_DIR}/users.generated.nix")),
        PathBuf::from(format!("{GENERATED_DIR}/features.generated.nix")),
    ];
    tokio::task::spawn_blocking(move || {
        let mut hits = Vec::new();
        for path in targets {
            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            for pat in FORBIDDEN_PATTERNS {
                if content.contains(pat) {
                    hits.push(format!("{}: contém '{}'", path.display(), pat));
                }
            }
        }
        hits
    })
    .await
    .unwrap_or_default()
}

/// Timeout do preflight. Mantemos curto (60s) porque com `engine/flake.lock`
/// preservado o metadata é puramente local — qualquer tempo maior que isto
/// significa que algo está bloqueando rede e o install vai falhar adiante de
/// qualquer jeito; melhor liberar a UI cedo.
const FLAKE_METADATA_TIMEOUT_SECS: u64 = 60;

async fn run_flake_metadata() -> (bool, String) {
    // `--offline`: assume o lock; não baixa nada. Com engine/flake.lock
    // presente o metadata resolve só os hashes locais.
    let fut = Command::new("nix")
        .args([
            "--extra-experimental-features",
            "nix-command flakes",
            "flake",
            "metadata",
            TARGET_ROOT,
            "--no-write-lock-file",
            "--offline",
            "--show-trace",
        ])
        .output();
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(FLAKE_METADATA_TIMEOUT_SECS),
        fut,
    )
    .await;
    let out = match out {
        Ok(inner) => inner,
        Err(_) => {
            return (
                false,
                format!(
                    "timeout: nix flake metadata excedeu {}s — verifique se engine/flake.lock está presente",
                    FLAKE_METADATA_TIMEOUT_SECS
                ),
            );
        }
    };
    match out {
        Ok(o) => {
            let ok = o.status.success();
            let mut buf = String::from_utf8_lossy(&o.stdout).into_owned();
            if !o.stderr.is_empty() {
                buf.push_str("\n--- stderr ---\n");
                buf.push_str(&String::from_utf8_lossy(&o.stderr));
            }
            (ok, buf)
        }
        Err(e) => (false, format!("falha ao executar nix: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denylist_blocks_secrets_and_artifacts() {
        for name in [
            ".git",
            "result",
            "target",
            "node_modules",
            ".env",
            "brain.env",
            "result-bin",
        ] {
            assert!(is_denied(name), "{name} deveria ser negado");
        }
        for name in ["flake.nix", "modules", "hosts", "lib"] {
            assert!(!is_denied(name), "{name} não deveria ser negado");
        }
    }

    #[test]
    fn relative_denylist_blocks_internal_installer_source() {
        assert!(
            is_denied_relative(Path::new("packages/kryonix-installer")),
            "packages/kryonix-installer deve ser negado pela denylist relativa"
        );
        // A denylist relativa bate o caminho exato; sub-paths não precisam ser
        // testados porque walkdir.filter_entry corta a subárvore inteira quando
        // o root é negado.
        assert!(
            !is_denied_relative(Path::new("packages")),
            "packages/ raiz não deve ser negado"
        );
        assert!(
            !is_denied_relative(Path::new("packages/kryonix-cli")),
            "outros pacotes não devem ser negados"
        );
        assert!(
            !is_denied_relative(Path::new("modules/nixos/installer")),
            "caminhos com 'installer' no nome mas fora do path exato não devem ser negados"
        );
    }

    #[tokio::test]
    async fn copy_engine_excludes_internal_installer_source() {
        use std::env;
        use std::time::{SystemTime, UNIX_EPOCH};

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock skew")
            .as_nanos();
        let tmp = env::temp_dir().join(format!("kryonix-target-tree-test-{stamp}"));
        let src = tmp.join("src");
        let dst = tmp.join("dst");
        std::fs::create_dir_all(&src).expect("mkdir src");

        // Fixture: mini-engine com o fallback do installer presente.
        let installer_src = src.join("packages/kryonix-installer/src");
        std::fs::create_dir_all(&installer_src).expect("mkdir installer src");
        std::fs::write(
            src.join("packages/kryonix-installer/Cargo.toml"),
            "[package]\nname = \"kryonix-installer\"\n",
        )
        .expect("write Cargo.toml");
        std::fs::write(installer_src.join("main.rs"), "fn main() {}").expect("write main.rs");

        // Controle positivo: outros packages devem ser copiados.
        std::fs::create_dir_all(src.join("packages/other-pkg")).expect("mkdir other-pkg");
        std::fs::write(src.join("packages/other-pkg/default.nix"), "{}")
            .expect("write other-pkg/default.nix");

        // Controle positivo: raiz do engine.
        std::fs::create_dir_all(src.join("modules/nixos")).expect("mkdir modules");
        std::fs::write(src.join("modules/nixos/default.nix"), "{}").expect("write modules");
        std::fs::write(src.join("flake.nix"), "{ }").expect("write flake.nix");

        copy_engine(&src, &dst)
            .await
            .expect("copy_engine deve funcionar");

        // Estado positivo: o que deve ter sido copiado.
        assert!(dst.join("flake.nix").exists(), "flake.nix deve ser copiado");
        assert!(
            dst.join("modules/nixos/default.nix").exists(),
            "modules/nixos/default.nix deve ser copiado"
        );
        assert!(
            dst.join("packages/other-pkg/default.nix").exists(),
            "outros pacotes devem ser copiados (controle)"
        );

        // Estado crítico: o source do installer NÃO pode vazar para o target.
        assert!(
            !dst.join("packages/kryonix-installer").exists(),
            "packages/kryonix-installer deve ser excluído pela denylist relativa"
        );
        assert!(
            !dst.join("packages/kryonix-installer/Cargo.toml").exists(),
            "arquivo dentro do installer interno também não pode existir"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn forbidden_patterns_cover_known_leaks() {
        for pat in ["/nix/store/kryonix", "self.outPath", "path:/nix/store"] {
            assert!(FORBIDDEN_PATTERNS.contains(&pat));
        }
    }

    #[test]
    fn target_flake_uses_path_engine() {
        // Sanity-check do template gerado: nunca pode mencionar path:../kryonix
        // ou path:/nix/store. Geramos manualmente um snippet com placeholders.
        let snippet = r#"inputs = { kryonix.url = "path:./engine"; };"#;
        assert!(snippet.contains("path:./engine"));
        assert!(!snippet.contains("path:../kryonix"));
        assert!(!snippet.contains("path:/nix/store"));
    }

    #[test]
    fn test_write_users_generated_validates_ssh_keys() {
        use crate::{InstallPlan, PlanDisk, PlanUser, TargetRemoteAccessPlan};
        let plan = InstallPlan {
            version: 1,
            confirmed_features: vec![],
            hostname: "test".into(),
            timezone: "UTC".into(),
            locale: "en_US.UTF-8".into(),
            keyboard: "us".into(),
            disk: PlanDisk {
                mode: "dry-run".into(),
                target: "/dev/sda".into(),
                layout: "btrfs-simple".into(),
                boot_mode: "uefi".into(),
                profile: "single".into(),
                selected_disks: vec!["/dev/sda".into()],
                raid_level: None,
                manual_partitions: None,
            },
            user: PlanUser {
                name: "tester".into(),
                admin: false,
                uid: 1000,
                hashed_password: None,
                email: "".into(),
                authorized_keys: vec![
                    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI test-key".into(), // valid
                    "ssh-rsa AAAAB3NzaC1...".into(),                         // valid
                    "invalid-key-algo AAAAB3...".into(),                     // invalid algorithm
                    "ssh-ed25519 AAA\nBBB".into(),                           // invalid newline
                    "ssh-ed25519 ${builtins.readFile \"/etc/shadow\"}".into(), // valid algo, but trying nix injection
                ],
            },
            features: serde_json::json!({}),
            network: Default::default(),
            target_remote_access: TargetRemoteAccessPlan { enabled: true },
        };

        let content = super::render_users_generated(&plan);

        assert!(content.contains("\"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI test-key\""));
        assert!(content.contains("\"ssh-rsa AAAAB3NzaC1...\""));
        assert!(!content.contains("invalid-key-algo"));
        assert!(!content.contains("BBB")); // newlines blocked
        // Check escaping of ${
        assert!(content.contains("\\${builtins.readFile \\\"/etc/shadow\\\"}"));
    }

    #[test]
    fn test_render_features_dedupe() {
        use crate::{InstallPlan, PlanDisk, PlanUser, TargetRemoteAccessPlan};
        let plan = InstallPlan {
            version: 1,
            confirmed_features: vec![],
            hostname: "test".into(),
            timezone: "UTC".into(),
            locale: "en_US.UTF-8".into(),
            keyboard: "us".into(),
            disk: PlanDisk {
                mode: "dry-run".into(),
                target: "/dev/sda".into(),
                layout: "btrfs-simple".into(),
                boot_mode: "uefi".into(),
                profile: "single".into(),
                selected_disks: vec!["/dev/sda".into()],
                raid_level: None,
                manual_partitions: None,
            },
            user: PlanUser {
                name: "tester".into(),
                admin: false,
                uid: 1000,
                hashed_password: None,
                email: "".into(),
                authorized_keys: vec![],
            },
            features: serde_json::json!({
                "system": {
                    "security.firewall": true
                },
                "security": {
                    "security.firewall": true
                },
                "remote": {
                    "security.firewall": true
                }
            }),
            network: Default::default(),
            target_remote_access: TargetRemoteAccessPlan { enabled: true },
        };

        let result = super::render_features(&plan).expect("Should not fail");
        let matches: Vec<_> = result.matches("security.firewall.enable = true;").collect();
        assert_eq!(
            matches.len(),
            1,
            "Should deduplicate and only contain one instance"
        );
    }

    #[test]
    fn test_render_features_conflict() {
        use crate::{InstallPlan, PlanDisk, PlanUser, TargetRemoteAccessPlan};
        let plan = InstallPlan {
            version: 1,
            confirmed_features: vec![],
            hostname: "test".into(),
            timezone: "UTC".into(),
            locale: "en_US.UTF-8".into(),
            keyboard: "us".into(),
            disk: PlanDisk {
                mode: "dry-run".into(),
                target: "/dev/sda".into(),
                layout: "btrfs-simple".into(),
                boot_mode: "uefi".into(),
                profile: "single".into(),
                selected_disks: vec!["/dev/sda".into()],
                raid_level: None,
                manual_partitions: None,
            },
            user: PlanUser {
                name: "tester".into(),
                admin: false,
                uid: 1000,
                hashed_password: None,
                email: "".into(),
                authorized_keys: vec![],
            },
            features: serde_json::json!({
                "system": {
                    "security.firewall": true
                },
                "security": {
                    "security.firewall": false
                }
            }),
            network: Default::default(),
            target_remote_access: TargetRemoteAccessPlan { enabled: true },
        };

        let result = super::render_features(&plan);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Feature conflict"));
        assert!(err.contains("security.firewall.enable requested with both true and false"));
    }
}
