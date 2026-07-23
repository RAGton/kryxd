pub mod fleet;
pub mod ldap;
pub mod rbac;
pub mod storage;
pub mod system;

use std::sync::Arc;

use axum::Router;

use crate::{AppState, api::auth};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .merge(auth::router())
        .merge(system::router())
        .merge(fleet::router())
        .merge(storage::router())
        .merge(ldap::router())
}
