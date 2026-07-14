//! Tipos de domínio independentes de Axum, Tokio e detalhes de infraestrutura.

pub use kryx::domain::config::{
    BtrfsStoragePlan, Encryption, FileSystem, InstallPlanV2, MountPlan, RepositoryPlan,
    StoragePlan, Topology, ZfsStoragePlan,
};
pub mod secrets;
pub use secrets::InstallSecretsV2;
