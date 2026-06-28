//! Live firewall config + staging. Merged into the `/routers` nest, so routes
//! live under `/routers/{id}/firewall/...`. Mirrors the System config pattern in
//! [`super::config`]: read live config, diff against the desired update, and stage
//! the minimal set of `set`/`delete` commands into the shared change tray.

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{AppError, Result},
    models::{
        ConfigChange, GlobalOptionsConfig, GlobalOptionsUpdate, NewConfigChange, StatePolicy,
        StatePolicyEntry,
    },
    state::AppState,
    vyos::client::VyosClient,
};

use super::config::insert_changes;
use super::routers::{fetch_client, gateway_err};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{id}/firewall/global-options", get(get_global_options))
        .route("/{id}/firewall/global-options/stage", post(stage_global_options))
}

const BASE: [&str; 2] = ["firewall", "global-options"];

/// The simple single-value options (toggles + selects), as
/// `(config key, accessor)` pairs — keeps the read/diff in lockstep so a new
/// option only needs adding in one list. The accessor maps the live config into
/// the matching field of [`GlobalOptionsConfig`].
const SINGLE_KEYS: [&str; 14] = [
    "all-ping",
    "broadcast-ping",
    "directed-broadcast",
    "ip-src-route",
    "ipv6-src-route",
    "ipv6-receive-redirects",
    "receive-redirects",
    "send-redirects",
    "log-martians",
    "syn-cookies",
    "twa-hazards-protection",
    "apply-to-bridge",
    "source-validation",
    "ipv6-source-validation",
];

// ── parse helpers ───────────────────────────────────────────────────────────

