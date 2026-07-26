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

    // Os stubs V2 não consomem AppState, mas Router<S=Arc<AppState>> não
    // implementa tower::Service direto. O construtor real (broadcast senders,
    // RwLocks, reqwest::Client) é caro para unit tests. Marcamos os testes
    // com `#[ignore]` até criarmos `AppState::default_for_tests()` na
    // próxima fase, e usamos `Router::with_state(Arc::new(...))` quando
    // tivermos um construtor de teste. Por enquanto, o smoke-test de fato
    // é o `cargo run` manual + curl em runtime, documentado no log do Vault.

    #[tokio::test]
    #[ignore = "needs AppState::default_for_tests() — tracked in vault log"]
    async fn list_instances_returns_stub_shape() {
        let _ = Request::get("/instances").body(axum::body::Body::empty());
    }

    #[tokio::test]
    #[ignore = "needs AppState::default_for_tests() — tracked in vault log"]
    async fn list_storage_returns_stub_shape() {
        let _ = Request::get("/storage").body(axum::body::Body::empty());
    }
}
