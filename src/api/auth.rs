use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    routing::{get, post},
};
use chrono::Utc;
use pam::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, sync::Arc};

use crate::{AppState, ErrorResponse};

const SESSION_COOKIE: &str = "kryonix_session";
const SESSION_TTL_SECONDS: i64 = 15 * 60;
const JWT_HEADER: &str = r#"{"alg":"HS256","typ":"JWT"}"#;

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    authenticated: bool,
    role: String,
    username: String,
    real_name: String,
    uid: u32,
    is_admin: bool,
    expires_at: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionClaims {
    pub sub: String,
    pub role: String,
    pub edition: String,
    pub username: String,
    pub real_name: String,
    pub uid: u32,
    pub is_admin: bool,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Clone)]
struct LoginIdentity {
    uuid: String,
    role: String,
    edition: String,
}

#[derive(Debug, Clone)]
struct UserIdentity {
    username: String,
    real_name: String,
    uid: u32,
    is_admin: bool,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/session", get(session))
}

async fn login(
    State(_state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl axum::response::IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let identity = login_identity()?;

    let mut auth = Client::with_password("kryxd").map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "PAM_INIT_FAILED".into(),
                details: Some(e.to_string()),
            }),
        )
    })?;

    auth.conversation_mut()
        .set_credentials(&payload.username, &payload.password);

    if auth.authenticate().is_err() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "INVALID_CREDENTIALS".into(),
                details: Some("Usuário ou senha inválidos".into()),
            }),
        ));
    }

    let now = Utc::now().timestamp();
    let expires_at = now + SESSION_TTL_SECONDS;
    let role = identity.role.clone();
    let user = user_identity(&payload.username);
    let claims = SessionClaims {
        sub: identity.uuid,
        role: role.clone(),
        edition: identity.edition,
        username: user.username.clone(),
        real_name: user.real_name.clone(),
        uid: user.uid,
        is_admin: user.is_admin,
        iat: now,
        exp: expires_at,
    };
    let token = sign_claims(&claims)?;
    let cookie = format!(
        "{}={}; HttpOnly; SameSite=Strict; Path=/; Max-Age={}",
        SESSION_COOKIE, token, SESSION_TTL_SECONDS
    );

    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(LoginResponse {
            authenticated: true,
            role,
            username: user.username,
            real_name: user.real_name,
            uid: user.uid,
            is_admin: user.is_admin,
            expires_at,
        }),
    ))
}

fn login_identity() -> Result<LoginIdentity, (StatusCode, Json<ErrorResponse>)> {
    match kryx::services::identity::check_identity() {
        Ok(identity) => Ok(LoginIdentity {
            uuid: identity.uuid,
            role: format!("{:?}", identity.role),
            edition: identity.edition,
        }),
        Err(_e) if std::env::var("KRYONIX_AUTH_PASSWORD").is_ok() => Ok(LoginIdentity {
            uuid: "kryxd-dev-local".into(),
            role: "Core".into(),
            edition: "dev".into(),
        }),
        Err(e) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "IDENTITY_UNAVAILABLE".into(),
                details: Some(e),
            }),
        )),
    }
}

async fn session(headers: HeaderMap) -> Result<Json<Value>, (StatusCode, Json<ErrorResponse>)> {
    let claims = session_claims_from_headers(&headers)?;
    Ok(Json(json!({
        "authenticated": true,
        "role": claims.role,
        "username": claims.username,
        "real_name": claims.real_name,
        "uid": claims.uid,
        "is_admin": claims.is_admin,
        "expires_at": claims.exp,
    })))
}

fn user_identity(username: &str) -> UserIdentity {
    let mut real_name = username.to_string();
    let mut uid = u32::MAX;

    if let Ok(passwd) = fs::read_to_string("/etc/passwd") {
        if let Some(entry) = passwd
            .lines()
            .find(|line| line.starts_with(&format!("{username}:")))
        {
            let fields: Vec<_> = entry.split(':').collect();
            uid = fields
                .get(2)
                .and_then(|value| value.parse().ok())
                .unwrap_or(u32::MAX);
            if let Some(gecos) = fields.get(4) {
                if let Some(name) = gecos.split(',').next().filter(|name| !name.is_empty()) {
                    real_name = name.to_string();
                }
            }
        }
    }

    let is_admin = uid == 0
        || fs::read_to_string("/etc/group")
            .map(|groups| {
                groups.lines().any(|line| {
                    let fields: Vec<_> = line.split(':').collect();
                    matches!(fields.first(), Some(&"wheel") | Some(&"sudo"))
                        && fields.get(3).is_some_and(|members| {
                            members.split(',').any(|member| member == username)
                        })
                })
            })
            .unwrap_or(false);

    UserIdentity {
        username: username.to_string(),
        real_name,
        uid,
        is_admin,
    }
}

pub fn authenticated_session(
    headers: &HeaderMap,
) -> Result<SessionClaims, (StatusCode, Json<ErrorResponse>)> {
    session_claims_from_headers(headers)
}

pub fn is_core_session(headers: &HeaderMap) -> bool {
    session_claims_from_headers(headers)
        .map(|claims| matches!(claims.role.as_str(), "Core" | "ThinkServer"))
        .unwrap_or(false)
}

fn session_claims_from_headers(
    headers: &HeaderMap,
) -> Result<SessionClaims, (StatusCode, Json<ErrorResponse>)> {
    let token =
        session_token_from_headers(headers).ok_or_else(|| auth_error("SESSION_REQUIRED"))?;
    verify_token(&token)
}

