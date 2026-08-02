//! Contrato persistível do plano de instalação Kryonix v2.

use std::collections::BTreeMap;
use std::path::Path;

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{de, Deserialize, Deserializer, Serialize};

/// Topologia física solicitada para o armazenamento.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Topology {
    Single,
    Split,
    Raid,
    Manual,
}

/// Sistemas de arquivos aceitos pelo contrato v2.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileSystem {
    Btrfs,
    Zfs,
    Ext4,
    Xfs,
}

/// Estratégia de criptografia aplicável a um ponto de montagem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Encryption {
    None,
    Luks2,
}

/// Capacidade de filesystem e criptografia associada a um volume lógico.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MountPlan {
    pub filesystem: FileSystem,
    pub encryption: Encryption,
}

/// Repositórios que formam a árvore Git do sistema instalado.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryPlan {
    pub core_url: String,
    pub upstream_url: String,
    pub downstream_url: String,
    pub branch: String,
}

/// Configuração do Node Think Server (KCP).
///
/// `host_id` é **opcional** no schema e é resolvido pelo backend em
/// tempo de validação quando o storage usa ZFS. A regra é:
///
/// 1. Se o usuário fornecer um `hostId` (Some), ele é aceito (após
///    trim e validação de não-vazio).
/// 2. Se o usuário omitir (None) **e** algum volume for ZFS, o
///    backend auto-deriva o `hostId` a partir do
///    `/etc/machine-id` (caminho NixOS padrão): primeiros 8 chars
///    hex, lowercased. Isso elimina atrito de UX (zero-friction)
///    e respeita o invariante ZFS — o NixOS já usa o machine-id
///    como base do `hostId` via `nixos-generate-config`.
/// 3. Se o `machine-id` não puder ser lido ou for inválido, o
///    plano é rejeitado com mensagem explícita. O frontend pode
///    então capturar o erro e oferecer fallback (input manual
///    ou geração local).
///
/// Quando `enable` for `true`, a WAN torna-se obrigatória — o
/// installer recusa o plano se `network.wan` for `None`. Esta
/// invariante é validada em `validate_node_think_plan`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NodeThinkPlan {
    pub enable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_id: Option<String>,
}

/// Opções obrigatórias quando qualquer volume usa ZFS.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ZfsStoragePlan {
    /// Limite referenciado aplicado ao dataset persistente de usuários.
    pub user_refquota: String,
}

/// Opções obrigatórias quando o volume de dados usa BTRFS.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BtrfsStoragePlan {
    /// Limite qgroup aplicado ao subvolume persistente de usuários.
    pub user_qgroup_limit: String,
}

/// Modo de configuração da interface de management (LAN/PXE).
///
/// O instalador sempre exige essa interface; DHCP e Static são as únicas
/// opções porque o cluster KCP não suporta PPPoE na porta LAN (PPPoE fica
/// exclusivamente no uplink WAN).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NetworkMode {
    Dhcp,
    Static,
}

/// Modo de configuração da interface WAN opcional.
///
/// `Pppoe` exige `pppoe_user` e (via `InstallSecretsV2`) `pppoe_password`.
/// A senha nunca trafega dentro do `InstallPlanV2`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WanNetworkMode {
    Dhcp,
    Static,
    Pppoe,
}

/// Configuração da interface de management (LAN/PXE).
///
/// `address`, `gateway` e `dns` são obrigatórios apenas em `Static`;
/// `prefix_length` é sempre obrigatório e define o CIDR aplicado na
/// interface Nix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagementNetwork {
    pub interface: String,
    pub mode: NetworkMode,
    #[serde(default)]
    pub address: Option<String>,
    pub prefix_length: u8,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub dns: Vec<String>,
    pub hostname: String,
}

/// Configuração da interface WAN opcional (uplink externo).
///
/// Em `Static`, `address`, `prefix_length`, `gateway` e `dns` são
/// obrigatórios. Em `Pppoe`, `pppoe_user` é obrigatório; a senha vem
/// via `InstallSecretsV2` e nunca entra no plano.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WanNetwork {
    pub interface: String,
    pub mode: WanNetworkMode,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub prefix_length: Option<u8>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub dns: Vec<String>,
    #[serde(default)]
    pub pppoe_user: Option<String>,
}

/// Bloco de rede do plano de instalação.
///
/// `management` é obrigatório quando `NetworkPlan` está presente
/// (sempre há pelo menos uma interface LAN/PXE no cluster KCP).
/// `wan` é opcional — perfis sem uplink (edge offline puro) declaram
/// `network: null` no payload V2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NetworkPlan {
    pub management: ManagementNetwork,
    #[serde(default)]
    pub wan: Option<WanNetwork>,
}

