//! Endpoints e casos de uso da API de instalação v2.
//!
//! O plano persistido é deliberadamente separado dos segredos. Senhas em
//! texto puro nunca são serializadas e o preflight executa somente inspeções
//! read-only, renderização em memória e validação sintática do módulo Nix.

use axum::{
    Json,
    extract::{State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;
use uuid::Uuid;

use crate::AppState;
use crate::domain::{CapabilityError, Encryption, InstallPlanV2, InstallSecretsV2, Topology};
use crate::services::partitioner::{DiskValidator, DiskoRenderer, PartitionerError};
use crate::services::security::{PasswordHasher, SecurityError};

/// Diretório efêmero padrão dos planos e segredos durante a instalação.
pub const DEFAULT_PLAN_STORE_ROOT: &str = "/run/kryxd/secrets";

const PLAN_FILE_NAME: &str = "plan.json";
const ADMIN_PASSWORD_HASH_FILE_NAME: &str = "admin-password.hash";
const PPPOE_PASSWORD_FILE_NAME: &str = "pppoe-password";
const DIRECTORY_MODE: u32 = 0o700;
const FILE_MODE: u32 = 0o600;

/// Repositório filesystem para planos v2 e seus segredos efêmeros.
#[derive(Clone)]
pub struct PlanStore {
    root: PathBuf,
}

impl PlanStore {
    /// Cria um store com raiz injetável, útil para testes e isolamento.
    ///
    /// A raiz deve ser absoluta e não pode atravessar `.` ou `..`.
    pub fn new(root: impl Into<PathBuf>) -> Result<Self, InstallServiceError> {
        let root = root.into();
        validate_store_root(&root)?;
        Ok(Self { root })
    }

    /// Retorna a raiz configurada para o store.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Serializa canonicamente, calcula SHA-256 e persiste um plano v2.
    ///
    /// A ordem de campos das structs Serde é estável e os mapas do contrato
    /// usam `BTreeMap`, tornando o JSON compacto determinístico.
    pub fn save_plan(&self, plan: &InstallPlanV2) -> Result<String, InstallServiceError> {
        let canonical_json = serde_json::to_vec(plan)
            .map_err(|error| InstallServiceError::PlanSerialization(error.to_string()))?;
        let digest = sha256_hex(&canonical_json);
        let directory = self.prepare_digest_directory(&digest)?;
        atomic_write(&directory, PLAN_FILE_NAME, &canonical_json, FILE_MODE)?;
        Ok(digest)
    }

    /// Carrega um plano persistido e verifica sua integridade pelo digest.
    pub fn load_plan(&self, digest: &str) -> Result<InstallPlanV2, InstallServiceError> {
        validate_digest(digest)?;
        let path = self.digest_directory(digest).join(PLAN_FILE_NAME);
        reject_symbolic_ancestors(&path)?;
        let bytes = read_regular_file(&path, "ler plano")?;

        if sha256_hex(&bytes) != digest {
            return Err(InstallServiceError::PlanIntegrityMismatch);
        }

        serde_json::from_slice(&bytes)
            .map_err(|error| InstallServiceError::InvalidPersistedPlan(error.to_string()))
    }

    /// Informa se o plano identificado pelo digest existe como arquivo regular.
    pub fn plan_exists(&self, digest: &str) -> Result<bool, InstallServiceError> {
        validate_digest(digest)?;
        let path = self.digest_directory(digest).join(PLAN_FILE_NAME);
        reject_symbolic_ancestors(&path)?;
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                Err(InstallServiceError::UnsafePath(path))
            }
            Ok(metadata) => Ok(metadata.is_file()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(filesystem_error("inspecionar plano", &path, error)),
        }
    }

    fn digest_directory(&self, digest: &str) -> PathBuf {
        self.root.join(digest)
    }

    fn prepare_digest_directory(&self, digest: &str) -> Result<PathBuf, InstallServiceError> {
        validate_digest(digest)?;
        ensure_private_directory(&self.root)?;
        let directory = self.digest_directory(digest);
        ensure_private_directory(&directory)?;
        Ok(directory)
    }

    fn persist_secrets(
        &self,
        digest: &str,
        admin_hash: &[u8],
        pppoe_password: Option<&[u8]>,
    ) -> Result<(), InstallServiceError> {
        validate_digest(digest)?;
        if !self.plan_exists(digest)? {
            return Err(InstallServiceError::PlanNotFound);
        }

        let directory = self.prepare_digest_directory(digest)?;
        atomic_write(
            &directory,
            ADMIN_PASSWORD_HASH_FILE_NAME,
            admin_hash,
            FILE_MODE,
        )?;

        match pppoe_password {
            Some(password) => {
                atomic_write(&directory, PPPOE_PASSWORD_FILE_NAME, password, FILE_MODE)?
            }
            None => remove_regular_file_if_present(
                &directory.join(PPPOE_PASSWORD_FILE_NAME),
                "remover senha PPPoE obsoleta",
            )?,
        }

        sync_directory(&directory)
    }
}

impl Default for PlanStore {
    fn default() -> Self {
        Self {
            root: PathBuf::from(DEFAULT_PLAN_STORE_ROOT),
        }
    }
}

/// Caso de uso central da API v2.
pub struct InstallService {
    store: PlanStore,
    password_hasher: PasswordHasher,
    disk_validator: DiskValidator,
}

impl InstallService {
    /// Cria o serviço usando o store informado e os adaptadores padrão.
    #[must_use]
    pub fn new(store: PlanStore) -> Self {
        Self {
            store,
            password_hasher: PasswordHasher::new(),
            disk_validator: DiskValidator::default(),
        }
    }

    /// Retorna o store associado ao serviço.
    #[must_use]
    pub fn store(&self) -> &PlanStore {
        &self.store
    }

    /// Valida e persiste um plano sanitizado, retornando seu digest.
    pub fn save_plan(&self, plan: &InstallPlanV2) -> Result<String, InstallServiceError> {
        validate_plan_capabilities(plan)?;
        self.store.save_plan(plan)
    }

    /// Gera o hash administrativo e persiste somente artefatos de segredo.
    ///
    /// A senha administrativa e a senha PPPoE nunca são incorporadas ao plano.
    /// O envelope recebido não implementa `Serialize`, `Clone` ou `Debug`.
    pub async fn save_secrets(
        &self,
        digest: &str,
        secrets: InstallSecretsV2,
    ) -> Result<(), InstallServiceError> {
        validate_digest(digest)?;
        if !self.store.plan_exists(digest)? {
            return Err(InstallServiceError::PlanNotFound);
        }

        let admin_hash = self
            .password_hasher
            .hash(&secrets.admin_password)
            .await
            .map_err(InstallServiceError::Security)?;
        self.store.persist_secrets(
            digest,
            admin_hash.expose_secret().as_bytes(),
            secrets
                .pppoe_password
                .as_ref()
                .map(|password| password.expose_secret().as_bytes()),
        )
    }

    /// Executa o preflight read-only do plano identificado pelo digest.
    ///
    /// O método rejeita capacidades ainda não implementadas, inspeciona os
    /// discos, renderiza o módulo Disko em memória e pede ao Nix apenas que
    /// valide sua sintaxe. Nenhum particionamento ou instalação é iniciado.
    pub async fn execute_preflight(
        &self,
        digest: String,
    ) -> Result<PreflightResponse, InstallServiceError> {
        let plan = self.store.load_plan(&digest)?;
        reject_unimplemented_capabilities(&plan)?;

        let validator = self.disk_validator;
        let plan_for_validation = plan.clone();
        tokio::task::spawn_blocking(move || validator.validate_plan(&plan_for_validation))
            .await
            .map_err(|_| InstallServiceError::BlockingTaskFailed)?
            .map_err(InstallServiceError::Partitioner)?;

        let rendered = DiskoRenderer::render(&plan).map_err(InstallServiceError::Partitioner)?;
        validate_nix_syntax(&rendered).await?;

        Ok(PreflightResponse {
            valid: true,
            plan_digest: digest,
        })
    }
}

impl Default for InstallService {
    fn default() -> Self {
        Self::new(PlanStore::default())
    }
}

/// Resposta do endpoint `POST /api/v2/plan`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanResponse {
    pub plan_digest: String,
}

