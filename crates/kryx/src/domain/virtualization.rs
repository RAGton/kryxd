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

/// Origem de uma midia local (ISO ou disco de VM).
///
/// Este enum e compartilhado por `IsoMedia` e `VirtualDiskImage`
/// porque ambos podem vir de upload manual, URL externa ou
/// importacao local. Nao inclui "remote Incus" porque midias
/// Incus sao representadas por `KveImage`, nao por midia local.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KveMediaOrigin {
    /// Enviada manualmente pelo usuario (multipart upload).
    Upload,
    /// Baixada por URL externa.
    Url,
    /// Importada de fonte ja presente no host (filesystem, disco local).
    LocalImport,
}

/// Midia ISO local sob gestao do KVE.
///
/// Nao e uma imagem Incus: aparece como opcao na criacao de VM
/// ou em fluxo proprio de anexacao. `sha256` identifica o conteudo
/// de forma estavel (id derivado). `storage_id` e referencia
/// logica ao `MediaStorage` que a guarda (resolver no slice de
/// storage, nao aqui).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct IsoMedia {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub storage_id: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub origin: KveMediaOrigin,
    /// Presente apenas quando `origin == KveMediaOrigin::Url`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

impl IsoMedia {
    /// Construtor para uso em testes e fixtures.
    ///
    /// `origin_url` e derivado: presente apenas quando a origem e `Url`.
    pub fn for_test(
        id: &str,
        name: &str,
        filename: &str,
        storage_id: &str,
        size_bytes: u64,
        sha256: &str,
        origin: KveMediaOrigin,
    ) -> Self {
        let origin_url = matches!(origin, KveMediaOrigin::Url).then(|| "https://example.invalid/iso".to_string());
        Self {
            id: id.to_string(),
            name: name.to_string(),
            filename: filename.to_string(),
            storage_id: storage_id.to_string(),
            size_bytes,
            sha256: sha256.to_string(),
            origin,
            origin_url,
            created_at: None,
        }
    }
}

/// Formato de arquivo de um disco de VM.
///
/// Identifica o formato do arquivo importado (raw/qcow2/vmdk/vhd/vhdx),
/// NAO o tamanho logico reportado pelo hypervisor. A identificacao
/// confia em magic bytes do arquivo, nao apenas na extensao.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KveVirtualDiskFormat {
    /// Imagem crua (sem metadados de formato).
    Raw,
    /// QEMU Copy-On-Write v2.
    Qcow2,
    /// VMware Virtual Machine Disk.
    Vmdk,
    /// Virtual Hard Disk (Microsoft, legacy).
    Vhd,
    /// Virtual Hard Disk v2 (Microsoft).
    Vhdx,
}

/// Disco completo de VM importado localmente.
///
/// Diferente de `KveImage`, este tipo representa um disco pronto
/// para ser anexado a uma VM (via libvirt/Incus) sem passar pelo
/// fluxo de imagens Incus. `physical_size_bytes` e o tamanho do
/// arquivo; `virtual_size_bytes` e o tamanho logico reportado pelo
/// header do disco (pode ser maior que o arquivo em formatos
/// sparse como qcow2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct VirtualDiskImage {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub format: KveVirtualDiskFormat,
    pub storage_id: String,
    pub physical_size_bytes: u64,
    /// Tamanho logico reportado pelo header. None se o formato nao
    /// tem header (raw) ou se nao foi possivel extrair.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub virtual_size_bytes: Option<u64>,
    pub sha256: String,
    pub origin: KveMediaOrigin,
    /// Presente apenas quando `origin == KveMediaOrigin::Url`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

impl VirtualDiskImage {
    /// Construtor para uso em testes e fixtures.
    pub fn for_test(
        id: &str,
        name: &str,
        filename: &str,
        format: KveVirtualDiskFormat,
        storage_id: &str,
        physical_size_bytes: u64,
        virtual_size_bytes: Option<u64>,
        sha256: &str,
        origin: KveMediaOrigin,
    ) -> Self {
        let origin_url = matches!(origin, KveMediaOrigin::Url).then(|| "https://example.invalid/disk".to_string());
        Self {
            id: id.to_string(),
            name: name.to_string(),
            filename: filename.to_string(),
            format,
            storage_id: storage_id.to_string(),
            physical_size_bytes,
            virtual_size_bytes,
            sha256: sha256.to_string(),
            origin,
            origin_url,
            created_at: None,
        }
    }
}
