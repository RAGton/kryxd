//! KCP Web Console - WebSocket proxy for Incus instances.
//!
//! SECURITY: This module acts as a reverse proxy - Incus secrets NEVER leave the backend.
//! The browser connects to Axum, and Axum connects to Incus.

use axum::{
    Json,
    extract::{Path, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::Deserialize;
use std::io::{Read, Write};
use std::sync::Arc;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::{debug, error, info};
use users::os::unix::UserExt;

use super::v1::rbac::RequireCoreRole;
use crate::AppState;
#[derive(Debug, Deserialize)]
struct TerminalClientMessage {
    #[serde(rename = "type")]
    kind: Option<String>,
    data: Option<String>,
    input: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
}

pub fn router() -> axum::Router<Arc<AppState>> {
    axum::Router::new()
        .route("/host/ws", get(websocket_host_terminal))
        .route("/instances/:name/console/ws", get(websocket_console))
}

/// Terminal local do host, sempre limitado à sessão PAM autenticada.
async fn websocket_host_terminal(
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<impl IntoResponse, (StatusCode, Json<crate::ErrorResponse>)> {
    let claims = crate::api::auth::authenticated_session(&headers)?;
    let username = claims.username;
    Ok(ws.on_upgrade(move |socket| handle_host_terminal(socket, username)))
}

async fn handle_host_terminal(mut socket: axum::extract::ws::WebSocket, username: String) {
    let Some(user) = users::get_user_by_name(&username) else {
        send_terminal_error(
            &mut socket,
            "USER_NOT_FOUND",
            "Usuário autenticado não existe no host",
        )
        .await;
        return;
    };

    let shell = user.shell().to_string_lossy().into_owned();
    let home = user.home_dir().to_string_lossy().into_owned();
    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: 32,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => pair,
        Err(error) => {
            error!("Failed to open host terminal PTY: {error}");
            send_terminal_error(
                &mut socket,
                "PTY_OPEN_FAILED",
                "Não foi possível abrir a PTY do host",
            )
            .await;
            return;
        }
    };

    let mut command = CommandBuilder::new("runuser");
    command.args(["--user", &username, "--", &shell, "-l"]);
    command.env("HOME", &home);
    command.env("USER", &username);
    command.env("LOGNAME", &username);
    command.env("TERM", "xterm-256color");
    command.env(
        "PATH",
        format!("/run/current-system/sw/bin:/etc/profiles/per-user/{username}/bin:/bin:/usr/bin"),
    );

    let mut child = match pair.slave.spawn_command(command) {
        Ok(child) => child,
        Err(error) => {
            error!("Failed to spawn host terminal shell: {error}");
            send_terminal_error(
                &mut socket,
                "SHELL_SPAWN_FAILED",
                "Não foi possível iniciar o shell do usuário",
            )
            .await;
            return;
        }
    };
    drop(pair.slave);

    let master = pair.master;
    let reader = match master.try_clone_reader() {
        Ok(reader) => reader,
        Err(error) => {
            error!("Failed to clone host terminal reader: {error}");
            let _ = child.kill();
            send_terminal_error(
                &mut socket,
                "PTY_READER_FAILED",
                "Falha ao ler a saída do terminal",
            )
            .await;
            return;
        }
    };
    let mut writer = match master.take_writer() {
        Ok(writer) => writer,
        Err(error) => {
            error!("Failed to open host terminal writer: {error}");
            let _ = child.kill();
            send_terminal_error(
                &mut socket,
                "PTY_WRITER_FAILED",
                "Falha ao enviar entrada ao terminal",
            )
            .await;
            return;
        }
    };

    let (output_tx, mut output_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(32);
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(size) => {
                    if output_tx.blocking_send(buffer[..size].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    let (mut sink, mut stream) = socket.split();
    let ready = serde_json::json!({
        "type": "ready",
        "username": username,
        "shell": shell,
        "home": home,
        "cols": 120,
        "rows": 32,
    });
    if sink
        .send(axum::extract::ws::Message::Text(ready.to_string().into()))
        .await
        .is_err()
    {
        let _ = child.kill();
        return;
    }

    loop {
        tokio::select! {
            message = stream.next() => {
                match message {
                    Some(Ok(axum::extract::ws::Message::Text(text))) => {
                        if let Ok(control) = serde_json::from_str::<TerminalClientMessage>(&text) {
                            match control.kind.as_deref() {
                                Some("resize") => {
                                    let cols = control.cols.unwrap_or(120).clamp(2, 500);
                                    let rows = control.rows.unwrap_or(32).clamp(2, 200);
                                    if let Err(error) = master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }) {
                                        let _ = sink.send(axum::extract::ws::Message::Text(serde_json::json!({"type":"error","code":"PTY_RESIZE_FAILED","message":error.to_string()}).to_string().into())).await;
                                    }
                                }
                                Some("input") => {
                                    let data = control.data.or(control.input).unwrap_or_default();
                                    if writer.write_all(data.as_bytes()).is_err() { break; }
                                    let _ = writer.flush();
                                }
                                _ => {}
                            }
                        } else {
                            if writer.write_all(text.as_bytes()).is_err() { break; }
                            let _ = writer.flush();
                        }
                    }
                    Some(Ok(axum::extract::ws::Message::Binary(data))) => {
                        if writer.write_all(&data).is_err() { break; }
                        let _ = writer.flush();
                    }
                    Some(Ok(axum::extract::ws::Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
            output = output_rx.recv() => {
                match output {
                    Some(bytes) => {
                        let text = String::from_utf8_lossy(&bytes).into_owned();
                        if sink.send(axum::extract::ws::Message::Text(text.into())).await.is_err() { break; }
                    }
                    None => break,
                }
            }
        }
    }

    let _ = child.kill();
}

async fn send_terminal_error(socket: &mut axum::extract::ws::WebSocket, code: &str, message: &str) {
    let payload = serde_json::json!({"type": "error", "code": code, "message": message});
    let _ = socket
        .send(axum::extract::ws::Message::Text(payload.to_string().into()))
        .await;
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

    info!(
        "Console WebSocket proxy ready for instance: {}",
        instance_name
    );

    Ok(ws.on_upgrade(move |socket| handle_websocket_upgrade(socket, incus_ws_url, instance_name)))
}

/// Obtain the Incus console WebSocket URL via exec endpoint.
/// Uses `incus exec` with a shell to get interactive console access.
async fn get_incus_console_url(instance_name: &str) -> Result<String, String> {
    let output = tokio::process::Command::new("incus")
        .args(["exec", instance_name, "--raw", "--", "sh"])
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
            let _ = sender
                .send(axum::extract::ws::Message::Text(format!(
                    "ERROR: Could not connect to instance console: {}",
                    e
                )))
                .await;
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
                    if let Err(e) = browser_sink
                        .send(axum::extract::ws::Message::Text(text))
                        .await
                    {
                        error!("Error forwarding incus->browser: {}", e);
                        break;
                    }
                }
                Ok(WsMessage::Binary(data)) => {
                    if let Err(e) = browser_sink
                        .send(axum::extract::ws::Message::Binary(data))
                        .await
                    {
                        error!("Error forwarding incus->browser binary: {}", e);
                        break;
                    }
                }
                Ok(WsMessage::Close(_)) => {
                    let _ = browser_sink
                        .send(axum::extract::ws::Message::Close(None))
                        .await;
                    break;
                }
                Ok(WsMessage::Ping(data)) => {
                    if let Err(e) = browser_sink
                        .send(axum::extract::ws::Message::Ping(data))
                        .await
                    {
                        error!("Error forwarding ping: {}", e);
                        break;
                    }
                }
                Ok(WsMessage::Pong(data)) => {
                    if let Err(e) = browser_sink
                        .send(axum::extract::ws::Message::Pong(data))
                        .await
                    {
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
async fn connect_to_incus_ws(
    url: &str,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    String,
> {
    // Connect (Incus typically uses HTTPS/WSS)
    let (socket, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|e| format!("WebSocket connection failed: {}", e))?;

    Ok(socket)
}
