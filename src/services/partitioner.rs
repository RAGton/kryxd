//! Validação não destrutiva de discos e renderização declarativa do Disko.

use std::collections::HashSet;
use std::fmt;
use std::path::{Component, Path};
use std::process::Command;

use serde::Deserialize;
use serde_json::Value;

use crate::domain::{Encryption, FileSystem, InstallPlanV2, MountPlan, Topology};

/// Tamanho mínimo padrão de um disco de instalação: 10 GiB.
pub const DEFAULT_MIN_DISK_SIZE_BYTES: u64 = 10 * 1024 * 1024 * 1024;

/// Classificação física aproximada informada pelo `lsblk`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiskMedium {
    /// Disco sem partes móveis, incluindo NVMe.
    SolidState,
    /// Disco rotacional.
    Rotational,
    /// O kernel não informou a característica de rotação.
    Unknown,
}

/// Metadados não destrutivos coletados para um disco selecionado.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedDisk {
    /// Caminho persistido no plano, por exemplo `/dev/nvme0n1`.
    pub path: String,
    /// Capacidade total em bytes.
    pub size_bytes: u64,
    /// Tipo de mídia inferido a partir de `ROTA`.
    pub medium: DiskMedium,
    /// Transporte informado pelo kernel, quando disponível.
    pub transport: Option<String>,
    /// Indica se `blkid -p` encontrou uma assinatura existente.
    pub has_existing_signature: bool,
}

/// Resultado da validação dos discos referenciados pelo plano.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiskValidationReport {
    /// Discos validados na ordem: sistema, depois dados.
    pub disks: Vec<ValidatedDisk>,
}

/// Falhas possíveis durante validação ou renderização de armazenamento.
#[derive(Debug)]
pub enum PartitionerError {
    /// O contrato é estruturalmente inválido.
    InvalidPlan(String),
    /// O plano usa uma capacidade ainda não implementada com segurança.
    UnsupportedStorageCapability(String),
    /// Um utilitário de inspeção não pôde ser iniciado.
    CommandIo {
        command: &'static str,
        source: std::io::Error,
    },
    /// Um utilitário de inspeção terminou com falha.
    CommandFailed {
        command: &'static str,
        detail: String,
    },
    /// A saída de um utilitário não respeitou o contrato esperado.
    InvalidCommandOutput {
        command: &'static str,
        detail: String,
    },
}

impl fmt::Display for PartitionerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPlan(detail) => {
                write!(formatter, "plano de armazenamento inválido: {detail}")
            }
            Self::UnsupportedStorageCapability(detail) => {
                write!(
                    formatter,
                    "capacidade de armazenamento não suportada: {detail}"
                )
            }
            Self::CommandIo { command, source } => {
                write!(formatter, "falha ao executar {command}: {source}")
            }
            Self::CommandFailed { command, detail } => {
                write!(formatter, "{command} falhou: {detail}")
            }
            Self::InvalidCommandOutput { command, detail } => {
                write!(formatter, "saída inválida de {command}: {detail}")
            }
        }
    }
}

impl std::error::Error for PartitionerError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::CommandIo { source, .. } => Some(source),
            _ => None,
        }
    }
}

/// Validador read-only de elegibilidade e capacidade dos discos.
#[derive(Debug, Clone, Copy)]
pub struct DiskValidator {
    min_size_bytes: u64,
}

impl Default for DiskValidator {
    fn default() -> Self {
        Self::new(DEFAULT_MIN_DISK_SIZE_BYTES)
    }
}

impl DiskValidator {
    /// Cria uma política com o tamanho mínimo informado em bytes.
    pub const fn new(min_size_bytes: u64) -> Self {
        Self { min_size_bytes }
    }

    /// Retorna o tamanho mínimo exigido pela política.
    pub const fn min_size_bytes(&self) -> u64 {
        self.min_size_bytes
    }

