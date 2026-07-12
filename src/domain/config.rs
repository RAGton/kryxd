//! Contrato persistível do plano de instalação Kryonix v2.

use std::collections::BTreeMap;

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

/// Seleção física e lógica de armazenamento do instalador.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoragePlan {
    pub topology: Topology,
    pub system_disks: Vec<String>,
    pub data_disks: Vec<String>,
    pub root: Option<MountPlan>,
    pub data: Option<MountPlan>,
    pub raid_level: Option<String>,
    pub manual_partitions: Vec<String>,
}

/// Plano de instalação v2, livre de senhas e outros segredos.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallPlanV2 {
    #[serde(deserialize_with = "deserialize_version_two")]
    pub version: u8,
    pub is_think_server: bool,
    pub repository: RepositoryPlan,
    pub storage: StoragePlan,
    pub features: BTreeMap<String, BTreeMap<String, bool>>,
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
                "manualPartitions": []
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
}
