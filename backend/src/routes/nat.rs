//! Live NAT inventory (NAT44, NAT64, NAT66, CGNAT), read from device config.
//! Merged into the `/routers` nest, so routes live under `/routers/{id}/nat/...`.

use axum::{extract::{Path, State}, routing::get, Json, Router};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{AppError, Result},
    models::{CgnatConfig, CgnatPool, CgnatRule, Nat44Config, Nat64Config, Nat66Config, NatRule},
    state::AppState,
    vyos::client::VyosClient,
};

use super::routers::{fetch_client, gateway_err};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{id}/nat/nat44", get(get_nat44))
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
        destination: addr_or_prefix(cfg, "destination"),
        translation: translation(cfg),
        translation_port: nested_str(cfg, "translation", "port"),
        protocol: child_str(cfg, "protocol"),
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
