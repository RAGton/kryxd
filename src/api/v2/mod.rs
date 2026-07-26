//! V2 contract surface — sub-routers KVE e Think (stubs de fundação).
//!
//! Cada sub-router expõe apenas o shape mínimo prometido para a CLI e a UI.
//! A implementação real (Incus + ZFS) entra nas próximas iterações.

pub mod kve;
pub mod think;

use axum::Router;
use std::sync::Arc;

use crate::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .nest("/kve", kve::router())
        .nest("/think", think::router())
}
