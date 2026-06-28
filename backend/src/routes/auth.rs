use axum::{
    extract::State,
    http::header::SET_COOKIE,
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    auth::{self, AuthUser, Claims, Verify},
    error::{AppError, Result},
    models::{SiteAccessEntry, SiteAccessRow, User, UserWithAccess},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    // login + logout are public; /auth/me is registered in routes::router behind require_auth.
    Router::new()
        .route("/login", post(login))
        .route("/logout", post(logout))
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

/// Loads a user plus their site-access list.
async fn load_user(state: &AppState, id: Uuid) -> Result<UserWithAccess> {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, first_name, last_name, email, username, password_hash, role, created_at
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let rows = sqlx::query_as::<_, SiteAccessRow>(
        "SELECT usa.user_id, usa.site_id, s.name AS site_name, usa.role
         FROM user_site_access usa
         JOIN sites s ON s.id = usa.site_id
         WHERE usa.user_id = $1
         ORDER BY s.name",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let site_access = rows
        .into_iter()
        .map(|r| SiteAccessEntry { site_id: r.site_id, site_name: r.site_name, role: r.role })
        .collect();

    Ok(UserWithAccess::from_user(user, site_access))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse> {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, first_name, last_name, email, username, password_hash, role, created_at
         FROM users WHERE username = $1",
    )
    .bind(&body.username)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    match auth::verify_password(&user.password_hash, &body.password) {
        Verify::Valid => {}
        Verify::LegacyPlaintext => {
            // Transparently upgrade the stored plaintext to an argon2 hash.
            if let Ok(hash) = auth::hash_password(&body.password) {
                let _ = sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
                    .bind(&hash)
                    .bind(user.id)
                    .execute(&state.db)
                    .await;
            }
        }
        Verify::Invalid => return Err(AppError::Unauthorized),
    }

    let claims = Claims::new(user.id, user.username.clone(), user.role.clone());
    let token = auth::encode_token(&claims, &state.jwt_secret).map_err(AppError::Internal)?;
    let body = load_user(&state, user.id).await?;

    Ok(([(SET_COOKIE, auth::session_cookie(&token))], Json(body)))
}

/// Returns the currently-authenticated user (the cookie is httpOnly, so the SPA can't read
/// it — this is how the frontend learns who is logged in).
pub async fn me(State(state): State<AppState>, AuthUser(claims): AuthUser) -> Result<Json<UserWithAccess>> {
    Ok(Json(load_user(&state, claims.sub).await?))
}

async fn logout() -> impl IntoResponse {
    (
        [(SET_COOKIE, auth::clear_cookie())],
        Json(serde_json::json!({ "ok": true })),
    )
}
