use axum::{
    extract::State,
    http::StatusCode,
    response::Response,
    Json,
};
use std::sync::Arc;
use axum::extract::Request;
use axum::middleware::Next;

use crate::AppState;
use crate::state::RuntimeMode;
use crate::ErrorResponse;

pub async fn installer_guard(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    if let RuntimeMode::InstalledHost(_) = &state.runtime_mode {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "FORBIDDEN".into(),
                details: Some("Installer and destructive endpoints are disabled on installed hosts. The system is in management mode.".into()),
            }),
        ));
    }

    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        routing::get,
        Router,
    };
    use axum::http::Request;
    use tower::ServiceExt;
    use crate::state::RuntimeMode;
    use crate::auth::new_auth_state;
    use crate::AppState;
    use tokio::sync::{RwLock, broadcast};

    fn make_test_state(mode: RuntimeMode) -> Arc<AppState> {
        let (log_tx, _) = broadcast::channel(1);
        let (progress_tx, _) = broadcast::channel(1);
        let http_client = reqwest::Client::new();
        
        Arc::new(AppState {
            log_sender: Arc::new(log_tx),
            progress_tx: Arc::new(progress_tx),
            install_status: Arc::new(RwLock::new(crate::load_install_state())),
            auth: new_auth_state(),
            http_client,
            installer_token: "test".into(),
            runtime_mode: mode,
            install_service: Arc::new(crate::api::install::InstallService::default()),
        })
    }

    #[tokio::test]
    async fn guard_allows_installer_mode() {
        let state = make_test_state(RuntimeMode::LiveInstaller);
        let app = Router::new()
            .route("/", get(|| async { "OK" }))
            .layer(axum::middleware::from_fn_with_state(state.clone(), installer_guard))
            .with_state(state);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn guard_blocks_installed_mode() {
        let identity = kryx::domain::identity::HostIdentity {
            uuid: "test".into(),
            role: kryx::domain::identity::HostRole::Core,
            edition: "test".into(),
        };
        let state = make_test_state(RuntimeMode::InstalledHost(identity));
        let app = Router::new()
            .route("/", get(|| async { "OK" }))
            .layer(axum::middleware::from_fn_with_state(state.clone(), installer_guard))
            .with_state(state);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}
