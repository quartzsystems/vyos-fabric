use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::{CreateSite, Router as RouterModel, Site, UpdateSite},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_sites).post(create_site))
        .route("/{id}", get(get_site).patch(update_site).delete(delete_site))
        .route("/{id}/routers", get(list_site_routers))
}

async fn list_sites(State(state): State<AppState>) -> Result<Json<Vec<Site>>> {
    let sites = sqlx::query_as::<_, Site>(
        "SELECT id, name, description, created_at FROM sites ORDER BY name",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(sites))
}

async fn get_site(State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<Json<Site>> {
    sqlx::query_as::<_, Site>(
        "SELECT id, name, description, created_at FROM sites WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .map(Json)
    .ok_or(AppError::NotFound)
}

async fn create_site(
    State(state): State<AppState>,
    Json(body): Json<CreateSite>,
) -> Result<(StatusCode, Json<Site>)> {
    let site = sqlx::query_as::<_, Site>(
        "INSERT INTO sites (name, description) VALUES ($1, $2)
         RETURNING id, name, description, created_at",
    )
    .bind(&body.name)
    .bind(&body.description)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(site)))
}

async fn update_site(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateSite>,
) -> Result<Json<Site>> {
    let site = sqlx::query_as::<_, Site>(
        "UPDATE sites SET
             name        = COALESCE($1, name),
             description = $2
         WHERE id = $3
         RETURNING id, name, description, created_at",
    )
    .bind(body.name)
    .bind(body.description)
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(site))
}

async fn delete_site(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM sites WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "deleted": id })))
}

async fn list_site_routers(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<RouterModel>>> {
    let routers = sqlx::query_as::<_, RouterModel>(
        "SELECT id, site_id, hostname, description, role, mgmt_ip, status, version, uptime_secs, \
         api_port, api_protocol, api_key, api_timeout, \
         ssh_username, ssh_password, ssh_port, \
         created_at, updated_at
         FROM routers WHERE site_id = $1 ORDER BY hostname",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(routers))
}
