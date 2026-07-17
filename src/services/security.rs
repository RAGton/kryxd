//! Serviços para transformar e persistir segredos sem incluí-los no plano.

use std::ffi::OsStr;
use std::fmt;
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;

use secrecy::{ExposeSecret, SecretString};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use uuid::Uuid;

const SECRETS_RELATIVE_DIRECTORY: &str = "var/lib/kryonix/installer-secrets";
const ADMIN_PASSWORD_HASH_FILE: &str = "admin-password.hash";
const DIRECTORY_MODE: u32 = 0o700;
const FILE_MODE: u32 = 0o600;

/// Erros seguros produzidos durante o hashing ou a persistência de segredos.
///
/// As mensagens nunca incluem a senha, o hash nem o `stderr` do processo de
/// hashing.
#[derive(Debug)]
pub enum SecurityError {
    /// A senha recebida estava vazia.
    EmptyPassword,
    /// O processo de hashing não pôde ser iniciado.
    HasherSpawn(io::Error),
    /// O canal de entrada do processo de hashing não estava disponível.
    HasherStdinUnavailable,
    /// A senha não pôde ser entregue ao processo de hashing.
    HasherInput(io::Error),
    /// O processo de hashing não pôde ser aguardado.
    HasherWait(io::Error),
    /// O processo de hashing terminou com falha.
    HasherFailed(Option<i32>),
    /// O processo retornou uma saída que não é um hash yescrypt válido.
    InvalidHashOutput,
    /// A raiz de destino não é um diretório absoluto e seguro.
    InvalidTargetRoot(PathBuf),
    /// Um componente simbólico foi encontrado no caminho protegido.
    SymlinkDetected(PathBuf),
    /// Um componente existente possui tipo incompatível com o esperado.
    InvalidPathType(PathBuf),
    /// Uma operação de filesystem falhou.
    Filesystem {
        /// Operação que falhou.
        operation: &'static str,
        /// Caminho afetado.
        path: PathBuf,
        /// Erro de I/O original.
        source: io::Error,
    },
}

impl fmt::Display for SecurityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyPassword => formatter.write_str("a senha administrativa está vazia"),
            Self::HasherSpawn(_) => {
                formatter.write_str("não foi possível iniciar o gerador de hash yescrypt")
            }
            Self::HasherStdinUnavailable => {
                formatter.write_str("o gerador de hash não disponibilizou entrada segura")
            }
            Self::HasherInput(_) => {
                formatter.write_str("não foi possível enviar a senha ao gerador de hash")
            }
            Self::HasherWait(_) => {
                formatter.write_str("não foi possível aguardar o gerador de hash")
            }
            Self::HasherFailed(status) => match status {
                Some(code) => write!(
                    formatter,
                    "o gerador de hash yescrypt terminou com código {code}"
                ),
                None => formatter.write_str("o gerador de hash yescrypt terminou por sinal"),
            },
            Self::InvalidHashOutput => {
                formatter.write_str("o gerador de hash retornou uma saída yescrypt inválida")
            }
            Self::InvalidTargetRoot(path) => write!(
                formatter,
                "a raiz de destino não é um diretório absoluto e seguro: {}",
                path.display()
            ),
            Self::SymlinkDetected(path) => write!(
                formatter,
                "link simbólico rejeitado no caminho de segredos: {}",
                path.display()
            ),
            Self::InvalidPathType(path) => write!(
                formatter,
                "tipo de arquivo inválido no caminho de segredos: {}",
                path.display()
            ),
            Self::Filesystem {
                operation,
                path,
                source,
            } => write!(
                formatter,
                "falha ao {operation} no caminho protegido {}: {source}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for SecurityError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::HasherSpawn(source) | Self::HasherInput(source) | Self::HasherWait(source) => {
                Some(source)
            }
            Self::Filesystem { source, .. } => Some(source),
            _ => None,
        }
    }
}

