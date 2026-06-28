//! Live NAT inventory (NAT44, NAT64, NAT66, CGNAT), read from device config.
//! Merged into the `/routers` nest, so routes live under `/routers/{id}/nat/...`.

use axum::{extract::{Path, State}, routing::{get, post}, Json, Router};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::{authorize_router, AuthUser},
    error::{AppError, Result},
    models::{
        CgnatConfig, CgnatPool, CgnatRule, ConfigChange, Nat44Config, Nat44RuleDelete,
        Nat44RuleUpdate, Nat64Config, Nat66Config, NatRule, NewConfigChange,
    },
    state::AppState,
    vyos::client::VyosClient,
};

use super::config::insert_changes;
use super::routers::{fetch_client, gateway_err};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{id}/nat/nat44", get(get_nat44))
        .route("/{id}/nat/nat44/stage", post(stage_nat44))
        .route("/{id}/nat/nat44/delete", post(delete_nat44))
        .route("/{id}/nat/nat64", get(get_nat64))
        .route("/{id}/nat/nat66", get(get_nat66))
        .route("/{id}/nat/cgnat", get(get_cgnat))
}

// ── parse helpers ──────────────────────────────────────────────────────────────

fn child_str(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn nested_str(v: &Value, parent: &str, child: &str) -> Option<String> {
    v.get(parent).and_then(|p| child_str(p, child))
}

fn str_list(v: &Value, key: &str) -> Vec<String> {
    match v.get(key) {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Array(arr)) => arr.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(),
        _ => Vec::new(),
    }
}

fn is_enabled(v: &Value) -> bool {
    v.get("disable").is_none()
}

/// Fetches a top-level config subtree (e.g. `["nat"]`), returning `Null` when empty.
async fn fetch_node(client: &VyosClient, path: &[&str]) -> Result<Value> {
    let resp = client.show_config(path).await.map_err(gateway_err)?;
    if resp["success"].as_bool() == Some(true) {
        return Ok(resp["data"].clone());
    }
    let err = resp["error"].as_str().unwrap_or_default();
    if err.to_lowercase().contains("empty") {
        Ok(Value::Null)
    } else if err.is_empty() {
        Err(AppError::Gateway("device returned an error reading NAT".into()))
    } else {
        Err(AppError::Gateway(err.to_string()))
    }
}

/// Match address or prefix under a `source` / `destination` section.
fn addr_or_prefix(rule: &Value, section: &str) -> Option<String> {
    let s = &rule[section];
    child_str(s, "address").or_else(|| child_str(s, "prefix"))
}

/// Translation target: an address, `masquerade`, or a referenced pool.
fn translation(rule: &Value) -> Option<String> {
    nested_str(rule, "translation", "address")
        .or_else(|| nested_str(rule, "translation", "pool"))
        .or_else(|| rule["translation"]["pool"].as_object().and_then(|o| o.keys().next().cloned()))
        .or_else(|| rule["translation"].get("masquerade").map(|_| "masquerade".to_string()))
}

fn parse_rule(num: &str, cfg: &Value, iface_key: Option<&str>) -> NatRule {
    // 1.4+: `<iface_key> name <iface>`; 1.3: `<iface_key> <iface>`.
    let interface = iface_key.and_then(|k| nested_str(cfg, k, "name").or_else(|| child_str(cfg, k)));
    NatRule {
        rule: num.to_string(),
        description: child_str(cfg, "description"),
        interface,
        source: addr_or_prefix(cfg, "source"),
        source_port: nested_str(cfg, "source", "port"),
        destination: addr_or_prefix(cfg, "destination"),
        destination_port: nested_str(cfg, "destination", "port"),
        translation: translation(cfg),
        translation_port: nested_str(cfg, "translation", "port"),
        protocol: child_str(cfg, "protocol"),
        exclude: cfg.get("exclude").is_some(),
        log: cfg.get("log").is_some(),
        enabled: is_enabled(cfg),
    }
}

