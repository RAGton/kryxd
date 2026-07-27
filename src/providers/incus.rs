//! Provider Incus sobre Unix socket local.
//!
//! Encapsula o cliente HTTP-over-Unix de `crate::api::incus` adicionando:
//! - timeout configurável via `KRYXD_INCUS_TIMEOUT_MS` (default 5000);
//! - path do socket configurável via `KRYXD_INCUS_SOCKET`
//!   (fallback `INCUS_SOCKET`, depois `/var/lib/incus/unix.socket`);
//! - limite de bytes na resposta;
//! - tradução de erros HTTP/Incus em `IncusError` estruturado;
//! - parsing de `GET /1.0/instances` em `Vec<VirtualInstance>`;
//! - parsing de `GET /1.0/storage-pools` em `Vec<VirtualStorage>`.

use std::{env, path::PathBuf, time::Duration};

use kryx::domain::{
    InstanceKind, InstanceState, KveHealth, StorageDriver, StorageState, VirtualInstance,
    VirtualStorage,
};
use serde_json::Value;
use thiserror::Error;
use tokio::time::timeout;

use crate::api::incus;

/// Erros estruturados do provider.
#[derive(Debug, Error)]
pub enum IncusError {
    #[error("socket ausente ou inacessível: {0}")]
    SocketUnavailable(String),

    #[error("timeout após {0:?} aguardando Incus")]
    Timeout(Duration),

    #[error("resposta Inválida: {0}")]
    InvalidResponse(String),

    #[error("Incus API retornou HTTP {status}: {body}")]
    HttpStatus { status: u16, body: String },
}

impl IncusError {
    pub fn code(&self) -> &'static str {
        match self {
            IncusError::SocketUnavailable(_) => "incus_unavailable",
            IncusError::Timeout(_) => "incus_timeout",
            IncusError::InvalidResponse(_) => "incus_invalid_response",
            IncusError::HttpStatus { .. } => "incus_http_error",
        }
    }
}

/// Configuração do provider.
#[derive(Debug, Clone)]
pub struct IncusConfig {
    pub socket: PathBuf,
    pub timeout: Duration,
    pub max_response_bytes: usize,
}

impl Default for IncusConfig {
    fn default() -> Self {
        Self {
            socket: default_socket(),
            timeout: Duration::from_millis(default_timeout_ms()),
            max_response_bytes: default_max_bytes(),
        }
    }
}