/// Seleção física e lógica de armazenamento do instalador.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", try_from = "StoragePlanWire")]
pub struct StoragePlan {
    pub topology: Topology,
    pub system_disks: Vec<String>,
    pub data_disks: Vec<String>,
    pub root: Option<MountPlan>,
    pub data: Option<MountPlan>,
    pub raid_level: Option<String>,
    pub manual_partitions: Vec<String>,
    pub zfs: Option<ZfsStoragePlan>,
    pub btrfs: Option<BtrfsStoragePlan>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoragePlanWire {
    topology: Topology,
    system_disks: Vec<String>,
    data_disks: Vec<String>,
    root: Option<MountPlan>,
    data: Option<MountPlan>,
    raid_level: Option<String>,
    manual_partitions: Vec<String>,
    zfs: Option<ZfsStoragePlan>,
    btrfs: Option<BtrfsStoragePlan>,
}

impl TryFrom<StoragePlanWire> for StoragePlan {
    type Error = String;

    fn try_from(value: StoragePlanWire) -> Result<Self, Self::Error> {
        let uses_zfs = value
            .root
            .as_ref()
            .is_some_and(|mount| mount.filesystem == FileSystem::Zfs)
            || value
                .data
                .as_ref()
                .is_some_and(|mount| mount.filesystem == FileSystem::Zfs);
        let uses_btrfs_data = value
            .data
            .as_ref()
            .is_some_and(|mount| mount.filesystem == FileSystem::Btrfs);

        match (&value.zfs, uses_zfs) {
            (None, true) => {
                return Err("storage.zfs is required when a filesystem uses ZFS".to_string());
            }
            (Some(_), false) => {
                return Err("storage.zfs is only valid when root or data uses ZFS".to_string());
            }
            (Some(zfs), true) if !valid_zfs_refquota(&zfs.user_refquota) => {
                return Err(
                    "storage.zfs.userRefquota must use a positive ZFS size such as 100G"
                        .to_string(),
                );
            }
            _ => {}
        }

        match (&value.btrfs, uses_btrfs_data) {
            (None, true) => {
                return Err(
                    "storage.btrfs is required when the data filesystem uses BTRFS".to_string(),
                );
            }
            (Some(_), false) => {
                return Err(
                    "storage.btrfs is only valid when the data filesystem uses BTRFS".to_string(),
                );
            }
            (Some(btrfs), true) if !valid_storage_quota(&btrfs.user_qgroup_limit) => {
                return Err(
                    "storage.btrfs.userQgroupLimit must use a positive size such as 100G"
                        .to_string(),
                );
            }
            _ => {}
        }

        Ok(Self {
            topology: value.topology,
            system_disks: value.system_disks,
            data_disks: value.data_disks,
            root: value.root,
            data: value.data,
            raid_level: value.raid_level,
            manual_partitions: value.manual_partitions,
            zfs: value.zfs,
            btrfs: value.btrfs,
        })
    }
}

fn valid_zfs_refquota(value: &str) -> bool {
    valid_storage_quota(value)
}

fn valid_storage_quota(value: &str) -> bool {
    let digit_count = value.bytes().take_while(u8::is_ascii_digit).count();
    let (number, suffix) = value.split_at(digit_count);

    !number.is_empty()
        && !number.starts_with('0')
        && number.bytes().all(|byte| byte.is_ascii_digit())
        && matches!(
            suffix,
            "K" | "M"
                | "G"
                | "T"
                | "P"
                | "KB"
                | "MB"
                | "GB"
                | "TB"
                | "PB"
                | "KiB"
                | "MiB"
                | "GiB"
                | "TiB"
                | "PiB"
        )
}

/// Plano de instalação v2, livre de senhas e outros segredos.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", try_from = "InstallPlanV2Wire")]
pub struct InstallPlanV2 {
    #[serde(deserialize_with = "deserialize_version_two")]
    pub version: u8,
    pub is_think_server: bool,
    pub node_think: Option<NodeThinkPlan>,
    pub repository: RepositoryPlan,
    pub network: Option<NetworkPlan>,
    pub storage: StoragePlan,
    pub features: BTreeMap<String, BTreeMap<String, bool>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstallPlanV2Wire {
    #[serde(deserialize_with = "deserialize_version_two")]
    version: u8,
    is_think_server: bool,
    #[serde(default)]
    node_think: Option<NodeThinkPlan>,
    repository: RepositoryPlan,
    #[serde(default)]
    network: Option<NetworkPlan>,
    storage: StoragePlan,
    features: BTreeMap<String, BTreeMap<String, bool>>,
}

impl TryFrom<InstallPlanV2Wire> for InstallPlanV2 {
    type Error = String;

