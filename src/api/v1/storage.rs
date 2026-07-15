use axum::{Json, Router, routing::get};
use serde_json::{json, Value};
use tokio::process::Command;
use crate::api::v1::rbac::RequireCoreRole;

pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new().route("/storage/quotas", get(get_quotas))
}

pub async fn get_quotas(_rbac: RequireCoreRole) -> Result<Json<Vec<Value>>, (axum::http::StatusCode, String)> {
    let output = Command::new("zfs")
        .args(["list", "-o", "name,used,available,quota", "-p", "-t", "filesystem", "-H"])
        .output()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, err.to_string()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 4 {
            results.push(json!({
                "name": parts[0],
                "used": parts[1].parse::<u64>().unwrap_or(0),
                "available": parts[2].parse::<u64>().unwrap_or(0),
                "quota": if parts[3] == "none" { 0 } else { parts[3].parse::<u64>().unwrap_or(0) }
            }));
        }
    }

    Ok(Json(results))
}
