//! Per-device live system config + the staged config review/commit system.
//!
//! Routes here are merged into the `/routers` nest, so they live under `/routers/{id}/...`.

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    auth::{authorize_router, AuthUser},
    error::{AppError, Result},
    models::{
        CommitWithChanges, ConfigChange, ConfigCommit, DeviceSystemConfig,
        NewConfigChange, NtpServerLive, SystemConfigUpdate,
    },
    state::AppState,
    vyos::client::{VyosClient, VyosVersion},
};

use super::routers::{fetch_client, gateway_err};

const CHANGE_COLS: &str =
    "id, router_id, op, path, summary, section, created_by, created_at, status, commit_id";
const COMMIT_COLS: &str =
    "id, router_id, committed_by, committed_at, status, change_count, saved, error, vyos_response";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{id}/system", get(get_system))
        .route("/{id}/system/stage", post(stage_system))
        .route("/{id}/changes", get(list_changes).delete(discard_all))
        .route("/{id}/changes/{change_id}", axum::routing::delete(discard_one))
        .route("/{id}/commit", post(commit))
        .route("/{id}/commits", get(list_commits))
}

// ── Live read ───────────────────────────────────────────────────────────────

/// Internal snapshot of the device's current system config, used by both the
/// GET endpoint and the staging diff.
struct LiveSystem {
    hostname: Option<String>,
    domain_name: Option<String>,
    time_zone: Option<String>,
    ntp_enabled: bool,
    ntp_servers: Vec<String>,
    ntp_base: Vec<&'static str>,
}

/// NTP config lives under `system ntp` on 1.3 and `service ntp` on 1.4+.
fn ntp_base(client: &VyosClient) -> Vec<&'static str> {
    match client.version {
        VyosVersion::V1_3 => vec!["system", "ntp"],
        _ => vec!["service", "ntp"],
    }
}