    /// Inspeciona um disco usando somente `lsblk` e `blkid -p`.
    pub fn inspect_disk(&self, path: &str) -> Result<ValidatedDisk, PartitionerError> {
        validate_device_path(path)?;

        let output = Command::new("lsblk")
            .args([
                "-J",
                "-b",
                "-d",
                "-o",
                "PATH,TYPE,SIZE,RM,RO,ROTA,TRAN",
                "--",
                path,
            ])
            .output()
            .map_err(|source| PartitionerError::CommandIo {
                command: "lsblk",
                source,
            })?;

        if !output.status.success() {
            return Err(PartitionerError::CommandFailed {
                command: "lsblk",
                detail: stderr_detail(&output.stderr),
            });
        }

        let inventory: LsblkOutput = serde_json::from_slice(&output.stdout).map_err(|error| {
            PartitionerError::InvalidCommandOutput {
                command: "lsblk",
                detail: error.to_string(),
            }
        })?;
        let raw = inventory.blockdevices.into_iter().next().ok_or_else(|| {
            PartitionerError::InvalidCommandOutput {
                command: "lsblk",
                detail: format!("nenhum dispositivo retornado para {path}"),
            }
        })?;

        let disk = parse_lsblk_disk(raw)?;
        self.ensure_eligible(&disk)?;

        Ok(ValidatedDisk {
            path: disk.path.clone(),
            size_bytes: disk.size_bytes,
            medium: disk.medium,
            transport: disk.transport,
            has_existing_signature: probe_signature(&disk.path)?,
        })
    }

    /// Valida a topologia, duplicatas e todos os discos selecionados no plano.
    pub fn validate_plan(
        &self,
        plan: &InstallPlanV2,
    ) -> Result<DiskValidationReport, PartitionerError> {
        validate_storage_contract(plan)?;

        let paths = selected_disk_paths(plan)?;
        let mut disks = Vec::with_capacity(paths.len());
        for path in paths {
            disks.push(self.inspect_disk(path)?);
        }

        Ok(DiskValidationReport { disks })
    }

    fn ensure_eligible(&self, disk: &ParsedDisk) -> Result<(), PartitionerError> {
        if disk.device_type != "disk" {
            return Err(PartitionerError::InvalidPlan(format!(
                "{} tem tipo {}, esperado disk",
                disk.path, disk.device_type
            )));
        }
        if disk.removable {
            return Err(PartitionerError::InvalidPlan(format!(
                "{} é removível e não pode ser alvo da instalação",
                disk.path
            )));
        }
        if disk.read_only {
            return Err(PartitionerError::InvalidPlan(format!(
                "{} está marcado como somente leitura",
                disk.path
            )));
        }
        if disk
            .transport
            .as_deref()
            .is_some_and(|transport| transport.eq_ignore_ascii_case("usb"))
        {
            return Err(PartitionerError::InvalidPlan(format!(
                "{} usa transporte USB e não é elegível",
                disk.path
            )));
        }
        if disk.size_bytes == 0 {
            return Err(PartitionerError::InvalidPlan(format!(
                "não foi possível determinar o tamanho de {}",
                disk.path
            )));
        }
        if disk.size_bytes < self.min_size_bytes {
            return Err(PartitionerError::InvalidPlan(format!(
                "{} tem {} bytes, abaixo do mínimo de {} bytes",
                disk.path, disk.size_bytes, self.min_size_bytes
            )));
        }
        Ok(())
    }
}

/// Renderer puro do módulo Disko correspondente ao plano v2.
#[derive(Debug, Default, Clone, Copy)]
pub struct DiskoRenderer;

impl DiskoRenderer {
    /// Gera o conteúdo completo de `disko-config.nix` sem executar o Disko.
    pub fn render(plan: &InstallPlanV2) -> Result<String, PartitionerError> {
        validate_storage_contract(plan)?;
        for path in selected_disk_paths(plan)? {
            validate_device_path(path)?;
        }

        match plan.storage.topology {
            Topology::Single => render_single(plan),
            Topology::Split => render_split(plan),
            Topology::Raid => Err(PartitionerError::UnsupportedStorageCapability(
                "topologia raid ainda não possui renderer executável".into(),
            )),
            Topology::Manual => Err(PartitionerError::UnsupportedStorageCapability(
                "topologia manual ainda não possui renderer executável".into(),
            )),
        }
    }
}

#[derive(Debug, Deserialize)]
struct LsblkOutput {
    blockdevices: Vec<LsblkDisk>,
}

#[derive(Debug, Deserialize)]
struct LsblkDisk {
    path: String,
    #[serde(rename = "type")]
    device_type: String,
    size: Value,
    #[serde(default)]
    rm: Value,
    #[serde(default)]
    ro: Value,
    #[serde(default)]
    rota: Value,
    #[serde(default)]
    tran: Value,
}

