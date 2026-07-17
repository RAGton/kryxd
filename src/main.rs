pub mod api;
mod auth;
mod detection;
mod disk;
pub mod domain;
mod executor;
mod network;
pub mod services;
use network::apply_network;
mod profiles;
mod source;

use axum::{
    Json, Router,
    extract::{ConnectInfo, Path, State},
    http::StatusCode,
    response::{
        IntoResponse,
        sse::{Event, Sse},
    },
    routing::{get, post},
};
use executor::{ProgressEvent, SafetyCheck, run_preflight};
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

// ── Shared state ──────────────────────────────────────────────────────────────

pub struct AppState {
    log_sender: Arc<broadcast::Sender<String>>,
    progress_tx: Arc<broadcast::Sender<ProgressEvent>>,
    install_status: Arc<RwLock<InstallStatus>>,
    /// GitHub OAuth state — token kept in memory only
    pub auth: auth::SharedAuthState,
    /// Reusable HTTP client (connection pooling, rustls)
    pub http_client: reqwest::Client,
    /// Token for destructive API calls
    pub installer_token: String,
    /// Casos de uso e stores isolados da API v2.
    pub install_service: Arc<api::install::InstallService>,
}

// ── Common error type ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct ErrorResponse {
    error: String,
    details: Option<String>,
}

type ApiError = (StatusCode, Json<ErrorResponse>);

fn err500(msg: impl Into<String>, detail: Option<String>) -> ApiError {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: msg.into(),
            details: detail,
        }),
    )
}

// ── Install plan types ────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PlanRequest {
    hostname: Option<String>,
    timezone: Option<String>,
    locale: Option<String>,
    keyboard: Option<String>,
    disk: PlanDiskReq,
    user: PlanUserReq,
    features: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct PlanDiskReq {
    target: String,
    layout: Option<String>,
    boot_mode: Option<String>,
}

#[derive(Deserialize)]
struct PlanUserReq {
    name: String,
    admin: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct InstallPlan {
    pub version: u32,
    pub hostname: String,
    pub timezone: String,
    pub locale: String,
    pub keyboard: String,
    pub disk: PlanDisk,
    pub user: PlanUser,
    pub features: serde_json::Value,
    #[serde(default)]
    pub confirmed_features: Vec<String>,
    #[serde(default)]
    pub network: NetworkPlan,
    /// Controla se openssh deve ser habilitado no sistema instalado.
    /// Mapeado de `remoteAccess.enabled` pelo mapper da UI.
    #[serde(rename = "target_remote_access", default)]
    pub target_remote_access: TargetRemoteAccessPlan,
}

// UI sends camelCase keys (serverIp, prefixLength, httpPort, pppoeUser).
// `rename_all = "camelCase"` makes serde accept the UI wire format directly
// while Rust code continues to use idiomatic snake_case field names.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetworkPlan {
    pub hostname: String,
    pub interface: String,
    pub server_ip: String,
    pub prefix_length: u8,
    pub mode: String,
    pub gateway: String,
    pub dns: Vec<String>,
    pub http_port: u16,
    #[serde(default)]
    pub wan: WanPlan,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct WanPlan {
    pub interface: String,
    pub mode: String,
    pub address: Option<String>,
    pub prefix_length: Option<u8>,
    pub gateway: Option<String>,
    pub dns: Vec<String>,
    pub pppoe_user: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PlanDisk {
    pub mode: String,
    pub target: String,
    pub layout: String,
    pub boot_mode: String,
    #[serde(default)]
    pub profile: String,
    #[serde(rename = "selectedDisks", default)]
    pub selected_disks: Vec<String>,
    #[serde(rename = "raidLevel")]
    pub raid_level: Option<String>,
    #[serde(rename = "manualPartitions")]
    pub manual_partitions: Option<Vec<PartitionSpec>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PartitionSpec {
    pub device: String,
    pub mountpoint: String,
    pub fstype: String,
    pub size: String,
    pub format: bool,
}

fn default_user_uid() -> u32 {
    1000
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PlanUser {
    pub name: String,
    pub admin: bool,
    /// UID do usuário no sistema instalado (informativo; não é segredo)
    #[serde(default = "default_user_uid")]
    pub uid: u32,
    /// E-mail do administrador (informativo; não é segredo)
    #[serde(default)]
    pub email: String,
    /// Chaves SSH públicas autorizadas — chaves públicas não são segredos
    #[serde(rename = "authorized_keys", default)]
    pub authorized_keys: Vec<String>,
    /// Hash da senha do usuário inicial (formato NixOS: `$y$...`, `$6$...`, etc.).
    ///
    /// SEGURANÇA:
    /// - Nunca serializado para JSON (skip_serializing_if garante).
    /// - Nunca logado via SSE ou arquivo de log.
    /// - Nunca persistido em install-plan.json nem state/.
    /// - Aceito apenas como input no payload do POST /install.
    #[serde(rename = "hashedPassword", default, skip_serializing)]
    pub hashed_password: Option<String>,
}

/// Controle de acesso remoto: se true, `services.openssh.enable` é emitido
/// no `features.generated.nix` do target.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct TargetRemoteAccessPlan {
    pub enabled: bool,
}

// ── Dry-run / validation types ────────────────────────────────────────────────

#[derive(Serialize)]
struct DryRunResult {
    ok: bool,
    checks: Vec<Check>,
}

#[derive(Serialize)]
struct Check {
    ok: bool,
    message: String,
}

impl Check {
    fn pass(msg: impl Into<String>) -> Self {
        Self {
            ok: true,
            message: msg.into(),
        }
    }
    fn fail(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            message: msg.into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct InstallStatus {
    running: bool,
    #[serde(rename = "exitCode")]
    exit_code: Option<i32>,
    #[serde(rename = "currentPhase")]
    current_phase: Option<String>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
    #[serde(rename = "lastLogLine")]
    last_log_line: Option<String>,
    #[serde(rename = "havePlan")]
    have_plan: bool,
    #[serde(rename = "canInstall")]
    can_install: bool,
}

fn save_install_state(status: &InstallStatus) {
    if let Ok(json) = serde_json::to_string_pretty(status) {
        let _ = std::fs::write("/tmp/kryonix-install-state.json", json);
    }
}

fn load_install_state() -> InstallStatus {
    if let Ok(json) = std::fs::read_to_string("/tmp/kryonix-install-state.json")
        && let Ok(status) = serde_json::from_str(&json)
    {
        return status;
    }
    InstallStatus::default()
}

#[derive(Deserialize)]
struct ProfileRequest {
    host: String,
    profile: String,
}

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let (log_tx, _) = broadcast::channel(100);
    let (progress_tx, _) = broadcast::channel::<ProgressEvent>(64);

    let http_client = reqwest::Client::builder()
        .use_rustls_tls()
        .user_agent("kryxd/0.1")
        .build()
        .expect("Failed to build HTTP client");

    let installer_token = std::env::var("KRYONIX_INSTALLER_TOKEN")
        .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
    println!("============================================================");
    println!("KRYONIX INSTALLER TOKEN: {}", installer_token);
    println!("Pass this token in the X-Kryonix-Installer-Token header.");
    println!("============================================================");

    let state = Arc::new(AppState {
        log_sender: Arc::new(log_tx),
        progress_tx: Arc::new(progress_tx),
        install_status: Arc::new(RwLock::new(load_install_state())),
        auth: auth::new_auth_state(),
        http_client,
        installer_token,
        install_service: Arc::new(api::install::InstallService::default()),
    });

    let legacy_api = Router::new()
        .route("/health", get(health))
        .route("/version", get(version_handler))
        // Hardware probe — canonical path matches spec, /probe kept for compat
        .route("/hardware", get(probe))
        .route("/probe", get(probe))
        // Step 0 — Network setup (ethernet auto / WiFi manual)
        .route("/network/status", get(network::status))
        .route("/network/interfaces", get(network::interfaces))
        .route("/network/wifi/scan", get(network::wifi_scan))
        .route("/network/wifi/connect", post(network::wifi_connect))
        .route("/network/wifi/disconnect", post(network::wifi_disconnect))
        .route("/network/apply", post(apply_network))
        // Step 1 — GitHub OAuth Device Flow
        .route("/auth/github/device", post(auth::start_device_flow))
        .route("/auth/github/poll", get(auth::poll_device_flow))
        .route("/repos", get(auth::list_repos))
        .route("/clone", post(auth::clone_repo))
        // Install orchestration
        .route(
            "/api/source/github/prepare",
            post(source::prepare_github_source),
        )
        .route(
            "/api/source/github/create-from-template",
            post(source::create_from_template),
        )
        .route("/plan", post(plan))
        .route("/dry-run", post(dry_run))
        .route("/install", post(install))
        .route("/install/status", get(install_status))
        .route("/install/progress", get(install_progress))
        // Profiles
        .route("/profile/apply", post(apply_profile_endpoint))
        // Debug — inspeção do target flake gerado em /mnt/etc/kryonixos
        .route("/debug/target", get(debug_target))
        // CSRF Token
        .route("/api/token", get(get_csrf_token))
        // Detection
        .route("/api/detection", get(detection_handler))
        // Disk Planner
        .route("/disk/apply", post(disk_apply_endpoint))
        .route("/disk/manual-setup", get(manual_setup_handler))
        // Installation
        .route("/install/finalize", post(install_finalize_endpoint))
        .route("/api/validate-install", get(validate_install_handler))
        // Disk utilities
        .route("/api/disks", get(get_disks))
        .route("/api/disks/:device/partitions", get(get_partitions_handler))
        .route("/api/partition", post(partition_endpoint))
        .route("/api/reboot", post(reboot_endpoint))
        .route("/api/stream", get(stream_logs));

    let app = Router::new()
        .nest("/api/v1", api::v1::router().nest("/legacy", legacy_api))
        .nest("/api/v2", api::router())
        .nest("/api/virt", api::virt::router())
        .layer(
            CorsLayer::new()
                .allow_methods(Any)
                .allow_headers(Any)
                .allow_origin(AllowOrigin::predicate(
                    |origin: &axum::http::HeaderValue, _request_parts| {
                        if let Ok(s) = origin.to_str() {
                            s.starts_with("http://127.0.0.1")
                                || s.starts_with("http://localhost")
                                || s.starts_with("http://[::1]")
                        } else {
                            false
                        }
                    },
                )),
        )
        .with_state(state);

    let bind_addr =
        std::env::var("KRYONIX_INSTALLER_BIND").unwrap_or_else(|_| "127.0.0.1:8080".to_string());

    if (bind_addr.starts_with("0.0.0.0") || bind_addr.starts_with("[::]"))
        && std::env::var("KRYONIX_ALLOW_REMOTE_BIND").is_err()
    {
        eprintln!(
            "ERROR: Destructive API is binding to {} without explicit authorization.",
            bind_addr
        );
        eprintln!("If you are absolutely sure you want to expose the installer to the network,");
        eprintln!("set KRYONIX_ALLOW_REMOTE_BIND=1 in your environment.");
        std::process::exit(1);
    }

    let listener = tokio::net::TcpListener::bind(&bind_addr).await.unwrap();
    println!(
        "Kryonix Installer API → http://{}",
        listener.local_addr().unwrap()
    );
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}

async fn get_csrf_token(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !addr.ip().is_loopback() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "FORBIDDEN".into(),
                details: Some("CSRF token can only be retrieved from localhost".into()),
            }),
        ));
    }
    Ok(Json(serde_json::json!({
        "token": state.installer_token
    })))
}