/// Envelope recebido exclusivamente por `PUT /api/v2/secrets`.
///
/// A ausência de `Serialize`, `Clone` e `Debug` evita persistência e logs
/// acidentais do plaintext.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecretsRequest {
    pub plan_digest: String,
    pub secrets: InstallSecretsV2,
}

/// Confirmação sem conteúdo sensível do endpoint de secrets.
#[derive(Serialize)]
pub struct SecretsResponse {
    pub ready: bool,
}

/// Requisição do preflight v2 por digest.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreflightRequest {
    pub plan_digest: String,
}

/// Resultado público do preflight não destrutivo.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightResponse {
    pub valid: bool,
    pub plan_digest: String,
}

/// Requisição para iniciar a instalação v2.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallRequest {
    pub plan_digest: String,
}

/// Resposta do endpoint de instalação.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResponse {
    pub started: bool,
}

/// Handler do `POST /api/v2/plan`.
pub async fn post_plan(
    State(state): State<std::sync::Arc<AppState>>,
    headers: HeaderMap,
    payload: Result<Json<InstallPlanV2>, JsonRejection>,
) -> Result<(StatusCode, Json<PlanResponse>), InstallServiceError> {
    require_installer_token(&state, &headers)?;
    let Json(plan) = payload.map_err(|_| InstallServiceError::InvalidRequestBody)?;
    let plan_digest = state.install_service.save_plan(&plan)?;
    Ok((StatusCode::CREATED, Json(PlanResponse { plan_digest })))
}

