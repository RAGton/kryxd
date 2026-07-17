use serde_json::Value;
use std::{env, path::PathBuf};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixStream,
};
use url::form_urlencoded::byte_serialize;

#[derive(Clone, Debug)]
pub struct IncusResponse {
    pub raw: Value,
    pub metadata: Value,
    pub operation: Option<String>,
}

pub async fn get_json(path: &str) -> Result<IncusResponse, String> {
    request_json("GET", path, None).await
}

pub async fn post_json(path: &str, body: &Value) -> Result<IncusResponse, String> {
    request_json("POST", path, Some(body)).await
}

pub async fn put_json(path: &str, body: &Value) -> Result<IncusResponse, String> {
    request_json("PUT", path, Some(body)).await
}

async fn request_json(method: &str, path: &str, body: Option<&Value>) -> Result<IncusResponse, String> {
    let socket = incus_socket_path();
    let mut stream = UnixStream::connect(&socket)
        .await
        .map_err(|e| format!("failed to connect to {}: {e}", socket.display()))?;

    let serialized_body = match body {
        Some(value) => serde_json::to_string(value)
            .map_err(|e| format!("failed to serialize Incus request body: {e}"))?,
        None => String::new(),
    };

    let request = if body.is_some() {
        format!(
            "{method} {path} HTTP/1.1\r\nHost: incus\r\nAccept: application/json\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{serialized_body}",
            serialized_body.as_bytes().len()
        )
    } else {
        format!(
            "{method} {path} HTTP/1.1\r\nHost: incus\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
        )
    };

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

    let raw = if body.iter().all(|byte| byte.is_ascii_whitespace()) {
        Value::Null
    } else {
        serde_json::from_slice(body).map_err(|e| format!("failed to parse Incus JSON: {e}"))?
    };
    let metadata = raw.get("metadata").cloned().unwrap_or_else(|| raw.clone());
    let operation = raw
        .get("operation")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);

    Ok(IncusResponse {
        raw,
        metadata,
        operation,
    })
}

pub fn encode_path_segment(value: &str) -> String {
    byte_serialize(value.as_bytes()).collect()
}

pub fn operation_id(response: &IncusResponse) -> Option<String> {
    response
        .metadata
        .get("id")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            response
                .operation
                .as_deref()
                .and_then(|operation| operation.rsplit('/').next())
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_path_segments_without_leaking_slashes() {
        assert_eq!(encode_path_segment("vm-100"), "vm-100");
        assert_eq!(encode_path_segment("tenant/vm 1"), "tenant%2Fvm%201");
    }
}
