use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::{accessible_site_ids, authorize_router, AuthUser, Claims},
    error::{AppError, Result},
    models::{CreateRouter, Router as RouterModel, RouterStatus, UpdateRouter},
    state::AppState,
    vyos::client::VyosClient,
};

fn admin_only(claims: &Claims) -> Result<()> {
    if claims.is_admin() { Ok(()) } else { Err(AppError::Forbidden) }
}

const COLS: &str =
    "id, site_id, hostname, description, role, mgmt_ip, status, version, uptime_secs, \
     api_port, api_protocol, api_key, api_timeout, \
     ssh_username, ssh_password, ssh_port, \
     created_at, updated_at";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_routers).post(create_router))
        .route("/{id}", get(get_router).patch(update_router).delete(delete_router))
        .route("/{id}/poll",      post(proxy_poll))
        .route("/{id}/retrieve",  post(proxy_retrieve))
        .route("/{id}/configure", post(proxy_configure))
        .route("/{id}/save",      post(proxy_save))
        .route("/{id}/show",      post(proxy_show))
        .route("/{id}/generate",  post(proxy_generate))
        .route("/{id}/reset",     post(proxy_reset))
        .route("/{id}/reboot",    post(proxy_reboot))
        .route("/{id}/poweroff",  post(proxy_poweroff))
        .route("/{id}/info",      get(proxy_info))
}

async fn list_routers(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<RouterModel>>> {
    let routers = if claims.is_admin() {
        sqlx::query_as::<_, RouterModel>(&format!("SELECT {COLS} FROM routers ORDER BY hostname"))
            .fetch_all(&state.db)
            .await?
    } else {
        let ids = accessible_site_ids(&state.db, claims.sub).await?;
        sqlx::query_as::<_, RouterModel>(&format!(
            "SELECT {COLS} FROM routers WHERE site_id = ANY($1) ORDER BY hostname"
        ))
        .bind(&ids)
        .fetch_all(&state.db)
        .await?
    };
    Ok(Json(routers))
}

async fn get_router(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<RouterModel>> {
    authorize_router(&state.db, &claims, id).await?;
    sqlx::query_as::<_, RouterModel>(
        &format!("SELECT {COLS} FROM routers WHERE id = $1"),
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .map(Json)
    .ok_or(AppError::NotFound)
}

async fn create_router(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(body): Json<CreateRouter>,
) -> Result<(StatusCode, Json<RouterModel>)> {
    admin_only(&claims)?;
    let router = sqlx::query_as::<_, RouterModel>(
        &format!(
            "INSERT INTO routers (site_id, hostname, role, description, mgmt_ip, status, version, uptime_secs)
             VALUES ($1, $2, $3, $4, $5, 'off', $6, 0)
             RETURNING {COLS}"
        ),
    )
    .bind(body.site_id)
    .bind(&body.hostname)
    .bind(&body.role)
    .bind(&body.description)
    .bind(&body.mgmt_ip)
    .bind(&body.version)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(router)))
}

async fn update_router(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateRouter>,
) -> Result<Json<RouterModel>> {
    admin_only(&claims)?;
    let router = sqlx::query_as::<_, RouterModel>(
        &format!(
            // Secrets ($7 api_key, $10 ssh_password) are write-only: only overwrite when a
            // non-empty value is supplied, otherwise keep the existing secret.
            "UPDATE routers SET
                 hostname     = COALESCE($1,  hostname),
                 description  = $2,
                 mgmt_ip      = COALESCE($3,  mgmt_ip),
                 version      = COALESCE($4,  version),
                 api_port     = $5,
                 api_protocol = COALESCE($6,  api_protocol),
                 api_key      = CASE WHEN $7::TEXT IS NULL OR $7 = '' THEN api_key ELSE $7 END,
                 api_timeout  = COALESCE($8,  api_timeout),
                 ssh_username = $9,
                 ssh_password = CASE WHEN $10::TEXT IS NULL OR $10 = '' THEN ssh_password ELSE $10 END,
                 ssh_port     = COALESCE($11, ssh_port),
                 updated_at   = NOW()
             WHERE id = $12
             RETURNING {COLS}"
        ),
    )
    .bind(body.hostname)
    .bind(body.description)
    .bind(body.mgmt_ip)
    .bind(body.version)
    .bind(body.api_port)
    .bind(body.api_protocol)
    .bind(body.api_key)
    .bind(body.api_timeout)
    .bind(body.ssh_username)
    .bind(body.ssh_password)
    .bind(body.ssh_port)
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(router))
}

