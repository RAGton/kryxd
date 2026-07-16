//! Storage API - Read-only Storage Command Center endpoints for Incus
//! 
//! SECURITY: Read-only endpoints. Only queries to Incus API; no destructive operations.

use axum::{
    http::StatusCode,
    Json,
    routing::get,
};
use std::sync::Arc;
use tracing::{debug, error, info};

use crate::ErrorResponse;

pub fn router() -> axum::Router<Arc<crate::AppState>> {
    axum::Router::new()
        .route("/pools", get(get_pools))
}

/// Response structure for storage pool information
#[derive(serde::Serialize)]
pub struct StoragePool {
    pub name: String,
    pub driver: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub available_size: Option<String>,
}

/// GET /api/v2/storage/pools
/// 
/// Query Incus API for storage pools information.
/// Returns clean JSON with pool name, driver, status, and sizes.
async fn get_pools() -> Result<Json<Vec<StoragePool>>, (StatusCode, Json<ErrorResponse>)> {
    debug!("Querying Incus for storage pools");
    
    let output = tokio::process::Command::new("incus")
        .args(["list", "storage-pools", "--format=json"])
        .output()
        .await
        .map_err(|e| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to spawn incus list".into(),
                details: Some(e.to_string()),
            }),
        ))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("incus list failed: {}", stderr);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Incus list failed".into(),
                details: Some(stderr.to_string()),
            }),
        ));
    }

    let pools: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout)
        .map_err(|e| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to parse Incus response".into(),
                details: Some(e.to_string()),
            }),
        ))?;

    let parsed_pools: Vec<StoragePool> = pools
        .into_iter()
        .filter_map(|pool| {
            let name = pool.get("name")?.as_str()?.to_string();
            let driver = pool.get("driver").and_then(|d| d.as_str()).unwrap_or("unknown").to_string();
            let status = pool.get("status").and_then(|s| s.as_str()).unwrap_or("Unknown").to_string();
            
            // Size info from config
            let config = pool.get("config")?;
            let total_size = config.get("size").and_then(|s| s.as_str()).map(|s| s.to_string());
            let used_size = config.get("used_by").and_then(|s| s.as_str()).map(|s| s.to_string());
            
            // Try to get space info
            let available_size = config.get("space").and_then(|s| s.as_str()).map(|s| s.to_string());

            Some(StoragePool {
                name,
                driver,
                status,
                total_size,
                used_size,
                available_size,
            })
        })
        .collect();

    info!("Found {} storage pools", parsed_pools.len());
    Ok(Json(parsed_pools))
}