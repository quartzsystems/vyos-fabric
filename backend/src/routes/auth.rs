use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;

use crate::{
    error::{AppError, Result},
    models::{SiteAccessEntry, SiteAccessRow, User, UserWithAccess},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/login", post(login))
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<UserWithAccess>> {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, first_name, last_name, email, username, password_hash, role, created_at
         FROM users WHERE username = $1 AND password_hash = $2",
    )
    .bind(&body.username)
    .bind(&body.password)
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
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;

    let site_access = rows
        .into_iter()
        .map(|r| SiteAccessEntry { site_id: r.site_id, site_name: r.site_name, role: r.role })
        .collect();

    Ok(Json(UserWithAccess::from_user(user, site_access)))
}
