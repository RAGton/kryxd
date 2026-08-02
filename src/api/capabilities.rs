//! Endpoint read-only para o registry canônico de capabilities.
//!
//! Para capabilities com runtime_check=true (campo extra, opcional),
//! o status é enriquecido em tempo de request inspecionando o estado
//! real do subsistema (ex: virtualization.incus verifica
//! /var/lib/incus/unix.socket e incus.service). Toda mutação é
//! idempotente e segura contra falhas de subsistema.

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

/// Path canônico do socket do Incus (systemd unit Incus).
const INCUS_SOCKET_PATH: &str = "/var/lib/incus/unix.socket";

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/capabilities", get(get_capabilities))
}

/// GET /api/v2/capabilities — não contém estado de usuário ou credenciais.
pub async fn get_capabilities() -> Result<Json<CapabilitiesResponse>, StatusCode> {
    let registry =
        kryx::domain::capability_registry().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let registry_digest =
        kryx::domain::registry_digest().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Runtime enrichment: para capabilities cujo id requer check runtime
    // (ex: virtualization.incus), sobrescreve status baseado em estado real.
    // Recebe &[] (referencia ao registry estatico) e retorna Vec clonado.
    let capabilities = enrich_with_runtime_checks(&registry.capabilities);

    Ok(Json(CapabilitiesResponse {
        schema_version: registry.schema_version,
        capabilities,
        registry_digest,
    }))
}

/// Enriquece o registry com checks de runtime para capabilities que
/// requerem inspeção dinâmica. Idempotente.
///
/// Recebe `&[CapabilityDefinition]` (slice imutável) porque o registry
/// é estático (`&'static CapabilityRegistry`) e não pode ser movido.
/// Usa `iter().cloned()` para produzir cópias independentes que podem
/// ser mutadas por capability (c.status = ..., c.reason = ...).
fn enrich_with_runtime_checks(
    caps: &[kryx::domain::CapabilityDefinition],
) -> Vec<kryx::domain::CapabilityDefinition> {
    caps.iter()
        .cloned()
        .map(|mut c| {
            match c.id.as_str() {
                "virtualization.incus" => {
                    let socket_exists = std::path::Path::new(INCUS_SOCKET_PATH).exists();
                    let service_active = std::process::Command::new("systemctl")
                        .args(["is-active", "--quiet", "incus.service"])
                        .status()
                        .map(|s| s.success())
                        .unwrap_or(false);
                    if socket_exists && service_active {
                        c.status = kryx::domain::CapabilityStatus::Ready;
                        c.reason = Some(
                            "KVE: Incus daemon active (unix.socket + incus.service OK)".into(),
                        );
                    } else if !socket_exists && !service_active {
                        c.status = kryx::domain::CapabilityStatus::Stub;
                        c.reason = Some("KVE: Incus daemon not active".into());
                    } else {
                        // Estado inconsistente (socket exists mas service down, ou vice-versa)
                        c.status = kryx::domain::CapabilityStatus::Partial;
                        c.reason = Some(format!(
                            "KVE: inconsistente (socket={}, service={})",
                            socket_exists, service_active
                        ));
                    }
                }
                _ => {}
            }
            c
        })
        .collect()
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
        // KCR-TEST-1: registry tem 50 capabilities (atualizado em 2026-08-02,
        // antes era 43 — drift documentado por audit 2026-07-27 §9).
        assert_eq!(first.capabilities.len(), 50);
        assert!(first.capabilities.iter().any(|capability| {
            capability.id == "storage.topology.raid"
                && capability.status == kryx::domain::CapabilityStatus::Unsupported
        }));
        // KVE: virtualization.incus deve existir e ter status Ready/Stub/Partial
        let kve = first
            .capabilities
            .iter()
            .find(|c| c.id == "virtualization.incus")
            .expect("virtualization.incus deve existir no registry");
        assert!(
            matches!(
                kve.status,
                kryx::domain::CapabilityStatus::Ready
                    | kryx::domain::CapabilityStatus::Stub
                    | kryx::domain::CapabilityStatus::Partial
            ),
            "KVE status deve ser Ready/Stub/Partial (achou: {:?})",
            kve.status
        );
        assert_eq!(kve.domain, kryx::domain::CapabilityDomain::Virtualization);
        let json = serde_json::to_string(&first).unwrap();
        for secret in ["password", "secret", "token", "privateKey"] {
            assert!(!json.to_lowercase().contains(&secret.to_lowercase()));
        }
    }
}