    fn try_from(value: InstallPlanV2Wire) -> Result<Self, Self::Error> {
        // (1) WAN obrigatória quando Node Think está ativo.
        validate_node_think_plan(value.node_think.as_ref(), value.network.as_ref())?;

        if let Some(network) = &value.network {
            validate_network_plan(network)?;
        }

        // (2) Auto-derivação do hostId agnóstica ao papel do host
        // (Node Think, KVE ou Desktop). Quando algum volume usa
        // ZFS, o NixOS precisa de `net.hostId` setado — sem isso,
        // import de pool ZFS fica frágil. Esta lógica roda
        // independente de Node Think estar ativo: KVE e Desktop
        // com ZFS também ganham o hostId auto-derivado.
        //
        // Regras:
        // - Storage sem ZFS → hostId permanece None (não-aplicável)
        // - Storage com ZFS + hostId presente (user supplied ou
        //   Node Think antigo) → preserva valor
        // - Storage com ZFS + hostId ausente → auto-deriva do
        //   /etc/machine-id (NixOS padrão)
        //
        // Para preservar compat com a Frente 1 (que concentrava
        // hostId em NodeThinkPlan), criamos ou atualizamos o bloco
        // `node_think` quando necessário. O `enable` continua
        // refletindo a intenção do usuário.
        let mut node_think = value.node_think;
        let uses_zfs = value
            .storage
            .root
            .as_ref()
            .is_some_and(|m| m.filesystem == FileSystem::Zfs)
            || value
                .storage
                .data
                .as_ref()
                .is_some_and(|m| m.filesystem == FileSystem::Zfs);

        if uses_zfs {
            // Verifica se já temos hostId (fornecido ou derivado
            // por outro path)
            let have_id = node_think
                .as_ref()
                .and_then(|t| t.host_id.as_ref())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);

            if !have_id {
                let derived = derive_host_id_from_machine_id(Path::new("/etc/machine-id"))?;
                match node_think.as_mut() {
                    Some(think) => think.host_id = Some(derived),
                    None => {
                        // Cria um NodeThinkPlan com enable=false
                        // só pra carregar o hostId. O tradutor
                        // emite `node.thinkServer.hostId = "..."`
                        // quando o campo está presente, mesmo com
                        // enable=false (ver translator.rs).
                        node_think = Some(NodeThinkPlan {
                            enable: false,
                            host_id: Some(derived),
                        });
                    }
                }
            }
        }

        Ok(Self {
            version: value.version,
            is_think_server: value.is_think_server,
            node_think,
            repository: value.repository,
            network: value.network,
            storage: value.storage,
            features: value.features,
        })
    }
}

/// Valida as invariantes do bloco Node Think (apenas WAN obrigatória).
///
/// O `hostId` **não é mais responsabilidade desta função** — a auto-
/// derivação a partir do `/etc/machine-id` é feita no `TryFrom`
/// superior (`InstallPlanV2`), de forma agnóstica ao papel do host
/// (Node Think, KVE ou Desktop). Esta função apenas garante:
///
/// 1. **WAN obrigatória** — quando Node Think está ativo, a WAN
///    (`network.wan`) é obrigatória. A presença é validada aqui;
///    os campos do `WanNetwork` (mode, pppoe_user, etc.) são
///    validados separadamente em `validate_network_plan`.
///
/// 2. **Edge offline (rede nula) com Node Think** — proibido: a
///    WAN é parte da definição operacional do Think Server
///    (uplink de cluster). Planos edge puro devem manter
///    `nodeThink.enable = false`.
///
/// O `is_think_server` legado é ignorado aqui (compatibilidade);
/// a unificação acontece no tradutor.
fn validate_node_think_plan(
    node_think: Option<&NodeThinkPlan>,
    network: Option<&NetworkPlan>,
) -> Result<(), String> {
    let Some(think) = node_think else {
        return Ok(());
    };
    if !think.enable {
        return Ok(());
    }

    // WAN obrigatória
    match network {
        None => {
            return Err("nodeThink.enable=true requires network.wan to be present".to_string());
        }
        Some(net) if net.wan.is_none() => {
            return Err("nodeThink.enable=true requires network.wan to be configured".to_string());
        }
        _ => {}
    }

    Ok(())
}

/// Lê o `machine-id` do caminho NixOS padrão e deriva um `hostId`
/// de 8 chars hex (32-bit), lowercased.
///
/// Regras:
/// - O arquivo deve existir e ser legível.
/// - O conteúdo deve ter pelo menos 32 chars (formato padrão
///   UUID de 32 hex sem hífens, mas aceita com hífens).
/// - Pega os primeiros 8 chars hex **válidos** (A-F, 0-9).
/// - O resultado não pode ser "00000000" (NixOS rejeita
///   `hostId=0` que é o mesmo que não-set).
fn derive_host_id_from_machine_id(path: &Path) -> Result<String, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read machine-id from {}: {}", path.display(), e))?;
    let trimmed = raw.trim();

    // Filtra só os primeiros 8 chars hex válidos
    let hex_chars: String = trimmed
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .take(8)
        .collect();

    if hex_chars.len() < 8 {
        return Err(format!(
            "machine-id at {} has only {} hex chars (need 8)",
            path.display(),
            hex_chars.len()
        ));
    }

    // Lowercase e check de zeros
    let lower = hex_chars.to_lowercase();
    if lower.chars().all(|c| c == '0') {
        return Err(format!(
            "machine-id at {} is all zeros (hostId=0 is invalid)",
            path.display()
        ));
    }

