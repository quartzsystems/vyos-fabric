//! Live interface inventory (ethernet + VLAN sub-interfaces), read from device config.
//! Merged into the `/routers` nest, so routes live under `/routers/{id}/interfaces/...`.

use axum::{extract::{Path, State}, routing::{get, post}, Json, Router};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::{authorize_router, AuthUser, Claims},
    error::{AppError, Result},
    models::{
        BondingInterface, BridgeInterface, ConfigChange, DummyInterface, EthernetConfigUpdate,
        EthernetInterface, GeneveInterface, L2tpv3Interface, LoopbackInterface, MacsecInterface,
        MacvlanInterface, NewConfigChange, OpenvpnInterface, PppoeInterface, SstpcInterface,
        TunnelInterface, VethInterface, VlanConfigUpdate, VlanDelete, VlanInterface, VtiInterface,
        VxlanInterface, WireguardInterface, WlanInterface, WwanInterface,
    },
    state::AppState,
};

use super::config::insert_changes;
use super::routers::{fetch_client, gateway_err};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{id}/interfaces/ethernet", get(list_ethernet))
        .route("/{id}/interfaces/ethernet/physical", get(list_physical_ethernet))
        .route("/{id}/interfaces/ethernet/stage", post(stage_ethernet))
        .route("/{id}/interfaces/vlan", get(list_vlan))
        .route("/{id}/interfaces/vlan/stage", post(stage_vlan))
        .route("/{id}/interfaces/vlan/delete", post(delete_vlan))
        .route("/{id}/interfaces/bonding", get(list_bonding))
        .route("/{id}/interfaces/bridge", get(list_bridge))
        .route("/{id}/interfaces/dummy", get(list_dummy))
        .route("/{id}/interfaces/geneve", get(list_geneve))
        .route("/{id}/interfaces/l2tpv3", get(list_l2tpv3))
        .route("/{id}/interfaces/loopback", get(list_loopback))
        .route("/{id}/interfaces/macsec", get(list_macsec))
        .route("/{id}/interfaces/openvpn", get(list_openvpn))
        .route("/{id}/interfaces/wireguard", get(list_wireguard))
        .route("/{id}/interfaces/pppoe", get(list_pppoe))
        .route("/{id}/interfaces/macvlan", get(list_macvlan))
        .route("/{id}/interfaces/sstpc", get(list_sstpc))
        .route("/{id}/interfaces/tunnel", get(list_tunnel))
        .route("/{id}/interfaces/veth", get(list_veth))
        .route("/{id}/interfaces/vti", get(list_vti))
        .route("/{id}/interfaces/vxlan", get(list_vxlan))
        .route("/{id}/interfaces/wlan", get(list_wlan))
        .route("/{id}/interfaces/wwan", get(list_wwan))
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

/// Reads `<parent> <child>` as a trimmed non-empty string (e.g. `authentication username`).
fn nested_str(v: &Value, parent: &str, child: &str) -> Option<String> {
    v.get(parent).and_then(|p| child_str(p, child))
}

/// Bonding/bridge members live under `member interface <name>` (1.4+).
fn members(v: &Value) -> Vec<String> {
    let mut m: Vec<String> = v["member"]["interface"]
        .as_object()
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();
    m.sort();
    m
}

