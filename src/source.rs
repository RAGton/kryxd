use axum::{Json, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::AppState;
use axum::extract::State;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct PrepareSourceRequest {
    pub repo: String,
    pub branch: String,
}

#[derive(Serialize)]
pub struct PrepareSourceResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<SourceInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recoverable: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub kind: String,
    pub repo: String,
    pub branch: String,
    pub clone_path: String,
    pub target_path: String,
    pub validated: bool,
}

pub async fn prepare_github_source(Json(req): Json<PrepareSourceRequest>) -> impl IntoResponse {
    // 1. Security Check: Validate Github URL and branch to prevent shell injection
    let is_safe_repo = req.repo.starts_with("https://github.com/")
        && req
            .repo
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '/' || c == '-' || c == '_' || c == '.');
    let is_safe_branch = !req.branch.is_empty()
        && req
            .branch
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');

    if !is_safe_repo || !is_safe_branch {
        return (
            StatusCode::BAD_REQUEST,
            Json(PrepareSourceResponse {
                ok: false,
                source: None,
                code: Some("SOURCE_GITHUB_USER_REPO_FAILED".into()),
                message: Some("URL do repositório ou branch inválidos. Apenas URLs HTTPS do github.com são permitidas.".into()),
                details: Some(serde_json::json!({
                    "repo": req.repo,
                    "branch": req.branch,
                    "stage": "security_check"
                })),
                recoverable: Some(true),
            })
        ).into_response();
    }
    let clone_path = "/run/kryonix-installer/sources/kryonixos";

    // 2. Prepare directory
    let path = Path::new(clone_path);
    if path.exists() {
        let _ = tokio::fs::remove_dir_all(path).await;
    }

    // Ensure parent directories exist
    if let Some(parent) = path.parent()
        && let Err(e) = tokio::fs::create_dir_all(parent).await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(PrepareSourceResponse {
                ok: false,
                source: None,
                code: Some("SOURCE_GITHUB_FS_ERROR".into()),
                message: Some("Não foi possível criar o diretório temporário.".into()),
                details: Some(serde_json::json!({
                    "path": parent.to_string_lossy(),
                    "error": e.to_string(),
                    "stage": "fs_prepare"
                })),
                recoverable: Some(true),
            }),
        )
            .into_response();
    }

    // 3. Git Clone (Safe, without shell interpolation)
    let output = match tokio::process::Command::new("git")
        .arg("clone")
        .arg("--depth")
        .arg("1")
        .arg("--branch")
        .arg(&req.branch)
        .arg(&req.repo)
        .arg(clone_path)
        .output()
        .await
    {
        Ok(out) => out,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(PrepareSourceResponse {
                    ok: false,
                    source: None,
                    code: Some("SOURCE_GITHUB_CLONE_FAILED".into()),
                    message: Some("Falha ao executar o comando git.".into()),
                    details: Some(serde_json::json!({
                        "repo": req.repo,
                        "error": e.to_string(),
                        "stage": "git_clone_spawn"
                    })),
                    recoverable: Some(true),
                }),
            )
                .into_response();
        }
    };

    if !output.status.success() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(PrepareSourceResponse {
                ok: false,
                source: None,
                code: Some("SOURCE_GITHUB_CLONE_FAILED".into()),
                message: Some("Não foi possível clonar o repositório KryonixOS.".into()),
                details: Some(serde_json::json!({
                    "repo": req.repo,
                    "stderr": String::from_utf8_lossy(&output.stderr).to_string(),
                    "stage": "git_clone"
                })),
                recoverable: Some(true),
            }),
        )
            .into_response();
    }

    // 4. Validate flake.nix
    let flake_path = path.join("flake.nix");
    if !flake_path.exists() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(PrepareSourceResponse {
                ok: false,
                source: None,
                code: Some("SOURCE_GITHUB_INVALID_FLAKE".into()),
                message: Some("O repositório clonado não possui um flake.nix válido.".into()),
                details: Some(serde_json::json!({
                    "repo": req.repo,
                    "stage": "flake_check"
                })),
                recoverable: Some(true),
            }),
        )
            .into_response();
    }

    // Success response
    (
        StatusCode::OK,
        Json(PrepareSourceResponse {
            ok: true,
            source: Some(SourceInfo {
                kind: "github-user-repo".into(),
                repo: req.repo,
                branch: req.branch,
                clone_path: clone_path.into(),
                target_path: "/etc/kryonixos".into(),
                validated: true,
            }),
            code: None,
            message: None,
            details: None,
            recoverable: None,
        }),
    )
        .into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFromTemplateRequest {
    pub repo_name: String,
    pub private: bool,
    pub branch: String,
    pub template_repo: String,
}

#[derive(Serialize)]
pub struct CreateFromTemplateResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

