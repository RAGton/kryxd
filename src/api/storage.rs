//! Storage API - read-only Storage Command Center endpoints for Incus.
//!
//! SECURITY: read-only endpoints. This module only queries the local Incus API
//! and generates declarative replication plans; it does not execute ZFS,
//! syncoid, or filesystem mutation commands.

use std::env;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    Json,
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use tracing::{debug, info};

use crate::api::v1::rbac::RequireCoreRole;
use crate::{AppState, ErrorResponse};

pub fn router() -> axum::Router<Arc<AppState>> {
    axum::Router::new()
        .route("/pools", get(get_pools))
        .route("/ceph/status", get(ceph_status))
        .route("/ceph/osds", get(ceph_osds))
        .route("/replication/status", get(replication_status))
        .route("/replication/plan", post(generate_replication_plan))
}

/// Response structure for the KCP Storage Command Center.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct StoragePool {
    pub name: String,
    pub driver: String,
    pub status: String,
    pub locations: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_size: Option<u64>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct ReplicationStatus {
    pub mode: String,
    pub snapshots: Vec<SnapshotStatus>,
    pub replications: Vec<ReplicationJobStatus>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct SnapshotStatus {
    pub dataset: String,
    pub snapshot: String,
    pub created_at: String,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct ReplicationJobStatus {
    pub source: String,
    pub target: String,
    pub frequency: String,
    pub last_run: Option<String>,
    pub status: String,
}

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ReplicationPlanRequest {
    pub source_pool: String,
    pub target_host: String,
    pub frequency: String,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct ReplicationPlanResponse {
    pub name: String,
    pub source: String,
    pub target: String,
    pub frequency: String,
    pub ssh_key_path: String,
    pub nix_config: String,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephClusterStatus {
    pub health: String,
    pub health_summary: String,
    pub quorum: CephQuorumStatus,
    pub managers: CephManagerStatus,
    pub capacity: CephCapacity,
    pub placement_groups: CephPlacementGroups,
    pub pools: Vec<CephPoolStatus>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephQuorumStatus {
    pub mon_total: u8,
    pub mon_in_quorum: u8,
    pub quorum_names: Vec<String>,
    pub monitors: Vec<CephMonitor>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephMonitor {
    pub name: String,
    pub node: String,
    pub address: String,
    pub rank: u8,
    pub state: String,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephManagerStatus {
    pub active_name: String,
    pub active_node: String,
    pub standbys: Vec<CephManagerStandby>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephManagerStandby {
    pub name: String,
    pub node: String,
    pub state: String,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephCapacity {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub used_percent: u8,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephPlacementGroups {
    pub total: u32,
    pub active_clean: u32,
    pub degraded: u32,
    pub stuck: u32,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephPoolStatus {
    pub name: String,
    pub pool_type: String,
    pub pg_num: u16,
    pub size: u8,
    pub min_size: u8,
    pub used_bytes: u64,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CephOsd {
    pub id: u32,
    pub node: String,
    pub device: String,
    pub device_class: String,
    pub up: bool,
    pub in_cluster: bool,
    pub status: String,
    pub reweight: u16,
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub iops_read: u32,
    pub iops_write: u32,
    pub temperature_c: u8,
}

#[derive(Deserialize)]
struct IncusResponse {
    metadata: Value,
}

/// GET /api/v2/storage/pools
///
/// Proxies read-only storage pool data from the local Incus REST API.
async fn get_pools(
    _rbac: RequireCoreRole,
) -> Result<Json<Vec<StoragePool>>, (StatusCode, Json<ErrorResponse>)> {
    debug!("Querying local Incus storage pools API");

    let pool_refs = incus_get_json("/1.0/storage-pools")
        .await
        .map_err(storage_error)?;

    let mut pools = Vec::new();
    for pool_path in storage_pool_paths(&pool_refs.metadata) {
        let pool = incus_get_json(&pool_path).await.map_err(storage_error)?;
        if let Some(mut mapped) = map_pool(&pool.metadata) {
            let resources_path = format!("{}/resources", pool_path.trim_end_matches('/'));
            if let Ok(resources) = incus_get_json(&resources_path).await {
                apply_resources(&mut mapped, &resources.metadata);
            }
            pools.push(mapped);
        }
    }

    info!("Found {} Incus storage pools", pools.len());
    Ok(Json(pools))
}

/// GET /api/v2/storage/replication/status
///
/// Returns structured read-only replication state. Physical snapshot inspection
/// is intentionally deferred; this endpoint is safe for UI planning flows.
async fn replication_status(_rbac: RequireCoreRole) -> Json<ReplicationStatus> {
    Json(ReplicationStatus {
        mode: "planned-only".to_string(),
        snapshots: Vec::new(),
        replications: Vec::new(),
    })
}

/// GET /api/v2/storage/ceph/status
///
/// Returns a strongly typed read-only Ceph topology snapshot. This is mocked in
/// phase one and shaped for a future real cluster adapter.
async fn ceph_status(_rbac: RequireCoreRole) -> Json<CephClusterStatus> {
    Json(mock_ceph_status())
}

/// GET /api/v2/storage/ceph/osds
///
/// Returns simulated OSD topology with node/device mapping. No Ceph or disk
/// command is executed here.
async fn ceph_osds(_rbac: RequireCoreRole) -> Json<Vec<CephOsd>> {
    Json(mock_ceph_osds())
}

fn mock_ceph_status() -> CephClusterStatus {
    CephClusterStatus {
        health: "HEALTH_WARN".to_string(),
        health_summary: "1 OSD nearfull; all monitors in quorum".to_string(),
        quorum: CephQuorumStatus {
            mon_total: 3,
            mon_in_quorum: 3,
            quorum_names: vec![
                "mon-a".to_string(),
                "mon-b".to_string(),
                "mon-c".to_string(),
            ],
            monitors: vec![
                CephMonitor {
                    name: "mon-a".to_string(),
                    node: "pve-alpha".to_string(),
                    address: "10.42.0.11:6789".to_string(),
                    rank: 0,
                    state: "quorum".to_string(),
                },
                CephMonitor {
                    name: "mon-b".to_string(),
                    node: "pve-beta".to_string(),
                    address: "10.42.0.12:6789".to_string(),
                    rank: 1,
                    state: "quorum".to_string(),
                },
                CephMonitor {
                    name: "mon-c".to_string(),
                    node: "pve-gamma".to_string(),
                    address: "10.42.0.13:6789".to_string(),
                    rank: 2,
                    state: "quorum".to_string(),
                },
            ],
        },
        managers: CephManagerStatus {
            active_name: "mgr-a".to_string(),
            active_node: "pve-alpha".to_string(),
            standbys: vec![
                CephManagerStandby {
                    name: "mgr-b".to_string(),
                    node: "pve-beta".to_string(),
                    state: "standby".to_string(),
                },
                CephManagerStandby {
                    name: "mgr-c".to_string(),
                    node: "pve-gamma".to_string(),
                    state: "standby".to_string(),
                },
            ],
        },
        capacity: CephCapacity {
            total_bytes: 12 * 1024 * 1024 * 1024 * 1024,
            used_bytes: 7 * 1024 * 1024 * 1024 * 1024,
            available_bytes: 5 * 1024 * 1024 * 1024 * 1024,
            used_percent: 58,
        },
        placement_groups: CephPlacementGroups {
            total: 256,
            active_clean: 248,
            degraded: 8,
            stuck: 0,
        },
        pools: vec![
            CephPoolStatus {
                name: "kve-rbd".to_string(),
                pool_type: "rbd".to_string(),
                pg_num: 128,
                size: 3,
                min_size: 2,
                used_bytes: 5 * 1024 * 1024 * 1024 * 1024,
            },
            CephPoolStatus {
                name: "kve-cephfs".to_string(),
                pool_type: "cephfs".to_string(),
                pg_num: 128,
                size: 3,
                min_size: 2,
                used_bytes: 2 * 1024 * 1024 * 1024 * 1024,
            },
        ],
    }
}

fn mock_ceph_osds() -> Vec<CephOsd> {
    vec![
        CephOsd {
            id: 0,
            node: "pve-alpha".to_string(),
            device: "/dev/disk/by-id/nvme-KVE_OSD_A0".to_string(),
            device_class: "nvme".to_string(),
            up: true,
            in_cluster: true,
            status: "UP/IN".to_string(),
            reweight: 100,
            used_bytes: 1_900_000_000_000,
            total_bytes: 4_000_000_000_000,
            iops_read: 910,
            iops_write: 420,
            temperature_c: 43,
        },
        CephOsd {
            id: 1,
            node: "pve-alpha".to_string(),
            device: "/dev/disk/by-id/nvme-KVE_OSD_A1".to_string(),
            device_class: "nvme".to_string(),
            up: true,
            in_cluster: true,
            status: "UP/IN".to_string(),
            reweight: 100,
            used_bytes: 2_700_000_000_000,
            total_bytes: 4_000_000_000_000,
            iops_read: 1120,
            iops_write: 510,
            temperature_c: 47,
        },
        CephOsd {
            id: 2,
            node: "pve-beta".to_string(),
            device: "/dev/disk/by-id/nvme-KVE_OSD_B0".to_string(),
            device_class: "nvme".to_string(),
            up: true,
            in_cluster: true,
            status: "UP/IN".to_string(),
            reweight: 100,
            used_bytes: 2_100_000_000_000,
            total_bytes: 4_000_000_000_000,
            iops_read: 860,
            iops_write: 390,
            temperature_c: 41,
        },
        CephOsd {
            id: 3,
            node: "pve-gamma".to_string(),
            device: "/dev/disk/by-id/nvme-KVE_OSD_C0".to_string(),
            device_class: "nvme".to_string(),
            up: false,
            in_cluster: true,
            status: "DOWN/IN".to_string(),
            reweight: 100,
            used_bytes: 3_100_000_000_000,
            total_bytes: 4_000_000_000_000,
            iops_read: 0,
            iops_write: 0,
            temperature_c: 39,
        },
    ]
}

/// POST /api/v2/storage/replication/plan
///
/// Generates auditable NixOS configuration for future sanoid/syncoid replication.
/// It never invokes zfs, syncoid, ssh, or any filesystem-changing command.
async fn generate_replication_plan(
    _rbac: RequireCoreRole,
    Json(req): Json<ReplicationPlanRequest>,
) -> Result<Json<ReplicationPlanResponse>, (StatusCode, Json<ErrorResponse>)> {
    validate_replication_request(&req).map_err(bad_request)?;
    Ok(Json(build_replication_plan(&req)))
}

fn build_replication_plan(req: &ReplicationPlanRequest) -> ReplicationPlanResponse {
    let name = "replicate-pool".to_string();
    let source = req.source_pool.trim().to_string();
    let target = format!("syncoid@{}:{}/backup", req.target_host.trim(), source);
    let frequency = req.frequency.trim().to_string();
    let ssh_key_path = "/run/secrets/syncoid_key".to_string();
    let nix_config = render_replication_nix(&name, &source, &target, &frequency, &ssh_key_path);

    ReplicationPlanResponse {
        name,
        source,
        target,
        frequency,
        ssh_key_path,
        nix_config,
    }
}

fn render_replication_nix(
    name: &str,
    source: &str,
    target: &str,
    frequency: &str,
    ssh_key_path: &str,
) -> String {
    format!(
        r#"{{
  services.sanoid = {{
    enable = true;
    datasets.{source_q} = {{
      autosnap = true;
      autoprune = true;
      recursive = true;
      hourly = {hourly};
      daily = {daily};
      monthly = 3;
    }};
  }};

  services.syncoid = {{
    enable = true;
    commands.{name_q} = {{
      source = {source_q};
      target = {target_q};
      recursive = true;
      interval = {frequency_q};
      sshKey = {ssh_key_q};
    }};
  }};
}}"#,
        source_q = nix_string(source),
        target_q = nix_string(target),
        frequency_q = nix_string(frequency),
        ssh_key_q = nix_string(ssh_key_path),
        name_q = nix_string(name),
        hourly = if frequency == "hourly" { 24 } else { 0 },
        daily = if frequency == "daily" { 30 } else { 7 },
    )
}

fn validate_replication_request(req: &ReplicationPlanRequest) -> Result<(), String> {
    validate_dataset(&req.source_pool)?;
    validate_target_host(&req.target_host)?;
    validate_frequency(&req.frequency)?;
    Ok(())
}

fn validate_dataset(value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("source_pool is required".to_string());
    }
    if value.contains('@') || value.contains("..") || value.starts_with('/') {
        return Err(
            "source_pool must be a ZFS dataset path, not a snapshot or filesystem path".to_string(),
        );
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/' | ':'))
    {
        return Err("source_pool contains unsupported characters".to_string());
    }
    Ok(())
}

fn validate_target_host(value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("target_host is required".to_string());
    }
    if value.contains('@') || value.contains('/') || value.contains(':') || value.contains(' ') {
        return Err("target_host must be a hostname or IP without user, path, or port".to_string());
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.'))
    {
        return Err("target_host contains unsupported characters".to_string());
    }
    Ok(())
}

fn validate_frequency(value: &str) -> Result<(), String> {
    match value.trim() {
        "hourly" | "daily" | "weekly" => Ok(()),
        _ => Err("frequency must be one of: hourly, daily, weekly".to_string()),
    }
}

fn nix_string(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

fn storage_pool_paths(metadata: &Value) -> Vec<String> {
    metadata
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| match item {
                    Value::String(path) => Some(path.clone()),
                    Value::Object(obj) => obj
                        .get("name")
                        .and_then(Value::as_str)
                        .map(|name| format!("/1.0/storage-pools/{name}")),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default()
}

fn map_pool(metadata: &Value) -> Option<StoragePool> {
    let obj = metadata.as_object()?;
    Some(StoragePool {
        name: obj.get("name")?.as_str()?.to_string(),
        driver: obj
            .get("driver")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        status: obj
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("Unknown")
            .to_string(),
        locations: obj
            .get("locations")
            .and_then(Value::as_array)
            .map(|locations| {
                locations
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        total_size: None,
        used_size: None,
    })
}

fn apply_resources(pool: &mut StoragePool, metadata: &Value) {
    let Some(space) = metadata.get("space") else {
        return;
    };

    pool.total_size = space.get("total").and_then(Value::as_u64);
    pool.used_size = space.get("used").and_then(Value::as_u64);
}

async fn incus_get_json(path: &str) -> Result<IncusResponse, String> {
    let socket = incus_socket_path();
    let mut stream = UnixStream::connect(&socket)
        .await
        .map_err(|e| format!("failed to connect to {}: {e}", socket.display()))?;

    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: incus\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| format!("failed to write Incus request: {e}"))?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .await
        .map_err(|e| format!("failed to read Incus response: {e}"))?;

    parse_http_json(&response)
}

fn incus_socket_path() -> PathBuf {
    env::var_os("INCUS_SOCKET")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/var/lib/incus/unix.socket"))
}

fn parse_http_json(response: &[u8]) -> Result<IncusResponse, String> {
    let split = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "malformed Incus HTTP response".to_string())?;
    let (headers, body) = response.split_at(split);
    let body = &body[4..];
    let headers = String::from_utf8_lossy(headers);

    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "missing Incus HTTP status".to_string())?;

    if !(200..300).contains(&status) {
        return Err(format!(
            "Incus API returned HTTP {status}: {}",
            String::from_utf8_lossy(body)
        ));
    }

    serde_json::from_slice(body).map_err(|e| format!("failed to parse Incus JSON: {e}"))
}

fn storage_error(details: String) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_GATEWAY,
        Json(ErrorResponse {
            error: "Failed to query Incus storage API".into(),
            details: Some(details),
        }),
    )
}

fn bad_request(details: String) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        Json(ErrorResponse {
            error: "Invalid replication plan request".into(),
            details: Some(details),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_pool_paths_from_incus_list_metadata() {
        let metadata = json!(["/1.0/storage-pools/default", { "name": "fast-zfs" }, 42]);

        assert_eq!(
            storage_pool_paths(&metadata),
            vec![
                "/1.0/storage-pools/default".to_string(),
                "/1.0/storage-pools/fast-zfs".to_string(),
            ]
        );
    }

    #[test]
    fn maps_pool_details_and_resources() {
        let mut pool = map_pool(&json!({
            "name": "default",
            "driver": "zfs",
            "status": "Created",
            "locations": ["core-01"]
        }))
        .expect("valid pool metadata");

        apply_resources(
            &mut pool,
            &json!({
                "space": { "total": 1024, "used": 128 }
            }),
        );

        assert_eq!(pool.name, "default");
        assert_eq!(pool.driver, "zfs");
        assert_eq!(pool.status, "Created");
        assert_eq!(pool.locations, vec!["core-01".to_string()]);
        assert_eq!(pool.total_size, Some(1024));
        assert_eq!(pool.used_size, Some(128));
    }

    #[test]
    fn replication_plan_generates_nix_without_running_zfs() {
        let plan = build_replication_plan(&ReplicationPlanRequest {
            source_pool: "pool/data".to_string(),
            target_host: "10.0.0.12".to_string(),
            frequency: "hourly".to_string(),
        });

        assert_eq!(plan.source, "pool/data");
        assert_eq!(plan.target, "syncoid@10.0.0.12:pool/data/backup");
        assert_eq!(plan.ssh_key_path, "/run/secrets/syncoid_key");
        assert!(plan.nix_config.contains("services.sanoid"));
        assert!(plan.nix_config.contains("services.syncoid"));
        assert!(
            plan.nix_config
                .contains("sshKey = \"/run/secrets/syncoid_key\";")
        );
        assert!(!plan.nix_config.contains("BEGIN OPENSSH"));
    }

    #[test]
    fn replication_request_rejects_shell_like_targets() {
        let err = validate_replication_request(&ReplicationPlanRequest {
            source_pool: "pool/data".to_string(),
            target_host: "root@host:/pool".to_string(),
            frequency: "daily".to_string(),
        })
        .expect_err("target with user/path must fail");

        assert!(err.contains("target_host"));
    }
}
