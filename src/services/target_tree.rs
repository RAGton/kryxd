//! Materialização segura da árvore Git do sistema instalado.
//!
//! O staging é preparado em `/run`, sem tocar o disco alvo. Depois que o
//! chamador monta o filesystem em `/mnt`, o serviço confirma o mountpoint,
//! materializa o hash administrativo fora do Git, cria o commit local e clona
//! o repositório para `/mnt/etc/kryonixos` sem hardlinks.

use std::ffi::{OsStr, OsString};
use std::fmt;
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Component, Path, PathBuf};
use std::process::{Output, Stdio};

use reqwest::Url;
use serde::Deserialize;
use tokio::process::Command;
use uuid::Uuid;

use crate::domain::{InstallPlanV2, RepositoryPlan};
use crate::services::partitioner::DiskoRenderer;
use crate::services::security::{PasswordHash, SecretStore, SecurityError};

/// Repositório efêmero preparado antes do particionamento.
pub const DEFAULT_STAGING_REPOSITORY: &str = "/run/kryonix-installer/target/kryonixos";
/// Raiz montada do sistema que será instalado.
pub const DEFAULT_TARGET_MOUNT: &str = "/mnt";
/// Caminho do repositório dentro do sistema instalado.
pub const TARGET_REPOSITORY_RELATIVE_PATH: &str = "etc/kryonixos";
/// Mensagem imutável do commit criado pelo instalador.
pub const MATERIALIZATION_COMMIT_MESSAGE: &str = "chore(installer): materialize installed system";

const DIRECTORY_MODE: u32 = 0o700;
const REGULAR_FILE_MODE: u32 = 0o644;
const ADMIN_HASH_MODE: u32 = 0o600;
const MAX_STAGED_HASH_BYTES: u64 = 16 * 1024;
const TRACKED_PATHS_BEFORE_LOCK: &[&str] =
    &["flake.nix", "disko-config.nix", "state/install-plan.json"];
const TRACKED_LOCK_PATH: &str = "flake.lock";

/// Binários externos usados pelo serviço.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetTreeCommands {
    pub git: PathBuf,
    pub nix: PathBuf,
    pub findmnt: PathBuf,
}

impl Default for TargetTreeCommands {
    fn default() -> Self {
        Self {
            git: PathBuf::from("git"),
            nix: PathBuf::from("nix"),
            findmnt: PathBuf::from("findmnt"),
        }
    }
}

/// Caminhos mutáveis usados pela materialização.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetTreePaths {
    pub staging_repository: PathBuf,
    pub target_mount: PathBuf,
    pub git_home: PathBuf,
}

impl Default for TargetTreePaths {
    fn default() -> Self {
        Self {
            staging_repository: PathBuf::from(DEFAULT_STAGING_REPOSITORY),
            target_mount: PathBuf::from(DEFAULT_TARGET_MOUNT),
            git_home: PathBuf::from("/run/kryonix-installer/target/git-home"),
        }
    }
}

impl TargetTreePaths {
    /// Retorna o destino final do repositório dentro do mount alvo.
    #[must_use]
    pub fn target_repository(&self) -> PathBuf {
        self.target_mount.join(TARGET_REPOSITORY_RELATIVE_PATH)
    }
}

/// Handle de staging pronto, mas ainda sem commit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedTargetTree {
    repository: PathBuf,
    branch: String,
}

impl PreparedTargetTree {
    /// Caminho do repositório efêmero preparado.
    #[must_use]
    pub fn repository(&self) -> &Path {
        &self.repository
    }
}

/// Resultado final depois da sincronização para o target montado.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaterializedTargetTree {
    pub staging_repository: PathBuf,
    pub target_repository: PathBuf,
    pub admin_password_hash: PathBuf,
    pub git_head: String,
}

/// Serviço de materialização com paths e binários injetáveis para testes.
#[derive(Debug, Clone)]
pub struct TargetTreeService {
    paths: TargetTreePaths,
    commands: TargetTreeCommands,
}

impl TargetTreeService {
    /// Cria o serviço com paths e binários explícitos.
    pub fn new(
        paths: TargetTreePaths,
        commands: TargetTreeCommands,
    ) -> Result<Self, TargetTreeError> {
        validate_managed_path(&paths.staging_repository, "staging")?;
        validate_managed_path(&paths.target_mount, "mount alvo")?;
        validate_managed_path(&paths.git_home, "HOME isolado do Git")?;
        if paths.staging_repository.starts_with(&paths.target_mount)
            || paths.target_mount.starts_with(&paths.staging_repository)
            || paths.git_home.starts_with(&paths.staging_repository)
            || paths.staging_repository.starts_with(&paths.git_home)
            || paths.git_home.starts_with(&paths.target_mount)
        {
            return Err(TargetTreeError::OverlappingManagedPaths);
        }
        Ok(Self { paths, commands })
    }

    /// Retorna os caminhos configurados para o serviço.
    #[must_use]
    pub fn paths(&self) -> &TargetTreePaths {
        &self.paths
    }

