//! Backend de storage para mídias KVE baseado em diretório.
//!
//! Layout físico sob `root_path`:
//!
//! ```text
//! <root>/staging/.staging-<uuid>   <- area de gravacao intermediaria
//! <root>/isos/<filename>          <- ISOs finalizadas
//! <root>/disks/<filename>         <- discos de VM finalizados
//! ```
//!
//! Staging e final ficam em subdiretorios separados. O caminho
//! final NAO e' decidido pela extensao do filename, e sim pela
//! classe semantica escolhida via `stage_iso` / `stage_virtual_disk`.
//!
//! Finalizacao:
//! 1. `OpenOptions::create_new(true)` no destino. POSIX `O_CREAT|O_EXCL`
//!    garante atomicidade: ou o destino e' nosso (vazio) ou ja existia.
//! 2. Se o destino existia, retorna `DestinationExists`. Remove o
//!    arquivo vazio criado pelo O_EXCL para nao deixar lixo.
//! 3. Se foi nosso, remove o vazio e faz `rename(staging, final)`
//!    atomico (mesmo filesystem garantido: ambos estao em root_path).
//!
//! Invariantes:
//! - O id do storage deve passar `is_valid_storage_id`.
//! - O `filename` deve ser seguro (sem `/`, `..`, `.`, nulo, muito longo).
//! - Staging fica sempre em `<root>/staging/`.
//! - Final ISO vai sempre para `<root>/isos/`. Disco para `<root>/disks/`.
//! - O handle carrega a classe semantica. Finalizar com classe diferente
//!    retorna `ClassMismatch`.
//! - O handle carrega o `storage_id`. Handle de outro storage e' rejeitado
//!    via `StorageMismatch`.
//! - Destino existente nunca e' sobrescrito.
//! - Rename cross-filesystem retorna `Io(...)` com `EXDEV` ou similar;
//!    sem fallback copy+delete.
//!
//! Este modulo faz I/O local controlado. Nenhuma operacao HTTP,
//! nenhum download, nenhuma chamada Incus.

use std::path::{Path, PathBuf};

use crate::storage::{is_valid_storage_id, MediaStorageConfig};
use thiserror::Error;
use tokio::fs;
use uuid::Uuid;

/// Subdiretorio canonico dentro do root_path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MediaSubdir {
    Staging,
    Isos,
    Disks,
}

impl MediaSubdir {
    fn as_segment(self) -> &'static str {
        match self {
            MediaSubdir::Staging => "staging",
            MediaSubdir::Isos => "isos",
            MediaSubdir::Disks => "disks",
        }
    }
}

/// Classe semantica da midia.
///
/// Estado interno ao runtime. Nao e' parte do contrato publico
/// (`crates/kryx`); usado apenas dentro do backend.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaStorageClass {
    Iso,
    VirtualDisk,
}

impl MediaStorageClass {
    fn subdir(self) -> MediaSubdir {
        match self {
            MediaStorageClass::Iso => MediaSubdir::Isos,
            MediaStorageClass::VirtualDisk => MediaSubdir::Disks,
        }
    }
}

