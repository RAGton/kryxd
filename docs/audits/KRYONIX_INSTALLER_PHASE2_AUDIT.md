# Kryonix Installer — Auditoria de Segurança Fase 2

**Auditor:** Aura/Hermes (Antigravity Senior Auditor)
**Data:** 2026-06-19
**Versão auditada:** HEAD (`src/executor/`, `src/main.rs`, `src/disk.rs`, `src/auth.rs`, `nix/`)
**Escopo:** Segurança, idempotência, recuperação de falhas, testabilidade

---

## 🔴 VEREDITO: `PARTIAL`

O installer tem uma base técnica sólida — especialmente os bloqueios de segurança de disco e o design do Target Flake v2. Mas existem **lacunas reais que podem comprometer uma instalação em hardware físico**, especialmente nas áreas de race condition no `POST /install`, ausência de estado persistente entre reboots e ausência de testes de integração. Não está pronto para produção sem as correções da Prioridade 1.

---

## Tabela de Riscos

| # | Área | Risco | Evidência no código | Severidade | Correção recomendada |
|---|------|-------|---------------------|------------|----------------------|
| 1 | **Race Condition / Instalação Dupla** | Dois cliques em "Instalar" lançam dois `tokio::spawn` simultâneos sobre o mesmo disco sem mutex. O segundo `disko` tentará formatar um disco já particionado. | `main.rs:820` — `tokio::spawn` sem checar `install_status.running` antes do spawn | 🔴 CRÍTICA | Checar `install_status.running` sob write-lock ANTES de spawn; retornar `409 Conflict` se já running |
| 2 | **Estado volátil — reboot mata job** | `InstallStatus` vive apenas em RAM (`Arc<RwLock<InstallStatus>>`). Se o processo cair no meio de `nixos-install`, toda informação sobre onde o job parou é perdida. Não há retomada. | `main.rs:33` — `install_status: Arc<RwLock<InstallStatus>>` sem persistência em disco | 🔴 CRÍTICA | Persistir estado em `/tmp/kryonix-install-state.json` a cada atualização de fase; ler no startup |
| 3 | **CORS Permissivo em API Destrutiva** | `CorsLayer::permissive()` permite qualquer origem fazer `POST /install` com `disk.mode="install"`. Em ambientes de rede compartilhada, uma página maliciosa aberta em outro tab pode iniciar uma instalação. | `main.rs:303` — `.layer(CorsLayer::permissive())` | 🔴 CRÍTICA | Restringir CORS a `localhost` / `127.0.0.1`; adicionar token de sessão CSRF mínimo gerado no boot |
| 4 | **Sem Autenticação nas Rotas Destrutivas** | `POST /install` e `POST /dry-run` não exigem nenhum token, cookie ou secret. Qualquer processo na mesma máquina ou rede (dependendo do bind) pode iniciar instalação. | `main.rs:772` — handler `install` sem middleware de auth | 🔴 CRÍTICA | Gerar `KRYONIX_LOCAL_TOKEN` aleatório no startup; exigir `X-Kryonix-Token` em rotas destrutivas |
| 5 | **Bind padrão pode ser alterado para 0.0.0.0** | `KRYONIX_INSTALLER_BIND` aceita qualquer string sem validação. Um serviço mal configurado expõe a API na rede local, permitindo que outros hosts iniciem instalação. | `main.rs:307-308` — `std::env::var("KRYONIX_INSTALLER_BIND").unwrap_or_else(...)` | 🟠 ALTA | Validar que bind é `127.0.0.1:PORT` ou `::1:PORT` por padrão; alertar se bind for `0.0.0.0` |
| 6 | **Sem Dry-run Real de Disco** | O `/dry-run` valida lógica do plano e lista checks, mas não roda `disko --mode dry-run`. O usuário pode ter um layout manualmente definido com erros que só aparecem na etapa destrutiva. | `main.rs:539` — `validate_plan()` não invoca `disko --dry-run` | 🟠 ALTA | Adicionar `disko --mode dry-run /tmp/kryonix-disko-config.nix` no handler `/dry-run` |
| 7 | **Disco Root do Live System (NVMe multi-namespace)** | `is_system_disk` identifica `/` via `findmnt` e compara prefixos. Para NVMe com `nvme0n1` + `nvme0n2` (namespaces separados), a heurística de prefixo pode não cobrir todos os casos. | `disk.rs:291-295` — `source_base.starts_with(target_base)` pode falhar em NVMe multipath | 🟠 ALTA | Adicionar verificação via `lsblk -s` (tree mode) para resolver parents de partições NVMe |
| 8 | **Log sem Mascaramento de Segredos** | O log do `nixos-install` é capturado linha por linha e enviado via SSE sem filtragem. Se o engine Nix logar paths que contenham dados sensíveis (hashes de senha, chaves SSH de ambiente), chegam ao cliente. | `nixos.rs:80-84` — SSE sem filtro de padrões sensíveis | 🟡 MÉDIA | Filtrar linhas com padrões `password`, `secret`, `PRIVATE KEY` antes de enviar via SSE |
| 9 | **Erro em `nix flake lock` não é retryable** | Se `pre_lock_target()` falha por race condition de FS ou lock temporário do nix daemon, a instalação aborta sem possibilidade de retry automático. | `target_tree.rs:196-218` — retorno de `Err()` imediato sem retry | 🟡 MÉDIA | Implementar retry com backoff exponencial (3 tentativas, 2s/4s/8s) para `pre_lock_target` |
| 10 | **Falta de `nix flake check` pré-destrutivo** | O installer não avalia o target flake antes de particionar. Se `features.generated.nix` tiver erro de sintaxe Nix (por campo inválido de timezone/locale), o `nixos-install` falha DEPOIS de apagar o disco. | `mod.rs:22-54` — `run_disko` antes de qualquer avaliação Nix | 🟡 MÉDIA | Executar `nix eval .#nixosConfigurations.HOSTNAME` antes de `run_disko` |
| 11 | **`check_network_for_nix` bloqueia em offline** | O safety check de rede usa `curl` síncrono (5s timeout) para `cache.nixos.org`. Em modo offline, isso atrasa o início da instalação e pode falhar indevidamente se o cache estiver em mirror local. | `safety.rs:232-248` — `--max-time 5` hard-coded | 🟡 MÉDIA | Tornar o check assíncrono; aceitar configuração de mirror via `KRYONIX_NIX_CACHE_URL` |
| 12 | **Idempotência de `generate_target_tree`** | Se o gerador falhar após copiar engine mas antes de `write_generated_modules`, o segundo attempt parte de um estado parcialmente escrito. `create_skeleton()` não limpa o estado anterior completamente. | `target_tree.rs:221-228` — `create_dir_all` sem limpeza prévia dos módulos gerados | 🟢 BAIXA | Limpar `generated/` inteiro antes de `write_generated_modules` para garantir idempotência |
| 13 | **Ausência de senha de usuário inicial** | `users.generated.nix` não emite `hashedPassword`. O sistema instalado terá o usuário criado mas sem senha, impossibilitando login em console físico (sem SSH). | `target_tree.rs:563-579` — nenhum campo de senha no template | 🟠 ALTA | Exigir e processar senha hashed (argon2/bcrypt) via canal separado do `InstallPlan`, emitir `hashedPassword` |
| 14 | **`network.rs` / `apply_network` não auditado** | O módulo `network.rs` (34 KB) aplica configurações de rede no live system mas não foi auditado nesta fase. Pode haver injection em argumentos para `nmcli` ou `ip`. | `network.rs` — não inspecionado nesta auditoria | 🔴 CRÍTICA | Auditar `network.rs` como Fase 3; em especial SSID, password e comandos nmcli |
| 15 | **disko config usa target sem sanitização adicional** | Em `generate_btrfs_simple`, o `target` vai diretamente para a string Nix sem ser re-validado pelo regex de `is_valid_disk_path`. O valor vem do `InstallPlan` serializado, que o safety check já validou — mas o caminho é confiado sem re-check. | `partition.rs:157` — `device = \"{target}\"` via format! | 🟢 BAIXA | Re-validar `target` com `is_valid_disk_path` dentro de `generate_disko_config` |

