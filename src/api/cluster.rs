use axum::{Json, Router, http::StatusCode, routing::get};
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;

use crate::api::incus::{self, encode_path_segment};
use crate::api::v1::rbac::RequireCoreRole;
use crate::{AppState, ErrorResponse};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/topology", get(get_topology))
}

#[derive(Serialize, Debug, Clone)]
pub struct ClusterTopology {
    pub datacenter: DatacenterTree,
    pub source: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct DatacenterTree {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub route: String,
    pub nodes: Vec<NodeTree>,
}

#[derive(Serialize, Debug, Clone)]
pub struct NodeTree {
    pub id: String,
    pub name: String,
    pub node_name: String,
    pub status: String,
    pub route: String,
    pub storages: Vec<StorageTree>,
    pub vms: Vec<InstanceTree>,
    pub cts: Vec<InstanceTree>,
}

#[derive(Serialize, Debug, Clone)]
pub struct StorageTree {
    pub id: String,
    pub name: String,
    pub pool_name: String,
    pub node_name: String,
    pub driver: String,
    pub status: String,
    pub route: String,
    pub locations: Vec<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct InstanceTree {
    pub id: String,
    pub name: String,
    pub instance_name: String,
    pub node_name: String,
    pub kind: String,
    pub status: String,
    pub route: String,
}

async fn get_topology(
    _rbac: RequireCoreRole,
) -> Result<Json<ClusterTopology>, (StatusCode, Json<ErrorResponse>)> {
    let cluster_members = match incus::get_json("/1.0/cluster/members").await {
        Ok(response) => map_cluster_members(&response.metadata),
        Err(_) => vec![node_shell("local-node")],
    };
    let mut nodes = if cluster_members.is_empty() {
        vec![node_shell("local-node")]
    } else {
        cluster_members
    };

    let instances = incus::get_json("/1.0/instances?recursion=1")
        .await
        .map_err(cluster_error)?;
    attach_instances(&mut nodes, &instances.metadata);

    let storage_pools = incus::get_json("/1.0/storage-pools?recursion=1")
        .await
        .map_err(cluster_error)?;
    attach_storage_pools(&mut nodes, &storage_pools.metadata);

    nodes.sort_by(|left, right| left.node_name.cmp(&right.node_name));
    for node in &mut nodes {
        node.storages
            .sort_by(|left, right| left.name.cmp(&right.name));
        node.vms.sort_by(|left, right| left.name.cmp(&right.name));
        node.cts.sort_by(|left, right| left.name.cmp(&right.name));
    }

    Ok(Json(ClusterTopology {
        datacenter: DatacenterTree {
            id: "datacenter".to_string(),
            name: "Datacenter".to_string(),
            kind: "datacenter".to_string(),
            route: "/kcp/datacenter/summary".to_string(),
            nodes,
        },
        source: "incus-socket".to_string(),
    }))
}

fn map_cluster_members(metadata: &Value) -> Vec<NodeTree> {
    metadata
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|member| {
            let name = member
                .get("server_name")
                .or_else(|| member.get("name"))
                .and_then(Value::as_str)?;
            let status = member
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("Unknown");
            Some(node_shell_with_status(name, status))
        })
        .collect()
}

fn attach_instances(nodes: &mut Vec<NodeTree>, metadata: &Value) {
    let Some(instances) = metadata.as_array() else {
        return;
    };

    for instance in instances {
        let Some(name) = instance_name(instance) else {
            continue;
        };
        let raw_kind = instance
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("container");
        let kind = match raw_kind {
            "virtual-machine" | "vm" => "vm",
            "container" | "ct" => "ct",
            _ => raw_kind,
        };
        let node_name = instance
            .get("location")
            .or_else(|| instance.get("node_name"))
            .and_then(Value::as_str)
            .unwrap_or("local-node");
        let status = instance
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("Unknown");
        let route_kind = if kind == "vm" { "vm" } else { "ct" };
        let encoded_node = encode_path_segment(node_name);
        let encoded_name = encode_path_segment(&name);
        let item = InstanceTree {
            id: name.clone(),
            name: name.clone(),
            instance_name: name,
            node_name: node_name.to_string(),
            kind: kind.to_string(),
            status: status.to_string(),
            route: format!("/kcp/node/{encoded_node}/{route_kind}/{encoded_name}/summary"),
        };

        let node = ensure_node(nodes, node_name);
        if kind == "vm" {
            node.vms.push(item);
        } else {
            node.cts.push(item);
        }
    }
}

fn attach_storage_pools(nodes: &mut Vec<NodeTree>, metadata: &Value) {
    let Some(pools) = metadata.as_array() else {
        return;
    };

    for pool in pools {
        let Some(name) = storage_pool_name(pool) else {
            continue;
        };
        let driver = pool
            .get("driver")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let status = pool
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("Created");
        let locations = pool_locations(pool, nodes);

        for node_name in locations.iter() {
            let encoded_node = encode_path_segment(node_name);
            let encoded_pool = encode_path_segment(&name);
            let storage = StorageTree {
                id: format!("{node_name}/{name}"),
                name: name.clone(),
                pool_name: name.clone(),
                node_name: node_name.clone(),
                driver: driver.to_string(),
                status: status.to_string(),
                route: format!("/kcp/node/{encoded_node}/storage/{encoded_pool}/summary"),
                locations: locations.clone(),
            };
            ensure_node(nodes, node_name).storages.push(storage);
        }
    }
}

fn node_shell(name: &str) -> NodeTree {
    node_shell_with_status(name, "Online")
}

fn node_shell_with_status(name: &str, status: &str) -> NodeTree {
    let encoded_name = encode_path_segment(name);
    NodeTree {
        id: name.to_string(),
        name: name.to_string(),
        node_name: name.to_string(),
        status: status.to_string(),
        route: format!("/kcp/node/{encoded_name}/summary"),
        storages: Vec::new(),
        vms: Vec::new(),
        cts: Vec::new(),
    }
}

fn ensure_node<'a>(nodes: &'a mut Vec<NodeTree>, name: &str) -> &'a mut NodeTree {
    if let Some(index) = nodes.iter().position(|node| node.node_name == name) {
        return &mut nodes[index];
    }
    nodes.push(node_shell(name));
    nodes.last_mut().expect("node was just pushed")
}

