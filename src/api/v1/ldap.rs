use axum::{Json, Router, routing::post};
use serde_json::{json, Value};
use crate::api::v1::rbac::RequireCoreRole;

pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new().route("/ldap/users", post(create_user))
}

pub async fn create_user(_rbac: RequireCoreRole) -> Json<Value> {
    Json(json!({ "status": "stub", "message": "LDAP user creation not yet implemented" }))
}