---

## Top 10 Melhorias Prioritárias

### P1 — Bloquear Instalações Concorrentes (CRÍTICO)
```rust
// ANTES de tokio::spawn em install():
{
    let mut status = state.install_status.write().await;
    if status.running {
        return (StatusCode::CONFLICT, Json(ErrorResponse {
            error: "INSTALL_ALREADY_RUNNING".into(),
            details: Some("Uma instalação já está em curso. Aguarde ou reinicie o installer.".into()),
        })).into_response();
    }
    status.running = true; // reserva o lock ANTES do spawn
}
```

### P2 — Restringir CORS + Token Local (CRÍTICO)
```rust
// Em main():
let local_token = std::env::var("KRYONIX_LOCAL_TOKEN")
    .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
println!("Token local: {local_token}"); // só visível no console físico

// CORS restritivo:
let cors = CorsLayer::new()
    .allow_origin(["http://localhost:8080".parse().unwrap()])
    .allow_methods([Method::GET, Method::POST]);
```

### P3 — Persistir Estado de Instalação (CRÍTICO)
Escrever `/tmp/kryonix-install-state.json` a cada mudança de fase. Ler no startup para permitir que a UI mostre "instalação anterior falhou em FASE X".

### P4 — Senha do Usuário Inicial (ALTA)
Aceitar `hashedPasswordFile` via canal seguro (env var ou arquivo com permissão 0400) e emiti-la no `users.generated.nix`. Sem senha, login físico é impossível.