/// Returns the config map for one interface type (keyed by interface name, e.g. `eth0`).
///
/// We query the parent `["interfaces"]` node and read its `<kind>` child — the same pattern
/// that works for the System page (`["system"]` → `host-name`). Querying the tag node directly
/// (`["interfaces","ethernet"]`) gets wrapped as `{"ethernet": {...}}` on some VyOS versions.
async fn interface_config(state: &AppState, claims: &Claims, id: Uuid, kind: &str) -> Result<Value> {
    let client = fetch_client(state, claims, id).await?;
    let resp = client
        .show_config(&["interfaces"])
        .await
        .map_err(gateway_err)?;

    if resp["success"].as_bool() == Some(true) {
        return Ok(resp["data"][kind].clone());
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
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<EthernetInterface>>> {
    let data = interface_config(&state, &claims, id, "ethernet").await?;

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

// ── Ethernet staging ─────────────────────────────────────────────────────────

/// Parse interface names from the first column of `show interfaces ethernet` op output.
/// The table starts after a dashed separator line; vif sub-interfaces (`eth1.20`) are skipped.
fn parse_ethernet_names(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_table = false;
    for line in text.lines() {
        let t = line.trim_start();
        if !in_table {
            if t.starts_with("---") {
                in_table = true;
            }
            continue;
        }
        let Some(tok) = t.split_whitespace().next() else { continue };
        if tok.contains('.') {
            continue; // vif sub-interface, not a physical NIC
        }
        if tok.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) {
            out.push(tok.to_string());
        }
    }
    out
}

/// The full set of physical ethernet NICs present on the device (configured or not),
/// read from operational state. The UI subtracts already-configured ones to find which
/// are free to add.
async fn list_physical_ethernet(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<String>>> {
    let client = fetch_client(&state, &claims, id).await?;
    let resp = client.show(&["interfaces", "ethernet"]).await.map_err(gateway_err)?;
    let text = resp["data"].as_str().unwrap_or_default();
    let mut names = parse_ethernet_names(text);
    names.sort();
    names.dedup();
    Ok(Json(names))
}

/// Config path of a physical ethernet node: `interfaces ethernet <name>`.
fn eth_base(name: &str) -> Vec<String> {
    vec!["interfaces".into(), "ethernet".into(), name.into()]
}

/// Diff a desired ethernet config against the live config into a minimal set/delete list.
fn diff_ethernet(eth: &Value, u: &EthernetConfigUpdate, by: Uuid) -> Vec<NewConfigChange> {
    let by = Some(by);
    let name = &u.name;
    let live = eth.get(name);
    let is_new = live.is_none();

    let base = eth_base(name);
    let mk = |op: &str, suffix: &[&str], summary: String| {
        let mut path = base.clone();
        path.extend(suffix.iter().map(|s| s.to_string()));
        NewConfigChange {
            op: op.into(),
            path,
            summary,
            section: "interfaces".into(),
            created_by: by,
        }
    };

    let mut out = Vec::new();
    let mut created_via_set = false;

    // Description.
    let live_desc = live.and_then(|v| child_str(v, "description"));
    let new_desc = u
        .description
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if new_desc != live_desc {
        if let Some(d) = &new_desc {
            out.push(mk("set", &["description", d.as_str()], format!("{name}: description → {d}")));
            created_via_set = true;
        } else {
            out.push(mk("delete", &["description"], format!("{name}: remove description")));
        }
    }

    // Addresses (multi-value).
    let live_addrs = live.map(as_addresses).unwrap_or_default();
    let new_addrs: Vec<String> = u
        .addresses
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    for a in &new_addrs {
        if !live_addrs.contains(a) {
            out.push(mk("set", &["address", a.as_str()], format!("{name}: add address {a}")));
            created_via_set = true;
        }
    }
    for a in &live_addrs {
        if !new_addrs.contains(a) {
            out.push(mk("delete", &["address", a.as_str()], format!("{name}: remove address {a}")));
        }
    }

    // MTU.
    let live_mtu = live.and_then(as_mtu);
    if u.mtu != live_mtu {
        if let Some(m) = u.mtu {
            out.push(mk("set", &["mtu", m.to_string().as_str()], format!("{name}: MTU → {m}")));
            created_via_set = true;
        } else {
            out.push(mk("delete", &["mtu"], format!("{name}: remove MTU")));
        }
    }

    // Speed — `None`/empty means auto (the default), modelled by deleting the explicit leaf.
    let live_speed = live.and_then(|v| child_str(v, "speed"));
    let new_speed = u.speed.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if new_speed != live_speed {
        if let Some(s) = &new_speed {
            out.push(mk("set", &["speed", s.as_str()], format!("{name}: speed → {s}")));
            created_via_set = true;
        } else {
            out.push(mk("delete", &["speed"], format!("{name}: speed → auto")));
        }
    }

    // Duplex — same auto-default handling as speed.
    let live_duplex = live.and_then(|v| child_str(v, "duplex"));
    let new_duplex = u.duplex.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if new_duplex != live_duplex {
        if let Some(d) = &new_duplex {
            out.push(mk("set", &["duplex", d.as_str()], format!("{name}: duplex → {d}")));
            created_via_set = true;
        } else {
            out.push(mk("delete", &["duplex"], format!("{name}: duplex → auto")));
        }
    }

    // Enabled state — VyOS models "down" as a valueless `disable` leaf. New NICs default up.
    let live_enabled = live.map(is_enabled).unwrap_or(true);
    if u.enabled != live_enabled {
        if u.enabled {
            out.push(mk("delete", &["disable"], format!("{name}: enable")));
        } else {
            out.push(mk("set", &["disable"], format!("{name}: disable")));
            created_via_set = true;
        }
    }

    // Configuring a previously-unconfigured NIC with nothing else still needs the node created.
    if is_new && !created_via_set {
        out.push(NewConfigChange {
            op: "set".into(),
            path: base,
            summary: format!("Configure {name}"),
            section: "interfaces".into(),
            created_by: by,
        });
    }

    out
}

async fn stage_ethernet(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<EthernetConfigUpdate>,
) -> Result<Json<Vec<ConfigChange>>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("interface name is required".into()));
    }

    let eth = interface_config(&state, &claims, id, "ethernet").await?;
    let changes = diff_ethernet(&eth, &body, claims.sub);

    // Replace this NIC's stale pending changes, but leave its VLAN (vif) changes alone —
    // those are staged separately and keyed by a deeper path.
    sqlx::query(
        "DELETE FROM config_changes
         WHERE router_id = $1 AND status = 'pending'
           AND path[1:3] = $2 AND path[4] IS DISTINCT FROM 'vif'",
    )
    .bind(id)
    .bind(eth_base(&body.name))
    .execute(&state.db)
    .await?;

    let inserted = insert_changes(&state.db, id, changes).await?;
    Ok(Json(inserted))
}