/// Handler do `PUT /api/v2/secrets`.
pub async fn put_secrets(
    State(state): State<std::sync::Arc<AppState>>,
    headers: HeaderMap,
    payload: Result<Json<SecretsRequest>, JsonRejection>,
) -> Result<Json<SecretsResponse>, InstallServiceError> {
    require_installer_token(&state, &headers)?;
    let Json(request) = payload.map_err(|_| InstallServiceError::InvalidRequestBody)?;
    state
        .install_service
        .save_secrets(&request.plan_digest, request.secrets)
        .await?;
    Ok(Json(SecretsResponse { ready: true }))
}

/// Handler do `POST /api/v2/dry-run`.
pub async fn post_preflight(
    State(state): State<std::sync::Arc<AppState>>,
    headers: HeaderMap,
    payload: Result<Json<PreflightRequest>, JsonRejection>,
) -> Result<Json<PreflightResponse>, InstallServiceError> {
    require_installer_token(&state, &headers)?;
    let Json(request) = payload.map_err(|_| InstallServiceError::InvalidRequestBody)?;
    state
        .install_service
        .execute_preflight(request.plan_digest)
        .await
        .map(Json)
}

/// Handler do `POST /api/v2/install`.
pub async fn post_install(
    State(state): State<std::sync::Arc<AppState>>,
    headers: HeaderMap,
    payload: Result<Json<InstallRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<InstallResponse>), InstallServiceError> {
    require_installer_token(&state, &headers)?;
    let Json(request) = payload.map_err(|_| InstallServiceError::InvalidRequestBody)?;
    let plan = state
        .install_service
        .store()
        .load_plan(&request.plan_digest)?;
    reject_unimplemented_capabilities(&plan)?;
    let config_content = kryx::services::translator::generate_nix_config(&plan)
        .map_err(InstallServiceError::Translation)?;

    let config_path = "/tmp/generated-install-config.nix";
    tokio::fs::write(config_path, config_content)
        .await
        .map_err(|e| InstallServiceError::Filesystem {
            operation: "gravar config nix gerada",
            path: PathBuf::from(config_path),
            source: e,
        })?;

    // Dispara o deploy com a nova flag em background (ou foreground se quisermos bloquear)
    // O Axum precisa retornar rapidamente, mas post_install parece bloquear?
    // Atualmente execute_plan bloqueia ou dispara background?
    // Vou usar tokio::spawn para não bloquear a resposta ACCEPTED, se for demorado.
    // Ou simplesmente rodar aguardando, já que execute_plan era síncrono.
    // Vamos usar tokio::process::Command
    tokio::spawn(async move {
        let _ = tokio::process::Command::new("kryx")
            .arg("deploy")
            .arg(config_path)
            .status()
            .await;
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(InstallResponse { started: true }),
    ))
}