### P5 — Dry-run Real do disko (ALTA)
```rust
// No handler /dry-run:
tokio::process::Command::new("disko")
    .args(["--mode", "dry-run", config_path])
    .output().await?;
```

### P6 — `nix eval` Antes de Particionar (ALTA)
Avaliar `nix eval --no-write-lock-file .#nixosConfigurations.HOSTNAME` com timeout de 120s antes de chamar `run_disko`. Falha de avaliação → abort antes de qualquer ação destrutiva.

### P7 — Proteção NVMe Multipath (ALTA)
Usar `lsblk --json --tree` para resolver disco-pai de qualquer partição montada em `/`, complementando a heurística de prefixo existente.

### P8 — Mascarar Secrets no SSE Log (MÉDIA)
```rust
fn mask_secrets(line: &str) -> String {
    let patterns = ["password=", "secret=", "PRIVATE KEY", "BEGIN RSA"];
    if patterns.iter().any(|p| line.contains(p)) {
        return "[LINHA OMITIDA — CONTÉM DADO SENSÍVEL]".into();
    }
    line.to_string()
}
```

### P9 — Retry em `pre_lock_target` (MÉDIA)
```rust
for attempt in 0..3 {
    match pre_lock_target().await {
        Ok(()) => break,
        Err(e) if attempt < 2 => {
            tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await;
        }
        Err(e) => return Err(e),
    }
}
```

### P10 — Auditar `network.rs` como Fase 3 (CRÍTICA / Pendente)
O módulo de 34 KB que aplica configurações de rede no live system é o maior vetor de command injection não coberto. Fase 3 deve auditar exclusivamente `network.rs`.

---

## Top 10 Testes que Precisam Existir

| # | Teste | Tipo | Arquivo sugerido |
|---|-------|------|-----------------|
| 1 | `test_concurrent_install_returns_409` — dois `POST /install` simultâneos; segundo deve retornar 409 | Integração API | `tests/api_integration.rs` |
| 2 | `test_dry_run_runs_disko_dry_mode` — `/dry-run` chama `disko --mode dry-run` | Integração | `tests/api_integration.rs` |
| 3 | `test_install_aborts_if_flake_eval_fails` — nix eval falha → disko não é chamado | Integração | `tests/install_flow.rs` |
| 4 | `test_network_module_no_injection` — SSID com metacaracteres shell não vaza para `nmcli` | Unitário | `src/network.rs` |
| 5 | `test_users_generated_emits_hashed_password` — `hashedPassword` presente no nix gerado | Unitário | `src/executor/target_tree.rs` |
| 6 | `test_state_persisted_after_phase_change` — estado gravado em `/tmp/kryonix-install-state.json` | Unitário | `src/main.rs` |
| 7 | `test_install_idempotent_on_partial_tree` — `generate_target_tree` com `generated/` parcialmente existente | Unitário | `src/executor/target_tree.rs` |
| 8 | `test_nvme_multipath_not_system_disk` — `is_system_disk` com nvme0n1 vs nvme0n2 | Unitário (mock) | `src/disk.rs` |
| 9 | `test_sse_log_masks_password_lines` — linha com "password=" não passa pelo SSE | Unitário | `src/executor/nixos.rs` |
| 10 | `test_vm_uefi_full_install` — instalação end-to-end em QEMU/KVM com OVMF | Integração VM | `tests/vm/uefi_install.sh` |

---

## Matriz Mínima de Testes de Integração (VM)

```
┌──────────────────────────┬────────────┬────────────┬──────────────────────────────┐
│ Cenário                  │ Esperado   │ Status     │ Comando de validação          │
├──────────────────────────┼────────────┼────────────┼──────────────────────────────┤
│ VM UEFI + btrfs-simple   │ PASS       │ ❌ ausente │ nixos-rebuild switch         │
│ VM BIOS + lvm-simple     │ PASS       │ ❌ ausente │ grub-install + reboot        │
│ Disco < 10 GB            │ REJECT     │ ✅ unitário│ dry-run retorna checks.ok=F  │
│ Disco NVMe (nvme0n1)     │ PASS       │ ❌ ausente │ regex covers nvme\d+n\d+     │
│ Sem rede (offline)       │ WARN/PASS  │ ❌ ausente │ check_network falha gracioso │
│ nixos-install falha      │ ERROR+LOG  │ ❌ ausente │ tail /tmp/kryonix-install.log│
│ Reexecução pós-falha     │ IDEMPOTENT │ ❌ ausente │ state.json mostra fase prévia│
│ Dois cliques em instalar │ 409        │ ❌ ausente │ segundo retorna Conflict      │
└──────────────────────────┴────────────┴────────────┴──────────────────────────────┘
```