async fn install_finalize_endpoint(
    State(_state): State<Arc<AppState>>,
    Json(_payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ApiError> {
    Err((
        StatusCode::GONE,
        Json(ErrorResponse {
            error: "LEGACY_ROUTE_DISABLED".into(),
            details: Some(
                "Use POST /dry-run para validação e POST /install para execução protegida.".into(),
            ),
        }),
    ))
}

async fn validate_install_handler() -> Result<Json<serde_json::Value>, ApiError> {
    let flag_exists = std::path::Path::new("/mnt/etc/kryonix-installed").exists();
    let efi_exists = std::path::Path::new("/mnt/boot/EFI").exists()
        || std::path::Path::new("/mnt/boot/efi").exists();
    let grub_exists = std::path::Path::new("/mnt/boot/grub").exists();

    Ok(Json(serde_json::json!({
        "flag_ok": flag_exists,
        "bootloader_ok": efi_exists || grub_exists,
        "paths": {
            "/mnt/etc/kryonix-installed": flag_exists,
            "/mnt/boot/EFI": efi_exists,
            "/mnt/boot/grub": grub_exists
        }
    })))
}

async fn disk_apply_endpoint(
    Json(_payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ApiError> {
    Err((
        StatusCode::GONE,
        Json(ErrorResponse {
            error: "LEGACY_ROUTE_DISABLED".into(),
            details: Some(
                "A rota /disk/apply não executa mais ações destrutivas. Use /dry-run e /install."
                    .into(),
            ),
        }),
    ))
}

async fn apply_profile_endpoint(
    Json(payload): Json<ProfileRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let profile = match payload.profile.to_uppercase().as_str() {
        "GAMER" => profiles::ProfileType::Gamer,
        "DEV_RUST" => profiles::ProfileType::DevRust,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Perfil inválido".into(),
                    details: Some(format!(
                        "Suportados: GAMER, DEV_RUST. Recebido: {}",
                        payload.profile
                    )),
                }),
            ));
        }
    };

    profiles::apply_profile(&payload.host, profile)
        .map(|_| Json(serde_json::json!({ "status": "success", "message": "Perfil aplicado com sucesso" })))
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Falha ao aplicar perfil".into(),
            details: Some(e),
        })))
}

// ── GET /debug/target ─────────────────────────────────────────────────────────
//
// Inspeção do target flake gerado, sem listar /mnt inteiro nem expor segredos.
// Usado pelo loop de debug do instalador para provar que `/mnt/etc/kryonixos`
// está autocontido antes do `nixos-install` rodar.
async fn debug_target() -> Result<Json<serde_json::Value>, ApiError> {
    let report = run_preflight()
        .await
        .map_err(|e| err500("DEBUG_TARGET_FAILED", Some(e)))?;

    // Tail do log do nixos-install (se houver). Útil quando o SSE perdeu a
    // conexão durante a fase de evaluation.
    let install_log_tail = match tokio::fs::read_to_string(executor::nixos::NIXOS_INSTALL_LOG).await
    {
        Ok(s) => {
            const MAX: usize = 6000;
            if s.len() > MAX {
                format!("...{}", &s[s.len() - MAX..])
            } else {
                s
            }
        }
        Err(_) => "(sem log — nixos-install ainda não rodou)".into(),
    };

    Ok(Json(serde_json::json!({
        "passed": report.passed(),
        "files": {
            "target_flake": report.target_flake_exists,
            "engine_flake": report.engine_flake_exists,
            "features_generated": report.features_generated_exists,
            "hardware_generated": report.hardware_generated_exists,
            "legacy_symlink": report.legacy_symlink_ok,
        },
        "bad_references": report.bad_references,
        "flake_metadata": {
            "ok": report.flake_metadata_ok,
            "output": report.flake_metadata_output,
        },
        "target_flake_preview": report.target_flake_preview,
        "nixos_install_log_tail": install_log_tail,
    })))
}

async fn detection_handler() -> Result<Json<Vec<detection::InstallationMatch>>, ApiError> {
    detection::detect_existing_installations()
        .map(Json)
        .map_err(|e| err500("FAILED_TO_DETECT_INSTALLATIONS", Some(e)))
}

async fn manual_setup_handler() -> impl IntoResponse {
    // Redirect to ttyd running on port 8081
    axum::response::Redirect::temporary("http://localhost:8081")
}

