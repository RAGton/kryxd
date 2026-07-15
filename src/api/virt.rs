use axum::{
    Json, Router,
    routing::{get, post},
    extract::State,
    http::StatusCode,
};
use std::sync::Arc;
use serde_json::Value;
use serde::{Deserialize, Serialize};

// Simulando dependência no nosso backend
// Em produção, isso importaria o virt_engine do kryx (como lib)
// Para este contexto vamos chamar o binário kryx via Command ou reimplementar a lógica simples
use tokio::process::Command;

use crate::{AppState, InstallPlan};
use crate::ErrorResponse;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/nodes", get(get_nodes))
        .route("/instances", post(create_instance))
}

async fn get_nodes() -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    let output = Command::new("incus")
        .arg("list")
        .arg("--format=json")
        .output()
        .await
        .map_err(|e| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to spawn incus list".into(),
                details: Some(e.to_string()),
            })
        ))?;

    if !output.status.success() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "incus list failed".into(),
                details: Some(String::from_utf8_lossy(&output.stderr).to_string()),
            })
        ));
    }

    let json: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to parse incus list json".into(),
                details: Some(e.to_string()),
            })
        ))?;

    Ok(Json(json))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstanceConfig {
    pub name: String,
    pub is_vm: bool,
    pub image: String,
    pub cpu: u16,
    pub ram_mb: u32,
    pub disk_gb: u32,
}

async fn create_instance(
    State(_state): State<Arc<AppState>>,
    Json(config): Json<InstanceConfig>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    let mut cmd = Command::new("incus");
    cmd.arg("launch").arg(&config.image).arg(&config.name);

    if config.is_vm {
        cmd.arg("--vm");
    } else {
        cmd.arg("-c");
        cmd.arg("raw.lxc=lxc.apparmor.profile=kryonix-incus-container");
    }

    cmd.arg("-c").arg(format!("limits.cpu={}", config.cpu));
    cmd.arg("-c").arg(format!("limits.memory={}MB", config.ram_mb));
    cmd.arg("-d").arg(format!("root,size={}GB", config.disk_gb));

    let output = cmd.output().await.map_err(|e| (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: "Failed to spawn incus launch".into(),
            details: Some(e.to_string()),
        })
    ))?;

    if !output.status.success() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "incus launch failed".into(),
                details: Some(String::from_utf8_lossy(&output.stderr).to_string()),
            })
        ));
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "instance": config.name
    })))
}
