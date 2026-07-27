//! KVE (Kryonix Virtualization Engine) — handlers HTTP V2.
//!
//! Endpoints expostos sob `/api/v2/kve/*` no daemon kryxd.
//! Fontes de verdade: `crates/kryx/domain/virtualization.rs` (modelos)
//! e `services::KveService` (orquestração).
//!
//! Contrato:
//! - `GET /api/v2/kve/health`     → 200 KveHealth, ou 503 KveErrorBody
//! - `GET /api/v2/kve/instances`  → 200 { status, source, instances[] }
//!                                  ou 503 KveErrorBody
//! - `GET /api/v2/kve/storage`    → 200 { status, source, storage[] }
//!                                  ou 503 KveErrorBody

use axum::{Json, Router, extract::State, http::StatusCode, routing::get};
use kryx::domain::{KveErrorBody, VirtualInstance, VirtualStorage};
use serde::Serialize;
use std::sync::Arc;

use crate::{AppState, services::KveService};

#[derive(Serialize)]
pub struct InstancesResponse {
    pub instances: Vec<VirtualInstance>,
    pub source: &'static str,
    pub status: &'static str,
}

#[derive(Serialize)]
pub struct StorageResponse {
    pub storage: Vec<VirtualStorage>,
    pub source: &'static str,
    pub status: &'static str,
}

/// Tipo do erro HTTP estruturado retornado pelos handlers quando
/// o backend Incus está indisponível. Mantém o contrato `KveErrorBody`.
type KveHttpError = (StatusCode, Json<KveErrorBody>);

pub async fn health(
    State(state): State<Arc<AppState>>,
) -> Result<Json<kryx::domain::KveHealth>, KveHttpError> {
    state
        .kve_service
        .health()
        .await
        .map(Json)
        .map_err(|err| (StatusCode::SERVICE_UNAVAILABLE, Json(err)))
}

pub async fn list_instances(
    State(state): State<Arc<AppState>>,
) -> Result<Json<InstancesResponse>, KveHttpError> {
    let instances = state
        .kve_service
        .list_instances()
        .await
        .map_err(|err| (StatusCode::SERVICE_UNAVAILABLE, Json(err)))?;
    Ok(Json(InstancesResponse {
        source: "incus",
        status: "ready",
        instances,
    }))
}

pub async fn list_storage(
    State(state): State<Arc<AppState>>,
) -> Result<Json<StorageResponse>, KveHttpError> {
    let storage = state
        .kve_service
        .list_storage()
        .await
        .map_err(|err| (StatusCode::SERVICE_UNAVAILABLE, Json(err)))?;
    Ok(Json(StorageResponse {
        source: "incus",
        status: "ready",
        storage,
    }))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/instances", get(list_instances))
        .route("/storage", get(list_storage))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use axum::http::{Request, StatusCode};
    use std::path::PathBuf;
    use std::time::Duration;
    use tokio::sync::RwLock;
    use tower::ServiceExt;

    fn dummy_state() -> Arc<AppState> {
        let provider = crate::providers::IncusProvider::new(crate::providers::IncusConfig {
            socket: PathBuf::from("/tmp/does-not-exist.sock"),
            timeout: Duration::from_millis(50),
            max_response_bytes: 1024,
        });
        Arc::new(AppState {
            log_sender: Arc::new(tokio::sync::broadcast::channel::<String>(16).0),
            progress_tx: Arc::new(tokio::sync::broadcast::channel::<crate::ProgressEvent>(16).0),
            install_status: Arc::new(RwLock::new(crate::InstallStatus::default())),
            auth: crate::auth::new_auth_state(),
            http_client: reqwest::Client::new(),
            installer_token: String::new(),
            runtime_mode: crate::state::RuntimeMode::LiveInstaller,
            install_service: Arc::new(crate::api::install::InstallService::default()),
            kve_service: KveService::new(provider),
        })
    }

    fn app() -> Router {
        Router::new()
            .route("/health", get(health))
            .route("/instances", get(list_instances))
            .route("/storage", get(list_storage))
            .with_state(dummy_state())
    }

    async fn body_json(body: Body) -> serde_json::Value {
        let bytes = to_bytes(body, 65_536).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn health_returns_503_with_structured_error_when_incus_down() {
        let res = app()
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "unavailable");
        assert_eq!(body["code"], "incus_unavailable");
        assert!(body["message"].as_str().unwrap().contains("socket"));
    }

    #[tokio::test]
    async fn list_instances_returns_503_when_incus_down() {
        let res = app()
            .oneshot(Request::get("/instances").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "unavailable");
        assert_eq!(body["code"], "incus_unavailable");
    }

    #[tokio::test]
    async fn list_storage_returns_503_when_incus_down() {
        let res = app()
            .oneshot(Request::get("/storage").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "unavailable");
    }

    #[test]
    fn instances_response_serializes_empty_array_shape() {
        let resp = InstancesResponse {
            source: "incus",
            status: "ready",
            instances: vec![],
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["status"], "ready");
        assert_eq!(json["source"], "incus");
        assert!(json["instances"].is_array());
        assert_eq!(json["instances"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn storage_response_uses_storage_field_not_datasets() {
        // O contrato V2 renomeia o campo `datasets` para `storage`.
        let resp = StorageResponse {
            source: "incus",
            status: "ready",
            storage: vec![],
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert!(
            json.get("datasets").is_none(),
            "campo legado `datasets` deve sumir"
        );
        assert!(json["storage"].is_array());
    }
}