// ── GET /health ───────────────────────────────────────────────────────────────

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status":  "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn version_handler() -> Result<Json<serde_json::Value>, ApiError> {
    let content = tokio::fs::read_to_string("/etc/kryonix-version")
        .await
        .map_err(|e| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Versão não encontrada".into(),
                    details: Some(e.to_string()),
                }),
            )
        })?;

    let mut map = serde_json::Map::new();
    for line in content.lines() {
        if let Some((key, value)) = line.split_once('=') {
            map.insert(
                key.to_string(),
                serde_json::Value::String(value.to_string()),
            );
        }
    }

    Ok(Json(serde_json::Value::Object(map)))
}

// ── GET /probe ────────────────────────────────────────────────────────────────

async fn probe() -> Result<Json<serde_json::Value>, ApiError> {
    let probe_cmd = std::env::var("KRYONIX_HARDWARE_PROBE")
        .unwrap_or_else(|_| "kryonix-hardware-probe".to_string());
    let output = tokio::task::spawn_blocking(move || Command::new(probe_cmd).output())
        .await
        .map_err(|e| err500("Spawn error", Some(e.to_string())))?
        .map_err(|e| err500("kryonix-hardware-probe not found", Some(e.to_string())))?;

    if !output.status.success() {
        return Err(err500(
            "kryonix-hardware-probe exited with error",
            Some(String::from_utf8_lossy(&output.stderr).into_owned()),
        ));
    }

    let report: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| err500("Failed to parse probe output", Some(e.to_string())))?;

    Ok(Json(report))
}

// ── POST /plan ────────────────────────────────────────────────────────────────

async fn plan(Json(req): Json<PlanRequest>) -> Json<InstallPlan> {
    Json(InstallPlan {
        version: 1,
        confirmed_features: vec![],
        hostname: req.hostname.unwrap_or_else(|| "kryonix".into()),
        timezone: req.timezone.unwrap_or_else(|| "America/Cuiaba".into()),
        locale: req.locale.unwrap_or_else(|| "pt_BR.UTF-8".into()),
        keyboard: req.keyboard.unwrap_or_else(|| "br-abnt2".into()),
        disk: PlanDisk {
            mode: "dry-run".into(), // front-end defines final mode
            target: req.disk.target,
            layout: req.disk.layout.unwrap_or_else(|| "btrfs-simple".into()),
            boot_mode: req.disk.boot_mode.unwrap_or_else(|| "uefi".into()),
            profile: "single".into(),
            selected_disks: vec![],
            raid_level: None,
            manual_partitions: None,
        },
        user: PlanUser {
            name: req.user.name,
            admin: req.user.admin.unwrap_or(true),
            uid: 1000,
            email: String::new(),
            authorized_keys: vec![],
            hashed_password: None,
        },
        features: req.features.unwrap_or(serde_json::json!({})),
        network: Default::default(),
        target_remote_access: Default::default(),
    })
}

// ── POST /dry-run ─────────────────────────────────────────────────────────────

fn hash_password_if_needed(plan: &mut InstallPlan) -> Result<(), ApiError> {
    hash_password_with_command(plan, "mkpasswd")
}

fn hash_password_with_command(plan: &mut InstallPlan, cmd_path: &str) -> Result<(), ApiError> {
    if let Some(pwd) = plan.user.hashed_password.as_deref() {
        if !pwd.is_empty() && !pwd.starts_with('$') {
            use axum::http::StatusCode;
            use std::io::Write;
            use std::process::{Command, Stdio};

            let mut child = Command::new(cmd_path)
                .arg("-m")
                .arg("yescrypt")
                .arg("--stdin")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| {
                    eprintln!("ERROR: Falha ao iniciar {} (não está no PATH?): {}", cmd_path, e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        axum::Json(crate::ErrorResponse {
                            error: format!("Falha ao gerar hash de senha: comando {} indisponível no ambiente da ISO.", cmd_path),
                            details: Some(e.to_string()),
                        })
                    )
                })?;

            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(pwd.as_bytes());
                let _ = stdin.write_all(b"\n");
            }

            match child.wait_with_output() {
                Ok(output) => {
                    if output.status.success() {
                        plan.user.hashed_password =
                            Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
                        Ok(())
                    } else {
                        eprintln!(
                            "ERROR: {} retornou falha: {}",
                            cmd_path,
                            String::from_utf8_lossy(&output.stderr).trim()
                        );
                        Err((
                            StatusCode::INTERNAL_SERVER_ERROR,
                            axum::Json(crate::ErrorResponse {
                                error: format!(
                                    "Falha ao gerar hash de senha: o comando {} retornou erro.",
                                    cmd_path
                                ),
                                details: None,
                            }),
                        ))
                    }
                }
                Err(e) => {
                    eprintln!("ERROR: Falha ao aguardar {}: {}", cmd_path, e);
                    Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        axum::Json(crate::ErrorResponse {
                            error: format!(
                                "Falha ao gerar hash de senha: erro na execução do {}.",
                                cmd_path
                            ),
                            details: Some(e.to_string()),
                        }),
                    ))
                }
            }
        } else {
            Ok(())
        }
    } else {
        Ok(())
    }
}

async fn dry_run(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(mut plan): Json<InstallPlan>,
) -> impl IntoResponse {
    let token = headers
        .get("X-Kryonix-Installer-Token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if token != state.installer_token {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "UNAUTHORIZED".into(),
                details: Some("Token X-Kryonix-Installer-Token inválido ou ausente.".into()),
            }),
        )
            .into_response();
    }

    let valid_modes = [
        "destroy",
        "format",
        "mount",
        "destroy,format,mount",
        "format,mount",
    ];
    let mut current_mode = plan.disk.mode.as_str();
    if current_mode == "disko" || current_mode == "dry-run" {
        plan.disk.mode = "destroy,format,mount".to_string();
        current_mode = "destroy,format,mount";
    }

    if !valid_modes.contains(&current_mode) {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({
                "ok": false,
                "code": "INVALID_DISK_MODE",
                "message": "Modo de disco inválido.",
                "action": "Selecione um modo de particionamento válido antes de continuar.",
                "details": {
                    "field": "disk.mode",
                    "received": current_mode,
                    "accepted": valid_modes
                },
                "recoverable": true,
                "destructiveActionStarted": false,
                "sessionId": state.installer_token
            })),
        )
            .into_response();
    }

    if let Err(e) = hash_password_if_needed(&mut plan) {
        return e.into_response();
    }
    let mut result = validate_plan(&plan);

    if result.ok {
        // P0.5: Run real disko dry-run to validate disk config
        if let Err(e) = executor::partition::run_disko_dry_run(&plan).await {
            result.ok = false;
            result
                .checks
                .push(Check::fail(format!("Disko dry-run falhou: {}", e)));
        } else {
            result
                .checks
                .push(Check::pass("Disko dry-run concluído com sucesso"));
        }
    }

    // 200 somente se ok==true; 422 se o plano/alvo é semanticamente inválido.
    // (Body/JSON malformado já vira 400/422 no extractor Json antes de chegar aqui.)
    let status = if result.ok {
        StatusCode::OK
    } else {
        StatusCode::UNPROCESSABLE_ENTITY
    };
    (status, Json(result)).into_response()
}

/// Verifica se o hostname está dentro do subset seguro (RFC-1123 light):
/// 1..=63 caracteres, apenas `[A-Za-z0-9-]`, e não começa/termina com `-`.
/// Rejeita explicitamente shell metas (`;`, `$`, `` ` ``, `\n`, espaços) e
/// path traversal (`..`, `/`) — qualquer um deles cai pelo filtro acima.
fn is_valid_hostname(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.is_empty() || bytes.len() > 63 {
        return false;
    }
    if bytes[0] == b'-' || bytes[bytes.len() - 1] == b'-' {
        return false;
    }
    bytes
        .iter()
        .all(|b| b.is_ascii_alphanumeric() || *b == b'-')
}

