use serde_json::Value;
use std::{env, path::PathBuf, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixStream,
    time::timeout,
};
use url::form_urlencoded::byte_serialize;

/// Bytes lidos por vez do socket.
const READ_CHUNK: usize = 16 * 1024;
/// Timeout default (em ms) para requests Incus quando socket explícito é
/// usado (e.g. pelo `IncusProvider`).
pub const DEFAULT_INCUS_TIMEOUT_MS: u64 = 5_000;

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

/// Variante que aceita socket e timeout configuráveis. Usada pelo
/// `crate::providers::incus::IncusProvider`.
pub async fn get_json_with_socket(socket: PathBuf, path: &str) -> Result<IncusResponse, String> {
    let fut = request_json_to_socket(&socket, "GET", path, None);
    match timeout(Duration::from_millis(DEFAULT_INCUS_TIMEOUT_MS), fut).await {
        Ok(res) => res,
        Err(_) => Err(format!(
            "timeout após {DEFAULT_INCUS_TIMEOUT_MS}ms aguardando Incus"
        )),
    }
}

async fn request_json(
    method: &str,
    path: &str,
    body: Option<&Value>,
) -> Result<IncusResponse, String> {
    let socket = incus_socket_path();
    request_json_to_socket(&socket, method, path, body).await
}

async fn request_json_to_socket(
    socket: &std::path::Path,
    method: &str,
    path: &str,
    body: Option<&Value>,
) -> Result<IncusResponse, String> {
    let mut stream = UnixStream::connect(socket)
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
    let mut buf = [0u8; READ_CHUNK];
    loop {
        match stream.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                response.extend_from_slice(&buf[..n]);
            }
            Err(e) => return Err(format!("failed to read Incus response: {e}")),
        }
    }

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
    let (raw_headers, raw_body) = response.split_at(split);
    let body = &raw_body[4..];
    let headers = String::from_utf8_lossy(raw_headers).to_string();

    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "missing Incus HTTP status".to_string())?;

    let is_chunked = headers
        .lines()
        .any(|line| line.eq_ignore_ascii_case("transfer-encoding: chunked"));

    let body = if is_chunked {
        decode_chunked(body).map_err(|e| format!("failed to decode chunked Incus response: {e}"))?
    } else {
        body.to_vec()
    };

    if !(200..300).contains(&status) {
        return Err(format!(
            "Incus API retornou HTTP {status}: {}",
            String::from_utf8_lossy(&body)
        ));
    }

    let raw = if body.iter().all(|byte| byte.is_ascii_whitespace()) {
        Value::Null
    } else {
        serde_json::from_slice(&body).map_err(|e| format!("failed to parse Incus JSON: {e}"))?
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

/// Decodifica um corpo HTTP `Transfer-Encoding: chunked`.
///
/// Cada chunk é codificado como `<hex-size>\r\n<bytes>\r\n`,
/// terminado por `0\r\n\r\n`. Bytes após o terminador
/// (headers extras ou trailers) sao descartados.
fn decode_chunked(body: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(body.len());
    let mut cursor = 0;
    while cursor < body.len() {
        let line_end = body[cursor..]
            .windows(2)
            .position(|w| w == b"\r\n")
            .ok_or_else(|| "chunked body sem CRLF terminador".to_string())?;
        let size_line = std::str::from_utf8(&body[cursor..cursor + line_end])
            .map_err(|e| format!("chunk size nao ASCII: {e}"))?;
        let size = usize::from_str_radix(size_line.trim(), 16)
            .map_err(|e| format!("chunk size invalido '{size_line}': {e}"))?;
        cursor += line_end + 2;
        if size == 0 {
            break;
        }
        let end = cursor + size;
        if end + 2 > body.len() {
            return Err(format!(
                "chunk declara {size} bytes mas body tem apenas {}",
                body.len() - cursor
            ));
        }
        out.extend_from_slice(&body[cursor..end]);
        cursor = end + 2; // pula o CRLF pos-chunk
    }
    Ok(out)
}

pub fn encode_path_segment(value: &str) -> String {
    byte_serialize(value.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
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