/// Parses `<section> rule <n>` into a sorted (by numeric rule) list.
fn parse_rules(node: &Value, section: &str, iface_key: Option<&str>) -> Vec<NatRule> {
    let mut out: Vec<NatRule> = node[section]["rule"]
        .as_object()
        .map(|m| m.iter().map(|(num, cfg)| parse_rule(num, cfg, iface_key)).collect())
        .unwrap_or_default();
    out.sort_by(|a, b| a.rule.parse::<u64>().unwrap_or(0).cmp(&b.rule.parse::<u64>().unwrap_or(0)));
    out
}

// ── handlers ───────────────────────────────────────────────────────────────────

async fn get_nat44(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Nat44Config>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = fetch_node(&client, &["nat"]).await?;
    Ok(Json(Nat44Config {
        source: parse_rules(&data, "source", Some("outbound-interface")),
        destination: parse_rules(&data, "destination", Some("inbound-interface")),
    }))
}

// ── NAT44 staging ────────────────────────────────────────────────────────────

/// `nat <section> rule <n>` base path for a rule.
fn rule_base(section: &str, rule: u32) -> Vec<String> {
    vec!["nat".into(), section.into(), "rule".into(), rule.to_string()]
}

/// Stage one set/delete leaf relative to a rule's base path. A non-empty `desired`
/// emits `set <base> <sub...> <value>`; an empty one deletes `<base> <sub...>` only
/// when the device currently has it. Mirrors the leaf diffing used elsewhere.
#[allow(clippy::too_many_arguments)]
fn nat_leaf(
    base: &[String],
    sub: &[&str],
    live_v: Option<String>,
    desired: &Option<String>,
    name: &str,
    field: &str,
    by: Option<Uuid>,
    out: &mut Vec<NewConfigChange>,
    created: &mut bool,
) {
    let desired = desired.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    if desired == live_v.as_deref() {
        return;
    }
    let mut path: Vec<String> = base.to_vec();
    path.extend(sub.iter().map(|s| s.to_string()));
    match desired {
        Some(v) => {
            path.push(v.to_string());
            out.push(NewConfigChange {
                op: "set".into(),
                path,
                summary: format!("{name}: {field} → {v}"),
                section: "nat".into(),
                created_by: by,
            });
            *created = true;
        }
        None => {
            if live_v.is_some() {
                out.push(NewConfigChange {
                    op: "delete".into(),
                    path,
                    summary: format!("{name}: remove {field}"),
                    section: "nat".into(),
                    created_by: by,
                });
            }
        }
    }
}