/// Hash yescrypt encapsulado para impedir serialização ou log acidental.
///
/// O tipo deliberadamente não implementa `Serialize`, `Clone` ou `Debug`.
pub struct PasswordHash(SecretString);

impl PasswordHash {
    fn from_command_output(mut output: String) -> Result<Self, SecurityError> {
        while matches!(output.as_bytes().last(), Some(b'\n' | b'\r')) {
            output.pop();
        }

        if !is_valid_yescrypt_hash(&output) {
            return Err(SecurityError::InvalidHashOutput);
        }

        Ok(Self(SecretString::from(output)))
    }

    pub(crate) fn expose_secret(&self) -> &str {
        self.0.expose_secret()
    }

    /// Reconstrói o tipo protegido a partir de um hash efêmero já validado.
    ///
    /// A string recebida é movida para `SecretString`, evitando uma cópia
    /// adicional do material sensível em memória.
    pub(crate) fn from_persisted(output: String) -> Result<Self, SecurityError> {
        Self::from_command_output(output)
    }
}

/// Adaptador responsável por gerar hashes yescrypt com `mkpasswd`.
pub struct PasswordHasher;

impl PasswordHasher {
    /// Cria um gerador que usa `mkpasswd` do ambiente de instalação.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }

    /// Gera um hash yescrypt, entregando a senha exclusivamente pelo `stdin`.
    ///
    /// O salt é gerado pelo próprio `mkpasswd`; nenhum segredo é incluído no
    /// `argv`, no ambiente ou em mensagens de erro.
    pub async fn hash(&self, password: &SecretString) -> Result<PasswordHash, SecurityError> {
        if password.expose_secret().is_empty() {
            return Err(SecurityError::EmptyPassword);
        }

        let mut command = Command::new(OsStr::new("mkpasswd"));
        command
            .args(["-m", "yescrypt", "--stdin"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);

        let mut child = command.spawn().map_err(SecurityError::HasherSpawn)?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or(SecurityError::HasherStdinUnavailable)?;

        stdin
            .write_all(password.expose_secret().as_bytes())
            .await
            .map_err(SecurityError::HasherInput)?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(SecurityError::HasherInput)?;
        stdin.shutdown().await.map_err(SecurityError::HasherInput)?;
        drop(stdin);

        let output = child
            .wait_with_output()
            .await
            .map_err(SecurityError::HasherWait)?;
        if !output.status.success() {
            return Err(SecurityError::HasherFailed(output.status.code()));
        }

        let stdout =
            String::from_utf8(output.stdout).map_err(|_| SecurityError::InvalidHashOutput)?;
        PasswordHash::from_command_output(stdout)
    }
}

impl Default for PasswordHasher {
    fn default() -> Self {
        Self::new()
    }
}

/// Repositório local que materializa hashes fora da árvore Git instalada.
pub struct SecretStore {
    target_root: PathBuf,
}

impl SecretStore {
    /// Cria um repositório de segredos associado a uma raiz já montada.
    ///
    /// A raiz deve ser absoluta, existir e não conter links simbólicos em
    /// nenhum de seus componentes.
    pub fn new(target_root: impl Into<PathBuf>) -> Result<Self, SecurityError> {
        let target_root = target_root.into();
        validate_target_root(&target_root)?;
        Ok(Self { target_root })
    }

    /// Retorna o caminho final do hash administrativo dentro da raiz alvo.
    #[must_use]
    pub fn admin_password_hash_path(&self) -> PathBuf {
        self.target_root
            .join(SECRETS_RELATIVE_DIRECTORY)
            .join(ADMIN_PASSWORD_HASH_FILE)
    }

