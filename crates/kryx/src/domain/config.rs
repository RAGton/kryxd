//! Contrato persistível do plano de instalação Kryonix v2.

use std::collections::BTreeMap;

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Deserializer, Serialize, de};

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
/// `host_id` é obrigatório quando `enable` for `true` porque o módulo Nix
/// `node.thinkServer.hostId` é exigido pelo importador de pools ZFS.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NodeThinkPlan {
    pub enable: bool,
    pub host_id: String,
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
        if let Some(network) = &value.network {
            validate_network_plan(network)?;
        }

        Ok(Self {
            version: value.version,
            is_think_server: value.is_think_server,
            node_think: value.node_think,
            repository: value.repository,
            network: value.network,
            storage: value.storage,
            features: value.features,
        })
    }
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
                return Err("network.management.address must be a valid IPv4 in static mode".to_string());
            }
            if !is_valid_ipv4(gw) {
                return Err("network.management.gateway must be a valid IPv4 in static mode".to_string());
            }
            if network.management.dns.is_empty() {
                return Err("network.management.dns must contain at least one IPv4 in static mode".to_string());
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
            return Err("network.wan.interface must differ from network.management.interface".to_string());
        }
        match wan.mode {
            WanNetworkMode::Dhcp => {}
            WanNetworkMode::Static => {
                let addr = wan.address.as_deref().unwrap_or("").trim();
                let gw = wan.gateway.as_deref().unwrap_or("").trim();
                let prefix = wan.prefix_length.unwrap_or(0);
                if !is_valid_ipv4(addr) {
                    return Err("network.wan.address must be a valid IPv4 in static mode".to_string());
                }
                if !is_valid_ipv4(gw) {
                    return Err("network.wan.gateway must be a valid IPv4 in static mode".to_string());
                }
                if prefix == 0 || prefix > 32 {
                    return Err("network.wan.prefixLength must be between 1 and 32 in static mode".to_string());
                }
                if wan.dns.is_empty() {
                    return Err("network.wan.dns must contain at least one IPv4 in static mode".to_string());
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
        value.as_object_mut()
            .unwrap()
            .insert("network".to_string(), network);
        // O fixture base usa ZFS single; o bloco de rede é independente.
        value
    }

    #[test]
    fn deserializes_plan_with_dhcp_management_no_wan() {
        // Cenário 1 do KCR: LAN DHCP sem WAN — edge offline puro (sem uplink).
        let plan: InstallPlanV2 =
            serde_json::from_value(plan_with_network(serde_json::json!({
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
        let plan: InstallPlanV2 =
            serde_json::from_value(plan_with_network(serde_json::json!({
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
        let result = serde_json::from_value::<InstallPlanV2>(plan_with_network(serde_json::json!({
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
        let result = serde_json::from_value::<InstallPlanV2>(plan_with_network(serde_json::json!({
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
}