    /// Prepara e trava o repositório em `/run`, sem criar commit ou tocar `/mnt`.
    ///
    /// Somente a allowlist de arquivos gerados é adicionada ao índice. O
    /// `flake.lock` é criado com `nix flake lock` e adicionado separadamente.
    pub async fn prepare_staging(
        &self,
        plan: &InstallPlanV2,
    ) -> Result<PreparedTargetTree, TargetTreeError> {
        validate_repository_plan(&plan.repository)?;
        reset_private_directory(&self.paths.staging_repository)?;
        reset_private_directory(&self.paths.git_home)?;
        let hooks_directory = self.paths.git_home.join("hooks");
        ensure_directory(&hooks_directory, DIRECTORY_MODE)?;

        self.git_success([
            OsString::from("init"),
            OsString::from(format!("--initial-branch={}", plan.repository.branch)),
            OsString::from("--"),
            self.paths.staging_repository.as_os_str().to_os_string(),
        ])
        .await?;
        self.configure_repository(&self.paths.staging_repository, &plan.repository)
            .await?;
        self.write_generated_tree(plan)?;

        let mut add_arguments = vec![
            OsString::from("-C"),
            self.paths.staging_repository.as_os_str().to_os_string(),
            OsString::from("add"),
            OsString::from("--"),
        ];
        add_arguments.extend(TRACKED_PATHS_BEFORE_LOCK.iter().map(OsString::from));
        self.git_success(add_arguments).await?;

        self.generate_flake_lock().await?;
        verify_regular_file(
            &self.paths.staging_repository.join(TRACKED_LOCK_PATH),
            "flake.lock",
        )?;
        self.git_success([
            OsString::from("-C"),
            self.paths.staging_repository.as_os_str().to_os_string(),
            OsString::from("add"),
            OsString::from("--"),
            OsString::from(TRACKED_LOCK_PATH),
        ])
        .await?;

        Ok(PreparedTargetTree {
            repository: self.paths.staging_repository.clone(),
            branch: plan.repository.branch.clone(),
        })
    }

    /// Materializa secrets, cria o commit e sincroniza para o target montado.
    ///
    /// O hash final é criado antes de `git commit`. Se o mountpoint ou o hash
    /// falhar, não existe commit e nenhum clone é iniciado.
    pub async fn materialize_on_target(
        &self,
        prepared: &PreparedTargetTree,
        plan: &InstallPlanV2,
        staged_admin_hash: &Path,
    ) -> Result<MaterializedTargetTree, TargetTreeError> {
        if prepared.repository != self.paths.staging_repository
            || prepared.branch != plan.repository.branch
        {
            return Err(TargetTreeError::PreparedTreeMismatch);
        }
        validate_repository_plan(&plan.repository)?;
        verify_git_repository(&prepared.repository)?;

        let mount_before = self.inspect_target_mount().await?;
        let password_hash = load_staged_password_hash(staged_admin_hash)?;
        let secret_store =
            SecretStore::new(&self.paths.target_mount).map_err(TargetTreeError::Security)?;
        let final_hash = secret_store
            .persist_admin_password_hash(&password_hash)
            .map_err(TargetTreeError::Security)?;
        verify_file_mode(&final_hash, ADMIN_HASH_MODE, "hash administrativo final")?;

        self.commit_staging().await?;
        let staging_head = self
            .git_stdout(
                &prepared.repository,
                [OsString::from("rev-parse"), OsString::from("HEAD")],
            )
            .await?;

        let target_repository = self
            .clone_to_target(prepared, &plan.repository, &mount_before)
            .await?;
        let target_head = self
            .git_stdout(
                &target_repository,
                [OsString::from("rev-parse"), OsString::from("HEAD")],
            )
            .await?;
        if staging_head != target_head {
            return Err(TargetTreeError::HeadMismatch);
        }

        let status = self
            .git_stdout(
                &target_repository,
                [
                    OsString::from("status"),
                    OsString::from("--porcelain=v1"),
                    OsString::from("--untracked-files=all"),
                ],
            )
            .await?;
        if !status.is_empty() {
            return Err(TargetTreeError::TargetWorktreeDirty);
        }

        remove_staged_hash(staged_admin_hash)?;

        Ok(MaterializedTargetTree {
            staging_repository: prepared.repository.clone(),
            target_repository,
            admin_password_hash: final_hash,
            git_head: staging_head,
        })
    }

    fn write_generated_tree(&self, plan: &InstallPlanV2) -> Result<(), TargetTreeError> {
        let state_directory = self.paths.staging_repository.join("state");
        ensure_directory(&state_directory, DIRECTORY_MODE)?;

        let flake = render_flake(&plan.repository)?;
        write_new_regular_file(
            &self.paths.staging_repository.join("flake.nix"),
            flake.as_bytes(),
            REGULAR_FILE_MODE,
        )?;

        let disko = DiskoRenderer::render(plan).map_err(TargetTreeError::Partitioner)?;
        write_new_regular_file(
            &self.paths.staging_repository.join("disko-config.nix"),
            disko.as_bytes(),
            REGULAR_FILE_MODE,
        )?;

        let mut serialized = serde_json::to_vec_pretty(plan)
            .map_err(|error| TargetTreeError::PlanSerialization(error.to_string()))?;
        serialized.push(b'\n');
        write_new_regular_file(
            &state_directory.join("install-plan.json"),
            &serialized,
            REGULAR_FILE_MODE,
        )
    }

