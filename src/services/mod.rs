//! Serviços de infraestrutura derivados do contrato de domínio v2.

pub mod kve;
pub mod media_storage;
pub mod migration;
pub mod partitioner;
pub mod security;
pub mod target_tree;

pub use kve::KveService;

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::domain::{
        BtrfsStoragePlan, Encryption, FileSystem, InstallPlanV2, MountPlan, RepositoryPlan,
        StoragePlan, Topology, XfsStoragePlan, ZfsStoragePlan,
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
                btrfs: None,
                xfs: None,
            },
            features: BTreeMap::new(),
            network: None,
            node_think: None,
        }
    }

    fn split_btrfs_plan() -> InstallPlanV2 {
        let mut plan = split_zfs_plan();
        plan.storage.data = Some(MountPlan {
            filesystem: FileSystem::Btrfs,
            encryption: Encryption::None,
        });
        plan.storage.zfs = None;
        plan.storage.btrfs = Some(BtrfsStoragePlan {
            user_qgroup_limit: "100G".into(),
        });
        plan
    }

    /// Split com root Ext4 + dados XFS com project quota.
    /// `validate_storage_contract` exige `storage.xfs` quando
    /// `data.filesystem == Xfs` e vice-versa (KCR-BACKEND-3).
    fn split_xfs_plan() -> InstallPlanV2 {
        let mut plan = split_zfs_plan();
        plan.storage.data = Some(MountPlan {
            filesystem: FileSystem::Xfs,
            encryption: Encryption::None,
        });
        plan.storage.zfs = None;
        plan.storage.btrfs = None;
        plan.storage.xfs = Some(XfsStoragePlan {
            user_prjquota: "100G".into(),
        });
        plan
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

    #[test]
    fn split_btrfs_renderer_enables_qgroups_and_limits_user_subvolume() {
        let rendered = DiskoRenderer::render(&split_btrfs_plan())
            .expect("split com dados BTRFS deve ser renderizável");

        assert!(rendered.contains("postCreateHook"));
        assert!(rendered.contains("btrfs quota enable"));
        assert!(rendered.contains("btrfs qgroup limit \"100G\""));
        assert!(rendered.contains("@srv-data/home"));
    }

    /// KCR-BACKEND-3: XFS project quotas.
    /// - Hook do Btrfs agora contém `set -euo pipefail` (KCR-BACKEND-2).
    /// - XFS com quota injeta `mountOptions = [ "prjquota" ]` e um
    ///   `postCreateHook` com `xfs_quota -x -c "project -s -p ..."` +
    ///   `xfs_quota -x -c "limit -p ..."`.
    #[test]
    fn btrfs_postcreate_hook_uses_set_euo_pipefail_and_no_longer_swallows_errors() {
        let rendered = DiskoRenderer::render(&split_btrfs_plan())
            .expect("split com dados BTRFS deve ser renderizável");

        assert!(
            rendered.contains("set -euo pipefail"),
            "hook Btrfs precisa usar `set -euo pipefail` (KCR-BACKEND-2)"
        );
        assert!(
            !rendered.contains("|| true"),
            "hook Btrfs NAO deve conter `|| true` (KCR-BACKEND-2): erros silenciosos sao proibidos"
        );
    }

    #[test]
    fn split_xfs_renderer_emits_prjquota_mountoption_and_xfs_quota_hook() {
        let rendered = DiskoRenderer::render(&split_xfs_plan())
            .expect("split com dados XFS deve ser renderizável");

        // mountOptions = [ "prjquota" ]
        assert!(
            rendered.contains("mountOptions = [ \"prjquota\" ];"),
            "renderer XFS deve emitir `mountOptions = [ \"prjquota\" ]` quando quota definida"
        );

        // postCreateHook com set -euo pipefail
        assert!(
            rendered.contains("postCreateHook"),
            "renderer XFS deve emitir `postCreateHook` quando quota definida"
        );
        assert!(
            rendered.contains("set -euo pipefail"),
            "hook XFS deve usar `set -euo pipefail` (consistencia com KCR-BACKEND-2)"
        );

        // xfs_quota project -s (inicializa o projeto no diretório)
        assert!(
            rendered.contains("xfs_quota -x -c \"project -s -p $target_dir 100\""),
            "hook XFS deve atribuir projid=100 ao subdiretório persistente"
        );

        // xfs_quota limit -p (aplica bsoft + bhard = LIMIT ao projid)
        assert!(
            rendered.contains("xfs_quota -x -c \"limit -p bsoft=100G bhard=100G 100\""),
            "hook XFS deve aplicar bsoft+bhard=100G ao projid 100"
        );

        // Garantia: o limit dentro do hook foi interpolado com o valor real
        // (substituição de __QUOTA__).
        assert!(
            !rendered.contains("__QUOTA__"),
            "placeholder __QUOTA__ nao pode permanecer no output"
        );
    }

    #[test]
    fn split_xfs_without_quota_renderer_emits_no_prjquota_option() {
        // Edge case: data XFS sem storage.xfs deve ser rejeitado pelo validator,
        // mas se chegar ao renderer (teste defensivo), ele NAO deve injetar
        // prjquota nem hook de quota.
        let mut plan = split_xfs_plan();
        plan.storage.xfs = None;
        // Forca o bypass do validator para testar o renderer isolado.
        // NOTA: isso so funciona porque DiskoRenderer::render chama
        // validate_storage_contract, que vai rejeitar o plano. O teste
        // verifica a defesa em profundidade.
        let result = DiskoRenderer::render(&plan);
        assert!(
            result.is_err(),
            "plano sem storage.xfs deve ser rejeitado pelo validator"
        );
    }
}