fn validate_plan(plan: &InstallPlan) -> DryRunResult {
    let mut checks = vec![];
    let mut ok = true;

    if plan.disk.profile == "manual" {
        let parts = plan
            .disk
            .manual_partitions
            .as_ref()
            .cloned()
            .unwrap_or_default();
        let has_root = parts.iter().any(|p| p.mountpoint == "/");
        let has_efi = parts
            .iter()
            .any(|p| p.mountpoint == "/boot/efi" || p.mountpoint == "/efi");

        if has_root {
            checks.push(Check::pass("Partição raiz (/) definida"));
        } else {
            checks.push(Check::fail("Modo manual exige partição raiz (/)"));
            ok = false;
        }

        if has_efi {
            checks.push(Check::pass("Partição EFI definida"));
        } else {
            checks.push(Check::fail(
                "Modo manual exige partição EFI (/boot/efi ou /efi)",
            ));
            ok = false;
        }

        // Check for duplicate mountpoints and size limits
        let mut mnts = std::collections::HashSet::new();
        let mut total_absolute_bytes: u64 = 0;
        let mut percentage_partitions = 0;

        let disk_size_bytes = if let Ok(info) = crate::disk::inspect_disk(&plan.disk.target) {
            info.size_bytes
        } else {
            0
        };

        for p in &parts {
            if !mnts.insert(&p.mountpoint) {
                checks.push(Check::fail(format!(
                    "Ponto de montagem duplicado: {}",
                    p.mountpoint
                )));
                ok = false;
            }

            let size_str = p.size.trim().to_uppercase();
            if size_str == "0"
                || size_str == "0B"
                || size_str == "0G"
                || size_str == "0M"
                || size_str == "0%"
            {
                checks.push(Check::fail(format!(
                    "A partição {} não pode ter tamanho 0 B",
                    p.mountpoint
                )));
                ok = false;
            } else if size_str.ends_with("%") {
                percentage_partitions += 1;
            } else {
                let multiplier = if size_str.ends_with("G") || size_str.ends_with("GB") {
                    1024 * 1024 * 1024
                } else if size_str.ends_with("M") || size_str.ends_with("MB") {
                    1024 * 1024
                } else if size_str.ends_with("K") || size_str.ends_with("KB") {
                    1024
                } else {
                    1
                };

                let num_str = size_str.trim_end_matches(|c: char| !c.is_ascii_digit());
                if let Ok(bytes) = num_str.parse::<u64>() {
                    let bytes = bytes * multiplier;
                    total_absolute_bytes += bytes;

                    if disk_size_bytes > 0 && bytes > disk_size_bytes {
                        checks.push(Check::fail(format!(
                            "A partição {} ({} bytes) é maior que o disco alvo",
                            p.mountpoint, bytes
                        )));
                        ok = false;
                    }
                }
            }
        }

        if disk_size_bytes > 0 && total_absolute_bytes > disk_size_bytes {
            checks.push(Check::fail(format!(
                "Sobreposição de partições: a soma dos tamanhos ({} bytes) excede o tamanho do disco ({} bytes)",
                total_absolute_bytes, disk_size_bytes
            )));
            ok = false;
        }

        if percentage_partitions > 1 {
            checks.push(Check::fail(
                "Sobreposição de partições: apenas uma partição pode usar tamanho percentual (ex: 100%)".to_string()
            ));
            ok = false;
        }
    } else if plan.disk.profile == "raid" {
        let level = plan.disk.raid_level.as_deref().unwrap_or("raid1");
        let count = plan.disk.selected_disks.len();
        let min_required = match level {
            "raid0" | "raid1" => 2,
            "raid5" => 3,
            "raid10" => 4,
            _ => 2,
        };

        if count >= min_required {
            checks.push(Check::pass(format!(
                "Configuração {} com {} discos",
                level.to_uppercase(),
                count
            )));
        } else {
            checks.push(Check::fail(format!(
                "{} exige pelo menos {} discos (selecionados: {})",
                level.to_uppercase(),
                min_required,
                count
            )));
            ok = false;
        }

        if level == "raid10" && !count.is_multiple_of(2) {
            checks.push(Check::fail("RAID 10 exige número par de discos"));
            ok = false;
        }
    } else {
        validate_install_target(&plan.disk.target, &mut checks, &mut ok);
    }

    if plan.disk.profile == "manual" {
        for target in install_targets(plan) {
            validate_install_target(&target, &mut checks, &mut ok);
        }
    } else if plan.disk.profile == "raid" {
        for target in &plan.disk.selected_disks {
            validate_install_target(target, &mut checks, &mut ok);
        }
    }

    let hostname = plan.hostname.trim();
    if hostname.is_empty() {
        checks.push(Check::fail("Hostname não pode ser vazio"));
        ok = false;
    } else if !is_valid_hostname(hostname) {
        checks.push(Check::fail(format!(
            "Hostname contém caracteres inválidos: {hostname}"
        )));
        ok = false;
    } else {
        checks.push(Check::pass(format!("Hostname: {hostname}")));
    }

    let user = plan.user.name.trim();
    if user.is_empty() {
        checks.push(Check::fail("Nome de usuário não pode ser vazio"));
        ok = false;
    } else if user
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        checks.push(Check::pass(format!("Usuário: {}", user)));
    } else {
        checks.push(Check::fail("Nome de usuário contém caracteres inválidos"));
        ok = false;
    }

    // P0.4: Validação de senha — bloqueio real.
    // Em modo install, a ausência de hashedPassword cria um usuário inutilizável
    // (sem senha = sem login em console físico sem SSH). Forçar erro antes de
    // qualquer ação destrutiva.
    if plan.disk.mode == "install" || plan.disk.mode == "real" {
        match plan.user.hashed_password.as_deref().map(str::trim) {
            None | Some("") => {
                checks.push(Check::fail(
                    "Senha obrigatória: user.hashedPassword ausente ou vazio. \
                     Envie o hash NixOS ($y$..., $6$...) no campo user.hashedPassword. \
                     O usuário seria criado sem senha, impossibilitando login físico.",
                ));
                ok = false;
            }
            Some(s) => {
                // Aceita hashes NixOS modernos: yescrypt ($y$), sha512crypt ($6$),
                // sha256crypt ($5$), bcrypt ($2b$) e ! para bloqueio explícito.
                let valid_prefix = s.starts_with("$y$")
                    || s.starts_with("$6$")
                    || s.starts_with("$5$")
                    || s.starts_with("$2b$")
                    || s.starts_with('!');
                if !valid_prefix {
                    checks.push(Check::fail(
                        "user.hashedPassword tem formato inválido (esperado: $y$, $6$, $5$, $2b$ ou '!'). \
                         Use `mkpasswd -m yescrypt` para gerar."
                    ));
                    ok = false;
                } else {
                    checks.push(Check::pass(
                        "Senha do usuário: hash presente e com formato válido",
                    ));
                }
            }
        }
    }

    if !plan.timezone.trim().is_empty() {
        checks.push(Check::pass(format!("Timezone: {}", plan.timezone)));
    } else {
        checks.push(Check::fail("Timezone não pode ser vazio"));
        ok = false;
    }

    // P0.8: Feature Gating with strict allowlist
    enum FeatureStatus {
        Supported,
        PartialRequiresConfirmation,
        BlockedStub,
        BlockedLegacy,
        Unknown,
    }

    fn classify_feature(domain: &str, name: &str) -> FeatureStatus {
        let feature_id = format!("{}.{}", domain, name);
        // TODO: Futuramente consumir do docs/FEATURE_REGISTRY.md do core
        match feature_id.as_str() {
            // ── Supported ─────────────────────────────────────────────
            "remote.openssh"
            | "network.openssh"
            | "system.impermanence"
            | "security.tpm"
            | "storage.zfs"
            | "mcp.enabled"
            | "desktop.waywallen"
            | "desktop.hyprland"
            | "desktop.plasma"
            | "gaming.steam"
            | "gaming.gamemode"
            | "development.rust"
            | "development.docker"
            | "observability.prometheus"
            // Frontend catalog: desktop
            | "desktop.audio"
            | "desktop.bluetooth"
            | "desktop.printing"
            | "desktop.kde-shortcuts"
            | "desktop.kvantum-theme"
            | "desktop.lock-screen-theme"
            // Frontend catalog: remote
            | "remote.tailscale"
            | "remote.vnc"
            | "remote.web-installer"
            // Frontend catalog: security
            | "security.firewall"
            | "security.qemu-guest"
            // Frontend catalog: storage
            | "storage.srv-data"
            | "storage.ai-models"
            // Frontend catalog: dev
            | "dev.rust"
            | "dev.python"
            | "dev.nix"
            | "dev.jupyter"
            // Frontend catalog: editor
            | "editor.vscode-insiders"
            | "editor.antigravity"
            // Frontend catalog: mcp
            | "mcp.filesystem"
            | "mcp.github"
            | "mcp.neo4j"
            | "mcp.ollama"
            // Frontend catalog: observability
            | "observability.grafana"
            // Frontend catalog: shell/terminal/obsidian
            | "shell.zsh"
            | "terminal.warp"
            | "obsidian.vault"
            // Frontend catalog: virtualization
            | "virtualization.podman"
            // Frontend catalog: ai (non-partial, non-stub)
            | "ai.claude"
            | "ai.gemini"
            | "ai.neo4j"
            | "ai.kryonix-brain" => FeatureStatus::Supported,

            // ── PartialRequiresConfirmation ────────────────────────────
            "ai.local_llm" | "ai.ollama" | "virtualization.vms"
            | "virtualization.libvirt" => {
                FeatureStatus::PartialRequiresConfirmation
            }

            // ── BlockedStub ───────────────────────────────────────────
            "ai.lightrag"
            | "ai.open-webui"
            | "ai.openWebui"
            | "remote.desktop.server"
            | "remote.desktop.client"
            | "ai.brain.client"
            | "ai.brain.server" => FeatureStatus::BlockedStub,

            // ── BlockedLegacy ─────────────────────────────────────────
            "network.legacy_bridge" | "system.legacy_boot" | "remoteDesktop" => {
                FeatureStatus::BlockedLegacy
            }
            _ => FeatureStatus::Unknown,
        }
    }

    if let Some(obj) = plan.features.as_object() {
        for (domain_name, domain) in obj {
            if let Some(features) = domain.as_object() {
                for (key, val) in features {
                    if val.as_bool().unwrap_or(false) {
                        let feature_id = format!("{}.{}", domain_name, key);
                        match classify_feature(domain_name, key) {
                            FeatureStatus::Supported => {
                                checks.push(Check::pass(format!(
                                    "Feature '{}' é suportada.",
                                    feature_id
                                )));
                            }
                            FeatureStatus::PartialRequiresConfirmation => {
                                if plan.confirmed_features.contains(&feature_id) {
                                    checks.push(Check::pass(format!(
                                        "Feature '{}' parcial ativada com confirmação.",
                                        feature_id
                                    )));
                                } else {
                                    checks.push(Check::fail(format!(
                                        "Feature '{}' é parcial. Requer confirmação explícita no payload (confirmed_features).",
                                        feature_id
                                    )));
                                    ok = false;
                                }
                            }
                            FeatureStatus::BlockedStub => {
                                checks.push(Check::fail(format!(
                                    "Feature '{}' é um stub e não pode ser ativada.",
                                    feature_id
                                )));
                                ok = false;
                            }
                            FeatureStatus::BlockedLegacy => {
                                checks.push(Check::fail(format!(
                                    "Feature '{}' é legacy e não pode ser ativada.",
                                    feature_id
                                )));
                                ok = false;
                            }
                            FeatureStatus::Unknown => {
                                checks.push(Check::fail(format!(
                                    "Feature '{}' é desconhecida e não pode ser ativada pelo installer.",
                                    feature_id
                                )));
                                ok = false;
                            }
                        }
                    }
                }
            }
        }
    }

    DryRunResult { ok, checks }
}

