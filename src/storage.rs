//! Configuração e validação para backends de storage.
//!
//! Detalhe de runtime do daemon kryxd. Não faz parte do contrato
//! de domínio compartilhado (`crates/kryx`) porque inclui paths
//! absolutos do host, que são específicos do daemon instalado.

use std::path::PathBuf;
use thiserror::Error;

/// Configuração de um backend de storage.
///
/// `id` é a referência lógica usada em `IsoMedia::storage_id` e
/// `VirtualDiskImage::storage_id`. Não é um path: é o nome que o
/// usuário consulta para escolher onde guardar a mídia.
///
/// `root_path` é o diretório onde arquivos finais serão colocados.
/// Toda escrita resolvida deve permanecer dentro deste diretório;
/// violações são tratadas como erro (path traversal).
///
/// `max_bytes` é o limite superior do tamanho de arquivo aceito.
/// A aplicação do limite é responsabilidade do backend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaStorageConfig {
    pub id: String,
    pub root_path: PathBuf,
    pub max_bytes: u64,
}

impl MediaStorageConfig {
    /// Constrói a partir de um id e root_path, sem limite explícito.
    /// Usado em testes e em paths que não têm cota definida.
    pub fn unbounded(id: &str, root_path: PathBuf) -> Self {
        Self {
            id: id.to_string(),
            root_path,
            max_bytes: u64::MAX,
        }
    }
}

/// Valida o `id` de um storage: 1-64 chars, somente ASCII
/// alfanumérico + `_` + `-` + `.`.
///
/// Critério canônico tanto para validar o `id` em uma configuração
/// quanto para os `storage_id` recebidos em `IsoMedia` e
/// `VirtualDiskImage` quando o domínio é validado por um backend
/// concreto.
pub fn is_valid_storage_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 64 {
        return false;
    }
    id.bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'.')
}

#[derive(Debug, Error)]
pub enum StorageIdError {
    #[error("storage id invalido: {0}")]
    Invalid(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_valid_storage_id_rejects_known_bad_inputs() {
        assert!(!is_valid_storage_id(""));
        assert!(!is_valid_storage_id("../etc"));
        assert!(!is_valid_storage_id("with/slash"));
        assert!(!is_valid_storage_id("with space"));
        assert!(!is_valid_storage_id("with\0nul"));
        assert!(!is_valid_storage_id(&"a".repeat(65)));
        // Casos válidos
        assert!(is_valid_storage_id("kryonix-isos"));
        assert!(is_valid_storage_id("default_0"));
        assert!(is_valid_storage_id("a.b-c_d"));
        assert!(is_valid_storage_id("123"));
    }

    #[test]
    fn unbounded_uses_max_bytes() {
        let cfg = MediaStorageConfig::unbounded("kryonix-isos", PathBuf::from("/var/lib/kryonix/isos"));
        assert_eq!(cfg.id, "kryonix-isos");
        assert_eq!(cfg.root_path, PathBuf::from("/var/lib/kryonix/isos"));
        assert_eq!(cfg.max_bytes, u64::MAX);
    }
}