/// Read a string-valued child of a config object, if present and non-empty.
fn child_str(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Reads the live `system` config subtree in one call. Errors (unreachable device,
/// bad API key, etc.) propagate so the caller returns 502 instead of blank fields.
async fn gather(client: &VyosClient) -> Result<LiveSystem> {
    let resp = client.show_config(&["system"]).await.map_err(gateway_err)?;
    if resp["success"].as_bool() != Some(true) {
        let err = resp["error"]
            .as_str()
            .unwrap_or("device returned an error reading system config");
        return Err(AppError::Gateway(err.to_string()));
    }

    // showConfig on a container node returns an object keyed by child node names.
    let data = &resp["data"];
    let hostname = child_str(data, "host-name");
    let domain_name = child_str(data, "domain-name");
    let time_zone = child_str(data, "time-zone");

    // NTP is under `system ntp` (1.3, already in `data`) vs `service ntp` (1.4+, separate call).
    let base = ntp_base(client);
    let ntp_value = if matches!(client.version, VyosVersion::V1_3) {
        data.get("ntp").cloned().unwrap_or(Value::Null)
    } else {
        let r = client.show_config(&base).await.map_err(gateway_err)?;
        if r["success"].as_bool() == Some(true) {
            r["data"].clone()
        } else {
            Value::Null
        }
    };

    let ntp_enabled = !ntp_value.is_null();
    let mut ntp_servers: Vec<String> = ntp_value["server"]
        .as_object()
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    ntp_servers.sort();

    Ok(LiveSystem {
        hostname,
        domain_name,
        time_zone,
        ntp_enabled,
        ntp_servers,
        ntp_base: base,
    })
}

async fn get_system(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<DeviceSystemConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let live = gather(&client).await?;

    // Operational: device clock (best-effort).
    let current_time = match client.show(&["date"]).await {
        Ok(resp) => resp["data"]
            .as_str()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        Err(_) => None,
    };

    let ntp_servers = live
        .ntp_servers
        .into_iter()
        .map(|server| NtpServerLive {
            server,
            ref_id: None,
            pull: None,
        })
        .collect();

    Ok(Json(DeviceSystemConfig {
        hostname: live.hostname,
        domain_name: live.domain_name,
        time_zone: live.time_zone,
        ntp_enabled: live.ntp_enabled,
        ntp_servers,
        current_time,
    }))
}

// ── Staging (system) ──────────────────────────────────────────────────────────

async fn stage_system(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SystemConfigUpdate>,
) -> Result<Json<Vec<ConfigChange>>> {
    let client = fetch_client(&state, &claims, id).await?;
    let live = gather(&client).await?;
    let changes = diff_system(&live, &body, claims.sub);

    // Re-staging recomputes against (still-unchanged) live config, so replace any prior
    // pending system changes rather than accumulating duplicates.
    sqlx::query(
        "DELETE FROM config_changes WHERE router_id = $1 AND section = 'system' AND status = 'pending'",
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    let mut inserted = Vec::with_capacity(changes.len());
    for c in changes {
        let row = sqlx::query_as::<_, ConfigChange>(&format!(
            "INSERT INTO config_changes (router_id, op, path, summary, section, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING {CHANGE_COLS}"
        ))
        .bind(id)
        .bind(&c.op)
        .bind(&c.path)
        .bind(&c.summary)
        .bind(&c.section)
        .bind(c.created_by)
        .fetch_one(&state.db)
        .await?;
        inserted.push(row);
    }

    Ok(Json(inserted))
}

/// Compute the minimal set/delete command list to turn `live` into the desired `update`.
fn diff_system(live: &LiveSystem, update: &SystemConfigUpdate, by: Uuid) -> Vec<NewConfigChange> {
    let mut out = Vec::new();
    let by = Some(by);
    let mk = |op: &str, path: Vec<String>, summary: String| NewConfigChange {
        op: op.to_string(),
        path,
        summary,
        section: "system".to_string(),
        created_by: by,
    };

    if let Some(hostname) = update.hostname.as_ref().map(|s| s.trim()) {
        if !hostname.is_empty() && Some(hostname) != live.hostname.as_deref() {
            out.push(mk(
                "set",
                vec!["system".into(), "host-name".into(), hostname.into()],
                format!("Hostname → {hostname}"),
            ));
        }
    }

    if let Some(domain) = update.domain_name.as_ref().map(|s| s.trim()) {
        if domain.is_empty() {
            if live.domain_name.is_some() {
                out.push(mk(
                    "delete",
                    vec!["system".into(), "domain-name".into()],
                    "Remove domain name".into(),
                ));
            }
        } else if Some(domain) != live.domain_name.as_deref() {
            out.push(mk(
                "set",
                vec!["system".into(), "domain-name".into(), domain.into()],
                format!("Domain name → {domain}"),
            ));
        }
    }

    if let Some(tz) = update.time_zone.as_ref().map(|s| s.trim()) {
        if !tz.is_empty() && Some(tz) != live.time_zone.as_deref() {
            out.push(mk(
                "set",
                vec!["system".into(), "time-zone".into(), tz.into()],
                format!("Time zone → {tz}"),
            ));
        }
    }

    let base: Vec<String> = live.ntp_base.iter().map(|s| s.to_string()).collect();

    // NTP disabled: drop the whole node if currently present.
    if update.ntp_enabled == Some(false) {
        if live.ntp_enabled {
            out.push(mk("delete", base.clone(), "Disable NTP".into()));
        }
        return out;
    }

    // Server set diff (only when an explicit list is provided).
    if let Some(desired) = &update.ntp_servers {
        let desired: Vec<String> = desired
            .iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        for srv in &desired {
            if !live.ntp_servers.contains(srv) {
                let mut path = base.clone();
                path.push("server".into());
                path.push(srv.clone());
                out.push(mk("set", path, format!("Add NTP server {srv}")));
            }
        }
        for srv in &live.ntp_servers {
            if !desired.contains(srv) {
                let mut path = base.clone();
                path.push("server".into());
                path.push(srv.clone());
                out.push(mk("delete", path, format!("Remove NTP server {srv}")));
            }
        }
    }

    out
}

// ── Change tray ────────────────────────────────────────────────────────────────

async fn list_changes(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<ConfigChange>>> {
    authorize_router(&state.db, &claims, id).await?;
    let changes = sqlx::query_as::<_, ConfigChange>(&format!(
        "SELECT {CHANGE_COLS} FROM config_changes
         WHERE router_id = $1 AND status = 'pending' ORDER BY created_at"
    ))
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(changes))
}

async fn discard_one(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path((id, change_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>> {
    authorize_router(&state.db, &claims, id).await?;
    let result = sqlx::query(
        "DELETE FROM config_changes WHERE id = $1 AND router_id = $2 AND status = 'pending'",
    )
    .bind(change_id)
    .bind(id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "discarded": change_id })))
}

async fn discard_all(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    authorize_router(&state.db, &claims, id).await?;
    let result = sqlx::query(
        "DELETE FROM config_changes WHERE router_id = $1 AND status = 'pending'",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    Ok(Json(json!({ "discarded": result.rows_affected() })))
}

// ── Commit ─────────────────────────────────────────────────────────────────────

async fn commit(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<CommitWithChanges>> {
    authorize_router(&state.db, &claims, id).await?;
    let actor = Some(claims.sub);

    let pending = sqlx::query_as::<_, ConfigChange>(&format!(
        "SELECT {CHANGE_COLS} FROM config_changes
         WHERE router_id = $1 AND status = 'pending' ORDER BY created_at"
    ))
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    if pending.is_empty() {
        return Err(AppError::Gateway("no pending changes to commit".into()));
    }

    let client = fetch_client(&state, &claims, id).await?;

    let cmds: Vec<Value> = pending
        .iter()
        .map(|c| json!({ "op": c.op, "path": c.path }))
        .collect();

    let configure_resp = client.configure(json!(cmds)).await.map_err(gateway_err)?;
    let applied = configure_resp["success"].as_bool() == Some(true);

    // Persist to boot config only if the apply succeeded.
    let mut saved = false;
    let mut response = configure_resp.clone();
    if applied {
        match client.save(None).await {
            Ok(save_resp) => {
                saved = save_resp["success"].as_bool() == Some(true);
                response = json!({ "configure": configure_resp, "save": save_resp });
            }
            Err(e) => {
                response = json!({ "configure": configure_resp, "save_error": e.to_string() });
            }
        }
    }

    let status = if applied { "success" } else { "failed" };
    let error = if applied {
        None
    } else {
        Some(
            configure_resp["error"]
                .as_str()
                .unwrap_or("device rejected the configuration")
                .to_string(),
        )
    };

    let commit_row = sqlx::query_as::<_, ConfigCommit>(&format!(
        "INSERT INTO config_commits
            (router_id, committed_by, status, change_count, saved, error, vyos_response)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING {COMMIT_COLS}"
    ))
    .bind(id)
    .bind(actor)
    .bind(status)
    .bind(pending.len() as i32)
    .bind(saved)
    .bind(&error)
    .bind(&response)
    .fetch_one(&state.db)
    .await?;

    // On success, mark the changes committed and link them to this commit.
    // On failure, leave them pending so the operator can fix and retry.
    let changes = if applied {
        sqlx::query_as::<_, ConfigChange>(&format!(
            "UPDATE config_changes SET status = 'committed', commit_id = $1
             WHERE router_id = $2 AND status = 'pending' RETURNING {CHANGE_COLS}"
        ))
        .bind(commit_row.id)
        .bind(id)
        .fetch_all(&state.db)
        .await?
    } else {
        pending
    };

    Ok(Json(CommitWithChanges {
        commit: commit_row,
        changes,
    }))
}

async fn list_commits(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<CommitWithChanges>>> {
    authorize_router(&state.db, &claims, id).await?;
    let commits = sqlx::query_as::<_, ConfigCommit>(&format!(
        "SELECT {COMMIT_COLS} FROM config_commits
         WHERE router_id = $1 ORDER BY committed_at DESC LIMIT 50"
    ))
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let mut out = Vec::with_capacity(commits.len());
    for commit in commits {
        let changes = sqlx::query_as::<_, ConfigChange>(&format!(
            "SELECT {CHANGE_COLS} FROM config_changes WHERE commit_id = $1 ORDER BY created_at"
        ))
        .bind(commit.id)
        .fetch_all(&state.db)
        .await?;
        out.push(CommitWithChanges { commit, changes });
    }

    Ok(Json(out))
}