#[derive(Debug)]
struct ParsedDisk {
    path: String,
    device_type: String,
    size_bytes: u64,
    removable: bool,
    read_only: bool,
    medium: DiskMedium,
    transport: Option<String>,
}

fn parse_lsblk_disk(raw: LsblkDisk) -> Result<ParsedDisk, PartitionerError> {
    let size_bytes =
        value_to_u64(&raw.size).ok_or_else(|| PartitionerError::InvalidCommandOutput {
            command: "lsblk",
            detail: format!("SIZE inválido para {}", raw.path),
        })?;
    let removable = value_to_bool(&raw.rm).unwrap_or(false);
    let read_only = value_to_bool(&raw.ro).unwrap_or(false);
    let medium = match value_to_bool(&raw.rota) {
        Some(true) => DiskMedium::Rotational,
        Some(false) => DiskMedium::SolidState,
        None => DiskMedium::Unknown,
    };
    let transport = raw
        .tran
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(ParsedDisk {
        path: raw.path,
        device_type: raw.device_type,
        size_bytes,
        removable,
        read_only,
        medium,
        transport,
    })
}

fn value_to_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

fn value_to_bool(value: &Value) -> Option<bool> {
    match value {
        Value::Bool(flag) => Some(*flag),
        Value::Number(number) => number.as_u64().map(|value| value != 0),
        Value::String(text) => match text.trim().to_ascii_lowercase().as_str() {
            "0" | "false" | "no" => Some(false),
            "1" | "true" | "yes" => Some(true),
            _ => None,
        },
        _ => None,
    }
}

fn probe_signature(path: &str) -> Result<bool, PartitionerError> {
    let output = Command::new("blkid")
        .args(["-p", "-o", "export", "--", path])
        .output()
        .map_err(|source| PartitionerError::CommandIo {
            command: "blkid",
            source,
        })?;

    match output.status.code() {
        Some(0) => Ok(true),
        Some(2) => Ok(false),
        _ => Err(PartitionerError::CommandFailed {
            command: "blkid",
            detail: stderr_detail(&output.stderr),
        }),
    }
}

fn stderr_detail(stderr: &[u8]) -> String {
    let detail = String::from_utf8_lossy(stderr).trim().to_owned();
    if detail.is_empty() {
        "comando terminou sem diagnóstico".into()
    } else {
        detail
    }
}

fn validate_storage_contract(plan: &InstallPlanV2) -> Result<(), PartitionerError> {
    let root = plan.storage.root.as_ref().ok_or_else(|| {
        PartitionerError::InvalidPlan("storage.root é obrigatório para single e split".into())
    })?;
    require_unencrypted(root, "root")?;

    match plan.storage.topology {
        Topology::Single => {
            ensure_count("systemDisks", plan.storage.system_disks.len(), 1)?;
            ensure_count("dataDisks", plan.storage.data_disks.len(), 0)?;
            if plan.storage.data.is_some() {
                return Err(PartitionerError::InvalidPlan(
                    "storage.data deve ser nulo na topologia single".into(),
                ));
            }
        }
        Topology::Split => {
            ensure_count("systemDisks", plan.storage.system_disks.len(), 1)?;
            ensure_count("dataDisks", plan.storage.data_disks.len(), 1)?;
            let data = plan.storage.data.as_ref().ok_or_else(|| {
                PartitionerError::InvalidPlan(
                    "storage.data é obrigatório na topologia split".into(),
                )
            })?;
            require_unencrypted(data, "data")?;
            if root.filesystem == FileSystem::Zfs && data.filesystem == FileSystem::Zfs {
                return Err(PartitionerError::UnsupportedStorageCapability(
                    "split com ZFS simultâneo em root e data não é suportado".into(),
                ));
            }
            if root.filesystem == FileSystem::Zfs {
                return Err(PartitionerError::UnsupportedStorageCapability(
                    "root ZFS em topologia split não é suportado".into(),
                ));
            }
        }
        Topology::Raid => {
            return Err(PartitionerError::UnsupportedStorageCapability(
                "topologia raid é parseada, mas falha fechado nesta fase".into(),
            ));
        }
        Topology::Manual => {
            return Err(PartitionerError::UnsupportedStorageCapability(
                "topologia manual é parseada, mas falha fechado nesta fase".into(),
            ));
        }
    }

    let uses_zfs = root.filesystem == FileSystem::Zfs
        || plan
            .storage
            .data
            .as_ref()
            .is_some_and(|data| data.filesystem == FileSystem::Zfs);
    if uses_zfs {
        let zfs = plan.storage.zfs.as_ref().ok_or_else(|| {
            PartitionerError::InvalidPlan(
                "storage.zfs é obrigatório quando um volume usa ZFS".into(),
            )
        })?;
        validate_refquota(&zfs.user_refquota)?;
    } else if plan.storage.zfs.is_some() {
        return Err(PartitionerError::InvalidPlan(
            "storage.zfs só pode ser definido quando um volume usa ZFS".into(),
        ));
    }

    selected_disk_paths(plan).map(|_| ())
}

