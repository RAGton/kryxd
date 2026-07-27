//! Serviço de domínio do KVE.
//!
//! Camada entre a API HTTP e o `IncusProvider`. Responsável por:
//! - separar instâncias em containers vs VMs;
//! - normalizar erros em `KveErrorBody`;
//! - nunca retornar lista vazia fingindo Incus funcionando;
//! - propagar erros estruturados em vez de panic.

use kryx::domain::{KveErrorBody, KveHealth, VirtualInstance, VirtualStorage};

use crate::providers::{IncusError, IncusProvider};

/// Serviço de alto nível consumido pelos handlers `src/api/v2/kve.rs`.
#[derive(Clone)]
pub struct KveService {
    provider: IncusProvider,
}

impl KveService {
    pub fn new(provider: IncusProvider) -> Self {
        Self { provider }
    }

    pub fn provider(&self) -> &IncusProvider {
        &self.provider
    }

    /// Verifica a saúde do backend Incus.
    pub async fn health(&self) -> Result<KveHealth, KveErrorBody> {
        self.provider.health().await.map_err(translate)
    }

    /// Lista todas as instâncias (VMs + containers).
    pub async fn list_instances(&self) -> Result<Vec<VirtualInstance>, KveErrorBody> {
        self.provider.list_instances().await.map_err(translate)
    }

    /// Lista apenas containers.
    pub async fn list_containers(&self) -> Result<Vec<VirtualInstance>, KveErrorBody> {
        let all = self.list_instances().await?;
        Ok(all
            .into_iter()
            .filter(|i| matches!(i.kind, kryx::domain::InstanceKind::Container))
            .collect())
    }

    /// Lista apenas VMs.
    pub async fn list_vms(&self) -> Result<Vec<VirtualInstance>, KveErrorBody> {
        let all = self.list_instances().await?;
        Ok(all
            .into_iter()
            .filter(|i| matches!(i.kind, kryx::domain::InstanceKind::VirtualMachine))
            .collect())
    }

    /// Lista storage pools.
    pub async fn list_storage(&self) -> Result<Vec<VirtualStorage>, KveErrorBody> {
        self.provider.list_storage().await.map_err(translate)
    }
}

fn translate(err: IncusError) -> KveErrorBody {
    let code = err.code().to_string();
    KveErrorBody {
        status: "unavailable",
        code,
        message: err.to_string(),
        source: Some(err.code().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kryx::domain::{InstanceKind, InstanceState};
    use std::path::PathBuf;
    use std::time::Duration;

    fn dummy_service() -> KveService {
        let provider = IncusProvider::new(crate::providers::IncusConfig {
            socket: PathBuf::from("/tmp/does-not-exist.sock"),
            timeout: Duration::from_millis(100),
            max_response_bytes: 4096,
        });
        KveService::new(provider)
    }

    #[tokio::test]
    async fn health_returns_unavailable_when_socket_missing() {
        let svc = dummy_service();
        let err = svc.health().await.expect_err("socket ausente deve falhar");
        assert_eq!(err.status, "unavailable");
        assert_eq!(err.code, "incus_unavailable");
        assert!(err.message.contains("socket"));
    }

    #[tokio::test]
    async fn list_instances_propagates_unavailable() {
        let svc = dummy_service();
        let err = svc
            .list_instances()
            .await
            .expect_err("socket ausente deve falhar");
        assert_eq!(err.code, "incus_unavailable");
    }

    #[tokio::test]
    async fn list_containers_vms_split_returns_empty_when_provider_errors() {
        // Quando o provider falha, list_containers/vms devem propagar o
        // erro em vez de retornar lista vazia (que poderia ser confundida
        // com "nenhum container rodando").
        let svc = dummy_service();
        let err = svc.list_containers().await.expect_err("deve propagar erro");
        assert_eq!(err.code, "incus_unavailable");
        let err = svc.list_vms().await.expect_err("deve propagar erro");
        assert_eq!(err.code, "incus_unavailable");
    }

    #[test]
    fn translate_maps_codes() {
        let cases = [
            (IncusError::SocketUnavailable("/x".into()), "incus_unavailable"),
            (IncusError::Timeout(Duration::from_millis(1)), "incus_timeout"),
            (IncusError::InvalidResponse("bad".into()), "incus_invalid_response"),
            (
                IncusError::HttpStatus {
                    status: 500,
                    body: "x".into(),
                },
                "incus_http_error",
            ),
        ];
        for (err, expected) in cases {
            let body = translate(err);
            assert_eq!(body.code, expected, "code for {expected}");
        }
    }

    #[test]
    fn unreachable_filter_logic_consistent_with_domain() {
        // Pequeno teste de invariante: se um provider retornasse uma lista
        // mista (CT + VM), o filtro binário sempre as separa sem overlap.
        let all = vec![
            VirtualInstance {
                name: "ct".into(),
                kind: InstanceKind::Container,
                state: InstanceState::Running,
                ipv4: vec![],
                image: None,
                architecture: None,
                cpu: None,
                memory_bytes: None,
            },
            VirtualInstance {
                name: "vm".into(),
                kind: InstanceKind::VirtualMachine,
                state: InstanceState::Stopped,
                ipv4: vec![],
                image: None,
                architecture: None,
                cpu: None,
                memory_bytes: None,
            },
        ];
        let ct: Vec<_> = all
            .iter()
            .cloned()
            .filter(|i| matches!(i.kind, InstanceKind::Container))
            .collect();
        let vm: Vec<_> = all
            .iter()
            .cloned()
            .filter(|i| matches!(i.kind, InstanceKind::VirtualMachine))
            .collect();
        assert_eq!(ct.len(), 1);
        assert_eq!(vm.len(), 1);
        assert_ne!(ct[0].name, vm[0].name);
    }
}