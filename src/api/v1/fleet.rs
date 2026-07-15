use axum::{Json, Router, routing::get};
use serde_json::Value;
use std::fs;
use crate::api::v1::rbac::RequireCoreRole;

pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new().route("/fleet/status", get(get_status))
}

pub async fn get_status(_rbac: RequireCoreRole) -> Json<Vec<Value>> {
    let mut manifests = Vec::new();
    let dir = "/var/lib/kryonix/telemetry";
    
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(json) = serde_json::from_str::<Value>(&content) {
                        manifests.push(json);
                    }
                }
            }
        }
    }
    
    Json(manifests)
}