    async fn configure_repository(
        &self,
        repository: &Path,
        plan: &RepositoryPlan,
    ) -> Result<(), TargetTreeError> {
        self.git_success_in(
            repository,
            [
                OsString::from("config"),
                OsString::from("--local"),
                OsString::from("user.name"),
                OsString::from("Kryonix Installer"),
            ],
        )
        .await?;
        self.git_success_in(
            repository,
            [
                OsString::from("config"),
                OsString::from("--local"),
                OsString::from("user.email"),
                OsString::from("installer@kryonix.invalid"),
            ],
        )
        .await?;

        for (name, url) in [
            ("core", plan.core_url.as_str()),
            ("upstream", plan.upstream_url.as_str()),
            ("downstream", plan.downstream_url.as_str()),
        ] {
            self.git_success_in(
                repository,
                [
                    OsString::from("remote"),
                    OsString::from("add"),
                    OsString::from(name),
                    OsString::from(url),
                ],
            )
            .await?;
        }

        self.git_success_in(
            repository,
            [
                OsString::from("config"),
                OsString::from("--local"),
                OsString::from("remote.pushDefault"),
                OsString::from("downstream"),
            ],
        )
        .await?;
        self.git_success_in(
            repository,
            [
                OsString::from("config"),
                OsString::from("--local"),
                OsString::from(format!("branch.{}.remote", plan.branch)),
                OsString::from("downstream"),
            ],
        )
        .await?;
        self.git_success_in(
            repository,
            [
                OsString::from("config"),
                OsString::from("--local"),
                OsString::from(format!("branch.{}.merge", plan.branch)),
                OsString::from(format!("refs/heads/{}", plan.branch)),
            ],
        )
        .await
    }

    async fn generate_flake_lock(&self) -> Result<(), TargetTreeError> {
        let output = Command::new(&self.commands.nix)
            .args([
                OsStr::new("--extra-experimental-features"),
                OsStr::new("nix-command flakes"),
                OsStr::new("flake"),
                OsStr::new("lock"),
            ])
            .arg(&self.paths.staging_repository)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status()
            .await
            .map_err(|source| TargetTreeError::ProcessIo {
                command: "nix flake lock",
                source,
            })?;
        if output.success() {
            Ok(())
        } else {
            Err(TargetTreeError::ProcessFailed {
                command: "nix flake lock",
                code: output.code(),
            })
        }
    }

    async fn commit_staging(&self) -> Result<(), TargetTreeError> {
        let hooks_directory = self.paths.git_home.join("hooks");
        self.git_success([
            OsString::from("-C"),
            self.paths.staging_repository.as_os_str().to_os_string(),
            OsString::from("-c"),
            OsString::from(format!("core.hooksPath={}", hooks_directory.display())),
            OsString::from("-c"),
            OsString::from("commit.gpgSign=false"),
            OsString::from("commit"),
            OsString::from("--no-verify"),
            OsString::from("-m"),
            OsString::from(MATERIALIZATION_COMMIT_MESSAGE),
        ])
        .await
    }

    async fn inspect_target_mount(&self) -> Result<MountIdentity, TargetTreeError> {
        reject_symbolic_ancestors(&self.paths.target_mount)?;
        let canonical_target = fs::canonicalize(&self.paths.target_mount).map_err(|source| {
            filesystem_error("resolver mount alvo", &self.paths.target_mount, source)
        })?;
        if canonical_target != self.paths.target_mount {
            return Err(TargetTreeError::UnsafePath(self.paths.target_mount.clone()));
        }

        let output = Command::new(&self.commands.findmnt)
            .args([OsStr::new("--json"), OsStr::new("--mountpoint")])
            .arg(&self.paths.target_mount)
            .args([
                OsStr::new("--output"),
                OsStr::new("TARGET,SOURCE,FSTYPE,OPTIONS"),
            ])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output()
            .await
            .map_err(|source| TargetTreeError::ProcessIo {
                command: "findmnt",
                source,
            })?;
        if !output.status.success() {
            return Err(TargetTreeError::TargetNotMounted(
                self.paths.target_mount.clone(),
            ));
        }

        let parsed: FindmntOutput = serde_json::from_slice(&output.stdout)
            .map_err(|_| TargetTreeError::InvalidMountOutput)?;
        let [mount] = parsed.filesystems.as_slice() else {
            return Err(TargetTreeError::InvalidMountOutput);
        };
        if Path::new(&mount.target) != canonical_target {
            return Err(TargetTreeError::TargetNotMounted(
                self.paths.target_mount.clone(),
            ));
        }
        if !matches!(mount.fs_type.as_str(), "btrfs" | "zfs" | "ext4" | "xfs") {
            return Err(TargetTreeError::UnsupportedTargetFilesystem(
                mount.fs_type.clone(),
            ));
        }
        if mount.options.split(',').any(|option| option == "ro") {
            return Err(TargetTreeError::TargetMountReadOnly);
        }

        Ok(MountIdentity {
            target: mount.target.clone(),
            source: mount.source.clone(),
            fs_type: mount.fs_type.clone(),
        })
    }

    async fn clone_to_target(
        &self,
        prepared: &PreparedTargetTree,
        repository_plan: &RepositoryPlan,
        mount_before: &MountIdentity,
    ) -> Result<PathBuf, TargetTreeError> {
        let target_repository = self.paths.target_repository();
        reject_symbolic_ancestors(&target_repository)?;
        if fs::symlink_metadata(&target_repository).is_ok() {
            return Err(TargetTreeError::TargetRepositoryExists(target_repository));
        }

        let parent = target_repository
            .parent()
            .ok_or_else(|| TargetTreeError::UnsafePath(target_repository.clone()))?;
        ensure_directory(parent, 0o755)?;
        let temporary = parent.join(format!(".kryonixos.{}.tmp", Uuid::new_v4()));
        let mut pending = PendingDirectory::new(temporary.clone());

        self.git_success([
            OsString::from("clone"),
            OsString::from("--local"),
            OsString::from("--no-hardlinks"),
            OsString::from("--single-branch"),
            OsString::from("--branch"),
            OsString::from(&prepared.branch),
            OsString::from("--"),
            prepared.repository.as_os_str().to_os_string(),
            temporary.as_os_str().to_os_string(),
        ])
        .await?;
        self.git_success_in(
            &temporary,
            [
                OsString::from("remote"),
                OsString::from("remove"),
                OsString::from("origin"),
            ],
        )
        .await?;
        self.configure_repository(&temporary, repository_plan)
            .await?;

        let mount_after_clone = self.inspect_target_mount().await?;
        if &mount_after_clone != mount_before {
            return Err(TargetTreeError::TargetMountChanged);
        }
        fs::rename(&temporary, &target_repository).map_err(|source| {
            filesystem_error(
                "materializar repositório no target",
                &target_repository,
                source,
            )
        })?;
        pending.disarm();

        let mount_after_rename = self.inspect_target_mount().await?;
        if &mount_after_rename != mount_before {
            return Err(TargetTreeError::TargetMountChanged);
        }
        Ok(target_repository)
    }