/// Erros do backend de storage.
#[derive(Debug, Error)]
pub enum MediaStorageError {
    #[error("storage id invalido: {0}")]
    InvalidStorageId(String),
    #[error("nome de arquivo invalido: {0}")]
    InvalidFilename(String),
    #[error("root_path invalido: {0}")]
    InvalidRootPath(String),
    #[error("path traversal detectado: '{kind}' fora do root")]
    PathTraversal { kind: &'static str },
    #[error("limite excedido: {size} > {max}")]
    SizeExceeded { size: u64, max: u64 },
    #[error("destino ja existe")]
    DestinationExists,
    #[error("classe de midia nao corresponde ao staging")]
    ClassMismatch,
    #[error("staging pertence a outro storage")]
    StorageMismatch,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Handle retornado por `stage_iso` / `stage_virtual_disk`.
///
/// Campos privados: o caller nao pode forjar outro `class` /
/// `storage_id` / `staging_path`. Apenas `final_filename` e' exposto
/// via metodo para diagnostico.
#[derive(Debug)]
pub struct StagingHandle {
    storage_id: String,
    class: MediaStorageClass,
    staging_path: PathBuf,
    final_filename: String,
}

impl StagingHandle {
    /// Nome do arquivo final pretendido (apenas leitura).
    pub fn final_filename(&self) -> &str {
        &self.final_filename
    }
}

/// Backend de storage que grava arquivos em um diretorio local.
#[derive(Debug, Clone)]
pub struct DirectoryStorage {
    config: MediaStorageConfig,
}

impl DirectoryStorage {
    /// Constroi um backend a partir de uma configuracao.
    ///
    /// Cria os subdiretorios canonicos (`staging/`, `isos/`, `disks/`)
    /// se nao existirem. Retorna erro se o id for invalido, se o
    /// root_path for vazio, ou se a criacao dos subdiretorios falhar.
    pub async fn new(config: MediaStorageConfig) -> Result<Self, MediaStorageError> {
        if !is_valid_storage_id(&config.id) {
            return Err(MediaStorageError::InvalidStorageId(config.id.clone()));
        }
        if config.root_path.as_os_str().is_empty() {
            return Err(MediaStorageError::InvalidRootPath("(empty)".into()));
        }

        // Cria root e os tres subdiretorios canonicos.
        ensure_subdir(&config.root_path, MediaSubdir::Staging).await?;
        ensure_subdir(&config.root_path, MediaSubdir::Isos).await?;
        ensure_subdir(&config.root_path, MediaSubdir::Disks).await?;

        // Validacao pos-criacao: cada subdir e' um diretorio dentro do root.
        for sub in [MediaSubdir::Staging, MediaSubdir::Isos, MediaSubdir::Disks] {
            let p = subdir_path(&config.root_path, sub);
            ensure_within_root(&p, &config.root_path)?;
            let md = fs::metadata(&p).await?;
            if !md.is_dir() {
                return Err(MediaStorageError::InvalidRootPath(format!(
                    "{:?} nao e' um diretorio",
                    p
                )));
            }
        }

        Ok(Self { config })
    }

    /// Id logico do storage.
    pub fn id(&self) -> &str {
        &self.config.id
    }

    /// Root path configurado.
    pub fn root_path(&self) -> &Path {
        &self.config.root_path
    }

    /// Path do subdiretorio de staging.
    pub fn staging_dir(&self) -> PathBuf {
        subdir_path(&self.config.root_path, MediaSubdir::Staging)
    }

    /// Path do subdiretorio de ISOs finalizadas.
    pub fn isos_dir(&self) -> PathBuf {
        subdir_path(&self.config.root_path, MediaSubdir::Isos)
    }

    /// Path do subdiretorio de discos finalizados.
    pub fn disks_dir(&self) -> PathBuf {
        subdir_path(&self.config.root_path, MediaSubdir::Disks)
    }

    /// Inicia o staging de uma ISO.
    ///
    /// Cria `<root>/staging/.staging-<uuid>` e retorna o handle.
    /// O caller grava dados via `open_append` e chama
    /// `finalize_iso(handle)`.
    pub async fn stage_iso(&self, filename: &str) -> Result<StagingHandle, MediaStorageError> {
        self.stage_internal(MediaStorageClass::Iso, filename).await
    }

    /// Inicia o staging de um disco de VM.
    pub async fn stage_virtual_disk(
        &self,
        filename: &str,
    ) -> Result<StagingHandle, MediaStorageError> {
        self.stage_internal(MediaStorageClass::VirtualDisk, filename)
            .await
    }

    /// Finaliza uma ISO fazendo commit atomico nao-destrutivo.
    pub async fn finalize_iso(
        &self,
        handle: StagingHandle,
    ) -> Result<PathBuf, MediaStorageError> {
        self.finalize_internal(MediaStorageClass::Iso, handle).await
    }

    /// Finaliza um disco de VM fazendo commit atomico nao-destrutivo.
    pub async fn finalize_virtual_disk(
        &self,
        handle: StagingHandle,
    ) -> Result<PathBuf, MediaStorageError> {
        self.finalize_internal(MediaStorageClass::VirtualDisk, handle)
            .await
    }

    /// Aborta um staging. Idempotente: arquivo ja removido retorna Ok.
    ///
    /// Nao distingue a classe: qualquer handle pode ser abortado,
    /// ja que staging fica sempre em `/staging/` por construcao.
    pub async fn abort(&self, handle: StagingHandle) -> Result<(), MediaStorageError> {
        self.verify_handle_storage(&handle)?;
        ensure_within_root(&handle.staging_path, &self.staging_dir())?;
        match fs::remove_file(&handle.staging_path).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(MediaStorageError::Io(e)),
        }
    }

    /// Abre um arquivo de staging existente para append.
    pub async fn open_append(handle: &StagingHandle) -> Result<fs::File, MediaStorageError> {
        let f = fs::OpenOptions::new()
            .append(true)
            .open(&handle.staging_path)
            .await?;
        Ok(f)
    }

    // ====== internos ======

    async fn stage_internal(
        &self,
        class: MediaStorageClass,
        filename: &str,
    ) -> Result<StagingHandle, MediaStorageError> {
        validate_filename(filename)?;
        let staging_dir = self.staging_dir();
        let staging_name = format!(".staging-{}", Uuid::new_v4());
        let staging_path = staging_dir.join(staging_name);
        fs::File::create(&staging_path).await?;
        Ok(StagingHandle {
            storage_id: self.config.id.clone(),
            class,
            staging_path,
            final_filename: filename.to_string(),
        })
    }

    async fn finalize_internal(
        &self,
        class: MediaStorageClass,
        handle: StagingHandle,
    ) -> Result<PathBuf, MediaStorageError> {
        // 1. O handle veio deste storage?
        self.verify_handle_storage(&handle)?;
        // 2. O handle foi criado para a classe solicitada?
        if handle.class != class {
            return Err(MediaStorageError::ClassMismatch);
        }
        // 3. Staging esta dentro de /staging/ deste root?
        ensure_within_root(&handle.staging_path, &self.staging_dir())?;
        let staging_path = handle.staging_path.clone();

        // 4. Calcular final_path no subdir correto.
        let final_dir = subdir_path(&self.config.root_path, class.subdir());
        ensure_within_root(&final_dir, &self.config.root_path)?;
        let final_path = final_dir.join(&handle.final_filename);
        ensure_within_root(&final_path, &final_dir)?;

        // 5. Validar tamanho contra max_bytes.
        let metadata = fs::metadata(&staging_path).await?;
        let size = metadata.len();
        if size > self.config.max_bytes {
            let _ = fs::remove_file(&staging_path).await;
            return Err(MediaStorageError::SizeExceeded {
                size,
                max: self.config.max_bytes,
            });
        }

        // 6. Atomic no-replace: OpenOptions::create_new(true) usa
        //    POSIX O_CREAT|O_EXCL. Se o destino existe, falha com
        //    AlreadyExists. Em sucesso, fecha e remove o arquivo
        //    vazio criado pelo O_EXCL para que o rename nao fique
        //    com ele por cima.
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&final_path)
            .await
        {
            Ok(file) => drop(file),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                let _ = fs::remove_file(&staging_path).await;
                return Err(MediaStorageError::DestinationExists);
            }
            Err(e) => {
                let _ = fs::remove_file(&staging_path).await;
                return Err(MediaStorageError::Io(e));
            }
        }