/// Falhas seguras da API v2; nenhuma variante contém senha ou hash.
#[derive(Debug)]
pub enum InstallServiceError {
    Unauthorized,
    InvalidRequestBody,
    InvalidStoreRoot(PathBuf),
    InvalidDigest,
    PlanNotFound,
    PlanIntegrityMismatch,
    PlanSerialization(String),
    InvalidPersistedPlan(String),
    Capability(CapabilityError),
    UnsafePath(PathBuf),
    Filesystem {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    Security(SecurityError),
    Partitioner(PartitionerError),
    Migration(crate::services::migration::Error),
    NixParserIo(io::Error),
    NixSyntaxInvalid(Option<i32>),
    BlockingTaskFailed,
    Translation(String),
}

impl fmt::Display for InstallServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unauthorized => formatter.write_str("token do instalador ausente ou inválido"),
            Self::InvalidRequestBody => {
                formatter.write_str("payload JSON inválido para o contrato da API v2")
            }
            Self::InvalidStoreRoot(_) => formatter.write_str("raiz do store de planos inválida"),
            Self::InvalidDigest => formatter.write_str("digest de plano inválido"),
            Self::PlanNotFound => formatter.write_str("plano não encontrado"),
            Self::PlanIntegrityMismatch => {
                formatter.write_str("integridade do plano persistido inválida")
            }
            Self::PlanSerialization(_) => {
                formatter.write_str("não foi possível serializar o plano")
            }
            Self::InvalidPersistedPlan(_) => {
                formatter.write_str("o plano persistido não respeita o contrato v2")
            }
            Self::Capability(error) => write!(formatter, "{error}"),
            Self::UnsafePath(_) => formatter.write_str("caminho inseguro no store de planos"),
            Self::Filesystem { operation, .. } => {
                write!(formatter, "falha de filesystem ao {operation}")
            }
            Self::Security(error) => write!(formatter, "{error}"),
            Self::Partitioner(error) => write!(formatter, "{error}"),
            Self::Migration(error) => write!(formatter, "{error}"),
            Self::NixParserIo(_) => formatter.write_str("não foi possível iniciar o parser Nix"),
            Self::NixSyntaxInvalid(status) => match status {
                Some(code) => write!(formatter, "configuração Disko inválida (código {code})"),
                None => formatter.write_str("configuração Disko inválida (processo interrompido)"),
            },
            Self::BlockingTaskFailed => {
                formatter.write_str("a tarefa isolada de validação foi interrompida")
            }
            Self::Translation(e) => write!(formatter, "falha ao traduzir o plano: {e}"),
        }
    }
}

impl std::error::Error for InstallServiceError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Filesystem { source, .. } | Self::NixParserIo(source) => Some(source),
            Self::Security(source) => Some(source),
            Self::Partitioner(source) => Some(source),
            Self::Migration(source) => Some(source),
            Self::Capability(source) => Some(source),
            _ => None,
        }
    }
}

impl IntoResponse for InstallServiceError {
    fn into_response(self) -> Response {
        let (status, code, recoverable) = match &self {
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", true),
            Self::InvalidRequestBody => (StatusCode::BAD_REQUEST, "INVALID_REQUEST_BODY", true),
            Self::InvalidDigest => (StatusCode::BAD_REQUEST, "INVALID_PLAN_DIGEST", true),
            Self::PlanNotFound => (StatusCode::NOT_FOUND, "PLAN_NOT_FOUND", true),
            Self::PlanIntegrityMismatch => (StatusCode::CONFLICT, "PLAN_INTEGRITY_MISMATCH", false),
            Self::InvalidPersistedPlan(_) => {
                (StatusCode::CONFLICT, "INVALID_PERSISTED_PLAN", false)
            }
            Self::Capability(_) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "UNSUPPORTED_CAPABILITY",
                true,
            ),
            Self::Partitioner(PartitionerError::CapabilityNotImplemented(_)) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "UNSUPPORTED_STORAGE_CAPABILITY",
                true,
            ),
            Self::Partitioner(PartitionerError::UnsupportedStorageCapability(_)) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "UNSUPPORTED_STORAGE_CAPABILITY",
                true,
            ),
            Self::Partitioner(PartitionerError::InvalidPlan(_)) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "INVALID_STORAGE_PLAN",
                true,
            ),
            Self::Security(_) => (StatusCode::UNPROCESSABLE_ENTITY, "INVALID_SECRETS", true),
            Self::Migration(crate::services::migration::Error::Partitioner(
                PartitionerError::CapabilityNotImplemented(_),
            )) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "UNSUPPORTED_STORAGE_CAPABILITY",
                true,
            ),
            Self::Migration(crate::services::migration::Error::Partitioner(
                PartitionerError::UnsupportedStorageCapability(_),
            )) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "UNSUPPORTED_STORAGE_CAPABILITY",
                true,
            ),
            Self::Migration(crate::services::migration::Error::Partitioner(
                PartitionerError::InvalidPlan(_),
            )) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "INVALID_STORAGE_PLAN",
                true,
            ),
            Self::Migration(_) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "MIGRATION_PREFLIGHT_REQUIRED",
                true,
            ),
            Self::NixSyntaxInvalid(_) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "INVALID_DISKO_CONFIGURATION",
                true,
            ),
            Self::InvalidStoreRoot(_)
            | Self::PlanSerialization(_)
            | Self::UnsafePath(_)
            | Self::Filesystem { .. }
            | Self::Partitioner(_)
            | Self::NixParserIo(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "INSTALLER_INTERNAL_ERROR",
                false,
            ),
            Self::BlockingTaskFailed => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "BLOCKING_TASK_FAILED",
                false,
            ),
            Self::Translation(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "TRANSLATION_FAILED",
                false,
            ),
        };

        let body = ErrorResponse {
            code,
            message: self.to_string(),
            details: None,
            recoverable,
            destructive_action_started: false,
        };
        (status, Json(body)).into_response()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    code: &'static str,
    message: String,
    details: Option<String>,
    recoverable: bool,
    destructive_action_started: bool,
}

