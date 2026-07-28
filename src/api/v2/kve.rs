//! KVE (Kryonix Virtualization Engine) — handlers HTTP V2.
//!
//! Endpoints expostos sob `/api/v2/kve/*` no daemon kryxd.
//! Fontes de verdade: `crates/kryx/domain/virtualization.rs` (modelos)
//! e `services::KveService` (orquestração).
//!
//! Contrato:
//! - `GET /api/v2/kve/health`     → 200 KveHealth, ou 503 KveErrorBody
//! - `GET /api/v2/kve/instances`  → 200 { status, source, instances[] }
//!                                  ou 503 KveErrorBody
//! - `GET /api/v2/kve/storage`    → 200 { status, source, storage[] }
//!                                  ou 503 KveErrorBody

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
};
use kryx::domain::{
    KveErrorBody, KveImage, KveImageKind, KveImageRemote, VirtualInstance, VirtualStorage,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{AppState, services::KveService};

#[derive(Serialize)]
pub struct InstancesResponse {
    pub instances: Vec<VirtualInstance>,
    pub source: &'static str,
    pub status: &'static str,
}

#[derive(Serialize)]
pub struct StorageResponse {
    pub storage: Vec<VirtualStorage>,
    pub source: &'static str,
    pub status: &'static str,
}

/// Resposta de `GET /api/v2/kve/image-remotes`.
#[derive(Serialize)]
pub struct ImageRemotesResponse {
    pub remotes: Vec<KveImageRemote>,
    pub source: &'static str,
}

/// Resposta de `GET /api/v2/kve/images`.
#[derive(Serialize)]
pub struct ImagesResponse {
    pub images: Vec<KveImage>,
    pub source: &'static str,
    pub status: &'static str,
    pub filters: ImageFilterEcho,
}

/// Echo dos filtros aplicados pelo caller, para clareza na UI.
#[derive(Serialize, Default)]
pub struct ImageFilterEcho {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<KveImageKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub architecture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
}

/// Query string aceita por `GET /api/v2/kve/images`.
///
/// Todos os campos sao opcionais. `kind` aceita os valores
/// kebab-case `container`, `virtual-machine`.
#[derive(Debug, Deserialize)]
pub struct ImageListQuery {
    #[serde(default)]
    pub remote: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub architecture: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
}

/// Tipo do erro HTTP estruturado retornado pelos handlers quando
/// o backend Incus está indisponível. Mantém o contrato `KveErrorBody`.
type KveHttpError = (StatusCode, Json<KveErrorBody>);

pub async fn health(
    State(state): State<Arc<AppState>>,
) -> Result<Json<kryx::domain::KveHealth>, KveHttpError> {
    state
        .kve_service
        .health()
        .await
        .map(Json)
        .map_err(|err| (StatusCode::SERVICE_UNAVAILABLE, Json(err)))
}

pub async fn list_instances(
    State(state): State<Arc<AppState>>,
) -> Result<Json<InstancesResponse>, KveHttpError> {
    let instances = state
        .kve_service
        .list_instances()
        .await
        .map_err(|err| (StatusCode::SERVICE_UNAVAILABLE, Json(err)))?;
    Ok(Json(InstancesResponse {
        source: "incus",
        status: "ready",
        instances,
    }))
}

pub async fn list_storage(
    State(state): State<Arc<AppState>>,
) -> Result<Json<StorageResponse>, KveHttpError> {
    let storage = state
        .kve_service
        .list_storage()
        .await
        .map_err(|err| (StatusCode::SERVICE_UNAVAILABLE, Json(err)))?;
    Ok(Json(StorageResponse {
        source: "incus",
        status: "ready",
        storage,
    }))
}

/// `GET /api/v2/kve/image-remotes`
///
/// Lista remotes configurados no client Incus local. Sincrono:
/// le `~/.config/incus/config.yml`. Nao fala com o daemon.
pub async fn list_image_remotes(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ImageRemotesResponse>, KveHttpError> {
    let remotes = state.kve_service.list_image_remotes();
    Ok(Json(ImageRemotesResponse {
        remotes,
        source: "client-config",
    }))
}

/// `GET /api/v2/kve/images?remote=&kind=&architecture=&query=`
///
/// Lista imagens Incus disponiveis, filtradas client-side.
/// `kind` aceita `container` ou `virtual-machine` (kebab-case).
/// Valores invalidos em `kind` retornam 400.
pub async fn list_images(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ImageListQuery>,
) -> Result<Json<ImagesResponse>, (StatusCode, Json<KveErrorBody>)> {
    // Validacao de kind no boundary HTTP.
    let kind = match q.kind.as_deref() {
        None => None,
        Some("container") => Some(KveImageKind::Container),
        Some("virtual-machine") => Some(KveImageKind::VirtualMachine),
        Some(other) => {
            let body = KveErrorBody {
                status: "invalid-filter",
                code: "invalid_kind".into(),
                message: format!(
                    "kind '{other}' nao reconhecido; valores aceitos: 'container', 'virtual-machine'"
                ),
                source: None,
            };
            return Err((StatusCode::BAD_REQUEST, Json(body)));
        }
    };

    let filter = crate::services::kve::ImageFilter {
        remote: q.remote.as_deref(),
        kind,
        architecture: q.architecture.as_deref(),
        query: q.query.as_deref(),
    };

    let images = state
        .kve_service
        .list_images(&filter)
        .await
        .map_err(|err| (StatusCode::SERVICE_UNAVAILABLE, Json(err)))?;

    Ok(Json(ImagesResponse {
        images,
        source: "incus",
        status: "ready",
        filters: ImageFilterEcho {
            remote: q.remote,
            kind,
            architecture: q.architecture,
            query: q.query,
        },
    }))
}

/// `GET /api/v2/kve/images/:fingerprint`
///
/// 404 estruturado quando a imagem nao existe no daemon.
pub async fn get_image(
    State(state): State<Arc<AppState>>,
    Path(fingerprint): Path<String>,
) -> Result<Json<KveImage>, (StatusCode, Json<KveErrorBody>)> {
    if fingerprint.is_empty() || fingerprint.len() > 256 {
        let body = KveErrorBody {
            status: "invalid-fingerprint",
            code: "invalid_fingerprint".into(),
            message: "fingerprint invalido".into(),
            source: None,
        };
        return Err((StatusCode::BAD_REQUEST, Json(body)));
    }

    match state.kve_service.get_image(&fingerprint).await {
        Ok(img) => Ok(Json(img)),
        Err(err) => {
            // Daemon Incus devolve 404 quando a imagem nao existe.
            // Quando o provider expõe isso como InvalidResponse,
            // o handler mapeia para 404 + code 'incus_invalid_response'
            // (ate diferenciarmos um code proprio para "not_found").
            let lower = err.message.to_lowercase();
            let status = if lower.contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::SERVICE_UNAVAILABLE
            };
            Err((status, Json(err)))
        }
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/instances", get(list_instances))
        .route("/storage", get(list_storage))
        .route("/image-remotes", get(list_image_remotes))
        .route("/images", get(list_images))
        .route("/images/:fingerprint", get(get_image))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use axum::http::{Request, StatusCode};
    use std::path::PathBuf;
    use std::time::Duration;
    use tokio::sync::RwLock;
    use tower::ServiceExt;

    fn dummy_state() -> Arc<AppState> {
        let provider = crate::providers::IncusProvider::new(crate::providers::IncusConfig {
            socket: PathBuf::from("/tmp/does-not-exist.sock"),
            timeout: Duration::from_millis(50),
            max_response_bytes: 1024,
        });
        Arc::new(AppState {
            log_sender: Arc::new(tokio::sync::broadcast::channel::<String>(16).0),
            progress_tx: Arc::new(tokio::sync::broadcast::channel::<crate::ProgressEvent>(16).0),
            install_status: Arc::new(RwLock::new(crate::InstallStatus::default())),
            auth: crate::auth::new_auth_state(),
            http_client: reqwest::Client::new(),
            installer_token: String::new(),
            runtime_mode: crate::state::RuntimeMode::LiveInstaller,
            install_service: Arc::new(crate::api::install::InstallService::default()),
            kve_service: KveService::new(provider),
        })
    }

    fn app() -> Router {
        Router::new()
            .route("/health", get(health))
            .route("/instances", get(list_instances))
            .route("/storage", get(list_storage))
            .with_state(dummy_state())
    }

    async fn body_json(body: Body) -> serde_json::Value {
        let bytes = to_bytes(body, 65_536).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn health_returns_503_with_structured_error_when_incus_down() {
        let res = app()
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "unavailable");
        assert_eq!(body["code"], "incus_unavailable");
        assert!(body["message"].as_str().unwrap().contains("socket"));
    }

    #[tokio::test]
    async fn list_instances_returns_503_when_incus_down() {
        let res = app()
            .oneshot(Request::get("/instances").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "unavailable");
        assert_eq!(body["code"], "incus_unavailable");
    }

    #[tokio::test]
    async fn list_storage_returns_503_when_incus_down() {
        let res = app()
            .oneshot(Request::get("/storage").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_json(res.into_body()).await;
        assert_eq!(body["status"], "unavailable");
    }

    #[test]
    fn instances_response_serializes_empty_array_shape() {
        let resp = InstancesResponse {
            source: "incus",
            status: "ready",
            instances: vec![],
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["status"], "ready");
        assert_eq!(json["source"], "incus");
        assert!(json["instances"].is_array());
        assert_eq!(json["instances"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn storage_response_uses_storage_field_not_datasets() {
        // O contrato V2 renomeia o campo `datasets` para `storage`.
        let resp = StorageResponse {
            source: "incus",
            status: "ready",
            storage: vec![],
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert!(
            json.get("datasets").is_none(),
            "campo legado `datasets` deve sumir"
        );
        assert!(json["storage"].is_array());
    }
}
