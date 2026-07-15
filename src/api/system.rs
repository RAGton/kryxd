use axum::{Json, Router, routing::get};
use serde::Serialize;

/// Capacidades não destrutivas expostas pela API v2 do instalador.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCapabilities {
    pub plan: bool,
    pub secrets: bool,
    pub preflight: bool,
}

/// Estado público e sanitizado da API v2 do instalador.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub api_version: &'static str,
    pub ready: bool,
    pub capabilities: SystemCapabilities,
}

/// Constrói as rotas de consulta do estado da API v2.
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new().route("/system/status", get(system_status))
}

/// Retorna apenas o estado e as capacidades declaradas da API.
///
/// O handler não consulta dispositivos, processos, credenciais ou caminhos do
/// host, portanto pode ser usado como uma verificação de disponibilidade sem
/// produzir efeitos colaterais.
pub async fn system_status() -> Json<SystemStatus> {
    Json(current_status())
}

fn current_status() -> SystemStatus {
    SystemStatus {
        api_version: "v2",
        ready: true,
        capabilities: SystemCapabilities {
            plan: true,
            secrets: true,
            preflight: true,
        },
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::current_status;

    #[test]
    fn status_exposes_only_declared_api_capabilities() {
        let serialized = serde_json::to_value(current_status()).expect("status deve serializar");

        assert_eq!(
            serialized,
            json!({
                "apiVersion": "v2",
                "ready": true,
                "capabilities": {
                    "plan": true,
                    "secrets": true,
                    "preflight": true
                }
            })
        );
    }
}