---

## Arquivos que Devem ser Alterados

| Arquivo | Motivo | Prioridade |
|---------|--------|------------|
| `src/main.rs` | Mutex de instalação única + token local + CORS restritivo + persistência de estado | P1 |
| `src/executor/nixos.rs` | Mascarar secrets no SSE log | P2 |
| `src/executor/target_tree.rs` | Limpar `generated/` antes de reescrever + senha de usuário | P2 |
| `src/executor/partition.rs` | Re-validar target com regex antes de gerar config | P3 |
| `src/executor/safety.rs` | Retry em check de rede + suporte a mirror | P3 |
| `src/disk.rs` | Proteção NVMe multipath via `lsblk --tree` | P2 |
| `src/executor/mod.rs` | `nix eval` antes de `run_disko` | P1 |
| `tests/` (novo) | Testes de integração API e VM | P2 |
| `nix/ui.nix` / `live.nix` | Garantir `experimental-features` no shell do live ISO | P3 |

---

## Comandos de Validação

```bash
# 1. Rodar todos os testes unitários existentes
cargo test --workspace 2>&1 | tee /tmp/kryonix-tests.log

# 2. Verificar se CORS está restritivo após fix
curl -H "Origin: http://evil.com" -X POST http://127.0.0.1:8080/install \
  -H "Content-Type: application/json" -d '{}' 2>&1 | grep -E "403|CORS"

# 3. Teste de concorrência (race condition)
for i in 1 2; do
  curl -s -X POST http://127.0.0.1:8080/install \
    -H "Content-Type: application/json" \
    -d '{"disk":{"mode":"install","target":"/dev/vda",...}}' &
done
wait

# 4. Verificar bind
ss -tlnp | grep 8080  # deve mostrar 127.0.0.1:8080, nunca 0.0.0.0

# 5. Verificar que secrets não vazam no SSE
curl -N http://127.0.0.1:8080/install/progress | grep -i password

# 6. Testar dry-run com disko
curl -X POST http://127.0.0.1:8080/dry-run \
  -H "Content-Type: application/json" \
  -d '{"disk":{"mode":"dry-run","target":"/dev/vda",...}}'

# 7. Rodar safety checks standalone
cargo test --package kryxd -- safety 2>&1

# 8. Validar target flake gerado (após instalação em VM)
nix flake check /mnt/etc/kryonixos --no-build

# 9. Checar NVMe no safety
cargo test --package kryxd -- nvme 2>&1

# 10. Verificar ausência de PXE e referencias internas
grep -rn "LAN/PXE\|LAN-PXE\|path:/nix/store\|self\.outPath" src/ || echo "OK"
```

---

## Critérios Objetivos para Chamar o Installer de Produção

Todos os itens abaixo devem ser verificáveis com evidência de código e testes:

- [ ] `POST /install` com instalação em curso retorna `409 Conflict` (testado)
- [ ] CORS restrito a `127.0.0.1` / `localhost` (testado)
- [ ] Token de autenticação exigido em rotas destrutivas (testado)
- [ ] Estado de instalação persiste em disco e sobrevive a restart do processo (testado)
- [ ] `/dry-run` executa `disko --mode dry-run` e reporta erros Nix/layout (testado)
- [ ] `nix eval` do target flake executa ANTES de qualquer ação destrutiva (testado)
- [ ] Usuário criado no sistema instalado tem senha hashed (verificado no nix gerado)
- [ ] Teste de integração em VM UEFI completo passa (evidência: log de CI)
- [ ] Teste de integração em VM BIOS completo passa (evidência: log de CI)
- [ ] `network.rs` auditado para command injection (Fase 3 concluída)
- [ ] `cargo test` passa sem warnings em release mode (`cargo test --release`)
- [ ] `nix flake check` do target gerado passa em ambiente de teste

---

## O que Está BEM (não repetir em elogios genéricos, mas documentar como baseline)

- Bloqueio de disco sistema (`is_system_disk` + `is_iso_boot_disk`) — dupla proteção bem implementada
- Target Flake v2 autocontido com `path:./engine` — resolve o NAR hash mismatch definitivamente  
- Pre-lock do `flake.lock` antes do `nixos-install` — abordagem correta e rara
- Regex de validação de disk path (`/dev/sd[a-z]|nvme\d+n\d+|vd[a-z]`) — eficaz contra traversal
- Validação de hostname RFC-1123 contra shell metas — cobertura correta
- Filtragem de SSH keys com whitelist de algoritmos + escaping de `${` — prevenção de Nix injection
- Testes unitários de validação e denylist — cobertura básica sólida
- `verify_disk_install` pós-nixos-install — elimina falsos positivos de PASS

---

*Auditoria gerada em 2026-06-19. Próxima revisão recomendada após implementação das P1.*
