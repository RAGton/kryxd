//! Think (cluster topology + node storage) — stubs de topologia e ZFS.
//!
//! Endpoints consumidos por /api/v2/think/* no daemom kryxd.
//! Implementação real (cluster map, PXE/DHCP, zpool status) virá depois.

use axum::{Json, Router, routing::get};
use serde::Serialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Serialize)]
pub struct TopologyResponse {
    pub nodes: Vec<serde_json::Value>,
    pub network: serde_json::Value,
    pub status: &'static str,
}

#[derive(Serialize)]
pub struct ZfsResponse {
    pub pools: Vec<serde_json::Value>,
    pub source: &'static str,
    pub status: &'static str,
}

/// GET /api/v2/think/topology — mapa do cluster Think (nodes + rede PXE/DHCP).
pub async fn get_topology() -> Json<TopologyResponse> {
    Json(TopologyResponse {
        nodes: vec![],
        network: serde_json::json!({"pxe": "unknown", "dhcp": "unknown"}),
        status: "stub",
    })
}

/// GET /api/v2/think/storage/zfs — status de pools ZFS registrados no Think.
pub async fn get_zfs() -> Json<ZfsResponse> {
    Json(ZfsResponse {
        pools: vec![],
        source: "zpool:stub",
        status: "stub",
    })
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/topology", get(get_topology))
        .route("/storage/zfs", get(get_zfs))
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
    async fn topology_returns_explicit_stub() {
        let Json(response) = get_topology().await;

        assert_eq!(response.status, "stub");
        assert!(response.nodes.is_empty());
        assert_eq!(response.network["pxe"], "unknown");
        assert_eq!(response.network["dhcp"], "unknown");
    }

    #[tokio::test]
    async fn zfs_returns_explicit_stub() {
        let Json(response) = get_zfs().await;

        assert_eq!(response.status, "stub");
        assert_eq!(response.source, "zpool:stub");
        assert!(response.pools.is_empty());
    }

    // ---------- Opção B: subrouter como Router<()>, oneshot HTTP ----------

    async fn body_json(body: Body) -> serde_json::Value {
        let bytes = to_bytes(body, 4096).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn path_get_think_topology_returns_stub_200() {
        let app = axum::Router::new().route("/topology", get(get_topology));

        let res = app
            .oneshot(Request::get("/topology").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "stub");
        assert!(body["nodes"].is_array());
        assert_eq!(body["nodes"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn path_get_think_storage_zfs_returns_stub_200() {
        let app = axum::Router::new().route("/storage/zfs", get(get_zfs));

        let res = app
            .oneshot(Request::get("/storage/zfs").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "stub");
        assert!(body["pools"].is_array());
        assert_eq!(body["pools"].as_array().unwrap().len(), 0);
    }
}