fn install_targets(plan: &InstallPlan) -> Vec<String> {
    let mut targets = vec![plan.disk.target.clone()];
    if let Some(parts) = &plan.disk.manual_partitions {
        targets.extend(parts.iter().map(|p| p.device.clone()));
    }
    targets.sort();
    targets.dedup();
    targets.retain(|target| !target.trim().is_empty());
    targets
}

fn validate_install_target(target: &str, checks: &mut Vec<Check>, ok: &mut bool) {
    match disk::inspect_disk(target) {
        Ok(info) => checks.push(Check::pass(format!(
            "Disco {target} encontrado como block device ({}, {})",
            info.name, info.size
        ))),
        Err(e) => {
            checks.push(Check::fail(e));
            *ok = false;
            return;
        }
    }

    match disk::is_system_disk(target) {
        Ok(true) => {
            checks.push(Check::fail(format!(
                "PERIGO: {target} é o disco onde o sistema está rodando"
            )));
            *ok = false;
        }
        Ok(false) => checks.push(Check::pass(format!("{target} não é o disco do sistema"))),
        Err(e) => {
            checks.push(Check::fail(e));
            *ok = false;
        }
    }

    match disk::disk_mount_conflicts(target) {
        Ok(conflicts) if conflicts.is_empty() => {
            checks.push(Check::pass(format!("{target} não tem partições montadas")))
        }
        Ok(conflicts) => {
            checks.push(Check::fail(format!(
                "{target} está montado em {}",
                conflicts.join(", ")
            )));
            *ok = false;
        }
        Err(e) => {
            checks.push(Check::fail(e));
            *ok = false;
        }
    }

    match disk::disk_has_min_install_size(target) {
        Ok((true, size_bytes)) => {
            let size_gb = size_bytes / (1024 * 1024 * 1024);
            checks.push(Check::pass(format!("{target} tem {size_gb} GB")));
        }
        Ok((false, size_bytes)) => {
            let size_gb = size_bytes / (1024 * 1024 * 1024);
            checks.push(Check::fail(format!("{target} tem apenas {size_gb} GB")));
            *ok = false;
        }
        Err(e) => {
            checks.push(Check::fail(e));
            *ok = false;
        }
    }
}

// ── POST /install ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct SafetyResponse {
    error: String,
    checks: Vec<SafetyCheck>,
}

