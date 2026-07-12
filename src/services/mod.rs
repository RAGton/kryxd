//! Serviços de infraestrutura derivados do contrato de domínio v2.

pub mod partitioner;
pub mod security;

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::domain::{
        Encryption, FileSystem, InstallPlanV2, MountPlan, RepositoryPlan, StoragePlan, Topology,
        ZfsStoragePlan,
    };

    use super::partitioner::DiskoRenderer;

    fn split_zfs_plan() -> InstallPlanV2 {
        InstallPlanV2 {
            version: 2,
            is_think_server: false,
            repository: RepositoryPlan {
                core_url: "https://github.com/RAGton/kryonix.git".into(),
                upstream_url: "https://github.com/RAGton/Kryonixos.git".into(),
                downstream_url: "https://github.com/example/kryonixos.git".into(),
                branch: "main".into(),
            },
            storage: StoragePlan {
                topology: Topology::Split,
                system_disks: vec!["/dev/vda".into()],
                data_disks: vec!["/dev/vdb".into()],
                root: Some(MountPlan {
                    filesystem: FileSystem::Ext4,
                    encryption: Encryption::None,
                }),
                data: Some(MountPlan {
                    filesystem: FileSystem::Zfs,
                    encryption: Encryption::None,
                }),
                raid_level: None,
                manual_partitions: Vec::new(),
                zfs: Some(ZfsStoragePlan {
                    user_refquota: "100G".into(),
                }),
            },
            features: BTreeMap::new(),
        }
    }

    #[test]
    fn split_zfs_renderer_contains_tier1_datasets_and_refquota() {
        let rendered = DiskoRenderer::render(&split_zfs_plan())
            .expect("split com raiz ext4 e dados ZFS deve ser renderizável");

        assert!(rendered.contains("device = \"/dev/vda\";"));
        assert!(rendered.contains("device = \"/dev/vdb\";"));
        assert!(rendered.contains("zpool.zroot"));
        assert!(rendered.contains("options.refquota = \"100G\";"));

        for dataset in [
            "srv-data/home",
            "srv-data/images",
            "srv-data/snapshots",
            "srv-data/storage",
        ] {
            assert!(
                rendered.contains(&format!("\"{dataset}\"")),
                "dataset ausente no renderer: {dataset}"
            );
        }
    }
}