fn require_unencrypted(mount: &MountPlan, name: &str) -> Result<(), PartitionerError> {
    if mount.encryption != Encryption::None {
        return Err(PartitionerError::UnsupportedStorageCapability(format!(
            "criptografia luks2 em storage.{name} ainda não é suportada"
        )));
    }
    Ok(())
}

fn ensure_count(field: &str, actual: usize, expected: usize) -> Result<(), PartitionerError> {
    if actual != expected {
        return Err(PartitionerError::InvalidPlan(format!(
            "storage.{field} deve conter {expected} disco(s), recebeu {actual}"
        )));
    }
    Ok(())
}

fn selected_disk_paths(plan: &InstallPlanV2) -> Result<Vec<&str>, PartitionerError> {
    let mut paths =
        Vec::with_capacity(plan.storage.system_disks.len() + plan.storage.data_disks.len());
    let mut seen = HashSet::new();

    for path in plan
        .storage
        .system_disks
        .iter()
        .chain(plan.storage.data_disks.iter())
    {
        if path.trim() != path || path.is_empty() {
            return Err(PartitionerError::InvalidPlan(
                "caminhos de disco não podem ser vazios nem conter espaços nas bordas".into(),
            ));
        }
        if !seen.insert(path.as_str()) {
            return Err(PartitionerError::InvalidPlan(format!(
                "disco duplicado no plano: {path}"
            )));
        }
        paths.push(path.as_str());
    }

    Ok(paths)
}

fn validate_device_path(path: &str) -> Result<(), PartitionerError> {
    let invalid_prefixes = [
        "/dev/loop",
        "/dev/zram",
        "/dev/ram",
        "/dev/sr",
        "/dev/fd",
        "/dev/md",
        "/dev/dm-",
        "/dev/mapper/",
        "/dev/nbd",
    ];
    if !path.starts_with("/dev/")
        || path.contains("//")
        || Path::new(path)
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err(PartitionerError::InvalidPlan(format!(
            "caminho de disco inválido ou fora de /dev: {path}"
        )));
    }
    if invalid_prefixes
        .iter()
        .any(|prefix| path.starts_with(prefix))
    {
        return Err(PartitionerError::InvalidPlan(format!(
            "tipo de dispositivo inelegível: {path}"
        )));
    }
    if !path
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "/._:+-".contains(character))
    {
        return Err(PartitionerError::InvalidPlan(format!(
            "caminho de disco contém caracteres não permitidos: {path}"
        )));
    }
    Ok(())
}

fn validate_refquota(refquota: &str) -> Result<(), PartitionerError> {
    let value = refquota.trim();
    let digits = value.chars().take_while(char::is_ascii_digit).count();
    let unit = &value[digits..];
    let valid_unit = matches!(
        unit,
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
    );
    if digits == 0
        || digits == value.len()
        || !valid_unit
        || value[..digits]
            .parse::<u64>()
            .ok()
            .filter(|size| *size > 0)
            .is_none()
    {
        return Err(PartitionerError::InvalidPlan(format!(
            "storage.zfs.userRefquota inválido: {refquota}; use, por exemplo, 100G"
        )));
    }
    Ok(())
}

