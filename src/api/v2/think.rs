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
    use super::*;
    use axum::body::to_bytes;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn topology_returns_stub_shape() {
        let app = router();
        let res = app
            .oneshot(Request::get("/topology").body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        let body = to_bytes(res.into_body(), 4096).await.unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed["status"], "stub");
        assert!(parsed["nodes"].is_array());
        assert!(parsed["network"].is_object());
    }

    #[tokio::test]
    async fn zfs_returns_stub_shape() {
        let app = router();
        let res = app
            .oneshot(Request::get("/storage/zfs").body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        let body = to_bytes(res.into_body(), 4096).await.unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(parsed["status"], "stub");
        assert!(parsed["pools"].is_array());
    }
}