    Ok(lower)
}

/// Pattern IPv4 (mesma forma do frontend `installPlan.js:20` e do AJV schema).
/// Compilado uma única vez via `Lazy` para evitar custo de recompilação.
static IPV4_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"^(25[0-5]|2[0-4]\d|[01]?\d?\d)\.(25[0-5]|2[0-4]\d|[01]?\d?\d)\.(25[0-5]|2[0-4]\d|[01]?\d?\d)\.(25[0-5]|2[0-4]\d|[01]?\d?\d)$",
    )
    .expect("IPv4 regex compiles")
});

fn is_valid_ipv4(value: &str) -> bool {
    IPV4_REGEX.is_match(value.trim())
}

fn validate_network_plan(network: &NetworkPlan) -> Result<(), String> {
    if network.management.interface.trim().is_empty() {
        return Err("network.management.interface must not be empty".to_string());
    }
    if network.management.prefix_length == 0 || network.management.prefix_length > 32 {
        return Err("network.management.prefixLength must be between 1 and 32".to_string());
    }
    if network.management.hostname.trim().is_empty() {
        return Err("network.management.hostname must not be empty".to_string());
    }
    match network.management.mode {
        NetworkMode::Dhcp => {}
        NetworkMode::Static => {
            let addr = network.management.address.as_deref().unwrap_or("").trim();
            let gw = network.management.gateway.as_deref().unwrap_or("").trim();
            if !is_valid_ipv4(addr) {
                return Err(
                    "network.management.address must be a valid IPv4 in static mode".to_string(),
                );
            }
            if !is_valid_ipv4(gw) {
                return Err(
                    "network.management.gateway must be a valid IPv4 in static mode".to_string(),
                );
            }
            if network.management.dns.is_empty() {
                return Err(
                    "network.management.dns must contain at least one IPv4 in static mode"
                        .to_string(),
                );
            }
            for d in &network.management.dns {
                if !is_valid_ipv4(d.trim()) {
                    return Err("network.management.dns contains an invalid IPv4".to_string());
                }
            }
        }
    }

    if let Some(wan) = &network.wan {
        if wan.interface.trim().is_empty() {
            return Err("network.wan.interface must not be empty".to_string());
        }
        if wan.interface == network.management.interface {
            return Err(
                "network.wan.interface must differ from network.management.interface".to_string(),
            );
        }
        match wan.mode {
            WanNetworkMode::Dhcp => {}
            WanNetworkMode::Static => {
                let addr = wan.address.as_deref().unwrap_or("").trim();
                let gw = wan.gateway.as_deref().unwrap_or("").trim();
                let prefix = wan.prefix_length.unwrap_or(0);
                if !is_valid_ipv4(addr) {
                    return Err(
                        "network.wan.address must be a valid IPv4 in static mode".to_string()
                    );
                }
                if !is_valid_ipv4(gw) {
                    return Err(
                        "network.wan.gateway must be a valid IPv4 in static mode".to_string()
                    );
                }
                if prefix == 0 || prefix > 32 {
                    return Err(
                        "network.wan.prefixLength must be between 1 and 32 in static mode"
                            .to_string(),
                    );
                }
                if wan.dns.is_empty() {
                    return Err(
                        "network.wan.dns must contain at least one IPv4 in static mode".to_string(),
                    );
                }
            }
            WanNetworkMode::Pppoe => {
                let user = wan.pppoe_user.as_deref().unwrap_or("").trim();
                if user.is_empty() {
                    return Err("network.wan.pppoeUser must not be empty in pppoe mode".to_string());
                }
            }
        }
    }

    Ok(())
}

