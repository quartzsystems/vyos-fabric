use axum::{
    extract::State,
    routing::get,
    Json, Router,
};

use crate::{
    error::{AppError, Result},
    models::{NtpServer, NtpServerInput, SystemConfig, SystemConfigFull, UpdateSystemConfig},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(get_config).patch(update_config))
}

async fn get_config(State(state): State<AppState>) -> Result<Json<SystemConfigFull>> {
    let config = sqlx::query_as::<_, SystemConfig>(
        "SELECT id, hostname, domain_name, timezone, ntp_enabled, updated_at FROM system_config LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let ntp_servers = sqlx::query_as::<_, NtpServer>(
        "SELECT id, server, ref_id, pull FROM ntp_servers ORDER BY server",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(SystemConfigFull {
        id: config.id,
        hostname: config.hostname,
        domain_name: config.domain_name,
        timezone: config.timezone,
        ntp_enabled: config.ntp_enabled,
        ntp_servers,
        updated_at: config.updated_at,
    }))
}

async fn update_config(
    State(state): State<AppState>,
    Json(body): Json<UpdateSystemConfig>,
) -> Result<Json<SystemConfigFull>> {
    if let Some(ref v) = body.hostname {
        sqlx::query("UPDATE system_config SET hostname = $1, updated_at = NOW()")
            .bind(v)
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = body.domain_name {
        sqlx::query("UPDATE system_config SET domain_name = $1, updated_at = NOW()")
            .bind(v)
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = body.timezone {
        sqlx::query("UPDATE system_config SET timezone = $1, updated_at = NOW()")
            .bind(v)
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = body.ntp_enabled {
        sqlx::query("UPDATE system_config SET ntp_enabled = $1, updated_at = NOW()")
            .bind(v)
            .execute(&state.db)
            .await?;
    }
    if let Some(servers) = body.ntp_servers {
        replace_ntp_servers(&state, servers).await?;
    }

    get_config(State(state)).await
}

async fn replace_ntp_servers(state: &AppState, servers: Vec<NtpServerInput>) -> Result<()> {
    sqlx::query("DELETE FROM ntp_servers")
        .execute(&state.db)
        .await?;
    for s in servers {
        sqlx::query(
            "INSERT INTO ntp_servers (server, ref_id, pull) VALUES ($1, $2, $3)",
        )
        .bind(&s.server)
        .bind(&s.ref_id)
        .bind(s.pull)
        .execute(&state.db)
        .await?;
    }
    Ok(())
}
