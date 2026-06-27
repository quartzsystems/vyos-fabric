use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::{CreateUser, GrantAccess, SiteAccessEntry, SiteAccessRow, UpdateUser, User, UserWithAccess},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_users).post(create_user))
        .route("/{id}", get(get_user).patch(update_user).delete(delete_user))
        .route("/{id}/access", axum::routing::post(grant_access))
        .route("/{id}/access/{site_id}", axum::routing::delete(revoke_access))
}

// ── helpers ───────────────────────────────────────────────────────────────────

async fn fetch_access_map(db: &sqlx::PgPool) -> Result<HashMap<Uuid, Vec<SiteAccessEntry>>> {
    let rows = sqlx::query_as::<_, SiteAccessRow>(
        "SELECT usa.user_id, usa.site_id, s.name AS site_name, usa.role
         FROM user_site_access usa
         JOIN sites s ON s.id = usa.site_id
         ORDER BY usa.user_id, s.name",
    )
    .fetch_all(db)
    .await?;

    let mut map: HashMap<Uuid, Vec<SiteAccessEntry>> = HashMap::new();
    for r in rows {
        map.entry(r.user_id).or_default().push(SiteAccessEntry {
            site_id: r.site_id,
            site_name: r.site_name,
            role: r.role,
        });
    }
    Ok(map)
}

async fn fetch_user_row(db: &sqlx::PgPool, id: Uuid) -> Result<User> {
    sqlx::query_as::<_, User>(
        "SELECT id, first_name, last_name, email, username, password_hash, role, created_at
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or(AppError::NotFound)
}

// ── handlers ──────────────────────────────────────────────────────────────────

async fn list_users(State(state): State<AppState>) -> Result<Json<Vec<UserWithAccess>>> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, first_name, last_name, email, username, password_hash, role, created_at
         FROM users ORDER BY username",
    )
    .fetch_all(&state.db)
    .await?;

    let mut access_map = fetch_access_map(&state.db).await?;

    let result = users
        .into_iter()
        .map(|u| {
            let access = access_map.remove(&u.id).unwrap_or_default();
            UserWithAccess::from_user(u, access)
        })
        .collect();

    Ok(Json(result))
}

async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<UserWithAccess>> {
    let user = fetch_user_row(&state.db, id).await?;
    let mut access_map = fetch_access_map(&state.db).await?;
    let access = access_map.remove(&id).unwrap_or_default();
    Ok(Json(UserWithAccess::from_user(user, access)))
}

async fn create_user(
    State(state): State<AppState>,
    Json(body): Json<CreateUser>,
) -> Result<(StatusCode, Json<UserWithAccess>)> {
    let role = body.role.unwrap_or_else(|| "operator".into());
    let first_name = body.first_name.unwrap_or_default();
    let last_name = body.last_name.unwrap_or_default();
    // TODO: replace with argon2 hash before shipping
    let password_hash = body.password;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (first_name, last_name, email, username, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, first_name, last_name, email, username, password_hash, role, created_at",
    )
    .bind(&first_name)
    .bind(&last_name)
    .bind(&body.email)
    .bind(&body.username)
    .bind(&password_hash)
    .bind(&role)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(UserWithAccess::from_user(user, vec![]))))
}

async fn update_user(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateUser>,
) -> Result<Json<UserWithAccess>> {
    let user = sqlx::query_as::<_, User>(
        "UPDATE users SET
             first_name    = COALESCE($1, first_name),
             last_name     = COALESCE($2, last_name),
             email         = CASE WHEN $3::TEXT IS NULL THEN email WHEN $3 = '' THEN NULL ELSE $3 END,
             username      = COALESCE($4, username),
             password_hash = CASE WHEN $5::TEXT IS NULL OR $5 = '' THEN password_hash ELSE $5 END,
             role          = COALESCE($6, role)
         WHERE id = $7
         RETURNING id, first_name, last_name, email, username, password_hash, role, created_at",
    )
    .bind(body.first_name)
    .bind(body.last_name)
    .bind(body.email)
    .bind(body.username)
    .bind(body.password)
    .bind(body.role)
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let mut access_map = fetch_access_map(&state.db).await?;
    let access = access_map.remove(&id).unwrap_or_default();
    Ok(Json(UserWithAccess::from_user(user, access)))
}

async fn delete_user(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "deleted": id })))
}

async fn grant_access(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(body): Json<GrantAccess>,
) -> Result<Json<serde_json::Value>> {
    sqlx::query(
        "INSERT INTO user_site_access (user_id, site_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, site_id) DO UPDATE SET role = EXCLUDED.role",
    )
    .bind(user_id)
    .bind(body.site_id)
    .bind(&body.role)
    .execute(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn revoke_access(
    State(state): State<AppState>,
    Path((user_id, site_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM user_site_access WHERE user_id = $1 AND site_id = $2")
        .bind(user_id)
        .bind(site_id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