fn render_single(plan: &InstallPlanV2) -> Result<String, PartitionerError> {
    let disk = &plan.storage.system_disks[0];
    let root = plan.storage.root.as_ref().expect("contrato validado");
    let partition = match root.filesystem {
        FileSystem::Btrfs => btrfs_partition("/", true),
        FileSystem::Ext4 => filesystem_partition("ext4", "/"),
        FileSystem::Xfs => filesystem_partition("xfs", "/"),
        FileSystem::Zfs => zfs_partition(),
    };
    let zpool = if root.filesystem == FileSystem::Zfs {
        render_zpool(plan, true)?
    } else {
        String::new()
    };

    Ok(format!(
        r#"{{
  disko.devices = {{
    disk.system = {{
      type = "disk";
      device = "{disk}";
      content = {{
        type = "gpt";
        partitions = {{
{esp}
          root = {{
            size = "100%";
{partition}
          }};
        }};
      }};
    }};
{zpool}  }};
}}
"#,
        esp = indent(&esp_partition(), 10),
        partition = indent(&partition, 12),
    ))
}

fn render_split(plan: &InstallPlanV2) -> Result<String, PartitionerError> {
    let system_disk = &plan.storage.system_disks[0];
    let data_disk = &plan.storage.data_disks[0];
    let root = plan.storage.root.as_ref().expect("contrato validado");
    let data = plan.storage.data.as_ref().expect("contrato validado");

    let root_partition = match root.filesystem {
        FileSystem::Btrfs => btrfs_partition("/", true),
        FileSystem::Ext4 => filesystem_partition("ext4", "/"),
        FileSystem::Xfs => filesystem_partition("xfs", "/"),
        FileSystem::Zfs => unreachable!("root ZFS split foi rejeitado pelo contrato"),
    };
    let data_partition = match data.filesystem {
        FileSystem::Btrfs => btrfs_partition("/srv/data", false),
        FileSystem::Ext4 => filesystem_partition("ext4", "/srv/data"),
        FileSystem::Xfs => filesystem_partition("xfs", "/srv/data"),
        FileSystem::Zfs => zfs_partition(),
    };
    let zpool = if data.filesystem == FileSystem::Zfs {
        render_zpool(plan, false)?
    } else {
        String::new()
    };

    Ok(format!(
        r#"{{
  disko.devices = {{
    disk = {{
      system = {{
        type = "disk";
        device = "{system_disk}";
        content = {{
          type = "gpt";
          partitions = {{
{esp}
            root = {{
              size = "100%";
{root_partition}
            }};
          }};
        }};
      }};
      data = {{
        type = "disk";
        device = "{data_disk}";
        content = {{
          type = "gpt";
          partitions.data = {{
            size = "100%";
{data_partition}
          }};
        }};
      }};
    }};
{zpool}  }};
}}
"#,
        esp = indent(&esp_partition(), 12),
        root_partition = indent(&root_partition, 14),
        data_partition = indent(&data_partition, 12),
    ))
}

fn esp_partition() -> String {
    r#"esp = {
  size = "1G";
  type = "EF00";
  content = {
    type = "filesystem";
    format = "vfat";
    mountpoint = "/boot";
    mountOptions = [ "umask=0077" ];
  };
};"#
    .into()
}

fn filesystem_partition(format: &str, mountpoint: &str) -> String {
    format!(
        r#"content = {{
  type = "filesystem";
  format = "{format}";
  mountpoint = "{mountpoint}";
}};"#
    )
}

fn btrfs_partition(mountpoint: &str, root_layout: bool) -> String {
    let subvolumes = if root_layout {
        r#""@root" = { mountpoint = "/"; };
"@home" = { mountpoint = "/home"; };
"@nix" = { mountpoint = "/nix"; mountOptions = [ "noatime" "compress=zstd" ]; };
"@var" = { mountpoint = "/var"; };"#
            .to_string()
    } else {
        format!(
            r#""@srv-data" = {{ mountpoint = "{mountpoint}"; }};
"@srv-data/home" = {{ mountpoint = "{mountpoint}/home"; }};
"@srv-data/images" = {{ mountpoint = "{mountpoint}/images"; }};
"@srv-data/snapshots" = {{ mountpoint = "{mountpoint}/snapshots"; }};
"@srv-data/storage" = {{ mountpoint = "{mountpoint}/storage"; }};"#
        )
    };

    format!(
        r#"content = {{
  type = "btrfs";
  extraArgs = [ "-f" ];
  subvolumes = {{
{subvolumes}
  }};
}};"#,
        subvolumes = indent(&subvolumes, 4),
    )
}