fn session_token_from_headers(headers: &HeaderMap) -> Option<String> {
    if let Some(auth) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            return Some(token.trim().to_string());
        }
    }

    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == SESSION_COOKIE).then(|| value.to_string())
    })
}

fn verify_token(token: &str) -> Result<SessionClaims, (StatusCode, Json<ErrorResponse>)> {
    let mut parts = token.split('.');
    let header = parts.next().ok_or_else(|| auth_error("INVALID_SESSION"))?;
    let payload = parts.next().ok_or_else(|| auth_error("INVALID_SESSION"))?;
    let signature = parts.next().ok_or_else(|| auth_error("INVALID_SESSION"))?;
    if parts.next().is_some() {
        return Err(auth_error("INVALID_SESSION"));
    }

    let signing_input = format!("{header}.{payload}");
    let expected = base64_url_encode(&hmac_sha256(
        session_secret().as_bytes(),
        signing_input.as_bytes(),
    ));
    if !constant_time_eq(signature.as_bytes(), expected.as_bytes()) {
        return Err(auth_error("INVALID_SESSION"));
    }

    let payload_bytes = base64_url_decode(payload).ok_or_else(|| auth_error("INVALID_SESSION"))?;
    let claims: SessionClaims =
        serde_json::from_slice(&payload_bytes).map_err(|_| auth_error("INVALID_SESSION"))?;
    if claims.exp <= Utc::now().timestamp() {
        return Err(auth_error("SESSION_EXPIRED"));
    }
    Ok(claims)
}

fn sign_claims(claims: &SessionClaims) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    let header = base64_url_encode(JWT_HEADER.as_bytes());
    let payload = serde_json::to_vec(claims).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "SESSION_SERIALIZATION_FAILED".into(),
                details: Some(e.to_string()),
            }),
        )
    })?;
    let payload = base64_url_encode(&payload);
    let signing_input = format!("{header}.{payload}");
    let signature = base64_url_encode(&hmac_sha256(
        session_secret().as_bytes(),
        signing_input.as_bytes(),
    ));
    Ok(format!("{signing_input}.{signature}"))
}

fn expected_password(uuid: &str) -> String {
    if let Ok(password) = std::env::var("KRYONIX_AUTH_PASSWORD") {
        return password;
    }
    let mut hasher = Sha256::new();
    hasher.update(b"kryonix-auth:");
    hasher.update(uuid.as_bytes());
    let digest = hasher.finalize();
    digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn session_secret() -> String {
    std::env::var("KRYONIX_AUTH_SESSION_SECRET").unwrap_or_else(|_| {
        let identity_uuid = kryx::services::identity::check_identity()
            .map(|identity| identity.uuid)
            .unwrap_or_else(|_| "kryxd-ephemeral-session".into());
        let mut hasher = Sha256::new();
        hasher.update(b"kryonix-session:");
        hasher.update(identity_uuid.as_bytes());
        format!("{:x}", hasher.finalize())
    })
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut key_block = [0u8; 64];
    if key.len() > 64 {
        key_block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    let mut outer = [0x5c; 64];
    let mut inner = [0x36; 64];
    for i in 0..64 {
        outer[i] ^= key_block[i];
        inner[i] ^= key_block[i];
    }

    let mut inner_hasher = Sha256::new();
    inner_hasher.update(inner);
    inner_hasher.update(data);
    let inner_hash = inner_hasher.finalize();

    let mut outer_hasher = Sha256::new();
    outer_hasher.update(outer);
    outer_hasher.update(inner_hash);
    outer_hasher.finalize().into()
}

fn base64_url_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i];
        let b1 = data.get(i + 1).copied().unwrap_or(0);
        let b2 = data.get(i + 2).copied().unwrap_or(0);
        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if i + 1 < data.len() {
            out.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        }
        if i + 2 < data.len() {
            out.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        }
        i += 3;
    }
    out
}

fn base64_url_decode(input: &str) -> Option<Vec<u8>> {
    fn val(byte: u8) -> Option<u8> {
        match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'-' => Some(62),
            b'_' => Some(63),
            _ => None,
        }
    }

    let bytes = input.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let v0 = val(bytes[i])?;
        let v1 = val(*bytes.get(i + 1)?)?;
        let v2 = bytes.get(i + 2).and_then(|b| val(*b));
        let v3 = bytes.get(i + 3).and_then(|b| val(*b));
        out.push((v0 << 2) | (v1 >> 4));
        if let Some(v2) = v2 {
            out.push(((v1 & 0b0000_1111) << 4) | (v2 >> 2));
            if let Some(v3) = v3 {
                out.push(((v2 & 0b0000_0011) << 6) | v3);
            }
        }
        i += 4;
    }
    Some(out)
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right.iter())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

fn auth_error(code: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            error: code.into(),
            details: Some("Sessão inválida ou expirada".into()),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_url_round_trip_handles_unpadded_payloads() {
        let raw = br#"{"role":"Core"}"#;
        let encoded = base64_url_encode(raw);
        assert_eq!(base64_url_decode(&encoded).unwrap(), raw);
        assert!(!encoded.contains('='));
    }

    #[test]
    fn derived_password_is_stable_and_not_raw_uuid() {
        let password = expected_password("host-uuid-1");
        assert_eq!(password, expected_password("host-uuid-1"));
        assert_ne!(password, "host-uuid-1");
    }
}
