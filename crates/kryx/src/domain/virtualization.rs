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

#[cfg(test)]
mod tests {
    use super::*;

    // ===== KveMediaOrigin =====

    #[test]
    fn media_origin_serializes_kebab_case() {
        let cases = [
            (KveMediaOrigin::Upload, "\"upload\""),
            (KveMediaOrigin::Url, "\"url\""),
            (KveMediaOrigin::LocalImport, "\"local-import\""),
        ];
        for (origin, expected_json) in cases {
            let json = serde_json::to_string(&origin).unwrap();
            assert_eq!(json, expected_json, "serialize {origin:?}");
        }
    }

    #[test]
    fn media_origin_round_trips_for_all_variants() {
        for origin in [
            KveMediaOrigin::Upload,
            KveMediaOrigin::Url,
            KveMediaOrigin::LocalImport,
        ] {
            let json = serde_json::to_string(&origin).unwrap();
            let parsed: KveMediaOrigin = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, origin);
        }
    }

    // ===== KveVirtualDiskFormat =====

    #[test]
    fn virtual_disk_format_serializes_lowercase() {
        let cases = [
            (KveVirtualDiskFormat::Raw, "\"raw\""),
            (KveVirtualDiskFormat::Qcow2, "\"qcow2\""),
            (KveVirtualDiskFormat::Vmdk, "\"vmdk\""),
            (KveVirtualDiskFormat::Vhd, "\"vhd\""),
            (KveVirtualDiskFormat::Vhdx, "\"vhdx\""),
        ];
        for (fmt, expected_json) in cases {
            let json = serde_json::to_string(&fmt).unwrap();
            assert_eq!(json, expected_json, "serialize {fmt:?}");
        }
    }

    #[test]
    fn virtual_disk_format_round_trips_for_all_variants() {
        for fmt in [
            KveVirtualDiskFormat::Raw,
            KveVirtualDiskFormat::Qcow2,
            KveVirtualDiskFormat::Vmdk,
            KveVirtualDiskFormat::Vhd,
            KveVirtualDiskFormat::Vhdx,
        ] {
            let json = serde_json::to_string(&fmt).unwrap();
            let parsed: KveVirtualDiskFormat = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, fmt);
        }
    }

    // ===== IsoMedia =====

    #[test]
    fn iso_media_round_trips_when_origin_is_url() {
        let iso = IsoMedia::for_test(
            "sha256:abc",
            "debian-13-installer",
            "debian-13-netinst.iso",
            "kryonix-isos",
            600_000_000,
            "abc123def456",
            KveMediaOrigin::Url,
        );
        let json = serde_json::to_string(&iso).unwrap();
        let parsed: IsoMedia = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, iso);
        assert!(json.contains("\"origin-url\":\"https://example.invalid/iso\""));
    }

    #[test]
    fn iso_media_omits_origin_url_when_origin_is_upload() {
        let iso = IsoMedia::for_test(
            "sha256:abc",
            "win11",
            "win11.iso",
            "kryonix-isos",
            5_000_000_000,
            "abc123",
            KveMediaOrigin::Upload,
        );
        let json = serde_json::to_string(&iso).unwrap();
        assert!(!json.contains("origin-url"));
        assert!(!json.contains("origin_url"));
        let parsed: IsoMedia = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, iso);
    }

    #[test]
    fn iso_media_omits_origin_url_when_origin_is_local_import() {
        let iso = IsoMedia::for_test(
            "sha256:abc",
            "ubuntu-server",
            "ubuntu-24.04-server.iso",
            "kryonix-isos",
            3_500_000_000,
            "deadbeef",
            KveMediaOrigin::LocalImport,
        );
        let json = serde_json::to_string(&iso).unwrap();
        assert!(!json.contains("origin-url"));
        let parsed: IsoMedia = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, iso);
    }

    #[test]
    fn iso_media_accepts_json_without_origin_url_field() {
        // JSON produzido por um caller que omite origin_url deve
        // deserializar com origin_url = None.
        let json = r#"{
            "id": "sha256:abc",
            "name": "nixos",
            "filename": "nixos-minimal.iso",
            "storage-id": "kryonix-isos",
            "size-bytes": 900000000,
            "sha256": "abc",
            "origin": "upload"
        }"#;
        let parsed: IsoMedia = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.origin, KveMediaOrigin::Upload);
        assert!(parsed.origin_url.is_none());
        assert!(parsed.created_at.is_none());
    }

    // ===== VirtualDiskImage =====

    #[test]
    fn virtual_disk_image_round_trips_qcow2_with_virtual_size() {
        let disk = VirtualDiskImage::for_test(
            "sha256:disk1",
            "ubuntu-cloud",
            "ubuntu-24.04.qcow2",
            KveVirtualDiskFormat::Qcow2,
            "kryonix-disks",
            1_200_000_000,
            Some(10_000_000_000),
            "deadbeef",
            KveMediaOrigin::Url,
        );
        let json = serde_json::to_string(&disk).unwrap();
        let parsed: VirtualDiskImage = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, disk);
        assert!(json.contains("\"format\":\"qcow2\""));
        assert!(json.contains("\"virtual-size-bytes\":10000000000"));
    }

    #[test]
    fn virtual_disk_image_omits_virtual_size_for_raw() {
        let disk = VirtualDiskImage::for_test(
            "sha256:raw1",
            "debian-cloud",
            "debian-12.raw",
            KveVirtualDiskFormat::Raw,
            "kryonix-disks",
            2_000_000_000,
            None,
            "cafebabe",
            KveMediaOrigin::Upload,
        );
        let json = serde_json::to_string(&disk).unwrap();
        assert!(!json.contains("virtual-size-bytes"));
        let parsed: VirtualDiskImage = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, disk);
    }

    // ===== Regressao: dominio Incus intacto =====

    #[test]
    fn kve_image_kind_continues_to_be_only_container_or_vm() {
        // Confirmacao: variantes do enum nao mudaram.
        // Serializa e deserializa para cada variante.
        for kind in [KveImageKind::Container, KveImageKind::VirtualMachine] {
            let json = serde_json::to_string(&kind).unwrap();
            let parsed: KveImageKind = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, kind);
        }

        // Garante que 'iso' NAO e uma variante valida de KveImageKind.
        let err = serde_json::from_str::<KveImageKind>("\"iso\"").unwrap_err();
        assert!(
            err.to_string().contains("unknown variant") || err.to_string().contains("iso"),
            "esperava erro de variante desconhecida, obteve: {err}"
        );
    }

    #[test]
    fn kve_image_round_trip_unchanged() {
        let img = KveImage::for_test("abc123", KveImageKind::Container, "local");
        let json = serde_json::to_string(&img).unwrap();
        let parsed: KveImage = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, img);
    }

    #[test]
    fn kve_image_remote_round_trip_unchanged() {
        let remote = KveImageRemote {
            name: "images".into(),
            protocol: "simplestreams".into(),
            address: "https://images.linuxcontainers.org".into(),
            public: true,
        };
        let json = serde_json::to_string(&remote).unwrap();
        let parsed: KveImageRemote = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, remote);
    }
}