async fn delete_router(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    admin_only(&claims)?;
    let result = sqlx::query("DELETE FROM routers WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "deleted": id })))
}

const _: () = { let _ = RouterStatus::Ok; };

// ── VyOS proxy helpers ────────────────────────────────────────────────────────

/// Builds a VyOS client for a device, enforcing that `claims` may access it. This is the
/// single funnel for every device operation, so the access check lives here.
pub(crate) async fn fetch_client(state: &AppState, claims: &Claims, id: Uuid) -> Result<VyosClient> {
    authorize_router(&state.db, claims, id).await?;

    let router = sqlx::query_as::<_, RouterModel>(
        &format!("SELECT {COLS} FROM routers WHERE id = $1"),
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let key = router
        .api_key
        .as_deref()
        .filter(|k| !k.is_empty())
        .ok_or_else(|| AppError::Gateway("no API key configured for this device".into()))?;

    VyosClient::new(
        &router.api_protocol,
        &router.mgmt_ip,
        router.api_port,
        key,
        router.api_timeout,
        &router.version,
    )
    .map_err(|e| AppError::Gateway(e.to_string()))
}

pub(crate) fn gateway_err(e: anyhow::Error) -> AppError {
    AppError::Gateway(e.to_string())
}

/// Quick poll: retrieve hostname and return raw VyOS response.
async fn proxy_poll(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    let resp = client.show_config(&["system", "host-name"]).await.map_err(gateway_err)?;
    Ok(Json(resp))
}

/// Generic /retrieve — body is the JSON payload forwarded verbatim.
async fn proxy_retrieve(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    let resp = client.post("/retrieve", body).await.map_err(gateway_err)?;
    Ok(Json(resp))
}

/// Generic /configure — body is forwarded verbatim (single command or array).
async fn proxy_configure(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    let resp = client.configure(body).await.map_err(gateway_err)?;
    Ok(Json(resp))
}

async fn proxy_save(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    let file = body
        .as_ref()
        .and_then(|Json(v)| v["file"].as_str().map(str::to_string));
    let resp = client.save(file.as_deref()).await.map_err(gateway_err)?;
    Ok(Json(resp))
}

async fn proxy_show(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    let resp = client.post("/show", body).await.map_err(gateway_err)?;
    Ok(Json(resp))
}

async fn proxy_generate(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    let resp = client.post("/generate", body).await.map_err(gateway_err)?;
    Ok(Json(resp))
}

async fn proxy_reset(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    let resp = client.post("/reset", body).await.map_err(gateway_err)?;
    Ok(Json(resp))
}

async fn proxy_reboot(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    if !client.version.has_reboot() {
        return Err(AppError::Gateway("reboot requires VyOS 1.4+".into()));
    }
    let resp = client.reboot().await.map_err(gateway_err)?;
    Ok(Json(resp))
}

async fn proxy_poweroff(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    if !client.version.has_reboot() {
        return Err(AppError::Gateway("poweroff requires VyOS 1.4+".into()));
    }
    let resp = client.poweroff().await.map_err(gateway_err)?;
    Ok(Json(resp))
}

async fn proxy_info(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let client = fetch_client(&state, &claims, id).await?;
    if !client.version.has_info() {
        return Err(AppError::Gateway("/info requires VyOS 1.5+".into()));
    }
    let resp = client.info().await.map_err(gateway_err)?;
    Ok(Json(resp))
}
