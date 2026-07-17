use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::{fs, time::sleep};

/// Capacidades não destrutivas expostas pela API v2 do daemon.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCapabilities {
    pub plan: bool,
    pub secrets: bool,
    pub preflight: bool,
}

/// Estado público e sanitizado da API v2 do daemon.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub api_version: &'static str,
    pub ready: bool,
    pub capabilities: SystemCapabilities,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostMetrics {
    pub sampled_at_ms: u128,
    pub cpu_percent: f32,
    pub memory: MemoryMetrics,
    pub source: &'static str,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMetrics {
    pub total_mb: u64,
    pub free_mb: u64,
    pub used_mb: u64,
    pub used_percent: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct CpuSnapshot {
    idle: u64,
    total: u64,
}

/// Constrói as rotas de consulta do estado da API v2.
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/system/status", get(system_status))
        .route("/metrics/host", get(host_metrics))
}

/// Retorna apenas o estado e as capacidades declaradas da API.
///
/// O handler não consulta dispositivos, processos, credenciais ou caminhos do
/// host, portanto pode ser usado como uma verificação de disponibilidade sem
/// produzir efeitos colaterais.
pub async fn system_status() -> Json<SystemStatus> {
    Json(current_status())
}

pub async fn host_metrics() -> Json<HostMetrics> {
    Json(collect_host_metrics().await)
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

async fn collect_host_metrics() -> HostMetrics {
    let first_cpu = read_cpu_snapshot().await.ok();
    sleep(Duration::from_millis(120)).await;
    let second_cpu = read_cpu_snapshot().await.ok();
    let memory = read_memory_metrics()
        .await
        .unwrap_or_else(|_| mock_memory_metrics());

    let cpu_percent = first_cpu
        .zip(second_cpu)
        .and_then(|(first, second)| cpu_percent_between(first, second))
        .unwrap_or_else(mock_cpu_percent);

    HostMetrics {
        sampled_at_ms: now_ms(),
        cpu_percent,
        memory,
        source: "procfs-or-dynamic-mock",
    }
}

async fn read_cpu_snapshot() -> Result<CpuSnapshot, String> {
    let stat = fs::read_to_string("/proc/stat")
        .await
        .map_err(|e| format!("failed to read /proc/stat: {e}"))?;
    parse_cpu_snapshot(&stat).ok_or_else(|| "missing aggregate cpu line".to_string())
}

async fn read_memory_metrics() -> Result<MemoryMetrics, String> {
    let meminfo = fs::read_to_string("/proc/meminfo")
        .await
        .map_err(|e| format!("failed to read /proc/meminfo: {e}"))?;
    parse_memory_metrics(&meminfo).ok_or_else(|| "missing memory totals".to_string())
}

fn parse_cpu_snapshot(stat: &str) -> Option<CpuSnapshot> {
    let line = stat.lines().find(|line| line.starts_with("cpu "))?;
    let values: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|value| value.parse::<u64>().ok())
        .collect();

    if values.len() < 4 {
        return None;
    }

    let idle = values.get(3).copied().unwrap_or(0) + values.get(4).copied().unwrap_or(0);
    let total = values.iter().copied().sum();

    Some(CpuSnapshot { idle, total })
}

fn cpu_percent_between(first: CpuSnapshot, second: CpuSnapshot) -> Option<f32> {
    let total_delta = second.total.checked_sub(first.total)?;
    let idle_delta = second.idle.checked_sub(first.idle)?;

    if total_delta == 0 || idle_delta > total_delta {
        return None;
    }

    let active = total_delta - idle_delta;
    Some(round_percent((active as f32 / total_delta as f32) * 100.0))
}

fn parse_memory_metrics(meminfo: &str) -> Option<MemoryMetrics> {
    let mut total_kib = None;
    let mut available_kib = None;

    for line in meminfo.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            total_kib = parse_kib_value(rest);
        } else if let Some(rest) = line.strip_prefix("MemAvailable:") {
            available_kib = parse_kib_value(rest);
        }
    }

    let total_mb = total_kib? / 1024;
    let free_mb = available_kib? / 1024;
    let used_mb = total_mb.saturating_sub(free_mb);
    let used_percent = if total_mb == 0 {
        0.0
    } else {
        round_percent((used_mb as f32 / total_mb as f32) * 100.0)
    };

    Some(MemoryMetrics {
        total_mb,
        free_mb,
        used_mb,
        used_percent,
    })
}

fn parse_kib_value(value: &str) -> Option<u64> {
    value
        .split_whitespace()
        .next()
        .and_then(|number| number.parse::<u64>().ok())
}

fn mock_cpu_percent() -> f32 {
    let phase = (now_ms() / 3_000) % 60;
    round_percent(18.0 + phase as f32)
}

fn mock_memory_metrics() -> MemoryMetrics {
    let total_mb: u64 = 16_384;
    let used_mb = 5_000 + ((now_ms() / 3_000) % 2_000) as u64;
    let free_mb = total_mb.saturating_sub(used_mb);
    let used_percent = round_percent((used_mb as f32 / total_mb as f32) * 100.0);

    MemoryMetrics {
        total_mb,
        free_mb,
        used_mb,
        used_percent,
    }
}

fn round_percent(value: f32) -> f32 {
    (value * 10.0).round() / 10.0
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{cpu_percent_between, current_status, parse_cpu_snapshot, parse_memory_metrics, CpuSnapshot};

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

    #[test]
    fn parses_proc_stat_aggregate_cpu_line() {
        let snapshot = parse_cpu_snapshot("cpu  10 20 30 40 5 0 0 0 0 0\ncpu0 1 2 3 4")
            .expect("cpu snapshot");

        assert_eq!(snapshot.idle, 45);
        assert_eq!(snapshot.total, 105);
    }

    #[test]
    fn computes_cpu_percent_between_snapshots() {
        let percent = cpu_percent_between(
            CpuSnapshot { idle: 40, total: 100 },
            CpuSnapshot { idle: 60, total: 200 },
        )
        .expect("cpu percent");

        assert_eq!(percent, 80.0);
    }

    #[test]
    fn parses_proc_meminfo_total_and_available() {
        let memory = parse_memory_metrics("MemTotal:       16384 kB\nMemAvailable:    4096 kB\n")
            .expect("memory metrics");

        assert_eq!(memory.total_mb, 16);
        assert_eq!(memory.free_mb, 4);
        assert_eq!(memory.used_mb, 12);
        assert_eq!(memory.used_percent, 75.0);
    }
}
