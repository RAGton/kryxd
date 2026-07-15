//! Ponte temporária entre o contrato v2 e os executores de armazenamento.

use std::fmt;

use crate::domain::{FileSystem, InstallPlanV2, Topology};

use super::partitioner::{DiskValidator, DiskoRenderer, PartitionerError};

/// Backend selecionado para um plano v2 durante a migração.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationBackend {
    /// Caminho legado de disco único BTRFS.
    LegacySingleBtrfs,
    /// Caminho legado de disco único ext4.
    LegacySingleExt4,
    /// Renderer Disko v2 para ZFS, split e demais layouts nativos.
    NativeDisko,
}

/// Falhas seguras produzidas pelo stub de migração.
#[derive(Debug)]
pub enum Error {
    /// O plano ou os discos falharam na validação read-only.
    Partitioner(PartitionerError),
    /// O plano v2 não contém os dados necessários ao executor v1.
    LegacyContextRequired(MigrationBackend),
    /// O layout foi renderizado, mas ainda não passou pelo preflight destrutivo.
    TargetTreePreflightRequired,
}

impl fmt::Display for Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Partitioner(error) => error.fmt(formatter),
            Self::LegacyContextRequired(MigrationBackend::LegacySingleBtrfs) => formatter
                .write_str(
                    "single BTRFS foi direcionado ao legado, mas o InstallPlanV2 não contém o contexto v1 exigido pelo executor",
                ),
            Self::LegacyContextRequired(MigrationBackend::LegacySingleExt4) => formatter
                .write_str(
                    "single ext4 foi direcionado ao legado, mas o executor v1 só oferece ext4 sobre LVM e não pode ser chamado sem alterar a topologia",
                ),
            Self::LegacyContextRequired(MigrationBackend::NativeDisko) => {
                formatter.write_str("backend nativo não usa contexto legado")
            }
            Self::TargetTreePreflightRequired => formatter.write_str(
                "o Disko foi renderizado, mas a execução exige target tree, preflight e nix eval prévios",
            ),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Partitioner(error) => Some(error),
            Self::LegacyContextRequired(_) | Self::TargetTreePreflightRequired => None,
        }
    }
}

impl From<PartitionerError> for Error {
    fn from(error: PartitionerError) -> Self {
        Self::Partitioner(error)
    }
}

/// Determina o backend sem executar comandos destrutivos.
pub fn select_backend(plan: &InstallPlanV2) -> Result<MigrationBackend, Error> {
    let root = plan.storage.root.as_ref().ok_or_else(|| {
        PartitionerError::InvalidPlan("storage.root é obrigatório para selecionar backend".into())
    })?;

    match (plan.storage.topology, root.filesystem) {
        (Topology::Single, FileSystem::Btrfs) => Ok(MigrationBackend::LegacySingleBtrfs),
        (Topology::Single, FileSystem::Ext4) => Ok(MigrationBackend::LegacySingleExt4),
        (Topology::Single | Topology::Split, _) => Ok(MigrationBackend::NativeDisko),
        (Topology::Raid, _) => Err(PartitionerError::UnsupportedStorageCapability(
            "topologia raid ainda não possui executor v2".into(),
        )
        .into()),
        (Topology::Manual, _) => Err(PartitionerError::UnsupportedStorageCapability(
            "topologia manual ainda não possui executor v2".into(),
        )
        .into()),
    }
}

/// Valida o plano e prepara a migração sem ultrapassar o preflight seguro.
///
/// A função chama o `DiskValidator` e seleciona o backend solicitado. O caminho
/// nativo também renderiza o módulo Disko. A execução permanece deliberadamente
/// bloqueada até o target tree v2 comprovar preflight e `nix eval`; o executor
/// legado não é chamado com dados sintéticos ou semanticamente falsos.
pub fn execute_plan(plan: InstallPlanV2) -> Result<(), Error> {
    DiskValidator::default().validate_plan(&plan)?;

    match select_backend(&plan)? {
        backend @ (MigrationBackend::LegacySingleBtrfs | MigrationBackend::LegacySingleExt4) => {
            Err(Error::LegacyContextRequired(backend))
        }
        MigrationBackend::NativeDisko => {
            let _rendered = DiskoRenderer::render(&plan)?;
            Err(Error::TargetTreePreflightRequired)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::domain::{Encryption, MountPlan, RepositoryPlan, StoragePlan, ZfsStoragePlan};

    use super::*;

    fn plan(topology: Topology, root_filesystem: FileSystem) -> InstallPlanV2 {
        let split = topology == Topology::Split;
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
                topology,
                system_disks: vec!["/dev/vda".into()],
                data_disks: if split {
                    vec!["/dev/vdb".into()]
                } else {
                    Vec::new()
                },
                root: Some(MountPlan {
                    filesystem: root_filesystem,
                    encryption: Encryption::None,
                }),
                data: split.then_some(MountPlan {
                    filesystem: FileSystem::Ext4,
                    encryption: Encryption::None,
                }),
                raid_level: None,
                manual_partitions: Vec::new(),
                zfs: (root_filesystem == FileSystem::Zfs).then_some(ZfsStoragePlan {
                    user_refquota: "100G".into(),
                }),
                btrfs: None,
            },
            features: BTreeMap::new(),
        }
    }

    #[test]
    fn selects_legacy_only_for_single_btrfs_and_ext4() {
        assert_eq!(
            select_backend(&plan(Topology::Single, FileSystem::Btrfs)).unwrap(),
            MigrationBackend::LegacySingleBtrfs
        );
        assert_eq!(
            select_backend(&plan(Topology::Single, FileSystem::Ext4)).unwrap(),
            MigrationBackend::LegacySingleExt4
        );
    }

    #[test]
    fn selects_native_renderer_for_split_and_zfs() {
        assert_eq!(
            select_backend(&plan(Topology::Split, FileSystem::Ext4)).unwrap(),
            MigrationBackend::NativeDisko
        );
        assert_eq!(
            select_backend(&plan(Topology::Single, FileSystem::Zfs)).unwrap(),
            MigrationBackend::NativeDisko
        );
    }
}