/// Read a string-valued child of a config object, if present and non-empty.
fn child_str(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

// ── live read ───────────────────────────────────────────────────────────────

/// Read the live `firewall global-options` subtree. Errors (unreachable device,
/// bad API key, etc.) propagate so the caller returns 502 instead of blank fields.
/// An absent subtree (no firewall config at all) yields an all-`None` result.
async fn gather_global_options(client: &VyosClient) -> Result<GlobalOptionsConfig> {
    let resp = client.show_config(&BASE).await.map_err(gateway_err)?;
    if resp["success"].as_bool() != Some(true) {
        let err = resp["error"]
            .as_str()
            .unwrap_or("device returned an error reading firewall config");
        return Err(AppError::Gateway(err.to_string()));
    }

    let data = &resp["data"];

    let state_policy = data.get("state-policy").map_or_else(StatePolicy::default, |sp| {
        let entry = |state: &str| StatePolicyEntry {
            action: sp.get(state).and_then(|e| child_str(e, "action")),
            log: sp.get(state).and_then(|e| e.get("log")).is_some(),
            log_level: sp
                .get(state)
                .and_then(|e| e.get("log-options"))
                .and_then(|lo| child_str(lo, "level")),
        };
        StatePolicy {
            established: entry("established"),
            related: entry("related"),
            invalid: entry("invalid"),
        }
    });

    Ok(GlobalOptionsConfig {
        all_ping: child_str(data, "all-ping"),
        broadcast_ping: child_str(data, "broadcast-ping"),
        directed_broadcast: child_str(data, "directed-broadcast"),
        ip_src_route: child_str(data, "ip-src-route"),
        ipv6_src_route: child_str(data, "ipv6-src-route"),
        ipv6_receive_redirects: child_str(data, "ipv6-receive-redirects"),
        receive_redirects: child_str(data, "receive-redirects"),
        send_redirects: child_str(data, "send-redirects"),
        log_martians: child_str(data, "log-martians"),
        syn_cookies: child_str(data, "syn-cookies"),
        twa_hazards_protection: child_str(data, "twa-hazards-protection"),
        apply_to_bridge: child_str(data, "apply-to-bridge"),
        source_validation: child_str(data, "source-validation"),
        ipv6_source_validation: child_str(data, "ipv6-source-validation"),
        resolver_cache: data.get("resolver-cache").is_some(),
        resolver_interval: child_str(data, "resolver-interval"),
        state_policy,
    })
}

async fn get_global_options(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<GlobalOptionsConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    Ok(Json(gather_global_options(&client).await?))
}

// ── staging ─────────────────────────────────────────────────────────────────

async fn stage_global_options(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<GlobalOptionsUpdate>,
) -> Result<Json<Vec<ConfigChange>>> {
    let client = fetch_client(&state, &claims, id).await?;
    let live = gather_global_options(&client).await?;
    let changes = diff_global_options(&live, &body, claims.sub);

    // Re-staging recomputes against (still-unchanged) live config, so replace any
    // prior pending firewall changes rather than accumulating duplicates.
    sqlx::query(
        "DELETE FROM config_changes WHERE router_id = $1 AND section = 'firewall' AND status = 'pending'",
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    let inserted = insert_changes(&state.db, id, changes).await?;
    Ok(Json(inserted))
}

/// Compute the minimal set/delete command list to turn `live` into `update`.
fn diff_global_options(
    live: &GlobalOptionsConfig,
    update: &GlobalOptionsUpdate,
    by: Uuid,
) -> Vec<NewConfigChange> {
    let mut out = Vec::new();
    let by = Some(by);
    let mk = |op: &str, path: Vec<String>, summary: String| NewConfigChange {
        op: op.to_string(),
        path,
        summary,
        section: "firewall".to_string(),
        created_by: by,
    };

    // A single-value leaf (`global-options <key> <value>`): set when the desired
    // value differs, delete when it should be absent but the device has it.
    let leaf = |key: &str, live_v: Option<&str>, desired: Option<&str>| -> Option<NewConfigChange> {
        let desired = desired.map(str::trim).filter(|s| !s.is_empty());
        if desired == live_v {
            return None;
        }
        Some(match desired {
            Some(v) => mk(
                "set",
                vec![BASE[0].into(), BASE[1].into(), key.into(), v.into()],
                format!("{key} → {v}"),
            ),
            None => mk(
                "delete",
                vec![BASE[0].into(), BASE[1].into(), key.into()],
                format!("Unset {key}"),
            ),
        })
    };

    // Pairs each key with its (live, desired) values, in SINGLE_KEYS order.
    let singles: [(Option<&str>, Option<&str>); 14] = [
        (live.all_ping.as_deref(), update.all_ping.as_deref()),
        (live.broadcast_ping.as_deref(), update.broadcast_ping.as_deref()),
        (live.directed_broadcast.as_deref(), update.directed_broadcast.as_deref()),
        (live.ip_src_route.as_deref(), update.ip_src_route.as_deref()),
        (live.ipv6_src_route.as_deref(), update.ipv6_src_route.as_deref()),
        (live.ipv6_receive_redirects.as_deref(), update.ipv6_receive_redirects.as_deref()),
        (live.receive_redirects.as_deref(), update.receive_redirects.as_deref()),
        (live.send_redirects.as_deref(), update.send_redirects.as_deref()),
        (live.log_martians.as_deref(), update.log_martians.as_deref()),
        (live.syn_cookies.as_deref(), update.syn_cookies.as_deref()),
        (live.twa_hazards_protection.as_deref(), update.twa_hazards_protection.as_deref()),
        (live.apply_to_bridge.as_deref(), update.apply_to_bridge.as_deref()),
        (live.source_validation.as_deref(), update.source_validation.as_deref()),
        (live.ipv6_source_validation.as_deref(), update.ipv6_source_validation.as_deref()),
    ];
    for (key, (live_v, desired)) in SINGLE_KEYS.iter().zip(singles) {
        out.extend(leaf(key, live_v, desired));
    }

    // resolver-cache: a valueless flag (present/absent).
    if update.resolver_cache != live.resolver_cache {
        if update.resolver_cache {
            out.push(mk(
                "set",
                vec![BASE[0].into(), BASE[1].into(), "resolver-cache".into()],
                "Enable resolver-cache".into(),
            ));
        } else {
            out.push(mk(
                "delete",
                vec![BASE[0].into(), BASE[1].into(), "resolver-cache".into()],
                "Disable resolver-cache".into(),
            ));
        }
    }

    out.extend(leaf(
        "resolver-interval",
        live.resolver_interval.as_deref(),
        update.resolver_interval.as_deref(),
    ));

    // state-policy: per-state action leaf + valueless log flag.
    let states: [(&str, &StatePolicyEntry, &crate::models::StatePolicyEntryUpdate); 3] = [
        ("established", &live.state_policy.established, &update.state_policy.established),
        ("related", &live.state_policy.related, &update.state_policy.related),
        ("invalid", &live.state_policy.invalid, &update.state_policy.invalid),
    ];
    for (state, live_entry, desired_entry) in states {
        let desired_action = desired_entry.action.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let live_action = live_entry.action.as_deref();

        // Clearing a state's action removes the whole state node (log included).
        if desired_action.is_none() {
            if live_action.is_some() {
                out.push(mk(
                    "delete",
                    vec![BASE[0].into(), BASE[1].into(), "state-policy".into(), state.into()],
                    format!("Unset {state} state-policy"),
                ));
            }
            continue;
        }

        let action = desired_action.unwrap();
        if Some(action) != live_action {
            out.push(mk(
                "set",
                vec![
                    BASE[0].into(),
                    BASE[1].into(),
                    "state-policy".into(),
                    state.into(),
                    "action".into(),
                    action.into(),
                ],
                format!("{state} state-policy → {action}"),
            ));
        }

        // log flag, only meaningful while the state has an action.
        if desired_entry.log != live_entry.log {
            let path = vec![
                BASE[0].into(),
                BASE[1].into(),
                "state-policy".into(),
                state.into(),
                "log".into(),
            ];
            if desired_entry.log {
                out.push(mk("set", path, format!("Enable {state} state-policy log")));
            } else {
                out.push(mk("delete", path, format!("Disable {state} state-policy log")));
            }
        }

        // log level (`log-options level`). The UI clears it when logging is off.
        let desired_level = desired_entry.log_level.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let live_level = live_entry.log_level.as_deref();
        if desired_level != live_level {
            let mut path = vec![
                BASE[0].into(),
                BASE[1].into(),
                "state-policy".into(),
                state.into(),
                "log-options".into(),
                "level".into(),
            ];
            match desired_level {
                Some(level) => {
                    path.push(level.into());
                    out.push(mk("set", path, format!("{state} state-policy log level → {level}")));
                }
                None => out.push(mk("delete", path, format!("Unset {state} state-policy log level"))),
            }
        }
    }

    out
}