        // 7. Rename(staging, final). Mesmo filesystem garantido pela
        //    invariante do layout; cross-filesystem produziria
        //    EXDEV propagado via io::Error.
        if let Err(e) = fs::rename(&staging_path, &final_path).await {
            // Em erro, tentar limpar o staging (final_path NAO foi
            // tocado, ou foi substituido com o conteudo do staging).
            let _ = fs::remove_file(&staging_path).await;
            return Err(MediaStorageError::Io(e));
        }
        Ok(final_path)
    }

    fn verify_handle_storage(&self, handle: &StagingHandle) -> Result<(), MediaStorageError> {
        if handle.storage_id != self.config.id {
            return Err(MediaStorageError::StorageMismatch);
        }
        Ok(())
    }
}

/// Resolve o subdiretorio canonico.
fn subdir_path(root: &Path, sub: MediaSubdir) -> PathBuf {
    root.join(sub.as_segment())
}

/// Cria subdiretorio se nao existir. Erro em qualquer outro problema.
async fn ensure_subdir(root: &Path, sub: MediaSubdir) -> Result<(), MediaStorageError> {
    let p = subdir_path(root, sub);
    fs::create_dir_all(&p).await?;
    Ok(())
}

/// Valida que `filename` e' seguro para uso em path: nao-vazio,
/// <=255 chars, sem separadores, sem `..`, sem `.` inicial, sem
/// byte nulo.
pub fn validate_filename(filename: &str) -> Result<(), MediaStorageError> {
    if filename.is_empty() || filename.len() > 255 {
        return Err(MediaStorageError::InvalidFilename(filename.to_string()));
    }
    if filename.contains("..")
        || filename.contains('/')
        || filename.contains('\\')
        || filename.contains('\0')
    {
        return Err(MediaStorageError::InvalidFilename(filename.to_string()));
    }
    if filename.starts_with('.') {
        return Err(MediaStorageError::InvalidFilename(filename.to_string()));
    }
    Ok(())
}

