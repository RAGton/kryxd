//! Endpoint read-only para o registry canônico de capabilities.

use axum::{Json, Router, http::StatusCode, routing::get};
use serde::Serialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitiesResponse {
    pub schema_version: u32,
    pub capabilities: Vec<kryx::domain::CapabilityDefinition>,
    pub registry_digest: String,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/capabilities", get(get_capabilities))
}

/// GET /api/v2/capabilities — não contém estado de usuário ou credenciais.
pub async fn get_capabilities() -> Result<Json<CapabilitiesResponse>, StatusCode> {
    let registry =
        kryx::domain::capability_registry().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let registry_digest =
        kryx::domain::registry_digest().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(CapabilitiesResponse {
        schema_version: registry.schema_version,
        capabilities: registry.capabilities.clone(),
        registry_digest,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn endpoint_returns_stable_public_registry() {
        let first = get_capabilities().await.unwrap().0;
        let second = get_capabilities().await.unwrap().0;
        assert_eq!(first.schema_version, 1);
        assert_eq!(first.registry_digest, second.registry_digest);
        assert_eq!(first.capabilities.len(), 42);
        assert!(first.capabilities.iter().any(|capability| {
            capability.id == "storage.topology.raid"
                && capability.status == kryx::domain::CapabilityStatus::Unsupported
        }));
        let json = serde_json::to_string(&first).unwrap();
        for secret in ["password", "secret", "token", "privateKey"] {
            assert!(!json.to_lowercase().contains(&secret.to_lowercase()));
        }
    }
}