    async fn git_stdout<const N: usize>(
        &self,
        repository: &Path,
        arguments: [OsString; N],
    ) -> Result<String, TargetTreeError> {
        let mut full_arguments = vec![OsString::from("-C"), repository.as_os_str().to_os_string()];
        full_arguments.extend(arguments);
        let output = self.git_output(full_arguments).await?;
        String::from_utf8(output.stdout)
            .map(|value| value.trim().to_string())
            .map_err(|_| TargetTreeError::InvalidGitOutput)
    }

    async fn git_success_in<const N: usize>(
        &self,
        repository: &Path,
        arguments: [OsString; N],
    ) -> Result<(), TargetTreeError> {
        let mut full_arguments = vec![OsString::from("-C"), repository.as_os_str().to_os_string()];
        full_arguments.extend(arguments);
        self.git_success(full_arguments).await
    }

    async fn git_success<I>(&self, arguments: I) -> Result<(), TargetTreeError>
    where
        I: IntoIterator<Item = OsString>,
    {
        self.git_output(arguments).await.map(|_| ())
    }

    async fn git_output<I>(&self, arguments: I) -> Result<Output, TargetTreeError>
    where
        I: IntoIterator<Item = OsString>,
    {
        let output = Command::new(&self.commands.git)
            .args(arguments)
            .env("HOME", &self.paths.git_home)
            .env("XDG_CONFIG_HOME", &self.paths.git_home)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_ASKPASS", "/bin/false")
            .env("SSH_ASKPASS", "/bin/false")
            .env_remove("GH_TOKEN")
            .env_remove("GITHUB_TOKEN")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output()
            .await
            .map_err(|source| TargetTreeError::ProcessIo {
                command: "git",
                source,
            })?;
        if output.status.success() {
            Ok(output)
        } else {
            Err(TargetTreeError::ProcessFailed {
                command: "git",
                code: output.status.code(),
            })
        }
    }
}

impl Default for TargetTreeService {
    fn default() -> Self {
        Self::new(TargetTreePaths::default(), TargetTreeCommands::default())
            .expect("os paths padrão do target tree são absolutos e seguros")
    }
}

/// Erros do serviço sem URLs, tokens, hashes ou stderr sensível.
#[derive(Debug)]
pub enum TargetTreeError {
    InvalidManagedPath {
        purpose: &'static str,
        path: PathBuf,
    },
    OverlappingManagedPaths,
    UnsafePath(PathBuf),
    InvalidRemote {
        name: &'static str,
        reason: &'static str,
    },
    InvalidBranch,
    PlanSerialization(String),
    Partitioner(crate::services::partitioner::PartitionerError),
    ProcessIo {
        command: &'static str,
        source: io::Error,
    },
    ProcessFailed {
        command: &'static str,
        code: Option<i32>,
    },
    Filesystem {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    MissingGeneratedFile(&'static str),
    InvalidGitOutput,
    InvalidMountOutput,
    TargetNotMounted(PathBuf),
    UnsupportedTargetFilesystem(String),
    TargetMountReadOnly,
    TargetMountChanged,
    TargetRepositoryExists(PathBuf),
    PreparedTreeMismatch,
    InvalidStagedSecret(&'static str),
    Security(SecurityError),
    HeadMismatch,
    TargetWorktreeDirty,
}

impl fmt::Display for TargetTreeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidManagedPath { purpose, path } => {
                write!(
                    formatter,
                    "path inválido para {purpose}: {}",
                    path.display()
                )
            }
            Self::OverlappingManagedPaths => {
                formatter.write_str("staging, Git HOME e target devem ser árvores separadas")
            }
            Self::UnsafePath(path) => write!(formatter, "path inseguro: {}", path.display()),
            Self::InvalidRemote { name, reason } => {
                write!(formatter, "remote {name} inválido: {reason}")
            }
            Self::InvalidBranch => formatter.write_str("branch Git inválida"),
            Self::PlanSerialization(_) => {
                formatter.write_str("não foi possível serializar o plano sanitizado")
            }
            Self::Partitioner(error) => write!(formatter, "{error}"),
            Self::ProcessIo { command, .. } => {
                write!(formatter, "não foi possível iniciar {command}")
            }
            Self::ProcessFailed { command, code } => {
                write!(formatter, "{command} terminou com código {code:?}")
            }
            Self::Filesystem {
                operation, path, ..
            } => write!(formatter, "falha ao {operation}: {}", path.display()),
            Self::MissingGeneratedFile(name) => {
                write!(formatter, "arquivo gerado ausente: {name}")
            }
            Self::InvalidGitOutput => formatter.write_str("Git retornou saída inválida"),
            Self::InvalidMountOutput => formatter.write_str("findmnt retornou saída inválida"),
            Self::TargetNotMounted(path) => {
                write!(
                    formatter,
                    "o target não é um mountpoint real: {}",
                    path.display()
                )
            }
            Self::UnsupportedTargetFilesystem(fs_type) => {
                write!(formatter, "filesystem do target não suportado: {fs_type}")
            }
            Self::TargetMountReadOnly => formatter.write_str("o target está montado read-only"),
            Self::TargetMountChanged => {
                formatter.write_str("a identidade do mount alvo mudou durante a sincronização")
            }
            Self::TargetRepositoryExists(path) => write!(
                formatter,
                "o repositório final já existe e não será sobrescrito: {}",
                path.display()
            ),
            Self::PreparedTreeMismatch => {
                formatter.write_str("o handle de staging não pertence a este serviço/plano")
            }
            Self::InvalidStagedSecret(reason) => {
                write!(formatter, "hash administrativo efêmero inválido: {reason}")
            }
            Self::Security(error) => write!(formatter, "{error}"),
            Self::HeadMismatch => formatter.write_str("HEAD diferente entre staging e target"),
            Self::TargetWorktreeDirty => formatter.write_str("worktree final não está limpa"),
        }
    }
}