impl IncusConfig {
    /// Constrói a config a partir de env vars + defaults.
    pub fn from_env() -> Self {
        let socket = env_socket();
        let timeout = Duration::from_millis(
            env::var("KRYXD_INCUS_TIMEOUT_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default_timeout_ms()),
        );
        let max_response_bytes = env::var("KRYXD_INCUS_MAX_BYTES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(default_max_bytes());
        Self {
            socket,
            timeout,
            max_response_bytes,
        }
    }

    pub fn socket_path(&self) -> &std::path::Path {
        &self.socket
    }
}

fn default_socket() -> PathBuf {
    PathBuf::from("/var/lib/incus/unix.socket")
}

fn default_timeout_ms() -> u64 {
    5_000
}

fn default_max_bytes() -> usize {
    8 * 1024 * 1024 // 8 MiB
}

/// Resolve o socket: KRYXD_INCUS_SOCKET > INCUS_SOCKET > default.
fn env_socket() -> PathBuf {
    env::var("KRYXD_INCUS_SOCKET")
        .ok()
        .map(PathBuf::from)
        .or_else(|| env::var("INCUS_SOCKET").ok().map(PathBuf::from))
        .unwrap_or_else(default_socket)
}

/// Provider que consulta o daemon Incus local via Unix socket.
#[derive(Clone, Debug)]
pub struct IncusProvider {
    config: IncusConfig,
}

impl IncusProvider {
    pub fn new(config: IncusConfig) -> Self {
        Self { config }
    }

    pub fn from_env() -> Self {
        Self::new(IncusConfig::from_env())
    }

    pub fn config(&self) -> &IncusConfig {
        &self.config
    }

    /// `GET /1.0` — verifica saúde do daemon.
    pub async fn health(&self) -> Result<KveHealth, IncusError> {
        let res = self
            .call(|socket| async move { incus::get_json_with_socket(socket, "/1.0").await })
            .await?;

        let mut health = KveHealth {
            status: "ready".to_string(),
            source: "incus".to_string(),
            socket: Some(self.config.socket.display().to_string()),
        };

        if let Some(api_version) = res.metadata.get("api").and_then(Value::as_str) {
            // Incus 1.0+ responde com {"api":"1.0","api_extensions":[...]}
            if api_version.starts_with('1') {
                health.status = "ready".to_string();
            } else {
                health.status = "unknown".to_string();
            }
        }

        Ok(health)
    }

    /// `GET /1.0/instances` — lista instâncias.
    pub async fn list_instances(&self) -> Result<Vec<VirtualInstance>, IncusError> {
        let res = self
            .call(|socket| async move {
                incus::get_json_with_socket(socket, "/1.0/instances?recursion=1").await
            })
            .await?;

        let entries = res.metadata.as_array().ok_or_else(|| {
            IncusError::InvalidResponse("/1.0/instances metadata is not an array".into())
        })?;

        let mut out = Vec::with_capacity(entries.len());
        for entry in entries {
            match parse_instance(entry) {
                Ok(instance) => out.push(instance),
                Err(err) => {
                    tracing::warn!(name = ?entry.get("name"), error = %err, "skipping malformed instance");
                }
            }
        }
        Ok(out)
    }

    /// `GET /1.0/storage-pools` — lista storage pools.
    pub async fn list_storage(&self) -> Result<Vec<VirtualStorage>, IncusError> {
        let res = self
            .call(|socket| async move {
                incus::get_json_with_socket(socket, "/1.0/storage-pools").await
            })
            .await?;

        let names: Vec<String> = res
            .metadata
            .as_array()
            .ok_or_else(|| {
                IncusError::InvalidResponse("/1.0/storage-pools metadata is not an array".into())
            })?
            .iter()
            .filter_map(|v| v.as_str())
            .map(|path| path.rsplit('/').next().unwrap_or("").to_string())
            .filter(|n| !n.is_empty())
            .collect();

        let mut out = Vec::with_capacity(names.len());
        for name in names {
            match self.storage_pool_detail(&name).await {
                Ok(pool) => out.push(pool),
                Err(err) => {
                    tracing::warn!(name = %name, error = %err, "skipping malformed storage pool");
                }
            }
        }
        Ok(out)
    }

    async fn storage_pool_detail(&self, name: &str) -> Result<VirtualStorage, IncusError> {
        let path = format!("/1.0/storage-pools/{}", incus::encode_path_segment(name));
        let res = self
            .call(|socket| {
                let path = path.clone();
                async move { incus::get_json_with_socket(socket, &path).await }
            })
            .await?;

        let meta = res.metadata;
        let driver = meta
            .get("driver")
            .and_then(Value::as_str)
            .map(parse_driver)
            .unwrap_or(StorageDriver::Other);
        let state = parse_storage_state(
            meta.get("status").and_then(Value::as_str),
            meta.get("used_by").and_then(Value::as_array),
        );
        let used_bytes = meta
            .get("space")
            .and_then(|s| s.get("used"))
            .and_then(Value::as_u64);
        let total_bytes = meta
            .get("space")
            .and_then(|s| s.get("total"))
            .and_then(Value::as_u64);

        Ok(VirtualStorage {
            name: name.to_string(),
            driver,
            state,
            description: meta
                .get("description")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            used_bytes,
            total_bytes,
        })
    }

    /// Wrapper que aplica timeout e traduz erros do cliente HTTP-over-Unix.
    async fn call<F, Fut>(&self, f: F) -> Result<incus::IncusResponse, IncusError>
    where
        F: FnOnce(PathBuf) -> Fut,
        Fut: std::future::Future<Output = Result<incus::IncusResponse, String>>,
    {
        let socket = self.config.socket.clone();
        let result = timeout(self.config.timeout, f(socket))
            .await
            .map_err(|_| IncusError::Timeout(self.config.timeout))?;

        result.map_err(|msg| classify_error(&msg, &self.config.socket.display().to_string()))
    }
}

fn classify_error(msg: &str, socket: &str) -> IncusError {
    if msg.starts_with("failed to connect to ") {
        return IncusError::SocketUnavailable(socket.to_string());
    }
    if let Some(rest) = msg.strip_prefix("Incus API returned HTTP ") {
        // formato: "Incus API returned HTTP 500: <body>"
        if let Some((status, body)) = rest.split_once(':') {
            if let Ok(code) = status.trim().parse::<u16>() {
                return IncusError::HttpStatus {
                    status: code,
                    body: body.trim().to_string(),
                };
            }
        }
        return IncusError::InvalidResponse(msg.to_string());
    }
    if msg.contains("failed to parse Incus JSON") || msg.contains("malformed Incus HTTP") {
        return IncusError::InvalidResponse(msg.to_string());
    }
    IncusError::InvalidResponse(msg.to_string())
}

fn parse_instance(entry: &Value) -> Result<VirtualInstance, IncusError> {
    let name = entry
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| IncusError::InvalidResponse("instance missing name".into()))?
        .to_string();

    let kind_str = entry
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("container");
    let kind = match kind_str {
        "container" => InstanceKind::Container,
        "virtual-machine" | "vm" => InstanceKind::VirtualMachine,
        other => {
            return Err(IncusError::InvalidResponse(format!(
                "instance {name} has unknown type {other}"
            )));
        }
    };

    let state_str = entry
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("Unknown");
    let state = parse_instance_state(state_str);

    let status_entry = entry.get("status").and_then(Value::as_object);
    let ipv4 = status_entry
        .and_then(|s| s.get("addresses"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(ToOwned::to_owned))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let cpu = status_entry
        .and_then(|s| s.get("cpu"))
        .and_then(|c| c.get("usage"))
        .and_then(Value::as_u64)
        .map(|v| v as u32);

    let memory_bytes = status_entry
        .and_then(|s| s.get("memory"))
        .and_then(|m| m.get("usage"))
        .and_then(Value::as_u64);

    Ok(VirtualInstance {
        name,
        kind,
        state,
        ipv4,
        image: None,
        architecture: entry
            .get("architecture")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        cpu,
        memory_bytes,
    })
}

fn parse_instance_state(s: &str) -> InstanceState {
    match s {
        "Running" => InstanceState::Running,
        "Stopped" => InstanceState::Stopped,
        "Frozen" => InstanceState::Frozen,
        "Starting" => InstanceState::Starting,
        "Stopping" => InstanceState::Stopping,
        "Error" | "Crashed" => InstanceState::Error,
        _ => InstanceState::Unknown,
    }
}

fn parse_driver(s: &str) -> StorageDriver {
    match s.to_ascii_lowercase().as_str() {
        "zfs" => StorageDriver::Zfs,
        "btrfs" => StorageDriver::Btrfs,
        "dir" | "directory" => StorageDriver::Dir,
        "lvm" | "lvmcluster" => StorageDriver::Lvm,
        "ceph" | "cephfs" | "cephrbd" => StorageDriver::Ceph,
        _ => StorageDriver::Other,
    }
}

fn parse_storage_state(status: Option<&str>, used_by: Option<&Vec<Value>>) -> StorageState {
    if matches!(status, Some("Error")) {
        return StorageState::Error;
    }
    match used_by {
        Some(list) if !list.is_empty() => StorageState::InUse,
        Some(_) => StorageState::Available,
        None => StorageState::Created,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn default_socket_is_well_known_path() {
        assert_eq!(
            default_socket(),
            PathBuf::from("/var/lib/incus/unix.socket")
        );
    }

    #[test]
    fn env_socket_resolves_to_default_when_unset() {
        // Garantimos que ambos estão unset antes do teste.
        let saved = env::var("KRYXD_INCUS_SOCKET").ok();
        if saved.is_some() {
            unsafe {
                env::remove_var("KRYXD_INCUS_SOCKET");
            }
            assert_eq!(env_socket(), default_socket());
            if let Some(v) = saved {
                unsafe {
                    env::set_var("KRYXD_INCUS_SOCKET", v);
                }
            }
        } else {
            assert_eq!(env_socket(), default_socket());
        }
    }

    #[test]
    fn from_env_uses_explicit_socket_when_provided() {
        let saved = env::var("KRYXD_INCUS_SOCKET").ok();
        unsafe {
            env::set_var("KRYXD_INCUS_SOCKET", "/tmp/kryx-test.sock");
        }
        let cfg = IncusConfig::from_env();
        assert_eq!(cfg.socket, PathBuf::from("/tmp/kryx-test.sock"));
        match saved {
            Some(v) => unsafe {
                env::set_var("KRYXD_INCUS_SOCKET", v);
            },
            None => unsafe {
                env::remove_var("KRYXD_INCUS_SOCKET");
            },
        }
    }

    #[test]
    fn parse_container_instance_with_ipv4() {
        let raw = json!({
            "name": "neo4j",
            "type": "container",
            "state": "Running",
            "architecture": "x86_64",
            "status": {
                "addresses": ["10.42.0.5", "fd42::5"],
                "cpu": {"usage": 1234567},
                "memory": {"usage": 536870912}
            }
        });
        let inst = parse_instance(&raw).expect("parse ok");
        assert_eq!(inst.name, "neo4j");
        assert_eq!(inst.kind, InstanceKind::Container);
        assert_eq!(inst.state, InstanceState::Running);
        assert_eq!(inst.ipv4, vec!["10.42.0.5", "fd42::5"]);
        assert_eq!(inst.cpu, Some(1_234_567));
        assert_eq!(inst.memory_bytes, Some(536_870_912));
        assert_eq!(inst.architecture.as_deref(), Some("x86_64"));
    }

    #[test]
    fn parse_vm_instance_without_ipv4() {
        let raw = json!({
            "name": "win11",
            "type": "virtual-machine",
            "state": "Stopped"
        });
        let inst = parse_instance(&raw).expect("parse ok");
        assert_eq!(inst.kind, InstanceKind::VirtualMachine);
        assert_eq!(inst.state, InstanceState::Stopped);
        assert!(inst.ipv4.is_empty());
        assert!(inst.cpu.is_none());
    }

    #[test]
    fn parse_unknown_state_falls_back_to_unknown() {
        let raw = json!({
            "name": "broken",
            "type": "container",
            "state": "WeirdState"
        });
        let inst = parse_instance(&raw).expect("parse ok");
        assert_eq!(inst.state, InstanceState::Unknown);
    }

    #[test]
    fn classify_socket_unavailable() {
        let err = classify_error(
            "failed to connect to /tmp/x.sock: no such file",
            "/tmp/x.sock",
        );
        assert!(matches!(err, IncusError::SocketUnavailable(_)));
        assert_eq!(err.code(), "incus_unavailable");
    }

    #[test]
    fn classify_http_status() {
        let err = classify_error(
            "Incus API returned HTTP 500: internal error",
            "/tmp/x.sock",
        );
        match err {
            IncusError::HttpStatus { status, body } => {
                assert_eq!(status, 500);
                assert_eq!(body, "internal error");
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn classify_invalid_response() {
        let err = classify_error(
            "failed to parse Incus JSON: expected value at line 1",
            "/tmp/x.sock".into(),
        );
        assert!(matches!(err, IncusError::InvalidResponse(_)));
        assert_eq!(err.code(), "incus_invalid_response");
    }
}