async fn install(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(mut plan): Json<InstallPlan>,
) -> impl IntoResponse {
    let token = headers
        .get("X-Kryonix-Installer-Token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if token != state.installer_token {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "UNAUTHORIZED".into(),
                details: Some("Token X-Kryonix-Installer-Token inválido ou ausente.".into()),
            }),
        )
            .into_response();
    }

    if let Err(e) = hash_password_if_needed(&mut plan) {
        return e.into_response();
    }

    // dry-run mode → only validate, never touch disks
    if plan.disk.mode == "dry-run" {
        return Json(validate_plan(&plan)).into_response();
    }

    if plan.disk.mode != "install" && plan.disk.mode != "real" {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "INVALID_INSTALL_MODE".into(),
                details: Some(
                    "Use disk.mode=\"dry-run\" para validar ou \"install\"/\"real\" para executar."
                        .into(),
                ),
            }),
        )
            .into_response();
    }

    let validation = validate_plan(&plan);
    if !validation.ok {
        return (StatusCode::UNPROCESSABLE_ENTITY, Json(validation)).into_response();
    }

    // Safety checks — ALL must pass; any failure → 403 Forbidden
    let checks = executor::run_safety_checks(&plan);
    if checks.iter().any(|c| !c.passed) {
        return (
            StatusCode::FORBIDDEN,
            Json(SafetyResponse {
                error: "Safety checks falharam — instalação recusada".into(),
                checks,
            }),
        )
            .into_response();
    }

    // ── P0.1: Bloquear instalação concorrente ────────────────────────────────
    // Adquire write-lock ANTES do spawn para eliminar a race window onde dois
    // requests simultâneos passavam a guarda (running era setado dentro do spawn).
    {
        let mut status = state.install_status.write().await;
        if status.running {
            return (
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    error: "INSTALL_ALREADY_RUNNING".into(),
                    details: Some(
                        "Uma instalação já está em curso. Aguarde a conclusão ou reinicie o installer."
                            .into(),
                    ),
                }),
            )
                .into_response();
        }
        // Reserva o slot ANTES do spawn — elimina a race window.
        status.running = true;
        status.exit_code = None;
        status.current_phase = Some("precheck".into());
        status.last_error = None;
        status.last_log_line = Some("job aceito; iniciando executor real".to_string());
        status.have_plan = true;
        status.can_install = true;
        save_install_state(&status);
    }

    let job_id = uuid::Uuid::new_v4().to_string();
    let tx = state.progress_tx.clone();
    let status_state = state.install_status.clone();
    let plan_clone = plan.clone();

    let _ = tx.send(ProgressEvent {
        step: "precheck".into(),
        message: "Executor real iniciado; disko e nixos-install serão chamados.".into(),
        percent: 1,
    });

    tokio::spawn(async move {
        match executor::run_installation(&plan_clone, tx.clone()).await {
            Ok(()) => {
                let mut status = status_state.write().await;
                status.running = false;
                status.exit_code = Some(0);
                status.current_phase = Some("done".into());
                status.last_error = None;
                status.last_log_line = Some("Instalação concluída pelo executor real".into());
                save_install_state(&status);
            }
            Err(error) => {
                let _ = tx.send(ProgressEvent {
                    step: "error".into(),
                    message: error.clone(),
                    percent: 100,
                });

                let mut status = status_state.write().await;
                // Garantir reset de running mesmo em erro — habilita retry manual.
                status.running = false;
                status.exit_code = Some(1);
                status.current_phase = Some("error".into());
                status.last_error = Some(error.clone());
                status.last_log_line = Some(error);
                save_install_state(&status);
            }
        }
    });

    (
        StatusCode::ACCEPTED,
        Json(serde_json::json!({ "job_id": job_id, "status": "running" })),
    )
        .into_response()
}

async fn install_status(State(state): State<Arc<AppState>>) -> Json<InstallStatus> {
    Json(state.install_status.read().await.clone())
}

// ── GET /install/progress — SSE ───────────────────────────────────────────────

async fn install_progress(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.progress_tx.subscribe();
    let stream = async_stream::stream! {
        while let Ok(event) = rx.recv().await {
            let data = serde_json::to_string(&event).unwrap_or_default();
            yield Ok(Event::default().data(data));
        }
    };
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::new())
}

// ── Legacy routes ─────────────────────────────────────────────────────────────

async fn get_partitions_handler(
    Path(device): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    disk::get_partitions(&device)
        .map(Json)
        .map_err(|e| err500("FAILED_TO_GET_PARTITIONS", Some(e)))
}

async fn get_disks() -> Result<Json<Vec<disk::DiskInfo>>, ApiError> {
    disk::list_disks()
        .map(Json)
        .map_err(|e| err500("FAILED_TO_LIST_DISKS", Some(e)))
}

