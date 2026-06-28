//! Live interface inventory (ethernet + VLAN sub-interfaces), read from device config.
//! Merged into the `/routers` nest, so routes live under `/routers/{id}/interfaces/...`.

use axum::{extract::{Path, State}, routing::get, Json, Router};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::{EthernetInterface, VlanInterface},
    state::AppState,
};

use super::routers::{fetch_client, gateway_err};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{id}/interfaces/ethernet", get(list_ethernet))
        .route("/{id}/interfaces/vlan", get(list_vlan))
}

// ── parse helpers ──────────────────────────────────────────────────────────────

fn child_str(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn as_mtu(v: &Value) -> Option<i32> {
    v.get("mtu").and_then(|m| match m {
        Value::String(s) => s.trim().parse().ok(),
        Value::Number(n) => n.as_i64().map(|x| x as i32),
        _ => None,
    })
}

/// VyOS renders a multi-value node (`address`) as a JSON string when it holds one
/// value and a JSON array when it holds several.
fn as_addresses(v: &Value) -> Vec<String> {
    match v.get("address") {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|x| x.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

fn is_enabled(v: &Value) -> bool {
    // `disable` is a valueless leaf — its mere presence means the iface is down.
    v.get("disable").is_none()
}

/// Returns the `ethernet` config map (keyed by interface name, e.g. `eth0`).
///
/// We query the parent `["interfaces"]` node and read its `ethernet` child — the same
/// pattern that works for the System page (`["system"]` → `host-name`). Querying the tag
/// node directly (`["interfaces","ethernet"]`) gets wrapped as `{"ethernet": {...}}` on some
/// VyOS versions, which is why a single bogus "ethernet" row showed up.
async fn ethernet_config(state: &AppState, id: Uuid) -> Result<Value> {
    let client = fetch_client(state, id).await?;
    let resp = client
        .show_config(&["interfaces"])
        .await
        .map_err(gateway_err)?;

    if resp["success"].as_bool() == Some(true) {
        return Ok(resp["data"]["ethernet"].clone());
    }

    let err = resp["error"].as_str().unwrap_or_default();
    if err.to_lowercase().contains("empty") {
        // VyOS: "Configuration under specified path is empty" — nothing configured.
        Ok(Value::Null)
    } else {
        Err(AppError::Gateway(if err.is_empty() {
            "device returned an error reading interfaces".into()
        } else {
            err.to_string()
        }))
    }
}

// ── handlers ───────────────────────────────────────────────────────────────────

async fn list_ethernet(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<EthernetInterface>>> {
    let data = ethernet_config(&state, id).await?;

    let mut out: Vec<EthernetInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| EthernetInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    hw_id: child_str(cfg, "hw-id"),
                    speed: child_str(cfg, "speed"),
                    duplex: child_str(cfg, "duplex"),
                    enabled: is_enabled(cfg),
                    vlan_count: cfg["vif"].as_object().map(|v| v.len() as i32).unwrap_or(0),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_vlan(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<VlanInterface>>> {
    let data = ethernet_config(&state, id).await?;

    let mut out: Vec<VlanInterface> = Vec::new();
    if let Some(eths) = data.as_object() {
        for (parent, cfg) in eths {
            let Some(vifs) = cfg["vif"].as_object() else { continue };
            for (vid, vcfg) in vifs {
                out.push(VlanInterface {
                    name: format!("{parent}.{vid}"),
                    parent: parent.clone(),
                    vlan_id: vid.parse().unwrap_or(0),
                    description: child_str(vcfg, "description"),
                    addresses: as_addresses(vcfg),
                    mtu: as_mtu(vcfg),
                    enabled: is_enabled(vcfg),
                });
            }
        }
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}
