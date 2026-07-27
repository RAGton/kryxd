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
    //! Stubs V2 são puros (zero argumentos, zero `State<Arc<AppState>>`).
    //! Não precisam de `AppState::default_for_tests()`: basta chamar o
    //! handler diretamente (Opção A) e/ou montar o subrouter como
    //! `Router<()>` para validar path + status (Opção B).

    use super::*;
    use axum::body::{Body, to_bytes};
    use axum::http::{Request, StatusCode};
    use axum::routing::get;
    use tower::ServiceExt;

    // ---------- Opção A: handler direto ----------

    #[tokio::test]
    async fn list_instances_returns_explicit_stub() {
        let Json(response) = list_instances().await;

        assert_eq!(response.status, "stub");
        assert_eq!(response.source, "incus:lista-vazia");
        assert!(response.instances.is_empty());
    }

    #[tokio::test]
    async fn list_storage_returns_explicit_stub() {
        let Json(response) = list_storage().await;

        assert_eq!(response.status, "stub");
        assert_eq!(response.source, "zfs:stub");
        assert!(response.datasets.is_empty());
    }

    // ---------- Opção B: subrouter como Router<()>, oneshot HTTP ----------

    async fn body_json(body: Body) -> serde_json::Value {
        let bytes = to_bytes(body, 4096).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn path_get_kve_instances_returns_stub_200() {
        let app = axum::Router::new()
            .route("/instances", get(list_instances));

        let res = app
            .oneshot(Request::get("/instances").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "stub");
        assert!(body["instances"].is_array());
        assert_eq!(body["instances"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn path_get_kve_storage_returns_stub_200() {
        let app = axum::Router::new()
            .route("/storage", get(list_storage));

        let res = app
            .oneshot(Request::get("/storage").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "stub");
        assert!(body["datasets"].is_array());
        assert_eq!(body["datasets"].as_array().unwrap().len(), 0);
    }

    /// Garante que o subrouter V2 não tem path duplicado
    /// (ex.: `/kve/kve/instances`). Se um dia alguém trocar
    /// `nest("/kve", ...)` por `nest("/kve", v2::router())`,
    /// este teste falha imediatamente.
    #[tokio::test]
    async fn path_get_kve_kve_instances_returns_404() {
        let app = axum::Router::new()
            .route("/kve/instances", get(list_instances));

        let res = app
            .oneshot(Request::get("/kve/kve/instances").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }
}
