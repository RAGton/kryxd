//! KCP Web Console - WebSocket proxy for Incus instances.
//! 
//! SECURITY: This module acts as a reverse proxy - Incus secrets NEVER leave the backend.
//! The browser connects to Axum, and Axum connects to Incus.

use axum::{
    extract::{Path, WebSocketUpgrade},
    http::StatusCode,
    response::IntoResponse,
    Json,
    routing::get,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::{debug, error, info};

use crate::AppState;
use super::v1::rbac::RequireCoreRole;

pub fn router() -> axum::Router<Arc<AppState>> {
    axum::Router::new()
        .route("/instances/:name/console/ws", get(websocket_console))
}

/// WebSocket proxy endpoint for instance console access.
/// 
/// # RBAC
/// Only Core or ThinkServer roles can open console sessions (via RequireCoreRole middleware).
/// 
/// # Flow
/// 1. Browser connects to this endpoint
/// 2. Backend authenticates to Incus locally
/// 3. Backend creates exec/console session and gets Incus WebSocket URL
/// 4. Bidirectional proxy relays data between browser and Incus
async fn websocket_console(
    Path(instance_name): Path<String>,
    ws: WebSocketUpgrade,
    _rbac: RequireCoreRole,
) -> Result<impl IntoResponse, (StatusCode, Json<crate::ErrorResponse>)> {
    // Get WebSocket URL from Incus
    let incus_ws_url = match get_incus_console_url(&instance_name).await {
        Ok(url) => url,
        Err(e) => {
            error!("Failed to get console URL for {}: {}", instance_name, e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(crate::ErrorResponse {
                    error: "Failed to connect to Incus console".into(),
                    details: Some(e),
                }),
            ));
        }
    };

    info!("Console WebSocket proxy ready for instance: {}", instance_name);
    
    Ok(ws.on_upgrade(move |socket| {
        handle_websocket_upgrade(socket, incus_ws_url, instance_name)
    }))
}

/// Obtain the Incus console WebSocket URL via exec endpoint.
/// Uses `incus exec` with a shell to get interactive console access.
async fn get_incus_console_url(instance_name: &str) -> Result<String, String> {
    let output = tokio::process::Command::new("incus")
        .args([
            "exec",
            instance_name,
            "--raw",
            "--",
            "sh",
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to spawn incus exec: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("incus exec failed: {}", stderr));
    }

    // Incus exec with --raw outputs WebSocket URL to stdout
    let ws_url = String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| line.starts_with("wss://") || line.starts_with("ws://"))
        .map(|s| s.to_string())
        .ok_or_else(|| "No WebSocket URL found in incus exec output".to_string())?;

    debug!("Obtained Incus WebSocket URL for {}", instance_name);
    Ok(ws_url)
}

/// Handle the bidirectional WebSocket proxy.
/// Data flows: Browser <-> Axum <-> Incus
async fn handle_websocket_upgrade(
    browser_socket: axum::extract::ws::WebSocket,
    incus_ws_url: String,
    instance_name: String,
) {
    // Connect to Incus as WebSocket client
    let incus_ws_stream = match connect_to_incus_ws(&incus_ws_url).await {
        Ok(stream) => stream,
        Err(e) => {
            error!("Failed to connect to Incus WebSocket: {}", e);
            // Send error to browser before closing
            let (mut sender, _) = browser_socket.split();
            let _ = sender.send(axum::extract::ws::Message::Text(
                format!("ERROR: Could not connect to instance console: {}", e)
            )).await;
            return;
        }
    };

    // Split both WebSockets into sinks and streams
    let (mut browser_sink, mut browser_stream) = browser_socket.split();
    let (mut incus_sink, mut incus_stream) = incus_ws_stream.split();

    // Task: Browser -> Incus
    let browser_to_incus = async {
        while let Some(msg) = browser_stream.next().await {
            match msg {
                Ok(axum::extract::ws::Message::Text(text)) => {
                    if let Err(e) = incus_sink.send(WsMessage::Text(text)).await {
                        error!("Error forwarding browser->incus: {}", e);
                        break;
                    }
                }
                Ok(axum::extract::ws::Message::Binary(data)) => {
                    if let Err(e) = incus_sink.send(WsMessage::Binary(data)).await {
                        error!("Error forwarding browser->incus binary: {}", e);
                        break;
                    }
                }
                Ok(axum::extract::ws::Message::Close(_)) => {
                    let _ = incus_sink.send(WsMessage::Close(None)).await;
                    break;
                }
                Ok(axum::extract::ws::Message::Ping(data)) => {
                    if let Err(e) = incus_sink.send(WsMessage::Ping(data)).await {
                        error!("Error forwarding ping: {}", e);
                        break;
                    }
                }
                Ok(axum::extract::ws::Message::Pong(data)) => {
                    if let Err(e) = incus_sink.send(WsMessage::Pong(data)).await {
                        error!("Error forwarding pong: {}", e);
                        break;
                    }
                }
                Err(e) => {
                    error!("Browser WebSocket error: {}", e);
                    break;
                }
            }
        }
    };

    // Task: Incus -> Browser
    let incus_to_browser = async {
        while let Some(msg) = incus_stream.next().await {
            match msg {
                Ok(WsMessage::Text(text)) => {
                    if let Err(e) = browser_sink.send(axum::extract::ws::Message::Text(text)).await {
                        error!("Error forwarding incus->browser: {}", e);
                        break;
                    }
                }
                Ok(WsMessage::Binary(data)) => {
                    if let Err(e) = browser_sink.send(axum::extract::ws::Message::Binary(data)).await {
                        error!("Error forwarding incus->browser binary: {}", e);
                        break;
                    }
                }
                Ok(WsMessage::Close(_)) => {
                    let _ = browser_sink.send(axum::extract::ws::Message::Close(None)).await;
                    break;
                }
                Ok(WsMessage::Ping(data)) => {
                    if let Err(e) = browser_sink.send(axum::extract::ws::Message::Ping(data)).await {
                        error!("Error forwarding ping: {}", e);
                        break;
                    }
                }
                Ok(WsMessage::Pong(data)) => {
                    if let Err(e) = browser_sink.send(axum::extract::ws::Message::Pong(data)).await {
                        error!("Error forwarding pong: {}", e);
                        break;
                    }
                }
                // Ignore other message types including Frame
                _ => {}
            }
        }
    };

    // Run both directions concurrently
    info!("Console proxy established for instance: {}", instance_name);
    let _ = futures_util::future::join(browser_to_incus, incus_to_browser).await;
    debug!("Console proxy closed for instance: {}", instance_name);
}

/// Connect to Incus WebSocket as client.
async fn connect_to_incus_ws(url: &str) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    String,
> {
    // Connect (Incus typically uses HTTPS/WSS)
    let (socket, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|e| format!("WebSocket connection failed: {}", e))?;
    
    Ok(socket)
}