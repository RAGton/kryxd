pub mod rbac;
pub mod system;
pub mod fleet;
pub mod storage;
pub mod ldap;

use axum::Router;

pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .merge(system::router())
        .merge(fleet::router())
        .merge(storage::router())
        .merge(ldap::router())
}