fn zfs_partition() -> String {
    r#"content = {
  type = "zfs";
  pool = "zroot";
};"#
    .into()
}

fn render_zpool(plan: &InstallPlanV2, root_pool: bool) -> Result<String, PartitionerError> {
    let refquota = &plan
        .storage
        .zfs
        .as_ref()
        .ok_or_else(|| PartitionerError::InvalidPlan("storage.zfs ausente".into()))?
        .user_refquota;
    let root_datasets = if root_pool {
        r#""root" = {
  type = "zfs_fs";
  mountpoint = "/";
};
"root/home" = {
  type = "zfs_fs";
  mountpoint = "/home";
};
"root/nix" = {
  type = "zfs_fs";
  mountpoint = "/nix";
  options.atime = "off";
};
"root/var" = {
  type = "zfs_fs";
  mountpoint = "/var";
};
"#
    } else {
        ""
    };

    Ok(format!(
        r#"    zpool.zroot = {{
      type = "zpool";
      options.ashift = "12";
      options.cachefile = "none";
      rootFsOptions = {{
        mountpoint = "none";
        compression = "zstd";
        acltype = "posixacl";
        xattr = "sa";
        "com.sun:auto-snapshot" = "false";
      }};
      datasets = {{
{root_datasets}        "srv-data" = {{
          type = "zfs_fs";
          options.mountpoint = "none";
        }};
        "srv-data/home" = {{
          type = "zfs_fs";
          mountpoint = "/srv/data/home";
          options.refquota = "{refquota}";
        }};
        "srv-data/images" = {{
          type = "zfs_fs";
          mountpoint = "/srv/data/images";
        }};
        "srv-data/snapshots" = {{
          type = "zfs_fs";
          mountpoint = "/srv/data/snapshots";
        }};
        "srv-data/storage" = {{
          type = "zfs_fs";
          mountpoint = "/srv/data/storage";
        }};
      }};
    }};
"#,
        root_datasets = indent(root_datasets, 8),
    ))
}

fn indent(text: &str, spaces: usize) -> String {
    let prefix = " ".repeat(spaces);
    text.lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_numeric_and_string_lsblk_scalars() {
        assert_eq!(value_to_u64(&Value::from(42)), Some(42));
        assert_eq!(value_to_u64(&Value::from("42")), Some(42));
        assert_eq!(value_to_bool(&Value::from("0")), Some(false));
        assert_eq!(value_to_bool(&Value::from(1)), Some(true));
    }

    #[test]
    fn classifies_rotational_and_solid_state_media() {
        let rotational = parse_lsblk_disk(LsblkDisk {
            path: "/dev/vda".into(),
            device_type: "disk".into(),
            size: Value::from(DEFAULT_MIN_DISK_SIZE_BYTES),
            rm: Value::from(false),
            ro: Value::from(false),
            rota: Value::from(true),
            tran: Value::from("sata"),
        })
        .expect("ROTA=1 deve ser válido");
        let solid_state = parse_lsblk_disk(LsblkDisk {
            path: "/dev/nvme0n1".into(),
            device_type: "disk".into(),
            size: Value::from(DEFAULT_MIN_DISK_SIZE_BYTES),
            rm: Value::from(false),
            ro: Value::from(false),
            rota: Value::from(false),
            tran: Value::from("nvme"),
        })
        .expect("ROTA=0 deve ser válido");

        assert_eq!(rotational.medium, DiskMedium::Rotational);
        assert_eq!(solid_state.medium, DiskMedium::SolidState);
    }

    #[test]
    fn refquota_must_be_positive_and_have_binary_style_unit() {
        assert!(validate_refquota("100G").is_ok());
        assert!(validate_refquota("0G").is_err());
        assert!(validate_refquota("100").is_err());
        assert!(validate_refquota("100G; builtins.abort").is_err());
    }

    #[test]
    fn rejects_unsafe_device_path() {
        assert!(validate_device_path("/dev/nvme0n1").is_ok());
        assert!(validate_device_path("/dev/disk/by-id/ata-disk_1").is_ok());
        assert!(validate_device_path("/dev/loop0").is_err());
        assert!(validate_device_path("/dev/../etc/passwd").is_err());
        assert!(validate_device_path("/dev/vda\"; abort").is_err());
    }
}