/// Diff a desired NAT44 rule against the live `nat` config into a minimal set/delete list.
fn diff_nat44(live_node: &Value, body: &Nat44RuleUpdate, by: Uuid) -> Vec<NewConfigChange> {
    let by = Some(by);
    let section = body.section.as_str();
    let iface_key = if section == "source" { "outbound-interface" } else { "inbound-interface" };
    let pretty = if section == "source" { "Source" } else { "Destination" };
    let name = format!("{pretty} rule {}", body.rule);
    let mut out = Vec::new();

    // A renumber is a move: drop the old rule and rebuild the target fresh.
    let moved = matches!(body.original_rule, Some(o) if o != body.rule);
    if moved {
        let o = body.original_rule.unwrap();
        out.push(NewConfigChange {
            op: "delete".into(),
            path: rule_base(section, o),
            summary: format!("Delete {pretty} NAT rule {o}"),
            section: "nat".into(),
            created_by: by,
        });
    }

    let num = body.rule.to_string();
    let live = if moved {
        None
    } else {
        live_node.get(section).and_then(|s| s.get("rule")).and_then(|r| r.get(&num))
    };
    let is_new = live.is_none();
    let base = rule_base(section, body.rule);
    let mut created = false;

    nat_leaf(&base, &["description"], live.and_then(|v| child_str(v, "description")), &body.description, &name, "description", by, &mut out, &mut created);
    nat_leaf(&base, &["source", "address"], live.and_then(|v| nested_str(v, "source", "address")), &body.source_address, &name, "source address", by, &mut out, &mut created);
    nat_leaf(&base, &["source", "port"], live.and_then(|v| nested_str(v, "source", "port")), &body.source_port, &name, "source port", by, &mut out, &mut created);
    nat_leaf(&base, &["destination", "address"], live.and_then(|v| nested_str(v, "destination", "address")), &body.destination_address, &name, "destination address", by, &mut out, &mut created);
    nat_leaf(&base, &["destination", "port"], live.and_then(|v| nested_str(v, "destination", "port")), &body.destination_port, &name, "destination port", by, &mut out, &mut created);
    nat_leaf(&base, &["protocol"], live.and_then(|v| child_str(v, "protocol")), &body.protocol, &name, "protocol", by, &mut out, &mut created);
    nat_leaf(&base, &["translation", "address"], live.and_then(|v| nested_str(v, "translation", "address")), &body.translation_address, &name, "translation address", by, &mut out, &mut created);
    nat_leaf(&base, &["translation", "port"], live.and_then(|v| nested_str(v, "translation", "port")), &body.translation_port, &name, "translation port", by, &mut out, &mut created);

    // Interface: written as `<key> name <iface>` (1.4+), read tolerates the 1.3 form.
    // Clearing removes the whole `<key>` node so either form is dropped.
    let live_iface = live.and_then(|v| nested_str(v, iface_key, "name").or_else(|| child_str(v, iface_key)));
    let new_iface = body.interface.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    if new_iface != live_iface.as_deref() {
        match new_iface {
            Some(i) => {
                let mut path = base.clone();
                path.extend([iface_key.to_string(), "name".to_string(), i.to_string()]);
                out.push(NewConfigChange { op: "set".into(), path, summary: format!("{name}: {iface_key} → {i}"), section: "nat".into(), created_by: by });
                created = true;
            }
            None => {
                if live_iface.is_some() {
                    let mut path = base.clone();
                    path.push(iface_key.into());
                    out.push(NewConfigChange { op: "delete".into(), path, summary: format!("{name}: remove {iface_key}"), section: "nat".into(), created_by: by });
                }
            }
        }
    }

    // Valueless flags.
    let flag = |out: &mut Vec<NewConfigChange>, created: &mut bool, key: &str, live_on: bool, desired: bool| {
        if desired == live_on {
            return;
        }
        let mut path = base.clone();
        path.push(key.into());
        if desired {
            out.push(NewConfigChange { op: "set".into(), path, summary: format!("{name}: enable {key}"), section: "nat".into(), created_by: by });
            *created = true;
        } else {
            out.push(NewConfigChange { op: "delete".into(), path, summary: format!("{name}: disable {key}"), section: "nat".into(), created_by: by });
        }
    };
    flag(&mut out, &mut created, "exclude", live.map(|v| v.get("exclude").is_some()).unwrap_or(false), body.exclude);
    flag(&mut out, &mut created, "log", live.map(|v| v.get("log").is_some()).unwrap_or(false), body.log);

    // Enabled state — VyOS models "down" as a valueless `disable` leaf. New rules default up.
    let live_enabled = live.map(is_enabled).unwrap_or(true);
    if body.enabled != live_enabled {
        let mut path = base.clone();
        path.push("disable".into());
        if body.enabled {
            out.push(NewConfigChange { op: "delete".into(), path, summary: format!("{name}: enable"), section: "nat".into(), created_by: by });
        } else {
            out.push(NewConfigChange { op: "set".into(), path, summary: format!("{name}: disable"), section: "nat".into(), created_by: by });
            created = true;
        }
    }

    // A new rule with no other set still needs the node created.
    if is_new && !created {
        out.push(NewConfigChange {
            op: "set".into(),
            path: base,
            summary: format!("Create {pretty} NAT rule {}", body.rule),
            section: "nat".into(),
            created_by: by,
        });
    }

    out
}