async fn list_vlan(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<VlanInterface>>> {
    let data = interface_config(&state, &claims, id, "ethernet").await?;

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

// ── VLAN staging ─────────────────────────────────────────────────────────────

/// Config path of a VLAN sub-interface node: `interfaces ethernet <parent> vif <id>`.
fn vif_base(parent: &str, vid: i32) -> Vec<String> {
    vec![
        "interfaces".into(),
        "ethernet".into(),
        parent.into(),
        "vif".into(),
        vid.to_string(),
    ]
}

/// The live config object for one vif (`None` when it doesn't exist yet).
fn live_vif<'a>(eth: &'a Value, parent: &str, vid: i32) -> Option<&'a Value> {
    eth.get(parent)?.get("vif")?.get(vid.to_string())
}

/// Diff a desired VLAN against the live ethernet config into a minimal set/delete list.
fn diff_vlan(eth: &Value, update: &VlanConfigUpdate, by: Uuid) -> Vec<NewConfigChange> {
    let by = Some(by);
    let name = format!("{}.{}", update.parent, update.vlan_id);
    let mut out = Vec::new();

    // An edit that changes parent or id is a move: drop the old vif and rebuild fresh.
    let moved = matches!(
        (&update.original_parent, update.original_vlan_id),
        (Some(op), Some(ovid)) if op != &update.parent || ovid != update.vlan_id
    );
    if moved {
        let op = update.original_parent.as_deref().unwrap();
        let ovid = update.original_vlan_id.unwrap();
        out.push(NewConfigChange {
            op: "delete".into(),
            path: vif_base(op, ovid),
            summary: format!("Delete VLAN {op}.{ovid}"),
            section: "interfaces".into(),
            created_by: by,
        });
    }

    // After a move the target is brand new, so diff against an empty live config.
    let live = if moved {
        None
    } else {
        live_vif(eth, &update.parent, update.vlan_id)
    };
    let is_new = live.is_none();

    let base = vif_base(&update.parent, update.vlan_id);
    let mk = |op: &str, suffix: &[&str], summary: String| {
        let mut path = base.clone();
        path.extend(suffix.iter().map(|s| s.to_string()));
        NewConfigChange {
            op: op.into(),
            path,
            summary,
            section: "interfaces".into(),
            created_by: by,
        }
    };

    // Whether we've emitted any `set` that implicitly creates the vif node.
    let mut created_via_set = false;

    // Description.
    let live_desc = live.and_then(|v| child_str(v, "description"));
    let new_desc = update
        .description
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if new_desc != live_desc {
        if let Some(d) = &new_desc {
            out.push(mk("set", &["description", d.as_str()], format!("{name}: description → {d}")));
            created_via_set = true;
        } else {
            out.push(mk("delete", &["description"], format!("{name}: remove description")));
        }
    }

    // Addresses (multi-value).
    let live_addrs = live.map(as_addresses).unwrap_or_default();
    let new_addrs: Vec<String> = update
        .addresses
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    for a in &new_addrs {
        if !live_addrs.contains(a) {
            out.push(mk("set", &["address", a.as_str()], format!("{name}: add address {a}")));
            created_via_set = true;
        }
    }
    for a in &live_addrs {
        if !new_addrs.contains(a) {
            out.push(mk("delete", &["address", a.as_str()], format!("{name}: remove address {a}")));
        }
    }

    // MTU.
    let live_mtu = live.and_then(as_mtu);
    if update.mtu != live_mtu {
        if let Some(m) = update.mtu {
            out.push(mk("set", &["mtu", m.to_string().as_str()], format!("{name}: MTU → {m}")));
            created_via_set = true;
        } else {
            out.push(mk("delete", &["mtu"], format!("{name}: remove MTU")));
        }
    }

    // Enabled state — VyOS models "down" as a valueless `disable` leaf. New vifs default up.
    let live_enabled = live.map(is_enabled).unwrap_or(true);
    if update.enabled != live_enabled {
        if update.enabled {
            out.push(mk("delete", &["disable"], format!("{name}: enable")));
        } else {
            out.push(mk("set", &["disable"], format!("{name}: disable")));
            created_via_set = true;
        }
    }

    // A new VLAN with no other set (e.g. only a parent + id) still needs the node created.
    if is_new && !created_via_set {
        out.push(NewConfigChange {
            op: "set".into(),
            path: base,
            summary: format!("Create VLAN {name}"),
            section: "interfaces".into(),
            created_by: by,
        });
    }

    out
}