fn reject_unimplemented_capabilities(plan: &InstallPlanV2) -> Result<(), InstallServiceError> {
    if matches!(plan.storage.topology, Topology::Manual | Topology::Raid) {
        return Err(InstallServiceError::Partitioner(
            PartitionerError::CapabilityNotImplemented(
                "topologias manual e raid ainda não possuem execução segura".into(),
            ),
        ));
    }

    let uses_luks2 = plan
        .storage
        .root
        .as_ref()
        .is_some_and(|mount| mount.encryption == Encryption::Luks2)
        || plan
            .storage
            .data
            .as_ref()
            .is_some_and(|mount| mount.encryption == Encryption::Luks2);
    if uses_luks2 {
        return Err(InstallServiceError::Partitioner(
            PartitionerError::CapabilityNotImplemented(
                "criptografia luks2 ainda não possui execução segura".into(),
            ),
        ));
    }

    Ok(())
}

fn validate_plan_capabilities(plan: &InstallPlanV2) -> Result<(), InstallServiceError> {
    kryx::domain::validate_feature_selection(&plan.features)
        .map_err(InstallServiceError::Capability)
}

fn require_installer_token(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(), InstallServiceError> {
    let provided = headers
        .get("X-Kryonix-Installer-Token")
        .and_then(|value| value.to_str().ok())
        .ok_or(InstallServiceError::Unauthorized)?;

    if constant_time_eq(provided.as_bytes(), state.installer_token.as_bytes()) {
        Ok(())
    } else {
        Err(InstallServiceError::Unauthorized)
    }
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }

    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

async fn validate_nix_syntax(rendered: &str) -> Result<(), InstallServiceError> {
    let status = Command::new("nix-instantiate")
        .args(["--parse", "--expr"])
        .arg(rendered)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .status()
        .await
        .map_err(InstallServiceError::NixParserIo)?;

    if status.success() {
        Ok(())
    } else {
        Err(InstallServiceError::NixSyntaxInvalid(status.code()))
    }
}

fn validate_digest(digest: &str) -> Result<(), InstallServiceError> {
    if digest.len() == 64
        && digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(InstallServiceError::InvalidDigest)
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn validate_store_root(root: &Path) -> Result<(), InstallServiceError> {
    if !root.is_absolute()
        || root
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err(InstallServiceError::InvalidStoreRoot(root.to_path_buf()));
    }
    Ok(())
}

fn ensure_private_directory(path: &Path) -> Result<(), InstallServiceError> {
    validate_store_root(path)?;
    reject_symbolic_ancestors(path)?;
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(InstallServiceError::UnsafePath(path.to_path_buf()));
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let mut builder = DirBuilder::new();
            builder.recursive(true).mode(DIRECTORY_MODE);
            builder
                .create(path)
                .map_err(|error| filesystem_error("criar diretório privado", path, error))?;
        }
        Err(error) => {
            return Err(filesystem_error("inspecionar diretório", path, error));
        }
    }

    fs::set_permissions(path, fs::Permissions::from_mode(DIRECTORY_MODE))
        .map_err(|error| filesystem_error("aplicar modo do diretório", path, error))?;
    Ok(())
}

