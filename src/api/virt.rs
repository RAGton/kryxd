use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::process::Command;

use crate::AppState;
use crate::ErrorResponse;
use crate::api::incus::{self, encode_path_segment, operation_id};
use crate::api::v1::rbac::RequireCoreRole;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/nodes", get(get_nodes))
        .route("/instances", get(get_nodes).post(create_instance))
        .route("/instances/:id/state", put(change_instance_state))
}

async fn get_nodes() -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    let output = Command::new("incus")
        .arg("list")
        .arg("--format=json")
        .output()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to spawn incus list".into(),
                    details: Some(e.to_string()),
                }),
            )
        })?;

    if !output.status.success() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "incus list failed".into(),
                details: Some(String::from_utf8_lossy(&output.stderr).to_string()),
            }),
        ));
    }

    let json: Value = serde_json::from_slice(&output.stdout).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to parse incus list json".into(),
                details: Some(e.to_string()),
            }),
        )
    })?;

    Ok(Json(json))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum InstanceKind {
    Vm,
    Ct,
}

impl InstanceKind {
    fn as_incus_type(&self) -> &'static str {
        match self {
            Self::Vm => "virtual-machine",
            Self::Ct => "container",
        }
    }

    fn as_api_kind(&self) -> &'static str {
        match self {
            Self::Vm => "vm",
            Self::Ct => "ct",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreateInstanceRequest {
    pub name: String,
    pub kind: InstanceKind,
    pub image: String,
    pub cpu: u16,
    pub ram_mb: u32,
    pub disk_gb: u32,
    pub network_bridge: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum InstanceStateAction {
    Start,
    Stop,
    Restart,
    Freeze,
}

impl InstanceStateAction {
    fn as_incus_action(&self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::Stop => "stop",
            Self::Restart => "restart",
            Self::Freeze => "freeze",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstanceStateRequest {
    pub action: InstanceStateAction,
}

async fn create_instance(
    _role: RequireCoreRole,
    State(_state): State<Arc<AppState>>,
    Json(config): Json<CreateInstanceRequest>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    validate_create_request(&config)?;

    let incus_payload = json!({
        "name": config.name.clone(),
        "type": config.kind.as_incus_type(),
        "source": {
            "type": "image",
            "alias": config.image.clone(),
        },
        "config": {
            "limits.cpu": config.cpu.to_string(),
            "limits.memory": format!("{}MiB", config.ram_mb),
        },
        "devices": {
            "root": {
                "type": "disk",
                "path": "/",
                "pool": "default",
                "size": format!("{}GiB", config.disk_gb),
            },
            "eth0": {
                "type": "nic",
                "name": "eth0",
                "network": config.network_bridge.clone(),
            }
        },
        "start": true,
    });

    let create_response = incus::post_json("/1.0/instances", &incus_payload)
        .await
        .map_err(create_error)?;
    let task_id = operation_id(&create_response);
    let wait_response = match task_id.as_deref() {
        Some(id) => {
            let encoded_id = encode_path_segment(id);
            incus::get_json(&format!("/1.0/operations/{encoded_id}/wait?timeout=30"))
                .await
                .ok()
        }
        None => None,
    };

    Ok(Json(json!({
        "status": if wait_response.is_some() { "completed" } else { "accepted" },
        "task_id": task_id,
        "instance": config.name,
        "kind": config.kind.as_api_kind(),
        "incus": create_response.raw,
        "wait": wait_response.map(|response| response.raw),
    })))
}

async fn change_instance_state(
    _role: RequireCoreRole,
    Path(id): Path<String>,
    Json(payload): Json<InstanceStateRequest>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    let action = payload.action.as_incus_action();
    let instance_id = encode_path_segment(&id);
    let incus_path = format!("/1.0/instances/{instance_id}/state");
    let incus_payload = json!({
        "action": action,
        "timeout": 30
    });

    let incus_response = incus::put_json(&incus_path, &incus_payload)
        .await
        .map_err(state_error)?;

    Ok(Json(json!({
        "status": "accepted",
        "instance": id,
        "action": action,
        "incus": incus_response.raw,
    })))
}

fn validate_create_request(
    config: &CreateInstanceRequest,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    if config.name.trim().is_empty() {
        return Err(bad_create_request("instance name is required"));
    }
    if config.image.trim().is_empty() {
        return Err(bad_create_request("image alias is required"));
    }
    if config.network_bridge.trim().is_empty() {
        return Err(bad_create_request("network_bridge is required"));
    }
    if config.cpu == 0 {
        return Err(bad_create_request("cpu must be greater than zero"));
    }
    if config.ram_mb == 0 {
        return Err(bad_create_request("ram_mb must be greater than zero"));
    }
    if config.disk_gb == 0 {
        return Err(bad_create_request("disk_gb must be greater than zero"));
    }
    Ok(())
}

fn bad_create_request(details: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        Json(ErrorResponse {
            error: "Invalid Incus instance request".into(),
            details: Some(details.to_string()),
        }),
    )
}

fn create_error(details: String) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_GATEWAY,
        Json(ErrorResponse {
            error: "Failed to create Incus instance".into(),
            details: Some(details),
        }),
    )
}

fn state_error(details: String) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_GATEWAY,
        Json(ErrorResponse {
            error: "Failed to change Incus instance state".into(),
            details: Some(details),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_state_actions_to_incus_payload_values() {
        assert_eq!(InstanceStateAction::Start.as_incus_action(), "start");
        assert_eq!(InstanceStateAction::Stop.as_incus_action(), "stop");
        assert_eq!(InstanceStateAction::Restart.as_incus_action(), "restart");
        assert_eq!(InstanceStateAction::Freeze.as_incus_action(), "freeze");
    }

    #[test]
    fn maps_instance_kind_to_incus_type() {
        assert_eq!(InstanceKind::Vm.as_incus_type(), "virtual-machine");
        assert_eq!(InstanceKind::Ct.as_incus_type(), "container");
    }
}
