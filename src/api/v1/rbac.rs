use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{StatusCode, request::Parts},
    Json,
};
use serde_json::{json, Value};

pub struct RequireCoreRole;

#[async_trait]
impl<S: Send + Sync> FromRequestParts<S> for RequireCoreRole {
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(_parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        if let Ok(identity) = kryx::services::identity::check_identity() {
            if matches!(
                identity.role,
                kryx::domain::identity::Role::Core | kryx::domain::identity::Role::ThinkServer
            ) {
                return Ok(RequireCoreRole);
            }
        }
        
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Forbidden", "details": "Core or ThinkServer role required"})),
        ))
    }
}