fn deserialize_version_two<'de, D>(deserializer: D) -> Result<u8, D::Error>
where
    D: Deserializer<'de>,
{
    let version = u8::deserialize(deserializer)?;
    if version == 2 {
        Ok(version)
    } else {
        Err(de::Error::custom(format!(
            "install plan version must be 2, received {version}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_plan_json() -> serde_json::Value {
        serde_json::json!({
            "version": 2,
            "isThinkServer": true,
            "repository": {
                "coreUrl": "https://github.com/RAGton/kryonix.git",
                "upstreamUrl": "https://github.com/RAGton/Kryonixos.git",
                "downstreamUrl": "https://github.com/example/kryonixos.git",
                "branch": "main"
            },
            "storage": {
                "topology": "single",
                "systemDisks": ["/dev/nvme0n1"],
                "dataDisks": [],
                "root": {
                    "filesystem": "zfs",
                    "encryption": "none"
                },
                "data": null,
                "raidLevel": null,
                "manualPartitions": [],
                "zfs": {
                    "userRefquota": "100G"
                }
            },
            "features": {
                "server": {
                    "containers": true
                },
                "desktop": {
                    "plasma": false
                }
            }
        })
    }

    fn valid_split_btrfs_plan_json() -> serde_json::Value {
        let mut value = valid_plan_json();
        value["storage"]["topology"] = serde_json::json!("split");
        value["storage"]["dataDisks"] = serde_json::json!(["/dev/nvme1n1"]);
        value["storage"]["root"] = serde_json::json!({
            "filesystem": "ext4",
            "encryption": "none"
        });
        value["storage"]["data"] = serde_json::json!({
            "filesystem": "btrfs",
            "encryption": "none"
        });
        value["storage"].as_object_mut().unwrap().remove("zfs");
        value["storage"]["btrfs"] = serde_json::json!({
            "userQgroupLimit": "100G"
        });
        value
    }

    #[test]
    fn deserializes_complete_v2_plan() {
        let plan: InstallPlanV2 = serde_json::from_value(valid_plan_json()).unwrap();
        assert_eq!(plan.version, 2);
        assert_eq!(plan.storage.topology, Topology::Single);
        assert_eq!(
            plan.storage.root.as_ref().map(|root| root.filesystem),
            Some(FileSystem::Zfs)
        );
        assert_eq!(plan.repository.branch, "main");
        assert!(plan.features["server"]["containers"]);
    }

    #[test]
    fn serializes_storage_fields_as_camel_case() {
        let plan: InstallPlanV2 = serde_json::from_value(valid_plan_json()).unwrap();
        let serialized = serde_json::to_value(plan).unwrap();

        assert_eq!(serialized["storage"]["systemDisks"][0], "/dev/nvme0n1");
        assert_eq!(serialized["storage"]["zfs"]["userRefquota"], "100G");
        assert!(serialized["storage"].get("system_disks").is_none());
    }

    #[test]
    fn rejects_any_version_other_than_two() {
        let mut value = valid_plan_json();
        value["version"] = serde_json::json!(1);
        let error = serde_json::from_value::<InstallPlanV2>(value).unwrap_err();
        assert!(error.to_string().contains("version must be 2"));
    }

    #[test]
    fn rejects_unknown_top_level_field() {
        let mut value = valid_plan_json();
        value["unexpected"] = serde_json::json!(true);
        let error = serde_json::from_value::<InstallPlanV2>(value).unwrap_err();
        assert!(error.to_string().contains("unknown field"));
    }

    #[test]
    fn rejects_unknown_nested_field() {
        let mut value = valid_plan_json();
        value["storage"]["root"]["password"] = serde_json::json!("forbidden");
        let error = serde_json::from_value::<InstallPlanV2>(value).unwrap_err();
        assert!(error.to_string().contains("unknown field"));
    }

    #[test]
    fn requires_downstream_url() {
        let mut value = valid_plan_json();
        value["repository"]
            .as_object_mut()
            .unwrap()
            .remove("downstreamUrl");
        let error = serde_json::from_value::<InstallPlanV2>(value).unwrap_err();
        assert!(error.to_string().contains("downstreamUrl"));
    }

    #[test]
    fn requires_zfs_options_for_zfs_storage() {
        let mut value = valid_plan_json();
        value["storage"].as_object_mut().unwrap().remove("zfs");

        let error = serde_json::from_value::<InstallPlanV2>(value).unwrap_err();
        assert!(error.to_string().contains("storage.zfs is required"));
    }

    #[test]
    fn rejects_invalid_zfs_refquota() {
        let mut value = valid_plan_json();
        value["storage"]["zfs"]["userRefquota"] = serde_json::json!("unlimited");

        let error = serde_json::from_value::<InstallPlanV2>(value).unwrap_err();
        assert!(error.to_string().contains("userRefquota"));
    }

    #[test]
    fn requires_btrfs_qgroup_limit_for_btrfs_data_volume() {
        let mut value = valid_split_btrfs_plan_json();
        value["storage"].as_object_mut().unwrap().remove("btrfs");

        let error = serde_json::from_value::<InstallPlanV2>(value).unwrap_err();
        assert!(error.to_string().contains("storage.btrfs is required"));
    }

    #[test]
    fn deserializes_btrfs_qgroup_limit() {
        let plan: InstallPlanV2 = serde_json::from_value(valid_split_btrfs_plan_json()).unwrap();

        assert_eq!(
            plan.storage
                .btrfs
                .as_ref()
                .map(|btrfs| btrfs.user_qgroup_limit.as_str()),
            Some("100G")
        );
    }

    // ── Network plan tests (KCR-2026-07-31-01, Etapa 1) ─────────────────────

    fn network_management_dhcp_json() -> serde_json::Value {
        serde_json::json!({
            "interface": "enp1s0",
            "mode": "dhcp",
            "prefixLength": 24,
            "hostname": "kryonix-edge-01"
        })
    }

    fn plan_with_network(network: serde_json::Value) -> serde_json::Value {
        let mut value = valid_plan_json();
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network);
        // O fixture base usa ZFS single; o bloco de rede é independente.
        value
    }

    #[test]
    fn deserializes_plan_with_dhcp_management_no_wan() {
        // Cenário 1 do KCR: LAN DHCP sem WAN — edge offline puro (sem uplink).
        let plan: InstallPlanV2 = serde_json::from_value(plan_with_network(serde_json::json!({
            "management": network_management_dhcp_json()
        })))
        .unwrap();

        let network = plan.network.expect("network block must be present");
        assert!(network.wan.is_none());
        assert_eq!(network.management.interface, "enp1s0");
        assert_eq!(network.management.mode, NetworkMode::Dhcp);
        assert_eq!(network.management.prefix_length, 24);
        assert_eq!(network.management.hostname, "kryonix-edge-01");
        assert!(network.management.dns.is_empty());
    }

    #[test]
    fn deserializes_plan_with_pppoe_wan_and_user() {
        // Cenário 2 do KCR: LAN DHCP + WAN PPPoE com user.
        // NOTA: a senha NÃO entra no plan (vem via InstallSecretsV2).
        let plan: InstallPlanV2 = serde_json::from_value(plan_with_network(serde_json::json!({
            "management": network_management_dhcp_json(),
            "wan": {
                "interface": "enp2s0",
                "mode": "pppoe",
                "pppoeUser": "cliente@provedor.net"
            }
        })))
        .unwrap();

        let network = plan.network.expect("network block must be present");
        let wan = network.wan.expect("wan block must be present");
        assert_eq!(wan.interface, "enp2s0");
        assert_eq!(wan.mode, WanNetworkMode::Pppoe);
        assert_eq!(wan.pppoe_user.as_deref(), Some("cliente@provedor.net"));
        assert!(wan.address.is_none());
        assert!(wan.prefix_length.is_none());
    }

    #[test]
    fn rejects_pppoe_wan_without_user() {
        // Cenário 3 do KCR: WAN PPPoE sem pppoe_user → erro.
        let result =
            serde_json::from_value::<InstallPlanV2>(plan_with_network(serde_json::json!({
                "management": network_management_dhcp_json(),
                "wan": {
                    "interface": "enp2s0",
                    "mode": "pppoe"
                }
            })));

        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("pppoeUser must not be empty"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn rejects_static_management_without_address() {
        // Cenário 4 do KCR: LAN Static sem IP address → erro.
        let result =
            serde_json::from_value::<InstallPlanV2>(plan_with_network(serde_json::json!({
                "management": {
                    "interface": "enp1s0",
                    "mode": "static",
                    "prefixLength": 24,
                    "hostname": "kryonix-static-01",
                    "gateway": "192.168.1.1",
                    "dns": ["1.1.1.1"]
                }
            })));

        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("address must be a valid IPv4"),
            "unexpected error: {err}"
        );
    }

    // ── Frente 1: nodeThink+WAN mandatory + ZFS conditional hostId ──────────

    /// Helper: monta um plano com `node_think` e `storage` customizados
    /// a partir do fixture base. Preserva `repository`/`features`.
    fn plan_with_node_think_and_storage(
        node_think: serde_json::Value,
        storage: serde_json::Value,
    ) -> serde_json::Value {
        let mut value = valid_plan_json();
        let obj = value.as_object_mut().unwrap();
        obj.remove("storage");
        obj.insert("nodeThink".to_string(), node_think);
        obj.insert("storage".to_string(), storage);
        value
    }

    /// Helper: storage ZFS com quota e root em zfs.
    fn storage_zfs_single_json() -> serde_json::Value {
        serde_json::json!({
            "topology": "single",
            "systemDisks": ["/dev/nvme0n1"],
            "dataDisks": [],
            "root": { "filesystem": "zfs", "encryption": "none" },
            "data": null,
            "raidLevel": null,
            "manualPartitions": [],
            "zfs": { "userRefquota": "100G" }
        })
    }

    /// Helper: storage Btrfs split com qgroup e data em btrfs.
    /// NOTA: o validador exige `btrfs` block apenas quando `data.filesystem
    /// == btrfs` (topologia split). Usar `root=btrfs` causaria rejeicao
    /// do bloco btrfs, entao o helper usa split com root ext4 e data btrfs.
    fn storage_btrfs_single_json() -> serde_json::Value {
        serde_json::json!({
            "topology": "split",
            "systemDisks": ["/dev/nvme0n1"],
            "dataDisks": ["/dev/nvme1n1"],
            "root": { "filesystem": "ext4", "encryption": "none" },
            "data": { "filesystem": "btrfs", "encryption": "none" },
            "raidLevel": null,
            "manualPartitions": [],
            "btrfs": { "userQgroupLimit": "100G" }
        })
    }

    /// Helper: storage XFS (sem bloco ZFS/Btrfs).
    fn storage_xfs_single_json() -> serde_json::Value {
        serde_json::json!({
            "topology": "single",
            "systemDisks": ["/dev/nvme0n1"],
            "dataDisks": [],
            "root": { "filesystem": "xfs", "encryption": "none" },
            "data": null,
            "raidLevel": null,
            "manualPartitions": []
        })
    }

    /// Helper: network com management + wan DHCP.
    fn network_with_dhcp_wan() -> serde_json::Value {
        serde_json::json!({
            "management": network_management_dhcp_json(),
            "wan": { "interface": "enp2s0", "mode": "dhcp" }
        })
    }

    #[test]
    fn node_think_btrfs_without_host_id_is_accepted() {
        // Cenário 1 da Frente 1: Node Think ativo + Btrfs (sem ZFS)
        // dispensa hostId, exige WAN. Plano completo: sucesso.
        let mut value = plan_with_node_think_and_storage(
            serde_json::json!({ "enable": true }),
            storage_btrfs_single_json(),
        );
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network_with_dhcp_wan());
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();

        let think = plan.node_think.expect("node_think must be present");
        assert!(think.enable);
        assert!(think.host_id.is_none(), "hostId must be None for Btrfs");
        let wan = plan
            .network
            .as_ref()
            .and_then(|n| n.wan.as_ref())
            .expect("wan must be present");
        assert_eq!(wan.mode, WanNetworkMode::Dhcp);
    }

    #[test]
    fn node_think_xfs_without_host_id_is_accepted() {
        // Cenário 2 da Frente 1: XFS (filesystem novo, sem ZFS/Btrfs)
        // também dispensa hostId. Garante que a regra de condicionalidade
        // é genérica (não hardcoded em ZFS/Btrfs).
        let mut value = plan_with_node_think_and_storage(
            serde_json::json!({ "enable": true }),
            storage_xfs_single_json(),
        );
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network_with_dhcp_wan());
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();

        assert!(plan.node_think.as_ref().unwrap().host_id.is_none());
        assert_eq!(
            plan.storage.root.as_ref().unwrap().filesystem,
            FileSystem::Xfs
        );
    }

    #[test]
    fn node_think_zfs_auto_generates_host_id_from_machine_id() {
        // Cenário 3 da Frente 1 (atualizado): Node Think + ZFS sem hostId
        // agora é ACEITO e o backend auto-deriva do /etc/machine-id.
        // O host real (Inspiron) tem machine-id começando com
        // "b8d7c377" (visível em kryonixos/hosts/inspiron/default.nix).
        let mut value = plan_with_node_think_and_storage(
            serde_json::json!({ "enable": true }),
            storage_zfs_single_json(),
        );
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network_with_dhcp_wan());
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();

        let think = plan.node_think.expect("node_think must be present");
        let auto_id = think
            .host_id
            .as_ref()
            .expect("hostId must be auto-generated from machine-id");
        assert_eq!(auto_id.len(), 8, "auto-derived hostId must be 8 hex chars");
        assert!(
            auto_id.chars().all(|c| c.is_ascii_hexdigit()),
            "auto-derived hostId must be hex: {auto_id}"
        );
        assert_ne!(auto_id, "00000000", "hostId=0 is invalid");
    }

    #[test]
    fn node_think_with_explicit_host_id_preserves_user_value() {
        // Quando o usuário fornece hostId explicitamente, é preservado
        // mesmo que o machine-id esteja disponível. Garante que o
        // auto-derive não sobrescreve a intenção do user.
        let mut value = plan_with_node_think_and_storage(
            serde_json::json!({ "enable": true, "hostId": "deadbeef" }),
            storage_zfs_single_json(),
        );
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network_with_dhcp_wan());
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();
        assert_eq!(
            plan.node_think.as_ref().unwrap().host_id.as_deref(),
            Some("deadbeef")
        );
    }

    #[test]
    fn node_think_btrfs_without_host_id_remains_none() {
        // Btrfs (sem ZFS) + Node Think + sem hostId: continua sendo None.
        // Auto-derive SÓ acontece para ZFS. Btrfs/XFS/Ext4 não precisam
        // de hostId (ZFS é o único FS que precisa de net-host-id).
        let mut value = plan_with_node_think_and_storage(
            serde_json::json!({ "enable": true }),
            storage_btrfs_single_json(),
        );
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network_with_dhcp_wan());
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();
        assert!(plan.node_think.as_ref().unwrap().host_id.is_none());
    }

    #[test]
    fn node_think_xfs_without_host_id_remains_none() {
        // XFS (sem ZFS) + Node Think + sem hostId: também None.
        // Confirma que a regra é genérica (FS != ZFS → hostId null).
        let mut value = plan_with_node_think_and_storage(
            serde_json::json!({ "enable": true }),
            storage_xfs_single_json(),
        );
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network_with_dhcp_wan());
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();
        assert!(plan.node_think.as_ref().unwrap().host_id.is_none());
    }

    #[test]
    fn desktop_with_zfs_auto_creates_host_id_even_without_node_think() {
        // Caso KVE/Desktop: usuário NÃO envia node_think no payload,
        // mas storage usa ZFS (root.filesystem). O backend deve
        // auto-criar NodeThinkPlan { enable: false, host_id:
        // Some(derived) } para garantir que o net.hostId será
        // emitido pelo tradutor.
        let mut value = valid_plan_json();
        value.as_object_mut().unwrap().remove("nodeThink");
        value
            .as_object_mut()
            .unwrap()
            .insert("storage".to_string(), storage_zfs_single_json());
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network_with_dhcp_wan());
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();
        let think = plan
            .node_think
            .as_ref()
            .expect("node_think must be auto-created when ZFS is used");
        assert!(!think.enable, "enable must be false (user didn't opt in)");
        let auto_id = think
            .host_id
            .as_ref()
            .expect("host_id must be auto-derived for ZFS");
        assert_eq!(auto_id.len(), 8);
        assert!(auto_id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn kve_with_zfs_and_no_host_id_auto_generates() {
        // Caso KVE (Kryonix Virtualization Engine): usuário envia
        // node_think com enable=false (sem host_id) e storage usa
        // ZFS. Backend auto-deriva o hostId mesmo sem Think ativo.
        let mut value = valid_plan_json();
        value.as_object_mut().unwrap().insert(
            "nodeThink".to_string(),
            serde_json::json!({ "enable": false }),
        );
        value
            .as_object_mut()
            .unwrap()
            .insert("storage".to_string(), storage_zfs_single_json());
        value
            .as_object_mut()
            .unwrap()
            .insert("network".to_string(), network_with_dhcp_wan());
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();
        let think = plan.node_think.as_ref().unwrap();
        assert!(!think.enable);
        assert!(
            think.host_id.is_some(),
            "KVE com ZFS sem hostId deve auto-derivar"
        );
    }

    #[test]
    fn derive_host_id_filters_and_lowercases_machine_id() {
        // Helper interno para testar a derivação pura.
        // machine-id pode vir com hífens (formato UUID) ou não; o
        // derivador deve pegar os primeiros 8 hex válidos e
        // lowercased.
        let dir = std::env::temp_dir().join(format!("kryx-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("machine-id");

        // Caso 1: UUID com hífens (formato padrão systemd)
        std::fs::write(&path, "B8D7C377-C219-4646-BF0F-DE3044C6BD32\n").unwrap();
        let id = derive_host_id_from_machine_id(&path).unwrap();
        assert_eq!(id, "b8d7c377");

        // Caso 2: hex puro sem hífens
        std::fs::write(&path, "abcdef1234567890ABCDEF\n").unwrap();
        let id = derive_host_id_from_machine_id(&path).unwrap();
        assert_eq!(id, "abcdef12");

        // Caso 3: all zeros é rejeitado
        std::fs::write(&path, "00000000000000000000000000000000\n").unwrap();
        let err = derive_host_id_from_machine_id(&path).unwrap_err();
        assert!(err.contains("all zeros"), "unexpected error: {err}");

        // Caso 4: muito curto é rejeitado
        std::fs::write(&path, "abc\n").unwrap();
        let err = derive_host_id_from_machine_id(&path).unwrap_err();
        assert!(err.contains("has only 3 hex chars"), "unexpected: {err}");

        // Limpa
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn node_think_without_wan_is_rejected() {
        // Cenário 4 da Frente 1: Node Think ativo sem WAN -> rejeitado.
        // Testa os dois modos: (a) network: null, (b) network.wan: null.
        let mut base = plan_with_node_think_and_storage(
            serde_json::json!({ "enable": true }),
            storage_btrfs_single_json(),
        );

        // (a) network: null
        let mut case_a = base.clone();
        case_a.as_object_mut().unwrap().remove("network");
        let err_a = serde_json::from_value::<InstallPlanV2>(case_a)
            .unwrap_err()
            .to_string();
        assert!(
            err_a.contains("nodeThink.enable=true requires network.wan to be present"),
            "unexpected error (a): {err_a}"
        );

        // (b) network presente mas sem wan
        let mut case_b = base.clone();
        case_b.as_object_mut().unwrap().insert(
            "network".to_string(),
            serde_json::json!({ "management": network_management_dhcp_json() }),
        );
        let err_b = serde_json::from_value::<InstallPlanV2>(case_b)
            .unwrap_err()
            .to_string();
        assert!(
            err_b.contains("nodeThink.enable=true requires network.wan to be configured"),
            "unexpected error (b): {err_b}"
        );
    }

    #[test]
    fn node_think_disabled_does_not_require_wan_or_host_id() {
        // Edge case: enable=false nao exige WAN nem hostId, mesmo com ZFS.
        // Garante que o validador nao super-restringe planos inativos.
        let mut value = plan_with_node_think_and_storage(
            serde_json::json!({ "enable": false }),
            storage_zfs_single_json(),
        );
        // network: null (edge offline puro com nodeThink desligado)
        let plan: InstallPlanV2 = serde_json::from_value(value).unwrap();
        assert!(!plan.node_think.as_ref().unwrap().enable);
        assert!(plan.network.is_none());
    }
}