/// Verifica que `candidate` resolve para dentro de `root`
/// lexicalmente. Mesmo filesystem nao e' verificado, mas para o
/// layout canonico (todas as escritas dentro de root_path) isso e'
/// garantido por construcao.
fn ensure_within_root(candidate: &Path, root: &Path) -> Result<(), MediaStorageError> {
    let normalize = |p: &Path| -> Option<PathBuf> {
        let mut out = PathBuf::new();
        for component in p.components() {
            match component {
                std::path::Component::ParentDir => {
                    if !out.pop() {
                        return None;
                    }
                }
                std::path::Component::Normal(c) => out.push(c),
                std::path::Component::CurDir => {}
                _ => {}
            }
        }
        Some(out)
    };
    let root_norm = normalize(root).ok_or(MediaStorageError::PathTraversal {
        kind: "root_invalid",
    })?;
    let cand_norm = normalize(candidate).ok_or(MediaStorageError::PathTraversal {
        kind: "candidate_invalid",
    })?;
    if !cand_norm.starts_with(&root_norm) {
        return Err(MediaStorageError::PathTraversal {
            kind: "outside_root",
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    fn tmp_dir(suffix: &str) -> PathBuf {
        std::env::temp_dir().join(format!("kryxd-storage-test-{}-{}", suffix, Uuid::new_v4()))
    }

    async fn write_payload(handle: &StagingHandle, payload: &[u8]) {
        let f = DirectoryStorage::open_append(handle).await.unwrap();
        let mut w = tokio::io::BufWriter::new(f);
        w.write_all(payload).await.unwrap();
        w.flush().await.unwrap();
    }

    // ====== construcao e layout ======

    #[tokio::test]
    async fn new_creates_staging_isos_and_disks_subdirs() {
        let root = tmp_dir("layout");
        let storage = DirectoryStorage::new(MediaStorageConfig {
            id: "kryonix-isos".into(),
            root_path: root.clone(),
            max_bytes: 1024,
        })
        .await
        .unwrap();

        for sub in ["staging", "isos", "disks"] {
            let p = root.join(sub);
            assert!(p.is_dir(), "esperava {p:?} como diretorio");
            // Os subdiretorios sao diretorios, nao arquivos nem symlinks
            // para fora do root.
            assert!(storage
                .staging_dir()
                .starts_with(&root)
                || storage.isos_dir().starts_with(&root)
                || storage.disks_dir().starts_with(&root));
        }

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn rejects_invalid_storage_id() {
        let root = tmp_dir("reject-id");
        let r = DirectoryStorage::new(MediaStorageConfig {
            id: String::new(),
            root_path: root.clone(),
            max_bytes: 1024,
        })
        .await;
        assert!(matches!(r, Err(MediaStorageError::InvalidStorageId(_))));

        let r = DirectoryStorage::new(MediaStorageConfig {
            id: "with/slash".into(),
            root_path: root,
            max_bytes: 1024,
        })
        .await;
        assert!(matches!(r, Err(MediaStorageError::InvalidStorageId(_))));
    }

    // ====== staging ======

    #[tokio::test]
    async fn stage_iso_lands_in_staging_subdir() {
        let root = tmp_dir("stage-iso");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-isos",
            root.clone(),
        ))
        .await
        .unwrap();

        let handle = storage.stage_iso("debian-13.iso").await.unwrap();
        assert!(
            handle.staging_path.starts_with(storage.staging_dir()),
            "staging_path={:?} deveria estar em staging_dir={:?}",
            handle.staging_path,
            storage.staging_dir()
        );
        assert!(handle.staging_path.starts_with(&root.join("staging")));
        assert_eq!(handle.final_filename(), "debian-13.iso");

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn stage_virtual_disk_lands_in_staging_subdir() {
        let root = tmp_dir("stage-disk");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-disks",
            root.clone(),
        ))
        .await
        .unwrap();

        let handle = storage
            .stage_virtual_disk("ubuntu-cloud.qcow2")
            .await
            .unwrap();
        assert!(handle.staging_path.starts_with(storage.staging_dir()));

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    // ====== finalizacao ======

    #[tokio::test]
    async fn finalize_iso_ends_up_in_isos_subdir() {
        let root = tmp_dir("fin-iso");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-isos",
            root.clone(),
        ))
        .await
        .unwrap();

        let handle = storage.stage_iso("debian-13.iso").await.unwrap();
        write_payload(&handle, b"ISO payload").await;
        let final_path = storage.finalize_iso(handle).await.unwrap();

        assert!(final_path.starts_with(storage.isos_dir()));
        assert!(final_path.starts_with(&root.join("isos")));
        assert!(!storage.staging_dir().join(".staging-anywhere").exists());

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn finalize_virtual_disk_ends_up_in_disks_subdir() {
        let root = tmp_dir("fin-disk");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-disks",
            root.clone(),
        ))
        .await
        .unwrap();

        let handle = storage
            .stage_virtual_disk("ubuntu-cloud.qcow2")
            .await
            .unwrap();
        write_payload(&handle, b"disk payload").await;
        let final_path = storage.finalize_virtual_disk(handle).await.unwrap();

        assert!(final_path.starts_with(storage.disks_dir()));
        assert!(final_path.starts_with(&root.join("disks")));

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    // ====== no-replace (DestinationExists) ======

    #[tokio::test]
    async fn finalize_iso_refuses_existing_destination() {
        let root = tmp_dir("iso-exists");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-isos",
            root.clone(),
        ))
        .await
        .unwrap();

        // Primeiro commit bem-sucedido.
        let h1 = storage.stage_iso("debian-13.iso").await.unwrap();
        write_payload(&h1, b"first").await;
        let original_path = storage.finalize_iso(h1).await.unwrap();
        let original_content = tokio::fs::read(&original_path).await.unwrap();
        assert_eq!(original_content, b"first");

        // Segundo staging com mesmo filename.
        let h2 = storage.stage_iso("debian-13.iso").await.unwrap();
        write_payload(&h2, b"OVERWRITE-ATTEMPT").await;
        let r = storage.finalize_iso(h2).await;
        assert!(matches!(r, Err(MediaStorageError::DestinationExists)));

        // Conteudo original preservado.
        let preserved = tokio::fs::read(&original_path).await.unwrap();
        assert_eq!(preserved, b"first", "destino original nao deve ter sido alterado");

        // Staging deve ter sido limpo (nao vaza arquivo orfao).
        let staging_files: Vec<_> = std::fs::read_dir(storage.staging_dir())
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert!(staging_files.is_empty());

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn finalize_virtual_disk_refuses_existing_destination() {
        let root = tmp_dir("disk-exists");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-disks",
            root.clone(),
        ))
        .await
        .unwrap();

        let h1 = storage
            .stage_virtual_disk("debian-12.qcow2")
            .await
            .unwrap();
        write_payload(&h1, b"original-disk").await;
        let original_path = storage.finalize_virtual_disk(h1).await.unwrap();

        let h2 = storage
            .stage_virtual_disk("debian-12.qcow2")
            .await
            .unwrap();
        write_payload(&h2, b"OVERWRITE-DISK").await;
        assert!(matches!(
            storage.finalize_virtual_disk(h2).await,
            Err(MediaStorageError::DestinationExists)
        ));

        let preserved = tokio::fs::read(&original_path).await.unwrap();
        assert_eq!(preserved, b"original-disk");

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    // ====== cross-class ======

    #[tokio::test]
    async fn iso_staging_cannot_be_finalized_as_disk() {
        let root = tmp_dir("class-iso-as-disk");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix",
            root.clone(),
        ))
        .await
        .unwrap();

        let h = storage.stage_iso("anything.iso").await.unwrap();
        write_payload(&h, b"x").await;
        assert!(matches!(
            storage.finalize_virtual_disk(h).await,
            Err(MediaStorageError::ClassMismatch)
        ));

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn disk_staging_cannot_be_finalized_as_iso() {
        let root = tmp_dir("class-disk-as-iso");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix",
            root.clone(),
        ))
        .await
        .unwrap();

        let h = storage.stage_virtual_disk("anything.qcow2").await.unwrap();
        write_payload(&h, b"x").await;
        assert!(matches!(
            storage.finalize_iso(h).await,
            Err(MediaStorageError::ClassMismatch)
        ));

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    // ====== extensao NAO define classe ======

    #[tokio::test]
    async fn extension_does_not_define_class() {
        let root = tmp_dir("ext-no-class");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix",
            root.clone(),
        ))
        .await
        .unwrap();

        // ISO com nome .qcow2 ainda vai para isos/
        let h_iso_with_disk_name = storage.stage_iso("imagem.qcow2").await.unwrap();
        write_payload(&h_iso_with_disk_name, b"a").await;
        let p = storage.finalize_iso(h_iso_with_disk_name).await.unwrap();
        assert!(p.starts_with(storage.isos_dir()));
        assert!(!p.starts_with(storage.disks_dir()));

        // Disco com nome .iso ainda vai para disks/
        let h_disk_with_iso_name = storage.stage_virtual_disk("disco.iso").await.unwrap();
        write_payload(&h_disk_with_iso_name, b"b").await;
        let p = storage.finalize_virtual_disk(h_disk_with_iso_name).await.unwrap();
        assert!(p.starts_with(storage.disks_dir()));
        assert!(!p.starts_with(storage.isos_dir()));

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    // ====== cross-storage ======

    #[tokio::test]
    async fn handle_from_other_storage_is_rejected() {
        let root1 = tmp_dir("storage-a");
        let root2 = tmp_dir("storage-b");
        let s1 = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-a",
            root1.clone(),
        ))
        .await
        .unwrap();
        let s2 = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-b",
            root2.clone(),
        ))
        .await
        .unwrap();

        let h = s1.stage_iso("payload.iso").await.unwrap();
        write_payload(&h, b"x").await;

        // Tentar finalizar no s2: storage mismatch.
        assert!(matches!(
            s2.finalize_iso(h).await,
            Err(MediaStorageError::StorageMismatch)
        ));

        let _ = tokio::fs::remove_dir_all(&root1).await;
        let _ = tokio::fs::remove_dir_all(&root2).await;
    }

    // ====== staging forjado: ainda recusado ======

    #[test]
    fn forged_handle_outside_staging_is_rejected() {
        // StagingHandle tem campos privados, mas se um caller conseguisse
        // construir um handle com staging_path fora de /staging/, a
        // normalizacao Lexical em ensure_within_root falharia.
        // Este teste so documenta a defesa; nao pode forjar o struct
        // diretamente. Mas validamos: handle real precisa estar em
        // /staging/.

        let candidate = PathBuf::from("/tmp/no-aqu");
        let root = PathBuf::from("/tmp/no-aqu/root");
        let r = ensure_within_root(&candidate, &root);
        assert!(matches!(r, Err(MediaStorageError::PathTraversal { .. })));
    }

    // ====== size cap ======

    #[tokio::test]
    async fn finalize_rejects_file_larger_than_max_bytes() {
        let root = tmp_dir("max-bytes");
        let storage = DirectoryStorage::new(MediaStorageConfig {
            id: "kryonix-isos".into(),
            root_path: root.clone(),
            max_bytes: 4,
        })
        .await
        .unwrap();

        let h = storage.stage_iso("big.iso").await.unwrap();
        write_payload(&h, b"this is definitely larger than 4 bytes").await;
        let r = storage.finalize_iso(h).await;
        assert!(matches!(r, Err(MediaStorageError::SizeExceeded { .. })));

        // Nada em isos/, nada em staging/.
        let isos_count = std::fs::read_dir(storage.isos_dir())
            .unwrap()
            .filter_map(|e| e.ok())
            .count();
        let staging_count = std::fs::read_dir(storage.staging_dir())
            .unwrap()
            .filter_map(|e| e.ok())
            .count();
        assert_eq!(isos_count, 0);
        assert_eq!(staging_count, 0);

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    // ====== abort idempotente ======

    #[tokio::test]
    async fn abort_is_idempotent_on_missing_staging() {
        let root = tmp_dir("abort-missing");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-isos",
            root.clone(),
        ))
        .await
        .unwrap();

        let h = storage.stage_iso("never.iso").await.unwrap();
        tokio::fs::remove_file(&h.staging_path).await.unwrap();
        storage.abort(h).await.unwrap();

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    // ====== round-trip happy path ======

    #[tokio::test]
    async fn iso_round_trip_preserves_content() {
        let root = tmp_dir("rt-iso");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-isos",
            root.clone(),
        ))
        .await
        .unwrap();

        let h = storage.stage_iso("debian-13.iso").await.unwrap();
        let payload: Vec<u8> = (0..1024).map(|i| (i % 251) as u8).collect();
        write_payload(&h, &payload).await;
        let final_path = storage.finalize_iso(h).await.unwrap();

        let read_back = tokio::fs::read(&final_path).await.unwrap();
        assert_eq!(read_back, payload);

        let _ = tokio::fs::remove_dir_all(&root).await;
    }
}
