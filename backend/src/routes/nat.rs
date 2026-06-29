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
        Nat44RuleUpdate, Nat64Config, Nat66Config, NatRule, NewConfigChange, StaticNatDelete,
        StaticNatMapping, StaticNatUpdate,
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
        .route("/{id}/nat/nat44/static/stage", post(stage_static))
        .route("/{id}/nat/nat44/static/delete", post(delete_static))
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

/// A `group { <type> <name> }` reference under a `source`/`destination` section,
/// rendered as `<type> <name>` (e.g. `network-group NET-INSIDE-v4`).
fn group_ref(rule: &Value, section: &str) -> Option<String> {
    let obj = rule.get(section)?.get("group")?.as_object()?;
    let (ty, name) = obj.iter().next()?;
    name.as_str().map(|n| format!("{ty} {n}"))
}

/// Translation target: an address, `masquerade`, or a referenced pool.
fn translation(rule: &Value) -> Option<String> {
    nested_str(rule, "translation", "address")
        .or_else(|| nested_str(rule, "translation", "pool"))
        .or_else(|| rule["translation"]["pool"].as_object().and_then(|o| o.keys().next().cloned()))
        .or_else(|| rule["translation"].get("masquerade").map(|_| "masquerade".to_string()))
}

fn parse_rule(num: &str, cfg: &Value, iface_key: Option<&str>) -> NatRule {
    // 1.4+: `<iface_key> name <iface>` or `<iface_key> group <iface-group>`; 1.3: `<iface_key> <iface>`.
    let (interface, interface_group) = match iface_key {
        Some(k) => {
            if let Some(n) = nested_str(cfg, k, "name") {
                (Some(n), false)
            } else if let Some(g) = nested_str(cfg, k, "group") {
                (Some(g), true)
            } else {
                (child_str(cfg, k), false)
            }
        }
        None => (None, false),
    };
    NatRule {
        rule: num.to_string(),
        description: child_str(cfg, "description"),
        interface,
        interface_group,
        source: addr_or_prefix(cfg, "source"),
        source_group: group_ref(cfg, "source"),
        source_port: nested_str(cfg, "source", "port"),
        destination: addr_or_prefix(cfg, "destination"),
        destination_group: group_ref(cfg, "destination"),
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

/// Splits the live `nat` config into source/destination rule lists plus 1-to-1
/// (static) mappings. A rule number present in both `source` and `destination` whose
/// addresses mirror (source `source`→`translation` equals destination
/// `translation`←`destination`) is lifted into `static_nat` and removed from both lists.
fn split_static(node: &Value) -> (Vec<NatRule>, Vec<NatRule>, Vec<StaticNatMapping>) {
    let mut source = parse_rules(node, "source", Some("outbound-interface"));
    let mut destination = parse_rules(node, "destination", Some("inbound-interface"));
    let mut statics: Vec<StaticNatMapping> = Vec::new();
    let mut paired: Vec<String> = Vec::new();

    if let (Some(src), Some(dst)) =
        (node["source"]["rule"].as_object(), node["destination"]["rule"].as_object())
    {
        for (num, s) in src {
            let Some(d) = dst.get(num) else { continue };
            let internal = nested_str(s, "source", "address");
            let external = nested_str(s, "translation", "address");
            // Mirror check: both addresses present and swapped on the destination rule.
            if internal.is_none()
                || external.is_none()
                || nested_str(d, "destination", "address") != external
                || nested_str(d, "translation", "address") != internal
            {
                continue;
            }
            statics.push(StaticNatMapping {
                rule: num.clone(),
                description: child_str(s, "description").or_else(|| child_str(d, "description")),
                interface: nested_str(s, "outbound-interface", "name")
                    .or_else(|| child_str(s, "outbound-interface")),
                internal_address: internal,
                external_address: external,
                enabled: is_enabled(s) && is_enabled(d),
            });
            paired.push(num.clone());
        }
    }

    source.retain(|r| !paired.contains(&r.rule));
    destination.retain(|r| !paired.contains(&r.rule));
    statics.sort_by(|a, b| a.rule.parse::<u64>().unwrap_or(0).cmp(&b.rule.parse::<u64>().unwrap_or(0)));
    (source, destination, statics)
}

// ── handlers ───────────────────────────────────────────────────────────────────

async fn get_nat44(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Nat44Config>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = fetch_node(&client, &["nat"]).await?;
    let (source, destination, static_nat) = split_static(&data);
    Ok(Json(Nat44Config { source, destination, static_nat }))
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

    // Interface: written as `<key> name <iface>` or `<key> group <iface-group>` (1.4+),
    // read tolerates the 1.3 bare form. Clearing or switching kind removes the whole
    // `<key>` node first so the stale form is dropped before the new one is set.
    let (live_iface, live_group) = match live {
        Some(v) if nested_str(v, iface_key, "name").is_some() => (nested_str(v, iface_key, "name"), false),
        Some(v) if nested_str(v, iface_key, "group").is_some() => (nested_str(v, iface_key, "group"), true),
        Some(v) => (child_str(v, iface_key), false),
        None => (None, false),
    };
    let new_iface = body.interface.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    if (new_iface, body.interface_group) != (live_iface.as_deref(), live_group) {
        // Drop any existing form before re-setting (covers value changes and name↔group switches).
        if live_iface.is_some() {
            let mut path = base.clone();
            path.push(iface_key.into());
            out.push(NewConfigChange { op: "delete".into(), path, summary: format!("{name}: remove {iface_key}"), section: "nat".into(), created_by: by });
        }
        if let Some(i) = new_iface {
            let kind = if body.interface_group { "group" } else { "name" };
            let mut path = base.clone();
            path.extend([iface_key.to_string(), kind.to_string(), i.to_string()]);
            out.push(NewConfigChange { op: "set".into(), path, summary: format!("{name}: {iface_key} {kind} → {i}"), section: "nat".into(), created_by: by });
            created = true;
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

// ── Static (1-to-1) NAT staging ────────────────────────────────────────────────

/// Builds the source + destination `Nat44RuleUpdate`s backing one 1-to-1 mapping.
/// The source rule maps `internal → external`; the destination rule mirrors it
/// (`external → internal`). All non-static leaves are left `None` so editing a
/// mapping cleans up any stray ports/protocol on the underlying rules.
fn static_pair(body: &StaticNatUpdate) -> (Nat44RuleUpdate, Nat44RuleUpdate) {
    let src = Nat44RuleUpdate {
        section: "source".into(),
        rule: body.rule,
        description: body.description.clone(),
        interface: body.interface.clone(),
        interface_group: false,
        source_address: body.internal_address.clone(),
        source_port: None,
        destination_address: None,
        destination_port: None,
        translation_address: body.external_address.clone(),
        translation_port: None,
        protocol: None,
        exclude: false,
        log: false,
        enabled: body.enabled,
        original_rule: body.original_rule,
    };
    let dst = Nat44RuleUpdate {
        section: "destination".into(),
        rule: body.rule,
        description: body.description.clone(),
        interface: body.interface.clone(),
        interface_group: false,
        source_address: None,
        source_port: None,
        destination_address: body.external_address.clone(),
        destination_port: None,
        translation_address: body.internal_address.clone(),
        translation_port: None,
        protocol: None,
        exclude: false,
        log: false,
        enabled: body.enabled,
        original_rule: body.original_rule,
    };
    (src, dst)
}

async fn stage_static(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<StaticNatUpdate>,
) -> Result<Json<Vec<ConfigChange>>> {
    if !(1..=999999).contains(&body.rule) {
        return Err(AppError::BadRequest("rule number must be between 1 and 999999".into()));
    }

    let client = fetch_client(&state, &claims, id).await?;
    let data = fetch_node(&client, &["nat"]).await?;

    let (src, dst) = static_pair(&body);
    let mut changes = diff_nat44(&data, &src, claims.sub);
    changes.extend(diff_nat44(&data, &dst, claims.sub));

    // Both halves of the pair are restaged together (and their originals on a renumber).
    let mut targets = vec![rule_base("source", body.rule), rule_base("destination", body.rule)];
    if let Some(o) = body.original_rule {
        if o != body.rule {
            targets.push(rule_base("source", o));
            targets.push(rule_base("destination", o));
        }
    }

    let inserted = restage_nat(&state, id, &targets, changes).await?;
    Ok(Json(inserted))
}

async fn delete_static(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<StaticNatDelete>,
) -> Result<Json<Vec<ConfigChange>>> {
    authorize_router(&state.db, &claims, id).await?;

    let src = rule_base("source", body.rule);
    let dst = rule_base("destination", body.rule);
    let changes = vec![
        NewConfigChange {
            op: "delete".into(),
            path: src.clone(),
            summary: format!("Delete 1-to-1 NAT rule {} (source)", body.rule),
            section: "nat".into(),
            created_by: Some(claims.sub),
        },
        NewConfigChange {
            op: "delete".into(),
            path: dst.clone(),
            summary: format!("Delete 1-to-1 NAT rule {} (destination)", body.rule),
            section: "nat".into(),
            created_by: Some(claims.sub),
        },
    ];

    let inserted = restage_nat(&state, id, &[src, dst], changes).await?;
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