/// Replace any pending changes already targeting `vif_base` paths, then stage `changes`.
async fn restage_vif(
    state: &AppState,
    id: Uuid,
    targets: &[Vec<String>],
    changes: Vec<NewConfigChange>,
) -> Result<Vec<ConfigChange>> {
    for t in targets {
        sqlx::query(
            "DELETE FROM config_changes
             WHERE router_id = $1 AND status = 'pending' AND path[1:5] = $2",
        )
        .bind(id)
        .bind(t)
        .execute(&state.db)
        .await?;
    }
    insert_changes(&state.db, id, changes).await
}

async fn stage_vlan(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<VlanConfigUpdate>,
) -> Result<Json<Vec<ConfigChange>>> {
    if !(1..=4094).contains(&body.vlan_id) {
        return Err(AppError::BadRequest("VLAN ID must be between 1 and 4094".into()));
    }

    let eth = interface_config(&state, &claims, id, "ethernet").await?;
    let changes = diff_vlan(&eth, &body, claims.sub);

    // Clear stale pending changes for the target vif (and the original, on a move).
    let mut targets = vec![vif_base(&body.parent, body.vlan_id)];
    if let (Some(op), Some(ovid)) = (&body.original_parent, body.original_vlan_id) {
        if op != &body.parent || ovid != body.vlan_id {
            targets.push(vif_base(op, ovid));
        }
    }

    let inserted = restage_vif(&state, id, &targets, changes).await?;
    Ok(Json(inserted))
}

async fn delete_vlan(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<VlanDelete>,
) -> Result<Json<Vec<ConfigChange>>> {
    authorize_router(&state.db, &claims, id).await?;

    let base = vif_base(&body.parent, body.vlan_id);
    let change = NewConfigChange {
        op: "delete".into(),
        path: base.clone(),
        summary: format!("Delete VLAN {}.{}", body.parent, body.vlan_id),
        section: "interfaces".into(),
        created_by: Some(claims.sub),
    };

    let inserted = restage_vif(&state, id, &[base], vec![change]).await?;
    Ok(Json(inserted))
}