fn instance_name(instance: &Value) -> Option<String> {
    instance
        .get("name")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| name_from_incus_path(instance.as_str()?))
}

fn storage_pool_name(pool: &Value) -> Option<String> {
    pool.get("name")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| name_from_incus_path(pool.as_str()?))
}

fn name_from_incus_path(path: &str) -> Option<String> {
    path.rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
}

fn pool_locations(pool: &Value, nodes: &[NodeTree]) -> Vec<String> {
    let locations: Vec<String> = pool
        .get("locations")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect();

    if !locations.is_empty() {
        return locations;
    }

    if nodes.is_empty() {
        vec!["local-node".to_string()]
    } else {
        nodes.iter().map(|node| node.node_name.clone()).collect()
    }
}

fn cluster_error(details: String) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_GATEWAY,
        Json(ErrorResponse {
            error: "Failed to query Incus cluster topology".into(),
            details: Some(details),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn falls_back_storage_to_all_nodes_without_locations() {
        let nodes = vec![node_shell("node-a"), node_shell("node-b")];
        let locations = pool_locations(&json!({ "name": "default" }), &nodes);
        assert_eq!(locations, vec!["node-a".to_string(), "node-b".to_string()]);
    }

    #[test]
    fn maps_instances_by_location_and_kind() {
        let mut nodes = vec![node_shell("node-a")];
        attach_instances(
            &mut nodes,
            &json!([
                { "name": "vm-prod", "type": "virtual-machine", "location": "node-a", "status": "Running" },
                { "name": "ct-db", "type": "container", "location": "node-b", "status": "Stopped" }
            ]),
        );

        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].vms[0].instance_name, "vm-prod");
        assert_eq!(nodes[1].cts[0].instance_name, "ct-db");
    }
}