fn reject_symbolic_ancestors(path: &Path) -> Result<(), InstallServiceError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(InstallServiceError::UnsafePath(current));
            }
            Ok(metadata) if !metadata.is_dir() && current != path => {
                return Err(InstallServiceError::UnsafePath(current));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => break,
            Err(error) => {
                return Err(filesystem_error(
                    "inspecionar ancestral do store",
                    &current,
                    error,
                ));
            }
        }
    }
    Ok(())
}

fn atomic_write(
    directory: &Path,
    file_name: &str,
    bytes: &[u8],
    mode: u32,
) -> Result<(), InstallServiceError> {
    ensure_private_directory(directory)?;
    let destination = directory.join(file_name);
    reject_unsafe_destination(&destination)?;

    let temporary = directory.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    let mut pending = PendingFile::new(temporary.clone());
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(mode)
        .open(&temporary)
        .map_err(|error| filesystem_error("criar arquivo temporário", &temporary, error))?;
    file.set_permissions(fs::Permissions::from_mode(mode))
        .map_err(|error| filesystem_error("aplicar modo do arquivo", &temporary, error))?;
    file.write_all(bytes)
        .map_err(|error| filesystem_error("escrever arquivo", &temporary, error))?;
    file.sync_all()
        .map_err(|error| filesystem_error("sincronizar arquivo", &temporary, error))?;
    drop(file);

    fs::rename(&temporary, &destination)
        .map_err(|error| filesystem_error("materializar arquivo", &destination, error))?;
    pending.disarm();
    fs::set_permissions(&destination, fs::Permissions::from_mode(mode))
        .map_err(|error| filesystem_error("reforçar modo do arquivo", &destination, error))?;
    sync_directory(directory)
}

fn reject_unsafe_destination(path: &Path) -> Result<(), InstallServiceError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(InstallServiceError::UnsafePath(path.to_path_buf()))
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(filesystem_error("inspecionar destino", path, error)),
    }
}

fn read_regular_file(path: &Path, operation: &'static str) -> Result<Vec<u8>, InstallServiceError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            InstallServiceError::PlanNotFound
        } else {
            filesystem_error(operation, path, error)
        }
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(InstallServiceError::UnsafePath(path.to_path_buf()));
    }
    fs::read(path).map_err(|error| filesystem_error(operation, path, error))
}

fn remove_regular_file_if_present(
    path: &Path,
    operation: &'static str,
) -> Result<(), InstallServiceError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(InstallServiceError::UnsafePath(path.to_path_buf()))
        }
        Ok(_) => fs::remove_file(path).map_err(|error| filesystem_error(operation, path, error)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(filesystem_error(operation, path, error)),
    }
}

fn sync_directory(directory: &Path) -> Result<(), InstallServiceError> {
    let handle = File::open(directory)
        .map_err(|error| filesystem_error("abrir diretório", directory, error))?;
    handle
        .sync_all()
        .map_err(|error| filesystem_error("sincronizar diretório", directory, error))
}

fn filesystem_error(
    operation: &'static str,
    path: &Path,
    source: io::Error,
) -> InstallServiceError {
    InstallServiceError::Filesystem {
        operation,
        path: path.to_path_buf(),
        source,
    }
}

struct PendingFile {
    path: PathBuf,
    armed: bool,
}

impl PendingFile {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for PendingFile {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::net::SocketAddr;
    use std::os::unix::fs::symlink;
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::domain::{FileSystem, MountPlan, RepositoryPlan, StoragePlan, ZfsStoragePlan};

