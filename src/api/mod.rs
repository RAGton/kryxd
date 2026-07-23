//! Superfície HTTP v2 do instalador.

pub mod auth;
pub mod capabilities;
pub mod cluster;
pub mod console;
pub mod incus;
pub mod install;
pub mod storage;
pub mod system;
pub mod v1;
pub mod virt;

use std::sync::Arc;

use axum::{
    Router,
    routing::{get, post, put},
};

use crate::AppState;

/// Constrói as rotas v2 sem substituir os adaptadores legados.
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/capabilities", get(capabilities::get_capabilities))
        .route("/plan", post(install::post_plan))
        .route("/secrets", put(install::put_secrets))
        .route("/dry-run", post(install::post_preflight))
        .route("/preflight", post(install::post_preflight))
        .route("/install", post(install::post_install))
        .nest("/virt", virt::router())
        .nest("/cluster", cluster::router())
        .nest("/console", console::router())
        .nest("/storage", storage::router())
        .merge(system::router())
}
