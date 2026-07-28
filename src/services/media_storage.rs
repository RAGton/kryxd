//! Backend de storage para mídias KVE baseado em diretório.
//!
//! Toda escrita fica dentro do `root_path` configurado. Operações
//! seguem o padrão staging-then-commit: arquivos são primeiro
//! gravados como `.staging-<uuid>` no mesmo diretório e depois
//! renomeados atomicamente para o nome final.
//!
//! Invariantes:
//! - O id do storage deve passar `is_valid_storage_id`.
//! - O nome do arquivo deve ser seguro (sem `/`, `..`, nulo).
//! - Nenhum path resolvido pode escapar de `root_path`.
//! - Operações destrutivas (overwrite, abort) são explícitas.
//!
//! Este módulo é I/O local controlado. Nenhuma operação HTTP,
//! nenhum download, nenhuma chamada Incus.

use std::path::{Path, PathBuf};

use crate::storage::{is_valid_storage_id, MediaStorageConfig};
use thiserror::Error;
use tokio::fs;
use uuid::Uuid;

/// Erros do backend de storage.
#[derive(Debug, Error)]
pub enum MediaStorageError {
    #[error("storage id invalido: {0}")]
    InvalidStorageId(String),
    #[error("nome de arquivo invalido: {0}")]
    InvalidFilename(String),
    #[error("root_path invalido: {0}")]
    InvalidRootPath(String),
    #[error("path traversal detectado: resolved path '{resolved}' fora de '{root}'")]
    PathTraversal { resolved: PathBuf, root: PathBuf },
    #[error("limite excedido: {size} > {max}")]
    SizeExceeded { size: u64, max: u64 },
    #[error("storage nao encontrado: {0}")]
    NotFound(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Handle retornado por `stage`. Representa um arquivo em
/// construção que ainda nao e' o arquivo final.
///
/// O caller grava dados no `path` retornado. Quando termina,
/// chama `commit(handle)` para mover o arquivo para o nome final
/// (atomic) ou `abort(handle)` para remover o staging.
#[derive(Debug)]
pub struct StagingHandle {
    pub staging_path: PathBuf,
    pub final_path: PathBuf,
}

/// Backend de storage que grava arquivos em um diretorio local.
///
/// Construção valida o `root_path` e o `id`. Uma vez construído,
/// o backend e' usado para staging/committing de arquivos de
/// mídia. Concorrência: dois `stage()` simultâneos com o mesmo
/// `filename` geram paths de staging distintos (sufixo UUID),
/// mas o `commit()` do segundo sobrepõe o primeiro.
#[derive(Debug, Clone)]
pub struct DirectoryStorage {
    config: MediaStorageConfig,
}

impl DirectoryStorage {
    /// Constrói um backend a partir de uma configuração.
    ///
    /// Cria o diretório raiz se não existir. Retorna erro se o id
    /// for inválido, se o root_path for vazio, ou se a criação
    /// do diretório falhar.
    pub async fn new(config: MediaStorageConfig) -> Result<Self, MediaStorageError> {
        if !is_valid_storage_id(&config.id) {
            return Err(MediaStorageError::InvalidStorageId(config.id.clone()));
        }
        if config.root_path.as_os_str().is_empty() {
            return Err(MediaStorageError::InvalidRootPath("(empty)".into()));
        }
        fs::create_dir_all(&config.root_path).await?;
        Ok(Self { config })
    }

    /// Id lógico do storage.
    pub fn id(&self) -> &str {
        &self.config.id
    }

    /// Root path configurado.
    pub fn root_path(&self) -> &Path {
        &self.config.root_path
    }

    /// Resolve o path final que `filename` ocuparia.
    ///
    /// Retorna erro se `filename` for inválido ou se a resolução
    /// escapar do root_path. Não cria arquivos; apenas calcula.
    pub fn path_for(&self, filename: &str) -> Result<PathBuf, MediaStorageError> {
        validate_filename(filename)?;
        let final_path = self.config.root_path.join(filename);
        ensure_within_root(&final_path, &self.config.root_path)?;
        Ok(final_path)
    }

    /// Inicia o staging de um arquivo.
    ///
    /// Cria o arquivo `.staging-<uuid>` no root_path. O caller
    /// grava dados via `open_append` ou `write_chunk`, depois
    /// chama `commit(handle)` ou `abort(handle)`.
    ///
    /// Se o caller fechar o arquivo e não chamar commit/abort, o
    /// arquivo `.staging-<uuid>` permanece no diretório. Limpeza
    /// manual ou rotina dedicada (slice posterior).
    pub async fn stage(&self, filename: &str) -> Result<StagingHandle, MediaStorageError> {
        let final_path = self.path_for(filename)?;
        let staging_name = format!(".staging-{}", Uuid::new_v4());
        let staging_path = self.config.root_path.join(staging_name);
        fs::File::create(&staging_path).await?;
        Ok(StagingHandle {
            staging_path,
            final_path,
        })
    }

    /// Abre um arquivo de staging existente para append.
    pub async fn open_append(handle: &StagingHandle) -> Result<fs::File, MediaStorageError> {
        let f = fs::OpenOptions::new()
            .append(true)
            .open(&handle.staging_path)
            .await?;
        Ok(f)
    }

    /// Commit atômico: move o arquivo de staging para o nome final.
    ///
    /// No Linux, `rename` é atômico dentro do mesmo filesystem.
    /// Como staging e final estão ambos em `root_path`, estão
    /// necessariamente no mesmo filesystem.
    pub async fn commit(&self, handle: StagingHandle) -> Result<PathBuf, MediaStorageError> {
        // Sanidade: staging e final devem estar dentro do root_path.
        ensure_within_root(&handle.staging_path, &self.config.root_path)?;
        ensure_within_root(&handle.final_path, &self.config.root_path)?;
        // Verifica o tamanho final.
        let metadata = fs::metadata(&handle.staging_path).await?;
        let size = metadata.len();
        if size > self.config.max_bytes {
            // Remove o staging antes de falhar.
            let _ = fs::remove_file(&handle.staging_path).await;
            return Err(MediaStorageError::SizeExceeded {
                size,
                max: self.config.max_bytes,
            });
        }
        fs::rename(&handle.staging_path, &handle.final_path).await?;
        Ok(handle.final_path)
    }

    /// Aborta um staging: remove o arquivo temporário.
    ///
    /// Idempotente: se o staging não existe mais (já removido
    /// manualmente ou por outro caminho), retorna Ok.
    pub async fn abort(&self, handle: StagingHandle) -> Result<(), MediaStorageError> {
        ensure_within_root(&handle.staging_path, &self.config.root_path)?;
        match fs::remove_file(&handle.staging_path).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(MediaStorageError::Io(e)),
        }
    }
}

/// Valida que `filename` é seguro para uso em path: não-vazio,
/// somente ASCII, sem separadores, sem `..`, sem byte nulo.
fn validate_filename(filename: &str) -> Result<(), MediaStorageError> {
    if filename.is_empty() || filename.len() > 255 {
        return Err(MediaStorageError::InvalidFilename(filename.to_string()));
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(MediaStorageError::InvalidFilename(filename.to_string()));
    }
    if filename.starts_with('.') {
        return Err(MediaStorageError::InvalidFilename(filename.to_string()));
    }
    if filename.bytes().any(|b| b == 0) {
        return Err(MediaStorageError::InvalidFilename(filename.to_string()));
    }
    Ok(())
}

/// Verifica que `candidate` resolve para dentro de `root`.
///
/// Estratégia: normaliza componentes, rejeita ParentDir fora do
/// root, checa prefixo. Não usa canonicalize() porque o arquivo
/// final pode não existir ainda.
fn ensure_within_root(candidate: &Path, root: &Path) -> Result<(), MediaStorageError> {
    // Normaliza ambos: remove CurDir, detecta ParentDir, colapsa.
    let normalize = |p: &Path| -> Option<PathBuf> {
        let mut out = PathBuf::new();
        for component in p.components() {
            match component {
                std::path::Component::ParentDir => {
                    // Tenta subir; se nao ha nada para subir, o path
                    // escapa do absoluto inicial.
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

    let root_norm = normalize(root).ok_or_else(|| MediaStorageError::PathTraversal {
        resolved: candidate.to_path_buf(),
        root: root.to_path_buf(),
    })?;
    let cand_norm = normalize(candidate).ok_or_else(|| MediaStorageError::PathTraversal {
        resolved: candidate.to_path_buf(),
        root: root.to_path_buf(),
    })?;

    if !cand_norm.starts_with(&root_norm) {
        return Err(MediaStorageError::PathTraversal {
            resolved: candidate.to_path_buf(),
            root: root.to_path_buf(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(suffix: &str) -> PathBuf {
        std::env::temp_dir().join(format!("kryxd-storage-test-{}-{}", suffix, Uuid::new_v4()))
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

    #[tokio::test]
    async fn creates_root_path_on_construction() {
        let root = tmp_dir("create-root");
        let storage = DirectoryStorage::new(MediaStorageConfig {
            id: "kryonix-isos".into(),
            root_path: root.clone(),
            max_bytes: 1024,
        })
        .await
        .unwrap();
        assert!(root.is_dir());
        assert_eq!(storage.id(), "kryonix-isos");
        assert_eq!(storage.root_path(), root.as_path());

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn path_for_rejects_traversal_and_bad_filenames() {
        let root = tmp_dir("path-traversal");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-disks",
            root.clone(),
        ))
        .await
        .unwrap();

        assert!(matches!(
            storage.path_for(".."),
            Err(MediaStorageError::InvalidFilename(_))
        ));
        assert!(matches!(
            storage.path_for("../etc/passwd"),
            Err(MediaStorageError::InvalidFilename(_))
        ));
        assert!(matches!(
            storage.path_for("sub/file.iso"),
            Err(MediaStorageError::InvalidFilename(_))
        ));
        assert!(matches!(
            storage.path_for(".hidden"),
            Err(MediaStorageError::InvalidFilename(_))
        ));
        assert!(matches!(
            storage.path_for(""),
            Err(MediaStorageError::InvalidFilename(_))
        ));

        // Nome valido retorna path final dentro do root.
        let p = storage.path_for("debian-13.iso").unwrap();
        assert!(p.starts_with(&root));

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn stage_commit_writes_file_atomically() {
        let root = tmp_dir("stage-commit");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-isos",
            root.clone(),
        ))
        .await
        .unwrap();

        let handle = storage.stage("debian-13.iso").await.unwrap();
        assert!(handle.staging_path.exists());
        assert!(!handle.final_path.exists());

        let payload = b"hello world from kryxd";
        let f = DirectoryStorage::open_append(&handle).await.unwrap();
        use tokio::io::AsyncWriteExt;
        let mut w = tokio::io::BufWriter::new(f);
        w.write_all(payload).await.unwrap();
        w.flush().await.unwrap();

        let final_path = storage.commit(handle).await.unwrap();
        assert!(final_path.exists());
        let read_back = tokio::fs::read(&final_path).await.unwrap();
        assert_eq!(read_back, payload);

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn abort_removes_staging_without_creating_final() {
        let root = tmp_dir("abort");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-isos",
            root.clone(),
        ))
        .await
        .unwrap();

        let handle = storage.stage("to-be-aborted.iso").await.unwrap();
        let staging_path = handle.staging_path.clone();
        let final_path = handle.final_path.clone();
        assert!(staging_path.exists());

        storage.abort(handle).await.unwrap();
        assert!(!staging_path.exists());
        assert!(!final_path.exists());

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn commit_rejects_file_larger_than_max_bytes() {
        let root = tmp_dir("max-bytes");
        let storage = DirectoryStorage::new(MediaStorageConfig {
            id: "kryonix-isos".into(),
            root_path: root.clone(),
            max_bytes: 4,
        })
        .await
        .unwrap();

        let handle = storage.stage("big.iso").await.unwrap();
        let payload = b"this is definitely larger than 4 bytes";
        let f = DirectoryStorage::open_append(&handle).await.unwrap();
        use tokio::io::AsyncWriteExt;
        let mut w = tokio::io::BufWriter::new(f);
        w.write_all(payload).await.unwrap();
        w.flush().await.unwrap();

        let r = storage.commit(handle).await;
        assert!(matches!(r, Err(MediaStorageError::SizeExceeded { .. })));

        // O staging foi removido antes de falhar.
        let mut count = 0;
        for entry in std::fs::read_dir(&root).unwrap() {
            let entry = entry.unwrap();
            count += 1;
            let _ = entry.file_name();
        }
        assert_eq!(count, 0, "esperava sem arquivos apos commit falho");

        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn abort_is_idempotent_on_missing_staging() {
        let root = tmp_dir("abort-missing");
        let storage = DirectoryStorage::new(MediaStorageConfig::unbounded(
            "kryonix-isos",
            root.clone(),
        ))
        .await
        .unwrap();

        let handle = storage.stage("never-written.iso").await.unwrap();
        tokio::fs::remove_file(&handle.staging_path).await.unwrap();

        // abort() nao pode falhar com NotFound; deve ser idempotente.
        storage.abort(handle).await.unwrap();

        let _ = tokio::fs::remove_dir_all(&root).await;
    }
}