impl std::error::Error for TargetTreeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Partitioner(source) => Some(source),
            Self::ProcessIo { source, .. } | Self::Filesystem { source, .. } => Some(source),
            Self::Security(source) => Some(source),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MountIdentity {
    target: String,
    source: String,
    fs_type: String,
}

#[derive(Deserialize)]
struct FindmntOutput {
    filesystems: Vec<FindmntFilesystem>,
}

#[derive(Deserialize)]
struct FindmntFilesystem {
    target: String,
    source: String,
    #[serde(rename = "fstype")]
    fs_type: String,
    options: String,
}

fn validate_repository_plan(plan: &RepositoryPlan) -> Result<(), TargetTreeError> {
    validate_remote("core", &plan.core_url)?;
    validate_remote("upstream", &plan.upstream_url)?;
    validate_remote("downstream", &plan.downstream_url)?;
    validate_branch(&plan.branch)
}

fn validate_remote(name: &'static str, value: &str) -> Result<(), TargetTreeError> {
    let parsed = Url::parse(value).map_err(|_| TargetTreeError::InvalidRemote {
        name,
        reason: "URL malformada",
    })?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() {
        return Err(TargetTreeError::InvalidRemote {
            name,
            reason: "somente HTTPS com host é permitido",
        });
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(TargetTreeError::InvalidRemote {
            name,
            reason: "userinfo e credenciais são proibidos",
        });
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(TargetTreeError::InvalidRemote {
            name,
            reason: "query e fragmento são proibidos",
        });
    }
    if parsed.path().trim_matches('/').is_empty() {
        return Err(TargetTreeError::InvalidRemote {
            name,
            reason: "o path do repositório está vazio",
        });
    }
    Ok(())
}

fn validate_branch(branch: &str) -> Result<(), TargetTreeError> {
    let valid_characters = branch
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/'));
    if branch.is_empty()
        || branch.len() > 200
        || !branch.as_bytes()[0].is_ascii_alphanumeric()
        || !valid_characters
        || branch.contains("..")
        || branch.contains("//")
        || branch.contains("@{")
        || branch.ends_with('/')
        || branch.ends_with('.')
        || branch.ends_with(".lock")
    {
        return Err(TargetTreeError::InvalidBranch);
    }
    Ok(())
}

fn render_flake(repository: &RepositoryPlan) -> Result<String, TargetTreeError> {
    let core = serde_json::to_string(&format!("git+{}", repository.core_url))
        .map_err(|error| TargetTreeError::PlanSerialization(error.to_string()))?;
    let upstream = serde_json::to_string(&format!("git+{}", repository.upstream_url))
        .map_err(|error| TargetTreeError::PlanSerialization(error.to_string()))?;
    Ok(format!(
        r#"{{
  description = "KryonixOS target materialized by Kryonix Installer";

  inputs = {{
    core.url = {core};
    upstream.url = {upstream};
  }};

  outputs = {{ self, core, upstream, ... }}: {{ }};
}}
"#
    ))
}

fn validate_managed_path(path: &Path, purpose: &'static str) -> Result<(), TargetTreeError> {
    let depth = path
        .components()
        .filter(|component| matches!(component, Component::Normal(_)))
        .count();
    if !path.is_absolute()
        || depth < 2
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err(TargetTreeError::InvalidManagedPath {
            purpose,
            path: path.to_path_buf(),
        });
    }
    Ok(())
}

fn reject_symbolic_ancestors(path: &Path) -> Result<(), TargetTreeError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(TargetTreeError::UnsafePath(current));
            }
            Ok(metadata) if current != path && !metadata.is_dir() => {
                return Err(TargetTreeError::UnsafePath(current));
            }
            Ok(_) => {}
            Err(source) if source.kind() == io::ErrorKind::NotFound => break,
            Err(source) => {
                return Err(filesystem_error("inspecionar ancestral", &current, source));
            }
        }
    }
    Ok(())
}