    /// Persiste o hash administrativo com diretório `0700` e arquivo `0600`.
    ///
    /// A escrita usa um arquivo temporário exclusivo no mesmo diretório,
    /// sincroniza seu conteúdo e o move atomicamente para o caminho final.
    pub fn persist_admin_password_hash(
        &self,
        password_hash: &PasswordHash,
    ) -> Result<PathBuf, SecurityError> {
        validate_target_root(&self.target_root)?;

        let secrets_directory = prepare_secrets_directory(&self.target_root)?;
        let destination = secrets_directory.join(ADMIN_PASSWORD_HASH_FILE);
        reject_unsafe_destination(&destination)?;

        let temporary = secrets_directory.join(format!(
            ".{ADMIN_PASSWORD_HASH_FILE}.{}.tmp",
            Uuid::new_v4()
        ));
        let mut pending = PendingTemporaryFile::new(temporary.clone());

        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(FILE_MODE)
            .open(&temporary)
            .map_err(|source| filesystem_error("criar arquivo temporário", &temporary, source))?;

        file.set_permissions(fs::Permissions::from_mode(FILE_MODE))
            .map_err(|source| filesystem_error("aplicar permissões", &temporary, source))?;
        file.write_all(password_hash.expose_secret().as_bytes())
            .map_err(|source| filesystem_error("escrever hash", &temporary, source))?;
        file.write_all(b"\n")
            .map_err(|source| filesystem_error("finalizar hash", &temporary, source))?;
        file.sync_all()
            .map_err(|source| filesystem_error("sincronizar hash", &temporary, source))?;
        drop(file);

        fs::rename(&temporary, &destination)
            .map_err(|source| filesystem_error("materializar hash", &destination, source))?;
        pending.disarm();

        let metadata = fs::symlink_metadata(&destination)
            .map_err(|source| filesystem_error("verificar hash", &destination, source))?;
        if metadata.file_type().is_symlink() {
            return Err(SecurityError::SymlinkDetected(destination));
        }
        if !metadata.is_file() {
            return Err(SecurityError::InvalidPathType(destination));
        }

        fs::set_permissions(&destination, fs::Permissions::from_mode(FILE_MODE))
            .map_err(|source| filesystem_error("reforçar permissões", &destination, source))?;
        sync_directory(&secrets_directory)?;

        Ok(destination)
    }
}

fn is_valid_yescrypt_hash(hash: &str) -> bool {
    hash.starts_with("$y$")
        && hash.split('$').count() >= 5
        && !hash.chars().any(char::is_whitespace)
}

fn validate_target_root(target_root: &Path) -> Result<(), SecurityError> {
    if !target_root.is_absolute()
        || target_root
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err(SecurityError::InvalidTargetRoot(target_root.to_path_buf()));
    }

    let mut current = PathBuf::new();
    for component in target_root.components() {
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current)
            .map_err(|source| filesystem_error("validar raiz de destino", &current, source))?;
        if metadata.file_type().is_symlink() {
            return Err(SecurityError::SymlinkDetected(current));
        }
        if !metadata.is_dir() {
            return Err(SecurityError::InvalidTargetRoot(current));
        }
    }

    Ok(())
}

fn prepare_secrets_directory(target_root: &Path) -> Result<PathBuf, SecurityError> {
    let mut current = target_root.to_path_buf();
    let components = ["var", "lib", "kryonix", "installer-secrets"];

    for (index, component) in components.into_iter().enumerate() {
        current.push(component);
        let is_secrets_directory = index + 1 == components.len();
        ensure_directory(&current, is_secrets_directory)?;
    }

    fs::set_permissions(&current, fs::Permissions::from_mode(DIRECTORY_MODE))
        .map_err(|source| filesystem_error("reforçar permissões", &current, source))?;
    Ok(current)
}