/// Replace any pending changes already targeting the given rule base paths, then stage `changes`.
async fn restage_nat(
    state: &AppState,
    id: Uuid,
    targets: &[Vec<String>],
    changes: Vec<NewConfigChange>,
) -> Result<Vec<ConfigChange>> {
    for t in targets {
        sqlx::query(
            "DELETE FROM config_changes
             WHERE router_id = $1 AND status = 'pending' AND path[1:4] = $2",
        )
        .bind(id)
        .bind(t)
        .execute(&state.db)
        .await?;
    }
    insert_changes(&state.db, id, changes).await
}

fn validate_section(section: &str) -> Result<()> {
    if section == "source" || section == "destination" {
        Ok(())
    } else {
        Err(AppError::BadRequest("section must be 'source' or 'destination'".into()))
    }
}

async fn stage_nat44(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Nat44RuleUpdate>,
) -> Result<Json<Vec<ConfigChange>>> {
    validate_section(&body.section)?;
    if !(1..=999999).contains(&body.rule) {
        return Err(AppError::BadRequest("rule number must be between 1 and 999999".into()));
    }

    let client = fetch_client(&state, &claims, id).await?;
    let data = fetch_node(&client, &["nat"]).await?;
    let changes = diff_nat44(&data, &body, claims.sub);

    // Clear stale pending changes for the target rule (and the original, on a renumber).
    let mut targets = vec![rule_base(&body.section, body.rule)];
    if let Some(o) = body.original_rule {
        if o != body.rule {
            targets.push(rule_base(&body.section, o));
        }
    }

    let inserted = restage_nat(&state, id, &targets, changes).await?;
    Ok(Json(inserted))
}

async fn delete_nat44(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Nat44RuleDelete>,
) -> Result<Json<Vec<ConfigChange>>> {
    validate_section(&body.section)?;
    authorize_router(&state.db, &claims, id).await?;

    let pretty = if body.section == "source" { "Source" } else { "Destination" };
    let base = rule_base(&body.section, body.rule);
    let change = NewConfigChange {
        op: "delete".into(),
        path: base.clone(),
        summary: format!("Delete {pretty} NAT rule {}", body.rule),
        section: "nat".into(),
        created_by: Some(claims.sub),
    };

    let inserted = restage_nat(&state, id, &[base], vec![change]).await?;
    Ok(Json(inserted))
}

async fn get_nat64(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Nat64Config>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = fetch_node(&client, &["nat64"]).await?;
    Ok(Json(Nat64Config {
        source: parse_rules(&data, "source", None),
    }))
}

async fn get_nat66(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Nat66Config>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = fetch_node(&client, &["nat66"]).await?;
    Ok(Json(Nat66Config {
        source: parse_rules(&data, "source", Some("outbound-interface")),
        destination: parse_rules(&data, "destination", Some("inbound-interface")),
    }))
}

async fn get_cgnat(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<CgnatConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = fetch_node(&client, &["nat"]).await?;
    let cg = &data["cgnat"];

    let mut pools: Vec<CgnatPool> = Vec::new();
    for kind in ["external", "internal"] {
        if let Some(m) = cg["pool"][kind].as_object() {
            for (name, p) in m {
                pools.push(CgnatPool {
                    kind: kind.to_string(),
                    name: name.clone(),
                    ranges: str_list(p, "range"),
                    external_port_range: child_str(p, "external-port-range"),
                });
            }
        }
    }
    pools.sort_by(|a, b| (a.kind.clone(), a.name.clone()).cmp(&(b.kind.clone(), b.name.clone())));

    let mut rules: Vec<CgnatRule> = cg["rule"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(num, r)| CgnatRule {
                    rule: num.clone(),
                    description: child_str(r, "description"),
                    source_pool: nested_str(r, "source", "pool"),
                    translation_pool: nested_str(r, "translation", "pool"),
                    enabled: is_enabled(r),
                })
                .collect()
        })
        .unwrap_or_default();
    rules.sort_by(|a, b| a.rule.parse::<u64>().unwrap_or(0).cmp(&b.rule.parse::<u64>().unwrap_or(0)));

    Ok(Json(CgnatConfig { pools, rules }))
}
