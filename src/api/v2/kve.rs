//! KVE (Kryonix Virtualization Engine) — stubs de Instâncias e Storage.
//!
//! Endpoints consumidos por /api/v2/kve/* no daemom kryxd.
//! Implementação real (Incus + ZFS) virá nas próximas fases; estes stubs
//! apenas estabelecem o contrato para a CLI e a UI.

use axum::{Json, Router, routing::get};
use serde::Serialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Serialize)]
pub struct InstancesResponse {
    pub instances: Vec<serde_json::Value>,
    pub source: &'static str,
    pub status: &'static str,
}

#[derive(Serialize)]
pub struct StorageResponse {
    pub datasets: Vec<serde_json::Value>,
    pub source: &'static str,
    pub status: &'static str,
}

/// GET /api/v2/kve/instances — lista instâncias (VM/CT) sob gestão KVE.
pub async fn list_instances() -> Json<InstancesResponse> {
    Json(InstancesResponse {
        instances: vec![],
        source: "incus:lista-vazia",
        status: "stub",
    })
}

/// GET /api/v2/kve/storage — datasets ZFS atrelados à pool do Incus.
pub async fn list_storage() -> Json<StorageResponse> {
    Json(StorageResponse {
        datasets: vec![],
        source: "zfs:stub",
        status: "stub",
    })
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/instances", get(list_instances))
        .route("/storage", get(list_storage))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn list_instances_returns_stub_shape() {
        let app = router();
        let res = app
            .oneshot(Request::get("/instances").body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        let body = to_bytes(res.into_body(), 4096).await.unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed["status"], "stub");
        assert!(parsed["instances"].is_array());
    }

    #[tokio::test]
    async fn list_storage_returns_stub_shape() {
        let app = router();
        let res = app
            .oneshot(Request::get("/storage").body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        let body = to_bytes(res.into_body(), 4096).await.unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed["status"], "stub");
        assert!(parsed["datasets"].is_array());
    }
}