fn ensure_directory(path: &Path, protected: bool) -> Result<(), SecurityError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() {
                return Err(SecurityError::SymlinkDetected(path.to_path_buf()));
            }
            if !metadata.is_dir() {
                return Err(SecurityError::InvalidPathType(path.to_path_buf()));
            }
        }
        Err(source) if source.kind() == io::ErrorKind::NotFound => {
            let mode = if protected { DIRECTORY_MODE } else { 0o755 };
            let mut builder = DirBuilder::new();
            builder.mode(mode);
            match builder.create(path) {
                Ok(()) => {}
                Err(source) if source.kind() == io::ErrorKind::AlreadyExists => {}
                Err(source) => {
                    return Err(filesystem_error("criar diretório", path, source));
                }
            }

            let metadata = fs::symlink_metadata(path)
                .map_err(|source| filesystem_error("verificar diretório", path, source))?;
            if metadata.file_type().is_symlink() {
                return Err(SecurityError::SymlinkDetected(path.to_path_buf()));
            }
            if !metadata.is_dir() {
                return Err(SecurityError::InvalidPathType(path.to_path_buf()));
            }
        }
        Err(source) => return Err(filesystem_error("inspecionar diretório", path, source)),
    }

    Ok(())
}

fn reject_unsafe_destination(destination: &Path) -> Result<(), SecurityError> {
    match fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err(SecurityError::SymlinkDetected(destination.to_path_buf()))
        }
        Ok(metadata) if !metadata.is_file() => {
            Err(SecurityError::InvalidPathType(destination.to_path_buf()))
        }
        Ok(_) => Ok(()),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(filesystem_error(
            "inspecionar destino do hash",
            destination,
            source,
        )),
    }
}

fn sync_directory(directory: &Path) -> Result<(), SecurityError> {
    let handle = File::open(directory).map_err(|source| {
        filesystem_error("abrir diretório para sincronização", directory, source)
    })?;
    handle
        .sync_all()
        .map_err(|source| filesystem_error("sincronizar diretório", directory, source))
}

fn filesystem_error(operation: &'static str, path: &Path, source: io::Error) -> SecurityError {
    SecurityError::Filesystem {
        operation,
        path: path.to_path_buf(),
        source,
    }
}

struct PendingTemporaryFile {
    path: PathBuf,
    armed: bool,
}

impl PendingTemporaryFile {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for PendingTemporaryFile {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn create(label: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("relógio do sistema deve estar após o Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "kryxd-security-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("deve criar raiz temporária exclusiva");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn fake_yescrypt_hash() -> PasswordHash {
        PasswordHash(SecretString::from("$y$j9T$testsalt$testhash"))
    }

    #[test]
    fn persists_hash_atomically_with_restricted_modes() {
        let root = TestRoot::create("persist");
        let store = SecretStore::new(root.path()).expect("raiz temporária deve ser segura");

        let destination = store
            .persist_admin_password_hash(&fake_yescrypt_hash())
            .expect("deve persistir hash falso");

        assert_eq!(destination, store.admin_password_hash_path());
        assert_eq!(
            fs::read_to_string(&destination).expect("deve ler hash persistido"),
            "$y$j9T$testsalt$testhash\n"
        );
        assert_eq!(
            fs::metadata(destination.parent().expect("hash deve ter diretório pai"))
                .expect("deve ler metadados do diretório")
                .permissions()
                .mode()
                & 0o777,
            DIRECTORY_MODE
        );
        assert_eq!(
            fs::metadata(&destination)
                .expect("deve ler metadados do hash")
                .permissions()
                .mode()
                & 0o777,
            FILE_MODE
        );
        assert!(
            fs::read_dir(destination.parent().expect("hash deve ter diretório pai"))
                .expect("deve listar diretório")
                .all(|entry| !entry
                    .expect("entrada deve ser legível")
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".tmp"))
        );
    }

    #[test]
    fn rejects_symbolic_target_root() {
        use std::os::unix::fs::symlink;

        let root = TestRoot::create("symlink");
        let real_root = root.path().join("real");
        let linked_root = root.path().join("linked");
        fs::create_dir(&real_root).expect("deve criar raiz real");
        symlink(&real_root, &linked_root).expect("deve criar link simbólico de teste");

        let result = SecretStore::new(&linked_root);
        assert!(matches!(result, Err(SecurityError::SymlinkDetected(_))));
    }
}
