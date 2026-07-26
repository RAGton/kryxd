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
    use axum::http::Request;

    // Ver nota em kve.rs: os stubs V2 não consomem AppState, mas o Router
    // tipado precisa de ::with_state(...) que exige um construtor default
    // ainda inexistente. Marcamos com #[ignore] e o smoke-test real é
    // runtime (cargo run + curl), documentado no log do Vault.

    #[tokio::test]
    #[ignore = "needs AppState::default_for_tests() — tracked in vault log"]
    async fn topology_returns_stub_shape() {
        let _ = Request::get("/topology").body(axum::body::Body::empty());
    }

    #[tokio::test]
    #[ignore = "needs AppState::default_for_tests() — tracked in vault log"]
    async fn zfs_returns_stub_shape() {
        let _ = Request::get("/storage/zfs").body(axum::body::Body::empty());
    }
}
