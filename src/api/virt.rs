use axum::{
    Json, Router,
    routing::{get, post},
    extract::State,
    http::StatusCode,
};
use std::sync::Arc;
use serde_json::Value;

// Simulando dependência no nosso backend
// Em produção, isso importaria o virt_engine do kryx (como lib)
// Para este contexto vamos chamar o binário kryx via Command ou reimplementar a lógica simples
use tokio::process::Command;

use crate::{AppState, InstallPlan};
use crate::ErrorResponse;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/nodes", get(get_nodes))
        .route("/container", post(create_container))
        .route("/vm", post(create_vm))
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

async fn create_container(
    State(_state): State<Arc<AppState>>,
    Json(plan): Json<InstallPlan>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    let name = plan.hostname.clone();
    // Definimos uma imagem padrão temporária já que o plano pode não especificar uma imagem OCI/Incus pura.
    let image = "images:ubuntu/24.04"; 

    let mut cmd = Command::new("incus");
    cmd.arg("launch").arg(image).arg(&name);
    cmd.arg("-c");
    cmd.arg("raw.lxc=lxc.apparmor.profile=kryonix-incus-container");

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
        "container": name
    })))
}

async fn create_vm(
    State(_state): State<Arc<AppState>>,
    Json(plan): Json<InstallPlan>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    let name = plan.hostname.clone();
    let image = "images:ubuntu/24.04";

    let mut cmd = Command::new("incus");
    cmd.arg("launch").arg(image).arg(&name).arg("--vm");

    let output = cmd.output().await.map_err(|e| (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: "Failed to spawn incus launch --vm".into(),
            details: Some(e.to_string()),
        })
    ))?;

    if !output.status.success() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "incus launch --vm failed".into(),
                details: Some(String::from_utf8_lossy(&output.stderr).to_string()),
            })
        ));
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "vm": name
    })))
}