fn reset_private_directory(path: &Path) -> Result<(), TargetTreeError> {
    reject_symbolic_ancestors(path)?;
    match fs::symlink_metadata(path) {
        Ok(metadata) if !metadata.is_dir() || metadata.file_type().is_symlink() => {
            return Err(TargetTreeError::UnsafePath(path.to_path_buf()));
        }
        Ok(_) => fs::remove_dir_all(path)
            .map_err(|source| filesystem_error("limpar staging", path, source))?,
        Err(source) if source.kind() == io::ErrorKind::NotFound => {}
        Err(source) => return Err(filesystem_error("inspecionar staging", path, source)),
    }
    ensure_directory(path, DIRECTORY_MODE)
}

fn ensure_directory(path: &Path, mode: u32) -> Result<(), TargetTreeError> {
    reject_symbolic_ancestors(path)?;
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(TargetTreeError::UnsafePath(path.to_path_buf()));
        }
        Ok(_) => {}
        Err(source) if source.kind() == io::ErrorKind::NotFound => {
            let mut builder = DirBuilder::new();
            builder.recursive(true).mode(mode);
            builder
                .create(path)
                .map_err(|source| filesystem_error("criar diretório", path, source))?;
        }
        Err(source) => return Err(filesystem_error("inspecionar diretório", path, source)),
    }
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
        .map_err(|source| filesystem_error("aplicar modo do diretório", path, source))
}

fn write_new_regular_file(path: &Path, bytes: &[u8], mode: u32) -> Result<(), TargetTreeError> {
    reject_symbolic_ancestors(path)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(mode)
        .open(path)
        .map_err(|source| filesystem_error("criar arquivo gerado", path, source))?;
    file.set_permissions(fs::Permissions::from_mode(mode))
        .map_err(|source| filesystem_error("aplicar modo do arquivo", path, source))?;
    file.write_all(bytes)
        .map_err(|source| filesystem_error("escrever arquivo gerado", path, source))?;
    file.sync_all()
        .map_err(|source| filesystem_error("sincronizar arquivo gerado", path, source))
}

fn verify_regular_file(path: &Path, name: &'static str) -> Result<(), TargetTreeError> {
    reject_symbolic_ancestors(path)?;
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => Ok(()),
        _ => Err(TargetTreeError::MissingGeneratedFile(name)),
    }
}

fn verify_git_repository(path: &Path) -> Result<(), TargetTreeError> {
    verify_regular_directory(&path.join(".git"), "repositório Git")
}

fn verify_regular_directory(path: &Path, _purpose: &'static str) -> Result<(), TargetTreeError> {
    reject_symbolic_ancestors(path)?;
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(()),
        _ => Err(TargetTreeError::UnsafePath(path.to_path_buf())),
    }
}

fn load_staged_password_hash(path: &Path) -> Result<PasswordHash, TargetTreeError> {
    reject_symbolic_ancestors(path)?;
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| TargetTreeError::InvalidStagedSecret("arquivo ausente"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(TargetTreeError::InvalidStagedSecret(
            "o path não é um arquivo regular",
        ));
    }
    if metadata.len() > MAX_STAGED_HASH_BYTES {
        return Err(TargetTreeError::InvalidStagedSecret(
            "arquivo excede o limite",
        ));
    }
    if metadata.permissions().mode() & 0o777 != ADMIN_HASH_MODE {
        return Err(TargetTreeError::InvalidStagedSecret(
            "o arquivo não possui modo 0600",
        ));
    }
    let hash = fs::read_to_string(path)
        .map_err(|_| TargetTreeError::InvalidStagedSecret("não foi possível ler o hash"))?;
    PasswordHash::from_persisted(hash).map_err(TargetTreeError::Security)
}

fn verify_file_mode(
    path: &Path,
    expected: u32,
    _purpose: &'static str,
) -> Result<(), TargetTreeError> {
    reject_symbolic_ancestors(path)?;
    let metadata = fs::symlink_metadata(path)
        .map_err(|source| filesystem_error("verificar arquivo", path, source))?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.permissions().mode() & 0o777 != expected
    {
        return Err(TargetTreeError::UnsafePath(path.to_path_buf()));
    }
    Ok(())
}

fn remove_staged_hash(path: &Path) -> Result<(), TargetTreeError> {
    verify_file_mode(path, ADMIN_HASH_MODE, "hash efêmero")?;
    fs::remove_file(path)
        .map_err(|source| filesystem_error("remover hash efêmero", path, source))?;
    let parent = path
        .parent()
        .ok_or_else(|| TargetTreeError::UnsafePath(path.to_path_buf()))?;
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| filesystem_error("sincronizar diretório de secrets", parent, source))
}

fn filesystem_error(operation: &'static str, path: &Path, source: io::Error) -> TargetTreeError {
    TargetTreeError::Filesystem {
        operation,
        path: path.to_path_buf(),
        source,
    }
}

struct PendingDirectory {
    path: PathBuf,
    armed: bool,
}

impl PendingDirectory {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for PendingDirectory {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::os::unix::fs::PermissionsExt;
    use std::process::Command as StdCommand;

