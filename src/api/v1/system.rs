use axum::{Json, Router, routing::get};
use kryx::domain::identity::HostIdentity;

pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new().route("/system/identity", get(get_identity))
}

pub async fn get_identity() -> Result<Json<HostIdentity>, (axum::http::StatusCode, String)> {
    kryx::services::identity::check_identity()
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))
}