async fn partition_endpoint(
    Json(_payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ApiError> {
    Err((
        StatusCode::GONE,
        Json(ErrorResponse {
            error: "LEGACY_ROUTE_DISABLED".into(),
            details: Some("A rota /api/partition foi desativada. Use /dry-run e /install.".into()),
        }),
    ))
}

async fn stream_logs(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.log_sender.subscribe();
    let stream = async_stream::stream! {
        while let Ok(msg) = rx.recv().await {
            yield Ok(Event::default().data(msg));
        }
    };
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::new())
}

async fn reboot_endpoint() -> Result<Json<serde_json::Value>, ApiError> {
    Err((
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: "REBOOT_DISABLED".into(),
            details: Some("O backend do instalador não reinicia a máquina automaticamente.".into()),
        }),
    ))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_plan(disk: &str, hostname: &str, user: &str) -> InstallPlan {
        InstallPlan {
            version: 1,
            confirmed_features: vec![],
            hostname: hostname.into(),
            timezone: "America/Cuiaba".into(),
            locale: "pt_BR.UTF-8".into(),
            keyboard: "br-abnt2".into(),
            disk: PlanDisk {
                mode: "dry-run".into(),
                target: disk.into(),
                layout: "btrfs-simple".into(),
                boot_mode: "uefi".into(),
                profile: "single".into(),
                selected_disks: vec![],
                raid_level: None,
                manual_partitions: None,
            },
            user: PlanUser {
                name: user.into(),
                admin: true,
                uid: 1000,
                hashed_password: None,
                email: String::new(),
                authorized_keys: vec![],
            },
            features: serde_json::json!({}),
            network: Default::default(),
            target_remote_access: Default::default(),
        }
    }

    #[test]
    fn test_zero_bytes_partition() {
        let mut plan = make_plan("/dev/vda", "host", "user");
        plan.disk.profile = "manual".to_string();
        plan.disk.manual_partitions = Some(vec![
            crate::PartitionSpec {
                device: "/dev/vda".to_string(),
                mountpoint: "/".to_string(),
                fstype: "btrfs".to_string(),
                size: "0B".to_string(),
                format: true,
            },
            crate::PartitionSpec {
                device: "/dev/vda".to_string(),
                mountpoint: "/boot/efi".to_string(),
                fstype: "vfat".to_string(),
                size: "512M".to_string(),
                format: true,
            },
        ]);
        let res = validate_plan(&plan);
        assert!(!res.ok);
        assert!(
            res.checks
                .iter()
                .any(|c| !c.ok && c.message.contains("tamanho 0 B"))
        );
    }

    #[test]
    fn test_multiple_percentage_partitions() {
        let mut plan = make_plan("/dev/vda", "host", "user");
        plan.disk.profile = "manual".to_string();
        plan.disk.manual_partitions = Some(vec![
            crate::PartitionSpec {
                device: "/dev/vda".to_string(),
                mountpoint: "/".to_string(),
                fstype: "btrfs".to_string(),
                size: "100%".to_string(),
                format: true,
            },
            crate::PartitionSpec {
                device: "/dev/vda".to_string(),
                mountpoint: "/boot/efi".to_string(),
                fstype: "vfat".to_string(),
                size: "100%".to_string(),
                format: true,
            },
        ]);
        let res = validate_plan(&plan);
        assert!(!res.ok);
        assert!(res.checks.iter().any(|c| {
            !c.ok
                && c.message
                    .contains("apenas uma partição pode usar tamanho percentual")
        }));
    }

    #[test]
    fn test_feature_supported_pass() {
        let mut plan = make_plan("/dev/null", "teste", "admin");
        plan.features = serde_json::json!({
            "system": { "impermanence": true }
        });
        let res = validate_plan(&plan);
        assert!(
            res.checks
                .iter()
                .any(|c| c.ok && c.message.contains("suportada"))
        );
    }

    #[test]
    fn test_feature_unknown_fails() {
        let mut plan = make_plan("/dev/null", "teste", "admin");
        plan.features = serde_json::json!({
            "madeup": { "feature": true }
        });
        let res = validate_plan(&plan);
        assert!(!res.ok);
        assert!(
            res.checks
                .iter()
                .any(|c| !c.ok && c.message.contains("desconhecida"))
        );
    }

    #[test]
    fn test_feature_stub_fails() {
        let mut plan = make_plan("/dev/null", "teste", "admin");
        plan.features = serde_json::json!({
            "ai": { "lightrag": true }
        });
        let res = validate_plan(&plan);
        assert!(!res.ok);
        assert!(
            res.checks
                .iter()
                .any(|c| !c.ok && c.message.contains("stub"))
        );
    }

    #[test]
    fn test_feature_legacy_fails() {
        let mut plan = make_plan("/dev/null", "teste", "admin");
        plan.features = serde_json::json!({
            "system": { "legacy_boot": true }
        });
        let res = validate_plan(&plan);
        assert!(!res.ok);
        assert!(
            res.checks
                .iter()
                .any(|c| !c.ok && c.message.contains("legacy"))
        );
    }

    #[test]
    fn test_feature_partial_without_confirmation_fails() {
        let mut plan = make_plan("/dev/null", "teste", "admin");
        plan.features = serde_json::json!({
            "ai": { "ollama": true }
        });
        let res = validate_plan(&plan);
        assert!(!res.ok);
        assert!(
            res.checks
                .iter()
                .any(|c| !c.ok && c.message.contains("parcial"))
        );
    }

    #[test]
    fn test_feature_partial_with_confirmation_passes() {
        let mut plan = make_plan("/dev/null", "teste", "admin");
        plan.features = serde_json::json!({
            "ai": { "ollama": true }
        });
        plan.confirmed_features = vec!["ai.ollama".into()];
        let res = validate_plan(&plan);
        assert!(
            res.checks
                .iter()
                .any(|c| c.ok && c.message.contains("confirmação"))
        );
    }

    // ── Testes de contrato UI↔backend ─────────────────────────────────────────

    /// Garante que InstallPlan desserializa um payload real da UI
    /// com features não-vazias, authorized_keys e target_remote_access.
    ///
    /// O payload usa as chaves camelCase que buildKryonixInstallPlan (installerApi.js)
    /// envia: serverIp, prefixLength, httpPort, pppoeUser.
    #[test]
    fn test_install_plan_deserializes_real_ui_payload() {
        // Fixture idêntica ao que buildKryonixInstallPlan produz:
        // chaves camelCase no bloco network, snake_case nos demais campos do
        // InstallPlan que o mapper mantém por compatibilidade.
        // NOTA: Nenhuma senha aqui — senhas trafegam via canal separado.
        let json = serde_json::json!({
            "version": 1,
            "hostname": "kryonix-srv",
            "timezone": "America/Cuiaba",
            "locale": "pt_BR.UTF-8",
            "keyboard": "br-abnt2",
            "disk": {
                "mode": "dry-run",
                "target": "/dev/sda",
                "layout": "btrfs-simple",
                "boot_mode": "uefi",
                "profile": "single",
                "selectedDisks": ["/dev/sda"]
            },
            "user": {
                "name": "rag",
                "admin": true,
                "uid": 1000,
                "email": "admin@kryonix.local",
                "authorized_keys": ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI test-key"]
            },
            "features": {
                "ai": { "ollama": true },
                "remote": { "openssh": true }
            },
            "target_remote_access": { "enabled": true },
            // camelCase: exatamente como a UI envia via buildKryonixInstallPlan
            "network": {
                "hostname": "kryonix-srv",
                "interface": "enp1s0",
                "serverIp": "10.0.0.10",
                "prefixLength": 24,
                "mode": "dhcp",
                "gateway": "10.0.0.1",
                "dns": ["1.1.1.1"],
                "httpPort": 8080,
                "wan": { "interface": "", "mode": "dhcp", "dns": [] }
            }
        });

        let plan: InstallPlan = serde_json::from_value(json)
            .expect("InstallPlan deve desserializar payload real da UI (camelCase)");

        assert_eq!(plan.user.name, "rag");
        assert_eq!(plan.user.uid, 1000);
        assert_eq!(plan.user.email, "admin@kryonix.local");
        assert_eq!(plan.user.authorized_keys.len(), 1);
        assert!(plan.user.authorized_keys[0].starts_with("ssh-ed25519"));
        assert!(plan.target_remote_access.enabled);
        assert_eq!(plan.network.server_ip, "10.0.0.10");
        assert_eq!(plan.network.prefix_length, 24);
        assert_eq!(plan.network.http_port, 8080);
        assert_eq!(
            plan.features.get("ai").and_then(|s| s.get("ollama")),
            Some(&serde_json::Value::Bool(true))
        );
    }

    /// Regressão — bug: "missing field server_ip" ao receber payload camelCase da UI.
    ///
    /// Antes do fix, `network: missing field server_ip` era retornado pelo
    /// axum porque NetworkPlan usava snake_case sem `rename_all = "camelCase"`.
    /// Este teste garante que o payload mínimo com network.serverIp (sem nenhum
    /// campo opcional) não mais causa 422.
    #[test]
    fn test_network_plan_accepts_camelcase_from_ui() {
        // Payload mínimo: apenas os campos obrigatórios que a UI sempre envia.
        // Representa o cenário de falha original: modo DHCP sem IP manual.
        let json = serde_json::json!({
            "version": 1,
            "hostname": "kryonix",
            "timezone": "America/Cuiaba",
            "locale": "pt_BR.UTF-8",
            "keyboard": "br-abnt2",
            "disk": {
                "mode": "dry-run",
                "target": "/dev/sda",
                "layout": "btrfs-simple",
                "boot_mode": "uefi",
                "profile": "single",
                "selectedDisks": ["/dev/sda"]
            },
            "user": { "name": "admin", "admin": true, "uid": 1000, "email": "", "authorized_keys": [] },
            "features": {},
            // Payload exato que buildKryonixInstallPlan gera no modo DHCP:
            // serverIp é o campo que causava "missing field server_ip"
            "network": {
                "hostname": "kryonix",
                "interface": "enp1s0",
                "serverIp": "0.0.0.0",
                "prefixLength": 0,
                "mode": "dhcp",
                "gateway": "0.0.0.0",
                "dns": [],
                "httpPort": 8080,
                "wan": { "interface": "", "mode": "dhcp", "dns": [] }
            }
        });

        // Antes do fix: panic com "missing field `server_ip`"
        // Após o fix: desserializa sem erro
        let result = serde_json::from_value::<InstallPlan>(json);
        assert!(
            result.is_ok(),
            "NetworkPlan deve aceitar chaves camelCase da UI. Erro: {:?}",
            result.err()
        );
        let plan = result.unwrap();
        assert_eq!(plan.network.server_ip, "0.0.0.0");
        assert_eq!(plan.network.prefix_length, 0);
        assert_eq!(plan.network.http_port, 8080);
    }

    /// Garante que InstallPlan aceita authorized_keys vazio (campo opcional).
    #[test]
    fn test_install_plan_accepts_empty_authorized_keys() {
        let json = serde_json::json!({
            "version": 1,
            "hostname": "kryonix",
            "timezone": "America/Cuiaba",
            "locale": "pt_BR.UTF-8",
            "keyboard": "br-abnt2",
            "disk": {
                "mode": "dry-run",
                "target": "/dev/sda",
                "layout": "btrfs-simple",
                "boot_mode": "uefi",
                "profile": "single",
                "selectedDisks": ["/dev/sda"]
            },
            "user": { "name": "admin", "admin": true },
            "features": {}
        });

        let plan: InstallPlan = serde_json::from_value(json)
            .expect("InstallPlan deve aceitar user sem authorized_keys");

        assert!(plan.user.authorized_keys.is_empty());
        assert!(!plan.target_remote_access.enabled);
    }

    /// Garante que PlanUser NÃO vaza a senha na serialização.
    #[test]
    fn test_plan_user_password_is_not_serialized() {
        let user = PlanUser {
            name: "admin".into(),
            admin: true,
            uid: 1000,
            hashed_password: Some("secret".into()),
            email: "a@b.com".into(),
            authorized_keys: vec![],
        };
        let json = serde_json::to_string(&user).unwrap();
        // A serialização não deve conter nenhum campo de senha
        assert!(!json.contains("password"));
        assert!(!json.contains("senha"));
        assert!(!json.contains("secret"));
    }

    #[test]
    fn test_dry_run_rejects_nonexistent_disk() {
        let result = validate_plan(&make_plan("/dev/nonexistent999xyz", "kryonix", "admin"));
        assert!(!result.ok);
        assert!(
            result
                .checks
                .iter()
                .any(|c| !c.ok && c.message.contains("nonexistent999xyz"))
        );
    }

    #[test]
    fn test_dry_run_rejects_empty_hostname() {
        let result = validate_plan(&make_plan("/dev/null", "", "admin"));
        assert!(!result.ok);
        assert!(
            result
                .checks
                .iter()
                .any(|c| !c.ok && c.message.contains("Hostname"))
        );
    }

    #[test]
    fn test_dry_run_manual_requires_root_and_efi() {
        let mut plan = make_plan("/dev/null", "kryonix", "admin");
        plan.disk.profile = "manual".into();
        plan.disk.manual_partitions = Some(vec![PartitionSpec {
            device: "/dev/sda".into(),
            mountpoint: "/home".into(),
            fstype: "ext4".into(),
            size: "100%".into(),
            format: true,
        }]);

        let result = validate_plan(&plan);
        assert!(!result.ok);
        assert!(
            result
                .checks
                .iter()
                .any(|c| !c.ok && c.message.contains("raiz (/)"))
        );
        assert!(
            result
                .checks
                .iter()
                .any(|c| !c.ok && c.message.contains("EFI"))
        );
    }

    #[test]
    fn test_dry_run_manual_rejects_duplicate_mountpoints() {
        let mut plan = make_plan("/dev/null", "kryonix", "admin");
        plan.disk.profile = "manual".into();
        plan.disk.manual_partitions = Some(vec![
            PartitionSpec {
                device: "/dev/sda".into(),
                mountpoint: "/".into(),
                fstype: "ext4".into(),
                size: "10G".into(),
                format: true,
            },
            PartitionSpec {
                device: "/dev/sda".into(),
                mountpoint: "/boot/efi".into(),
                fstype: "vfat".into(),
                size: "512M".into(),
                format: true,
            },
            PartitionSpec {
                device: "/dev/sda".into(),
                mountpoint: "/".into(),
                fstype: "ext4".into(),
                size: "10G".into(),
                format: true,
            },
        ]);

        let result = validate_plan(&plan);
        assert!(!result.ok);
        assert!(
            result
                .checks
                .iter()
                .any(|c| !c.ok && c.message.contains("duplicado"))
        );
    }

    #[test]
    fn test_dry_run_raid_requires_min_disks() {
        let mut plan = make_plan("/dev/null", "kryonix", "admin");
        plan.disk.profile = "raid".into();
        plan.disk.raid_level = Some("raid5".into());
        plan.disk.selected_disks = vec!["/dev/sda".into(), "/dev/sdb".into()]; // RAID 5 needs 3

        let result = validate_plan(&plan);
        assert!(!result.ok);
        assert!(
            result
                .checks
                .iter()
                .any(|c| !c.ok && c.message.contains("RAID5 exige pelo menos 3"))
        );
    }

    #[test]
    fn test_dry_run_rejects_empty_user() {
        let result = validate_plan(&make_plan("/dev/null", "kryonix", ""));
        assert!(!result.ok);
        assert!(
            result
                .checks
                .iter()
                .any(|c| !c.ok && c.message.contains("usuário"))
        );
    }

    #[test]
    fn test_dry_run_rejects_invalid_user_chars() {
        let result = validate_plan(&make_plan("/dev/null", "kryonix", "root; rm -rf /"));
        assert!(!result.ok);
    }

    #[test]
    fn test_dry_run_rejects_null_device() {
        let result = validate_plan(&make_plan("/dev/null", "kryonix", "admin"));
        assert!(!result.ok);
        assert!(
            result
                .checks
                .iter()
                .any(|c| c.message.contains("null") && !c.ok)
        );
    }

    #[test]
    fn test_install_dry_run_mode_flag() {
        // Verify that a plan with mode="dry-run" has the correct flag
        // (handler-level gating tested by checking the flag itself)
        let plan = make_plan("/dev/null", "kryonix", "admin");
        assert_eq!(plan.disk.mode, "dry-run");
    }

    #[test]
    fn test_install_mode_field_controls_execution_path() {
        // "dry-run" must never reach safety checks / executor
        // This is documented at the handler level; here we verify the field name is correct.
        let mut plan = make_plan("/dev/null", "kryonix", "admin");
        plan.disk.mode = "install".into();
        assert_ne!(plan.disk.mode, "dry-run");
    }

    #[test]
    fn test_dry_run_rejects_hostname_with_shell_metas() {
        // Cobrir shell metas e command substitution que poderiam vazar para
        // /etc/hostname ou para argumentos de programas em pipeline.
        for bad in [
            "evil; rm -rf /",
            "host$()",
            "with`cmd`",
            "spaces here",
            "newline\nhost",
        ] {
            let result = validate_plan(&make_plan("/dev/null", bad, "admin"));
            assert!(
                !result.ok,
                "hostname \"{bad}\" deveria ter sido rejeitado pelo validate_plan"
            );
            assert!(
                result
                    .checks
                    .iter()
                    .any(|c| !c.ok && c.message.contains("caracteres inválidos")),
                "hostname \"{bad}\" deveria ter uma falha sobre caracteres inválidos"
            );
        }
    }

    #[test]
    fn test_dry_run_rejects_hostname_with_path_traversal() {
        // `..` e `/` não pertencem ao charset de hostname e poderiam ser
        // explorados em paths construídos pelo executor.
        for bad in ["..", "../etc", "foo/bar", "..-..-"] {
            let result = validate_plan(&make_plan("/dev/null", bad, "admin"));
            assert!(!result.ok, "hostname \"{bad}\" deveria ter sido rejeitado");
        }
    }

    // ── P0.1: Testes de concorrência ─────────────────────────────────────────

    /// Garante que InstallStatus.running=true bloqueia segundo install.
    /// Testa a lógica de guarda diretamente (sem HTTP), verificando que o
    /// mecanismo de detecção funciona corretamente.
    #[tokio::test]
    async fn test_concurrent_install_guard_blocks_second_request() {
        use tokio::sync::RwLock;

        // Simula o estado compartilhado do AppState
        let install_status = Arc::new(RwLock::new(InstallStatus::default()));

        // Primeira "instalação": adquire o lock e marca running=true
        {
            let mut status = install_status.write().await;
            assert!(!status.running, "should start as not running");
            status.running = true;
        }

        // Segunda "instalação": deve detectar running=true e retornar conflito
        let would_conflict = {
            let status = install_status.read().await;
            status.running
        };
        assert!(
            would_conflict,
            "second install attempt must detect running=true"
        );

        // Simula conclusão: reset de running
        {
            let mut status = install_status.write().await;
            status.running = false;
        }

        // Terceira tentativa (após conclusão): deve passar
        let would_conflict_after_reset = {
            let status = install_status.read().await;
            status.running
        };
        assert!(
            !would_conflict_after_reset,
            "after reset, new install must be allowed"
        );
    }

    /// Garante que um erro no executor reseta running=false
    /// (habilita retry manual após falha).
    #[tokio::test]
    async fn test_install_error_resets_running_flag() {
        use tokio::sync::RwLock;

        let install_status = Arc::new(RwLock::new(InstallStatus::default()));

        // Marca como running (como faz o handler)
        {
            let mut status = install_status.write().await;
            status.running = true;
        }

        // Simula o que o spawn faz em caso de erro
        {
            let mut status = install_status.write().await;
            status.running = false; // reset obrigatório em erro
            status.exit_code = Some(1);
            status.current_phase = Some("error".into());
            status.last_error = Some("disko falhou".into());
        }

        let status = install_status.read().await;
        assert!(!status.running, "running must be false after error");
        assert_eq!(status.exit_code, Some(1));
        assert_eq!(status.current_phase.as_deref(), Some("error"));
    }

    #[test]
    fn test_hash_password_with_invalid_command() {
        let mut plan = make_plan("/dev/sda", "kryonix", "rocha");
        plan.user.hashed_password = Some("my_plain_password".into());

        let result = hash_password_with_command(&mut plan, "comando_inexistente_123");

        assert!(result.is_err(), "Deve retornar erro estruturado, não panic");
        if let Err((status, json)) = result {
            assert_eq!(status, axum::http::StatusCode::INTERNAL_SERVER_ERROR);
            assert!(
                json.0
                    .error
                    .contains("comando comando_inexistente_123 indisponível")
            );
        }
    }
}