pub async fn create_from_template(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateFromTemplateRequest>,
) -> impl IntoResponse {
    let token = {
        let auth = state.auth.lock().await;
        match auth.access_token.clone() {
            Some(t) => t,
            None => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(CreateFromTemplateResponse {
                        ok: false,
                        source: None,
                        error: Some("Not authenticated".into()),
                        details: Some("Complete GitHub OAuth flow first.".into()),
                    }),
                )
                    .into_response();
            }
        }
    };

    // 1. Validate templateRepo URL and extract owner/repo
    let template_url = req
        .template_repo
        .strip_suffix(".git")
        .unwrap_or(&req.template_repo);
    let template_path = match template_url.strip_prefix("https://github.com/") {
        Some(p) => p,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(CreateFromTemplateResponse {
                    ok: false,
                    source: None,
                    error: Some("Invalid template URL".into()),
                    details: Some("Template must be a github.com HTTPS URL".into()),
                }),
            )
                .into_response();
        }
    };

    let parts: Vec<&str> = template_path.split('/').collect();
    if parts.len() < 2 {
        return (
            StatusCode::BAD_REQUEST,
            Json(CreateFromTemplateResponse {
                ok: false,
                source: None,
                error: Some("Invalid template URL structure".into()),
                details: None,
            }),
        )
            .into_response();
    }
    let template_owner = parts[0];
    let template_repo_name = parts[1];

    // 2. Validate repo_name
    let is_safe_repo_name = !req.repo_name.is_empty()
        && req
            .repo_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if !is_safe_repo_name {
        return (
            StatusCode::BAD_REQUEST,
            Json(CreateFromTemplateResponse {
                ok: false,
                source: None,
                error: Some("Invalid repository name".into()),
                details: None,
            }),
        )
            .into_response();
    }

    // 3. Call GitHub API to generate from template
    let generate_url = format!(
        "https://api.github.com/repos/{}/{}/generate",
        template_owner, template_repo_name
    );

    let resp = match state
        .http_client
        .post(&generate_url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "kryonix-installer/0.1")
        .json(&serde_json::json!({
            "owner": "", // let github default to the authenticated user
            "name": req.repo_name,
            "private": req.private,
            "include_all_branches": false
        }))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(CreateFromTemplateResponse {
                    ok: false,
                    source: None,
                    error: Some("Failed to call GitHub API".into()),
                    details: Some(e.to_string()),
                }),
            )
                .into_response();
        }
    };

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return (
            StatusCode::BAD_GATEWAY,
            Json(CreateFromTemplateResponse {
                ok: false,
                source: None,
                error: Some("GitHub API returned error".into()),
                details: Some(err_text),
            }),
        )
            .into_response();
    }

    // 4. Parse response to get the newly created repo's clone URL
    #[derive(Deserialize)]
    #[allow(dead_code)]
    struct GhRepoResponse {
        clone_url: String,
        owner: GhOwner,
    }
    #[derive(Deserialize)]
    #[allow(dead_code)]
    struct GhOwner {
        login: String,
    }

    let created_repo: GhRepoResponse = match resp.json().await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(CreateFromTemplateResponse {
                    ok: false,
                    source: None,
                    error: Some("Failed to parse GitHub response".into()),
                    details: Some(e.to_string()),
                }),
            )
                .into_response();
        }
    };

    // GitHub repo generation is asynchronous sometimes, but the clone URL is returned immediately.
    // We may need to retry cloning if it's not immediately available, but for now we attempt to clone.

    // 5. Clone the new repository
    let clone_path = "/run/kryonix-installer/sources/kryonixos";
    let path = Path::new(clone_path);
    if path.exists() {
        let _ = tokio::fs::remove_dir_all(path).await;
    }
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    // Inject token for auth
    let authed_url = if let Some(rest) = created_repo.clone_url.strip_prefix("https://") {
        format!("https://x-access-token:{}@{}", token, rest)
    } else {
        created_repo.clone_url.clone()
    };

    // Try cloning with retries (up to 3 times) because template generation can take a few seconds
    let mut clone_success = false;
    let mut clone_err = String::new();
    for _ in 0..3 {
        let output = tokio::process::Command::new("git")
            .arg("clone")
            .arg("--depth")
            .arg("1")
            .arg("--branch")
            .arg(&req.branch)
            .arg(&authed_url)
            .arg(clone_path)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("HOME", "/nonexistent")
            .output()
            .await;

        if let Ok(out) = output {
            if out.status.success() {
                clone_success = true;
                break;
            } else {
                clone_err = String::from_utf8_lossy(&out.stderr).to_string();
                clone_err = clone_err.replace(&token, "***");
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }

    if !clone_success {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(CreateFromTemplateResponse {
                ok: false,
                source: None,
                error: Some("Failed to clone created repository".into()),
                details: Some(clone_err),
            }),
        )
            .into_response();
    }

    // 6. Validate flake.nix
    let flake_path = path.join("flake.nix");
    if !flake_path.exists() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(CreateFromTemplateResponse {
                ok: false,
                source: None,
                error: Some("Created repository does not contain a flake.nix".into()),
                details: None,
            }),
        )
            .into_response();
    }

    // 7. Success
    (
        StatusCode::OK,
        Json(CreateFromTemplateResponse {
            ok: true,
            source: Some(serde_json::json!({
                "kind": "github-create-from-template",
                "templateRepo": req.template_repo,
                "repo": created_repo.clone_url,
                "branch": req.branch,
                "clonePath": clone_path,
                "targetPath": "/etc/kryonixos",
                "validated": true,
                "created": true
            })),
            error: None,
            details: None,
        }),
    )
        .into_response()
}
