//! Modelos de virtualização compartilhados entre kryxd e kryx CLI.
//!
//! Estes tipos são o contrato canônico para instâncias (VMs/containers)
//! e storage pools expostos pela API KVE do kryxd. O CLI kryx os
//! serializa direto da resposta JSON, portanto mudanças aqui são
//! breaking changes no contrato HTTP.

use serde::{Deserialize, Serialize};

/// Tipo de instância Incus.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstanceKind {
    Container,
    #[serde(rename = "virtual-machine", alias = "virtual_machine")]
    VirtualMachine,
}

/// Estado de runtime de uma instância.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstanceState {
    Running,
    Stopped,
    Frozen,
    Starting,
    Stopping,
    Error,
    Unknown,
}

/// Instância (VM ou container) sob gestão do KVE.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VirtualInstance {
    pub name: String,
    pub kind: InstanceKind,
    pub state: InstanceState,
    #[serde(default)]
    pub ipv4: Vec<String>,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub architecture: Option<String>,
    #[serde(default)]
    pub cpu: Option<u32>,
    #[serde(default)]
    pub memory_bytes: Option<u64>,
}

/// Driver de um storage pool.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageDriver {
    Zfs,
    Btrfs,
    Dir,
    Lvm,
    Ceph,
    Other,
}

/// Estado de um storage pool.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageState {
    Created,
    Available,
    InUse,
    Error,
    Unknown,
}

/// Storage pool disponível para o KVE.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VirtualStorage {
    pub name: String,
    pub driver: StorageDriver,
    pub state: StorageState,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub used_bytes: Option<u64>,
    #[serde(default)]
    pub total_bytes: Option<u64>,
}

/// Saúde do backend Incus.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KveHealth {
    pub status: String,
    pub source: String,
    #[serde(default)]
    pub socket: Option<String>,
}

/// Erro estruturado exposto pela API.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KveErrorBody {
    pub status: &'static str,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

impl KveErrorBody {
    pub fn unavailable(message: impl Into<String>, source: Option<String>) -> Self {
        Self {
            status: "unavailable",
            code: "incus_unavailable".into(),
            message: message.into(),
            source,
        }
    }
}

/// Categoria de uma imagem Incus.
///
/// Apenas duas variantes sao reconhecidas: container e VM pronta.
/// ISOs NAO sao imagens Incus e tem dominio proprio (IsoMedia);
/// elas nunca devem aparecer aqui nem serem usadas como origem
/// de `incus launch`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KveImageKind {
    /// Imagem de container Incus (squashfs ou rootfs).
    Container,
    /// Imagem pronta para VM (formato disk image).
    VirtualMachine,
}

/// Remote de imagens visível para o kryxd.
///
/// Origem: client config do Incus (`~/.config/incus/config.yml`).
/// O daemon Incus não expõe remotes via API HTTP.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KveImageRemote {
    pub name: String,
    pub protocol: String,
    pub address: String,
    pub public: bool,
}

/// Imagem Incus disponível para criação futura de containers ou VMs.
///
/// `kind` reflete o campo top-level `type` da resposta Incus
/// (`"container"` ou `"virtual-machine"`). ISOs só aparecem
/// aqui se o provider explicitamente classificar — o kryxd
/// ainda não tem import de ISO, então ISOs ficam fora da
/// listagem por padrão.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KveImage {
    pub fingerprint: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub kind: KveImageKind,
    pub remote: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub os: Option<String>,
    #[serde(default)]
    pub release: Option<String>,
    #[serde(default)]
    pub architecture: Option<String>,
    #[serde(default)]
    pub variant: Option<String>,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

impl KveImage {
    /// Construtor para uso em testes e fixtures.
    pub fn for_test(fingerprint: &str, kind: KveImageKind, remote: &str) -> Self {
        Self {
            fingerprint: fingerprint.to_string(),
            aliases: Vec::new(),
            kind,
            remote: remote.to_string(),
            description: None,
            os: None,
            release: None,
            architecture: None,
            variant: None,
            size_bytes: None,
            created_at: None,
            expires_at: None,
        }
    }
}