    const TEST_INSTALLER_TOKEN: &str = "test-installer-token";

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn create() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("relógio deve estar após o Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("kryonix-api-v2-{}-{unique}", std::process::id()));
            Self(path)
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn plan() -> InstallPlanV2 {
        InstallPlanV2 {
            version: 2,
            is_think_server: true,
            repository: RepositoryPlan {
                core_url: "https://github.com/RAGton/kryonix.git".into(),
                upstream_url: "https://github.com/RAGton/Kryonixos.git".into(),
                downstream_url: "https://github.com/example/kryonixos.git".into(),
                branch: "main".into(),
            },
            storage: StoragePlan {
                topology: Topology::Single,
                system_disks: vec!["/dev/vda".into()],
                data_disks: Vec::new(),
                root: Some(MountPlan {
                    filesystem: FileSystem::Zfs,
                    encryption: Encryption::None,
                }),
                data: None,
                raid_level: None,
                manual_partitions: Vec::new(),
                zfs: Some(ZfsStoragePlan {
                    user_refquota: "100G".into(),
                }),
                btrfs: None,
            },
            features: BTreeMap::new(),
        }
    }

    async fn start_test_api(
        store: PlanStore,
    ) -> (SocketAddr, tokio::task::JoinHandle<Result<(), io::Error>>) {
        let (log_sender, _) = tokio::sync::broadcast::channel(4);
        let (progress_sender, _) = tokio::sync::broadcast::channel(4);
        let state = Arc::new(crate::AppState {
            log_sender: Arc::new(log_sender),
            progress_tx: Arc::new(progress_sender),
            install_status: Arc::new(tokio::sync::RwLock::new(crate::InstallStatus::default())),
            auth: crate::auth::new_auth_state(),
            http_client: reqwest::Client::new(),
            installer_token: TEST_INSTALLER_TOKEN.into(),
            runtime_mode: crate::state::RuntimeMode::LiveInstaller,
            install_service: Arc::new(InstallService::new(store)),
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener local de teste deve abrir");
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, crate::api::router().with_state(state)).await
        });

        (address, server)
    }

    #[test]
    fn persists_deterministic_plan_with_private_modes() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");
        let digest = store.save_plan(&plan()).expect("plano deve ser persistido");
        let plan_path = root.0.join(&digest).join(PLAN_FILE_NAME);

        assert_eq!(digest.len(), 64);
        assert!(digest.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert_eq!(store.save_plan(&plan()).unwrap(), digest);
        assert_eq!(store.load_plan(&digest).unwrap(), plan());
        assert_eq!(
            fs::metadata(&root.0).unwrap().permissions().mode() & 0o777,
            DIRECTORY_MODE
        );
        assert_eq!(
            fs::metadata(plan_path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            DIRECTORY_MODE
        );
        assert_eq!(
            fs::metadata(plan_path).unwrap().permissions().mode() & 0o777,
            FILE_MODE
        );
    }

    #[test]
    fn rejects_digest_that_could_escape_the_store() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");

        assert!(matches!(
            store.load_plan("../../etc/passwd"),
            Err(InstallServiceError::InvalidDigest)
        ));
        assert!(matches!(
            store.load_plan(&"A".repeat(64)),
            Err(InstallServiceError::InvalidDigest)
        ));
    }

    #[test]
    fn rejects_symbolic_digest_directory_when_loading_plan() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");
        let digest = store.save_plan(&plan()).expect("plano deve ser persistido");
        let digest_directory = root.0.join(&digest);
        let relocated_directory = root.0.join("relocated-plan");
        fs::rename(&digest_directory, &relocated_directory).expect("fixture deve ser movida");
        symlink(&relocated_directory, &digest_directory).expect("symlink de teste deve ser criado");

        assert!(matches!(
            store.load_plan(&digest),
            Err(InstallServiceError::UnsafePath(path)) if path == digest_directory
        ));
    }

    #[test]
    fn persists_only_separate_secret_artifacts_with_private_modes() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");
        let digest = store.save_plan(&plan()).expect("plano deve ser persistido");

        store
            .persist_secrets(&digest, b"$y$fixture-hash", Some(b"provider-password"))
            .expect("artefatos separados devem ser persistidos");