    use super::*;
    use crate::domain::{Encryption, FileSystem, MountPlan, StoragePlan, Topology, ZfsStoragePlan};

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn create() -> Self {
            let path = std::env::temp_dir().join(format!(
                "kryonix-target-tree-{}-{}",
                std::process::id(),
                Uuid::new_v4()
            ));
            fs::create_dir_all(&path).expect("raiz temporária deve ser criada");
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

    fn write_executable(path: &Path, content: &str) {
        fs::write(path, content).expect("script de teste deve ser escrito");
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .expect("script de teste deve ser executável");
    }

    fn test_service(root: &TestRoot, mount_succeeds: bool) -> TargetTreeService {
        let bin = root.0.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let fake_nix = bin.join("nix");
        write_executable(
            &fake_nix,
            r#"#!/bin/sh
set -eu
for repository in "$@"; do :; done
printf '%s\n' '{"nodes":{"root":{"inputs":{}}},"root":"root","version":7}' > "$repository/flake.lock"
"#,
        );

        let target_mount = root.0.join("mnt");
        fs::create_dir_all(&target_mount).unwrap();
        let fake_findmnt = bin.join("findmnt");
        if mount_succeeds {
            let json = serde_json::json!({
                "filesystems": [{
                    "target": target_mount,
                    "source": "/dev/test-target",
                    "fstype": "ext4",
                    "options": "rw,relatime"
                }]
            });
            write_executable(
                &fake_findmnt,
                &format!("#!/bin/sh\nprintf '%s\\n' '{}'\n", json),
            );
        } else {
            write_executable(&fake_findmnt, "#!/bin/sh\nexit 1\n");
        }

        TargetTreeService::new(
            TargetTreePaths {
                staging_repository: root.0.join("run/target/kryonixos"),
                target_mount,
                git_home: root.0.join("run/target/git-home"),
            },
            TargetTreeCommands {
                git: PathBuf::from("git"),
                nix: fake_nix,
                findmnt: fake_findmnt,
            },
        )
        .unwrap()
    }

    fn write_staged_hash(root: &TestRoot) -> PathBuf {
        let directory = root.0.join("run/secrets/fixture");
        fs::create_dir_all(&directory).unwrap();
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
        let path = directory.join("admin-password.hash");
        fs::write(&path, "$y$j9T$fixture-salt$fixture-hash\n").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        path
    }

    fn git_output(repository: &Path, arguments: &[&str]) -> String {
        let output = StdCommand::new("git")
            .arg("-C")
            .arg(repository)
            .args(arguments)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .output()
            .expect("git de teste deve iniciar");
        assert!(output.status.success(), "git de teste falhou");
        String::from_utf8(output.stdout).unwrap().trim().to_string()
    }

    #[tokio::test]
    async fn materializes_exact_remotes_commit_lock_and_private_secret() {
        let root = TestRoot::create();
        let service = test_service(&root, true);
        let plan = plan();
        let prepared = service.prepare_staging(&plan).await.unwrap();
        fs::write(
            prepared.repository().join("sentinel-not-for-install"),
            "sentinel",
        )
        .unwrap();
        let staged_hash = write_staged_hash(&root);

        let materialized = service
            .materialize_on_target(&prepared, &plan, &staged_hash)
            .await
            .unwrap();

        assert_eq!(
            git_output(&materialized.staging_repository, &["remote"]),
            "core\ndownstream\nupstream"
        );
        for (remote, expected_url) in [
            ("core", plan.repository.core_url.as_str()),
            ("upstream", plan.repository.upstream_url.as_str()),
            ("downstream", plan.repository.downstream_url.as_str()),
        ] {
            assert_eq!(
                git_output(
                    &materialized.target_repository,
                    &["remote", "get-url", remote]
                ),
                expected_url
            );
        }
        assert_eq!(
            git_output(
                &materialized.target_repository,
                &["config", "--get", "remote.pushDefault"]
            ),
            "downstream"
        );
        assert_eq!(
            git_output(
                &materialized.target_repository,
                &["config", "--get", "branch.main.remote"]
            ),
            "downstream"
        );
        assert_eq!(
            git_output(
                &materialized.target_repository,
                &["config", "--get", "branch.main.merge"]
            ),
            "refs/heads/main"
        );
        assert_eq!(
            git_output(
                &materialized.target_repository,
                &["log", "-1", "--format=%s"]
            ),
            MATERIALIZATION_COMMIT_MESSAGE
        );
        assert_eq!(
            git_output(
                &materialized.staging_repository,
                &["rev-list", "--count", "HEAD"]
            ),
            "1"
        );
        assert_eq!(
            git_output(&materialized.target_repository, &["ls-files"]),
            "disko-config.nix\nflake.lock\nflake.nix\nstate/install-plan.json"
        );
        assert!(
            !materialized
                .target_repository
                .join("sentinel-not-for-install")
                .exists()
        );
        assert!(!staged_hash.exists());
        assert_eq!(
            fs::metadata(&materialized.admin_password_hash)
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(materialized.admin_password_hash.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        let target_config =
            fs::read_to_string(materialized.target_repository.join(".git/config")).unwrap();
        assert!(!target_config.contains(&service.paths.staging_repository.display().to_string()));
        assert!(!target_config.contains("origin"));
        assert!(
            !git_output(&materialized.target_repository, &["ls-files"])
                .contains("installer-secrets")
        );
    }

    #[tokio::test]
    async fn missing_secret_prevents_commit_and_clone() {
        let root = TestRoot::create();
        let service = test_service(&root, true);
        let plan = plan();
        let prepared = service.prepare_staging(&plan).await.unwrap();
        let missing = root.0.join("missing-admin-password.hash");

        assert!(matches!(
            service
                .materialize_on_target(&prepared, &plan, &missing)
                .await,
            Err(TargetTreeError::InvalidStagedSecret("arquivo ausente"))
        ));
        let head = StdCommand::new("git")
            .arg("-C")
            .arg(prepared.repository())
            .args(["rev-parse", "--verify", "HEAD"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(!head.success());
        assert!(!service.paths.target_repository().exists());
    }

    #[tokio::test]
    async fn ordinary_directory_is_not_accepted_as_target_mount() {
        let root = TestRoot::create();
        let service = test_service(&root, false);
        let plan = plan();
        let prepared = service.prepare_staging(&plan).await.unwrap();
        let staged_hash = write_staged_hash(&root);

        assert!(matches!(
            service
                .materialize_on_target(&prepared, &plan, &staged_hash)
                .await,
            Err(TargetTreeError::TargetNotMounted(_))
        ));
        assert!(staged_hash.exists());
        assert!(!service.paths.target_repository().exists());
        assert!(
            !service
                .paths
                .target_mount
                .join("var/lib/kryonix/installer-secrets/admin-password.hash")
                .exists()
        );
    }

    #[tokio::test]
    async fn rejects_remote_credentials_and_malicious_branches_before_git() {
        let root = TestRoot::create();
        let service = test_service(&root, true);

        let mut tokenized = plan();
        tokenized.repository.core_url = "https://token@github.com/RAGton/kryonix.git".into();
        assert!(matches!(
            service.prepare_staging(&tokenized).await,
            Err(TargetTreeError::InvalidRemote { .. })
        ));
        assert!(!service.paths.staging_repository.exists());

        let mut invalid_branch = plan();
        invalid_branch.repository.branch = "-c/core.hooksPath=/tmp/hook".into();
        assert!(matches!(
            service.prepare_staging(&invalid_branch).await,
            Err(TargetTreeError::InvalidBranch)
        ));
        assert!(!service.paths.staging_repository.exists());
    }

    #[test]
    fn rejects_overlapping_staging_git_home_and_target_paths() {
        let root = TestRoot::create();
        let target_mount = root.0.join("mnt");
        let result = TargetTreeService::new(
            TargetTreePaths {
                staging_repository: target_mount.join("run/target/kryonixos"),
                target_mount,
                git_home: root.0.join("git-home"),
            },
            TargetTreeCommands::default(),
        );

        assert!(matches!(
            result,
            Err(TargetTreeError::OverlappingManagedPaths)
        ));
    }

    #[tokio::test]
    async fn flake_lock_failure_prevents_staging_commit() {
        let root = TestRoot::create();
        let mut service = test_service(&root, true);
        let failing_nix = root.0.join("bin/nix-fail");
        write_executable(&failing_nix, "#!/bin/sh\nexit 9\n");
        service.commands.nix = failing_nix;

        assert!(matches!(
            service.prepare_staging(&plan()).await,
            Err(TargetTreeError::ProcessFailed {
                command: "nix flake lock",
                code: Some(9)
            })
        ));
        let head = StdCommand::new("git")
            .arg("-C")
            .arg(&service.paths.staging_repository)
            .args(["rev-parse", "--verify", "HEAD"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(!head.success());
    }

    #[tokio::test]
    #[ignore = "smoke explícito: executa o nix real, sem rede e sem inputs externos"]
    async fn real_nix_flake_lock_smoke() {
        if StdCommand::new("nix").arg("--version").status().is_err() {
            return;
        }
        let root = TestRoot::create();
        let repository = root.0.join("repo");
        let dependency = root.0.join("dependency");
        fs::create_dir_all(&repository).unwrap();
        fs::create_dir_all(&dependency).unwrap();
        fs::write(dependency.join("fixture"), "offline fixture\n").unwrap();
        let dependency_url = serde_json::to_string(&format!("path:{}", dependency.display()))
            .expect("path temporário deve serializar");
        fs::write(
            repository.join("flake.nix"),
            format!(
                "{{ inputs.fixture = {{ url = {dependency_url}; flake = false; }}; outputs = {{ self, fixture }}: {{ }}; }}\n"
            ),
        )
        .unwrap();
        let status = StdCommand::new("git")
            .args(["init", "--initial-branch=main", "--"])
            .arg(&repository)
            .status()
            .unwrap();
        assert!(status.success());
        assert!(
            StdCommand::new("git")
                .arg("-C")
                .arg(&repository)
                .args(["add", "--", "flake.nix"])
                .status()
                .unwrap()
                .success()
        );
        let service = TargetTreeService::new(
            TargetTreePaths {
                staging_repository: repository.clone(),
                target_mount: root.0.join("mnt"),
                git_home: root.0.join("git-home"),
            },
            TargetTreeCommands::default(),
        )
        .unwrap();
        service.generate_flake_lock().await.unwrap();
        assert!(repository.join("flake.lock").is_file());
    }

    #[tokio::test]
    #[ignore = "smoke explícito: resolve os inputs HTTPS reais do plano"]
    async fn real_generated_remote_flake_lock_smoke() {
        if StdCommand::new("nix").arg("--version").status().is_err() {
            return;
        }
        let root = TestRoot::create();
        let target_mount = root.0.join("mnt");
        fs::create_dir_all(&target_mount).unwrap();
        let service = TargetTreeService::new(
            TargetTreePaths {
                staging_repository: root.0.join("run/target/kryonixos"),
                target_mount,
                git_home: root.0.join("run/target/git-home"),
            },
            TargetTreeCommands {
                git: PathBuf::from("git"),
                nix: PathBuf::from("nix"),
                findmnt: PathBuf::from("findmnt"),
            },
        )
        .unwrap();

        let prepared = service.prepare_staging(&plan()).await.unwrap();
        assert!(prepared.repository().join("flake.lock").is_file());
        assert!(
            git_output(prepared.repository(), &["ls-files"])
                .lines()
                .any(|path| path == "flake.lock")
        );
    }
}