async fn list_bonding(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<BondingInterface>>> {
    let data = interface_config(&state, &claims, id, "bonding").await?;

    let mut out: Vec<BondingInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| BondingInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    mode: child_str(cfg, "mode"),
                    members: members(cfg),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_dummy(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<DummyInterface>>> {
    let data = interface_config(&state, &claims, id, "dummy").await?;

    let mut out: Vec<DummyInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| DummyInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_geneve(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<GeneveInterface>>> {
    let data = interface_config(&state, &claims, id, "geneve").await?;

    let mut out: Vec<GeneveInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| GeneveInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    vni: child_str(cfg, "vni"),
                    remote: child_str(cfg, "remote"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_l2tpv3(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<L2tpv3Interface>>> {
    let data = interface_config(&state, &claims, id, "l2tpv3").await?;

    let mut out: Vec<L2tpv3Interface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| L2tpv3Interface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    source_address: child_str(cfg, "source-address"),
                    remote: child_str(cfg, "remote"),
                    tunnel_id: child_str(cfg, "tunnel-id"),
                    peer_tunnel_id: child_str(cfg, "peer-tunnel-id"),
                    session_id: child_str(cfg, "session-id"),
                    peer_session_id: child_str(cfg, "peer-session-id"),
                    encapsulation: child_str(cfg, "encapsulation"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_bridge(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<BridgeInterface>>> {
    let data = interface_config(&state, &claims, id, "bridge").await?;

    let mut out: Vec<BridgeInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| BridgeInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    members: members(cfg),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_loopback(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<LoopbackInterface>>> {
    let data = interface_config(&state, &claims, id, "loopback").await?;

    let mut out: Vec<LoopbackInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| LoopbackInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_macsec(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<MacsecInterface>>> {
    let data = interface_config(&state, &claims, id, "macsec").await?;

    let mut out: Vec<MacsecInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| MacsecInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    source_interface: child_str(cfg, "source-interface"),
                    cipher: nested_str(cfg, "security", "cipher"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_openvpn(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<OpenvpnInterface>>> {
    let data = interface_config(&state, &claims, id, "openvpn").await?;

    let mut out: Vec<OpenvpnInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| OpenvpnInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    mode: child_str(cfg, "mode"),
                    protocol: child_str(cfg, "protocol"),
                    local_host: child_str(cfg, "local-host"),
                    remote_host: child_str(cfg, "remote-host"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_wireguard(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<WireguardInterface>>> {
    let data = interface_config(&state, &claims, id, "wireguard").await?;

    let mut out: Vec<WireguardInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| WireguardInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    port: child_str(cfg, "port"),
                    peer_count: cfg["peer"].as_object().map(|o| o.len() as i32).unwrap_or(0),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_pppoe(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<PppoeInterface>>> {
    let data = interface_config(&state, &claims, id, "pppoe").await?;

    let mut out: Vec<PppoeInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| PppoeInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    source_interface: child_str(cfg, "source-interface"),
                    username: nested_str(cfg, "authentication", "username"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_macvlan(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<MacvlanInterface>>> {
    let data = interface_config(&state, &claims, id, "pseudo-ethernet").await?;

    let mut out: Vec<MacvlanInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| MacvlanInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    source_interface: child_str(cfg, "source-interface"),
                    mode: child_str(cfg, "mode"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_sstpc(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<SstpcInterface>>> {
    let data = interface_config(&state, &claims, id, "sstpc").await?;

    let mut out: Vec<SstpcInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| SstpcInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    server: child_str(cfg, "server"),
                    username: nested_str(cfg, "authentication", "username"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_tunnel(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<TunnelInterface>>> {
    let data = interface_config(&state, &claims, id, "tunnel").await?;

    let mut out: Vec<TunnelInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| TunnelInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    encapsulation: child_str(cfg, "encapsulation"),
                    source_address: child_str(cfg, "source-address"),
                    remote: child_str(cfg, "remote"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_veth(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<VethInterface>>> {
    let data = interface_config(&state, &claims, id, "virtual-ethernet").await?;

    let mut out: Vec<VethInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| VethInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    peer_name: child_str(cfg, "peer-name"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_vti(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<VtiInterface>>> {
    let data = interface_config(&state, &claims, id, "vti").await?;

    let mut out: Vec<VtiInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| VtiInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_vxlan(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<VxlanInterface>>> {
    let data = interface_config(&state, &claims, id, "vxlan").await?;

    let mut out: Vec<VxlanInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| VxlanInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    vni: child_str(cfg, "vni"),
                    remote: child_str(cfg, "remote"),
                    source_address: child_str(cfg, "source-address"),
                    port: child_str(cfg, "port"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_wlan(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<WlanInterface>>> {
    let data = interface_config(&state, &claims, id, "wireless").await?;

    let mut out: Vec<WlanInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| WlanInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    interface_type: child_str(cfg, "type"),
                    ssid: child_str(cfg, "ssid"),
                    channel: child_str(cfg, "channel"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

async fn list_wwan(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<WwanInterface>>> {
    let data = interface_config(&state, &claims, id, "wwan").await?;

    let mut out: Vec<WwanInterface> = data
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| WwanInterface {
                    name: name.clone(),
                    description: child_str(cfg, "description"),
                    addresses: as_addresses(cfg),
                    mtu: as_mtu(cfg),
                    apn: child_str(cfg, "apn"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}