        for file_name in [ADMIN_PASSWORD_HASH_FILE_NAME, PPPOE_PASSWORD_FILE_NAME] {
            let path = root.0.join(&digest).join(file_name);
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                FILE_MODE
            );
        }

        let persisted_plan = fs::read(root.0.join(&digest).join(PLAN_FILE_NAME)).unwrap();
        assert!(
            !persisted_plan
                .windows(b"provider-password".len())
                .any(|window| window == b"provider-password")
        );
    }

    #[test]
    fn rejects_manual_raid_and_luks2_before_disk_inspection() {
        for topology in [Topology::Manual, Topology::Raid] {
            let mut unsupported = plan();
            unsupported.storage.topology = topology;
            assert!(matches!(
                reject_unimplemented_capabilities(&unsupported),
                Err(InstallServiceError::Partitioner(
                    PartitionerError::CapabilityNotImplemented(_)
                ))
            ));
        }

        let mut encrypted = plan();
        encrypted.storage.root.as_mut().unwrap().encryption = Encryption::Luks2;
        assert!(matches!(
            reject_unimplemented_capabilities(&encrypted),
            Err(InstallServiceError::Partitioner(
                PartitionerError::CapabilityNotImplemented(_)
            ))
        ));
    }

    #[test]
    fn token_comparison_rejects_different_values() {
        assert!(constant_time_eq(b"expected-token", b"expected-token"));
        assert!(!constant_time_eq(b"expected-token", b"different-token"));
        assert!(!constant_time_eq(b"short", b"longer"));
    }

    #[test]
    fn detects_plan_tampering_before_deserialization() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");
        let digest = store.save_plan(&plan()).expect("plano deve ser persistido");
        let plan_path = root.0.join(&digest).join(PLAN_FILE_NAME);
        fs::write(&plan_path, b"{}").expect("deve adulterar fixture");

        assert!(matches!(
            store.load_plan(&digest),
            Err(InstallServiceError::PlanIntegrityMismatch)
        ));
    }

    #[tokio::test]
    async fn post_plan_endpoint_returns_digest_and_persists_plan() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");
        let (address, server) = start_test_api(store).await;
        let response = reqwest::Client::new()
            .post(format!("http://{address}/plan"))
            .header("X-Kryonix-Installer-Token", TEST_INSTALLER_TOKEN)
            .json(&plan())
            .send()
            .await
            .expect("requisição local deve responder");

        assert_eq!(response.status(), StatusCode::CREATED);
        let body: serde_json::Value = response.json().await.unwrap();
        let digest = body["planDigest"].as_str().expect("digest deve existir");
        assert!(root.0.join(digest).join(PLAN_FILE_NAME).is_file());
        server.abort();
    }

    #[tokio::test]
    async fn plan_endpoint_requires_token_and_normalizes_json_errors() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");
        let (address, server) = start_test_api(store).await;
        let client = reqwest::Client::new();

        let unauthorized = client
            .post(format!("http://{address}/plan"))
            .json(&plan())
            .send()
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
        let unauthorized_body: serde_json::Value = unauthorized.json().await.unwrap();
        assert_eq!(unauthorized_body["code"], "UNAUTHORIZED");

        let invalid = client
            .post(format!("http://{address}/plan"))
            .header("X-Kryonix-Installer-Token", TEST_INSTALLER_TOKEN)
            .json(&serde_json::json!({ "version": 2 }))
            .send()
            .await
            .unwrap();
        assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
        let invalid_body: serde_json::Value = invalid.json().await.unwrap();
        assert_eq!(invalid_body["code"], "INVALID_REQUEST_BODY");
        assert_eq!(invalid_body["destructiveActionStarted"], false);
        server.abort();
    }

    #[tokio::test]
    async fn test_install_endpoint_requires_token() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");
        let (address, server) = start_test_api(store).await;
        let client = reqwest::Client::new();

        let unauthorized = client
            .post(format!("http://{address}/install"))
            .json(&serde_json::json!({ "planDigest": "dummy" }))
            .send()
            .await
            .unwrap();

        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
        let unauthorized_body: serde_json::Value = unauthorized.json().await.unwrap();
        assert_eq!(unauthorized_body["code"], "UNAUTHORIZED");
        server.abort();
    }

    #[tokio::test]
    async fn test_install_endpoint_rejects_unsupported_topology() {
        let root = TestRoot::create();
        let store = PlanStore::new(&root.0).expect("raiz temporária deve ser válida");
        let (address, server) = start_test_api(store).await;
        let client = reqwest::Client::new();

        let mut raid_plan = plan();
        raid_plan.storage.topology = Topology::Raid;

        let response = client
            .post(format!("http://{address}/plan"))
            .header("X-Kryonix-Installer-Token", TEST_INSTALLER_TOKEN)
            .json(&raid_plan)
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);
        let body: serde_json::Value = response.json().await.unwrap();
        let digest = body["planDigest"].as_str().expect("digest deve existir");

        let install_response = client
            .post(format!("http://{address}/install"))
            .header("X-Kryonix-Installer-Token", TEST_INSTALLER_TOKEN)
            .json(&serde_json::json!({ "planDigest": digest }))
            .send()
            .await
            .unwrap();

        assert_eq!(install_response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let error_body: serde_json::Value = install_response.json().await.unwrap();
        assert_eq!(error_body["code"], "UNSUPPORTED_STORAGE_CAPABILITY");
        server.abort();
    }
}
