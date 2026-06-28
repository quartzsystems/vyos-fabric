//! Live service inventory, read from device config + operational state.
//! Merged into the `/routers` nest, so routes live under `/routers/{id}/services/...`.

use axum::{extract::{Path, State}, routing::get, Json, Router};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{AppError, Result},
    models::{
        BroadcastRelayId, ConfigSyncConfig, ConntrackSyncConfig, ConsoleServerDevice,
        DhcpLease, DhcpRange, DhcpRelayConfig, DhcpServer, DhcpServerConfig, DhcpStaticMapping,
        DhcpSubnet, Dhcpv6Range, Dhcpv6RelayConfig, Dhcpv6RelayInterface, Dhcpv6Server,
        Dhcpv6ServerConfig, Dhcpv6StaticMapping, Dhcpv6Subnet, DnsForwardingConfig,
        DnsForwardingDomain, DynamicDnsEntry, EventHandlerEntry, HttpsConfig, IpoeServerConfig,
        LldpConfig, MdnsRepeaterConfig, MonitoringConfig, NtpConfig, PppoeServerConfig,
        RouterAdvertInterface, SaltMinionConfig, SnmpCommunity, SnmpConfig, SshConfig,
        TftpServerConfig, WebProxyConfig,
    },
    state::AppState,
    vyos::client::{VyosClient, VyosVersion},
};

use super::routers::{fetch_client, gateway_err};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{id}/services/dhcp-server", get(get_dhcp_server))
        .route("/{id}/services/dhcp-relay", get(get_dhcp_relay))
        .route("/{id}/services/dhcpv6-server", get(get_dhcpv6_server))
        .route("/{id}/services/dhcpv6-relay", get(get_dhcpv6_relay))
        .route("/{id}/services/broadcast-relay", get(get_broadcast_relay))
        .route("/{id}/services/config-sync", get(get_config_sync))
        .route("/{id}/services/conntrack-sync", get(get_conntrack_sync))
        .route("/{id}/services/console-server", get(get_console_server))
        .route("/{id}/services/dns-forwarding", get(get_dns_forwarding))
        .route("/{id}/services/dynamic-dns", get(get_dynamic_dns))
        .route("/{id}/services/event-handler", get(get_event_handler))
        .route("/{id}/services/https", get(get_https))
        .route("/{id}/services/ipoe-server", get(get_ipoe_server))
        .route("/{id}/services/lldp", get(get_lldp))
        .route("/{id}/services/mdns-repeater", get(get_mdns_repeater))
        .route("/{id}/services/monitoring", get(get_monitoring))
        .route("/{id}/services/ntp", get(get_ntp))
        .route("/{id}/services/pppoe-server", get(get_pppoe_server))
        .route("/{id}/services/router-advert", get(get_router_advert))
        .route("/{id}/services/salt-minion", get(get_salt_minion))
        .route("/{id}/services/snmp", get(get_snmp))
        .route("/{id}/services/ssh", get(get_ssh))
        .route("/{id}/services/tftp-server", get(get_tftp_server))
        .route("/{id}/services/web-proxy", get(get_web_proxy))
}

// ── parse helpers ──────────────────────────────────────────────────────────────

fn child_str(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// VyOS renders a multi-value node as a string for one value, array for several.
fn str_list(v: &Value, key: &str) -> Vec<String> {
    match v.get(key) {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|x| x.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

/// `disable` is a valueless leaf — its presence means the network is down.
fn is_enabled(v: &Value) -> bool {
    v.get("disable").is_none()
}

/// Sorted keys of a tag node (e.g. each `interface <name>` under a service).
fn node_keys(v: &Value, key: &str) -> Vec<String> {
    let mut k: Vec<String> = v[key]
        .as_object()
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();
    k.sort();
    k
}

/// Reads `<parent> <child>` as a trimmed non-empty string.
fn nested_str(v: &Value, parent: &str, child: &str) -> Option<String> {
    v.get(parent).and_then(|p| child_str(p, child))
}

/// `str_list`, sorted for stable display.
fn sorted_list(v: &Value, key: &str) -> Vec<String> {
    let mut l = str_list(v, key);
    l.sort();
    l
}

/// Fetches one config subtree, returning `Null` when nothing is configured.
/// Mirrors the interfaces handler: query the parent and read the named child so
/// some VyOS versions don't wrap the tag node oddly.
async fn config_node(client: &VyosClient, parent: &[&str], child: &str) -> Result<Value> {
    let resp = client.show_config(parent).await.map_err(gateway_err)?;
    if resp["success"].as_bool() == Some(true) {
        return Ok(resp["data"][child].clone());
    }
    let err = resp["error"].as_str().unwrap_or_default();
    if err.to_lowercase().contains("empty") {
        Ok(Value::Null)
    } else if err.is_empty() {
        Err(AppError::Gateway("device returned an error reading services".into()))
    } else {
        Err(AppError::Gateway(err.to_string()))
    }
}

fn parse_ranges(subnet: &Value) -> Vec<DhcpRange> {
    let mut out: Vec<DhcpRange> = subnet["range"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, r)| DhcpRange {
                    name: name.clone(),
                    start: child_str(r, "start"),
                    stop: child_str(r, "stop"),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn parse_static_mappings(subnet: &Value) -> Vec<DhcpStaticMapping> {
    let mut out: Vec<DhcpStaticMapping> = subnet["static-mapping"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, sm)| DhcpStaticMapping {
                    name: name.clone(),
                    ip_address: child_str(sm, "ip-address"),
                    // 1.4+ uses `mac`, 1.3 used `mac-address`.
                    mac_address: child_str(sm, "mac").or_else(|| child_str(sm, "mac-address")),
                    description: child_str(sm, "description"),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn parse_subnets(network: &Value) -> Vec<DhcpSubnet> {
    let mut out: Vec<DhcpSubnet> = network["subnet"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(cidr, s)| DhcpSubnet {
                    subnet: cidr.clone(),
                    default_router: child_str(s, "default-router")
                        .or_else(|| str_list(s, "option").into_iter().next()),
                    name_servers: str_list(s, "name-server"),
                    domain_name: child_str(s, "domain-name"),
                    lease: child_str(s, "lease"),
                    ranges: parse_ranges(s),
                    static_mappings: parse_static_mappings(s),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.subnet.cmp(&b.subnet));
    out
}

fn parse_servers(data: &Value) -> Vec<DhcpServer> {
    let mut out: Vec<DhcpServer> = data["shared-network-name"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, net)| DhcpServer {
                    name: name.clone(),
                    enabled: is_enabled(net),
                    authoritative: net.get("authoritative").is_some(),
                    description: child_str(net, "description"),
                    subnets: parse_subnets(net),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Parses the fixed-width table printed by `show dhcp server leases`.
///
/// Column positions are derived from the dashed separator line, then each data
/// row is sliced by those offsets — robust to spaces inside date fields.
fn parse_leases(text: &str) -> Vec<DhcpLease> {
    let lines: Vec<&str> = text.lines().collect();
    let Some(sep_idx) = lines.iter().position(|l| {
        let t = l.trim();
        !t.is_empty() && t.chars().all(|c| c == '-' || c == ' ') && t.contains('-')
    }) else {
        return Vec::new();
    };
    if sep_idx == 0 {
        return Vec::new();
    }

    // Column start offsets = the start of each run of dashes.
    let sep: Vec<char> = lines[sep_idx].chars().collect();
    let mut starts: Vec<usize> = Vec::new();
    let mut i = 0;
    while i < sep.len() {
        if sep[i] == '-' {
            starts.push(i);
            while i < sep.len() && sep[i] == '-' {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    if starts.is_empty() {
        return Vec::new();
    }

    let field = |line: &str, col: usize| -> String {
        let chars: Vec<char> = line.chars().collect();
        let start = starts[col];
        if start >= chars.len() {
            return String::new();
        }
        let end = starts.get(col + 1).copied().unwrap_or(chars.len()).min(chars.len());
        chars[start..end].iter().collect::<String>().trim().to_string()
    };

    // Match header labels to known columns.
    let header = lines[sep_idx - 1];
    let labels: Vec<String> = (0..starts.len()).map(|c| field(header, c).to_lowercase()).collect();
    let find = |needle: &str| labels.iter().position(|l| l.contains(needle));
    // Matches both "IP address" (DHCP) and "IPv6 address" (DHCPv6).
    let ip_col = labels.iter().position(|l| l.contains("ip") && l.contains("address"));
    let mac_col = find("mac");
    let state_col = find("state");
    let start_col = find("start");
    let exp_col = find("expir");
    let rem_col = find("remain");
    let pool_col = find("pool");
    let host_col = find("hostname");

    let opt = |line: &str, col: Option<usize>| -> Option<String> {
        col.map(|c| field(line, c)).filter(|s| !s.is_empty())
    };

    let mut out = Vec::new();
    for line in &lines[sep_idx + 1..] {
        if line.trim().is_empty() {
            continue;
        }
        let ip_address = opt(line, ip_col).unwrap_or_default();
        if ip_address.is_empty() {
            continue;
        }
        out.push(DhcpLease {
            ip_address,
            mac_address: opt(line, mac_col),
            state: opt(line, state_col),
            lease_start: opt(line, start_col),
            lease_expiration: opt(line, exp_col),
            remaining: opt(line, rem_col),
            pool: opt(line, pool_col),
            hostname: opt(line, host_col),
        });
    }
    out
}

// ── handler ──────────────────────────────────────────────────────────────────

async fn get_dhcp_server(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<DhcpServerConfig>> {
    let client = fetch_client(&state, &claims, id).await?;

    let data = config_node(&client, &["service"], "dhcp-server").await?;
    let servers = parse_servers(&data);

    // Leases are operational and best-effort: never fail the whole request over them.
    let leases = match client.show(&["dhcp", "server", "leases"]).await {
        Ok(resp) => resp["data"].as_str().map(parse_leases).unwrap_or_default(),
        Err(_) => Vec::new(),
    };

    Ok(Json(DhcpServerConfig { servers, leases }))
}

// ── DHCP relay ────────────────────────────────────────────────────────────────

async fn get_dhcp_relay(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<DhcpRelayConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "dhcp-relay").await?;

    let mut interfaces = str_list(&data, "interface");
    interfaces.sort();
    let mut servers = str_list(&data, "server");
    servers.sort();

    Ok(Json(DhcpRelayConfig { interfaces, servers }))
}

// ── DHCPv6 relay ──────────────────────────────────────────────────────────────

/// Parses a tag node of relay interfaces (`listen-interface` / `upstream-interface`).
fn relay_interfaces(node: &Value, key: &str) -> Vec<Dhcpv6RelayInterface> {
    let mut out: Vec<Dhcpv6RelayInterface> = node[key]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(iface, c)| {
                    let addrs = str_list(c, "address");
                    Dhcpv6RelayInterface {
                        interface: iface.clone(),
                        address: if addrs.is_empty() { None } else { Some(addrs.join(", ")) },
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.interface.cmp(&b.interface));
    out
}

async fn get_dhcpv6_relay(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Dhcpv6RelayConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "dhcpv6-relay").await?;

    Ok(Json(Dhcpv6RelayConfig {
        listen_interfaces: relay_interfaces(&data, "listen-interface"),
        upstream_interfaces: relay_interfaces(&data, "upstream-interface"),
    }))
}

// ── DHCPv6 server ─────────────────────────────────────────────────────────────

fn parse_v6_ranges(subnet: &Value) -> Vec<Dhcpv6Range> {
    let mut out: Vec<Dhcpv6Range> = Vec::new();

    // 1.4 style: `range <name> { start; stop }`.
    if let Some(m) = subnet["range"].as_object() {
        for (name, r) in m {
            out.push(Dhcpv6Range {
                name: name.clone(),
                start: child_str(r, "start"),
                stop: child_str(r, "stop"),
            });
        }
    }
    // 1.3 style: `address-range { start <addr> { stop <addr> } }`.
    if let Some(starts) = subnet["address-range"]["start"].as_object() {
        for (start_addr, r) in starts {
            out.push(Dhcpv6Range {
                name: start_addr.clone(),
                start: Some(start_addr.clone()),
                stop: child_str(r, "stop"),
            });
        }
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn parse_v6_static_mappings(subnet: &Value) -> Vec<Dhcpv6StaticMapping> {
    let mut out: Vec<Dhcpv6StaticMapping> = subnet["static-mapping"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, sm)| Dhcpv6StaticMapping {
                    name: name.clone(),
                    identifier: child_str(sm, "mac")
                        .or_else(|| child_str(sm, "mac-address"))
                        .or_else(|| child_str(sm, "identifier")),
                    ipv6_address: child_str(sm, "ipv6-address"),
                    ipv6_prefix: child_str(sm, "ipv6-prefix"),
                    description: child_str(sm, "description"),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn parse_v6_subnets(network: &Value) -> Vec<Dhcpv6Subnet> {
    let mut out: Vec<Dhcpv6Subnet> = network["subnet"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(cidr, s)| Dhcpv6Subnet {
                    subnet: cidr.clone(),
                    name_servers: str_list(s, "name-server"),
                    domain_search: str_list(s, "domain-search"),
                    // 1.x nests as `lease-time default <n>`; fall back to a flat `lease`.
                    lease: s.get("lease-time")
                        .and_then(|lt| child_str(lt, "default"))
                        .or_else(|| child_str(s, "lease")),
                    ranges: parse_v6_ranges(s),
                    static_mappings: parse_v6_static_mappings(s),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.subnet.cmp(&b.subnet));
    out
}

fn parse_v6_servers(data: &Value) -> Vec<Dhcpv6Server> {
    let mut out: Vec<Dhcpv6Server> = data["shared-network-name"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, net)| Dhcpv6Server {
                    name: name.clone(),
                    enabled: is_enabled(net),
                    description: child_str(net, "description"),
                    subnets: parse_v6_subnets(net),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

async fn get_dhcpv6_server(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Dhcpv6ServerConfig>> {
    let client = fetch_client(&state, &claims, id).await?;

    let data = config_node(&client, &["service"], "dhcpv6-server").await?;
    let servers = parse_v6_servers(&data);

    let leases = match client.show(&["dhcpv6", "server", "leases"]).await {
        Ok(resp) => resp["data"].as_str().map(parse_leases).unwrap_or_default(),
        Err(_) => Vec::new(),
    };

    Ok(Json(Dhcpv6ServerConfig { servers, leases }))
}

// ── UDP broadcast relay ─────────────────────────────────────────────────────────

async fn get_broadcast_relay(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<BroadcastRelayId>>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "broadcast-relay").await?;

    let mut out: Vec<BroadcastRelayId> = data["id"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(rid, cfg)| BroadcastRelayId {
                    id: rid.clone(),
                    interfaces: sorted_list(cfg, "interface"),
                    address: child_str(cfg, "address"),
                    port: child_str(cfg, "port"),
                    description: child_str(cfg, "description"),
                    enabled: is_enabled(cfg),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(Json(out))
}

// ── Config sync ─────────────────────────────────────────────────────────────────

async fn get_config_sync(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<ConfigSyncConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "config-sync").await?;

    Ok(Json(ConfigSyncConfig {
        mode: child_str(&data, "mode"),
        secondary_address: nested_str(&data, "secondary", "address"),
        secondary_username: nested_str(&data, "secondary", "username"),
        sections: sorted_list(&data, "section"),
    }))
}

// ── Conntrack sync ──────────────────────────────────────────────────────────────

async fn get_conntrack_sync(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<ConntrackSyncConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "conntrack-sync").await?;

    Ok(Json(ConntrackSyncConfig {
        interfaces: node_keys(&data, "interface"),
        // `failover-mechanism vrrp ...` — report the chosen mechanism name.
        failover_mechanism: data["failover-mechanism"]
            .as_object()
            .and_then(|o| o.keys().next().cloned()),
        mcast_group: child_str(&data, "mcast-group"),
        sync_queue_size: child_str(&data, "sync-queue-size"),
        accept_protocols: sorted_list(&data, "accept-protocol"),
    }))
}

// ── Console server ──────────────────────────────────────────────────────────────

async fn get_console_server(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<ConsoleServerDevice>>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "console-server").await?;

    let mut out: Vec<ConsoleServerDevice> = data["device"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| ConsoleServerDevice {
                    name: name.clone(),
                    speed: child_str(cfg, "speed"),
                    data_bits: child_str(cfg, "data-bits"),
                    stop_bits: child_str(cfg, "stop-bits"),
                    parity: child_str(cfg, "parity"),
                    ssh_port: nested_str(cfg, "ssh", "port"),
                    description: child_str(cfg, "description"),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

// ── DNS forwarding ──────────────────────────────────────────────────────────────

async fn get_dns_forwarding(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<DnsForwardingConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service", "dns"], "forwarding").await?;

    let mut domains: Vec<DnsForwardingDomain> = data["domain"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, d)| DnsForwardingDomain {
                    name: name.clone(),
                    name_servers: sorted_list(d, "name-server"),
                })
                .collect()
        })
        .unwrap_or_default();
    domains.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(Json(DnsForwardingConfig {
        cache_size: child_str(&data, "cache-size"),
        listen_addresses: sorted_list(&data, "listen-address"),
        allow_from: sorted_list(&data, "allow-from"),
        name_servers: sorted_list(&data, "name-server"),
        system: data.get("system").is_some(),
        dnssec: child_str(&data, "dnssec"),
        domains,
    }))
}

// ── Dynamic DNS ─────────────────────────────────────────────────────────────────

async fn get_dynamic_dns(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<DynamicDnsEntry>>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service", "dns"], "dynamic").await?;

    let mut out: Vec<DynamicDnsEntry> = data["name"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| DynamicDnsEntry {
                    name: name.clone(),
                    address: child_str(cfg, "address"),
                    protocol: child_str(cfg, "protocol"),
                    server: child_str(cfg, "server"),
                    username: child_str(cfg, "username"),
                    host_names: sorted_list(cfg, "host-name"),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

// ── Event handler ───────────────────────────────────────────────────────────────

async fn get_event_handler(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<EventHandlerEntry>>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "event-handler").await?;

    let mut out: Vec<EventHandlerEntry> = data["event"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, cfg)| EventHandlerEntry {
                    name: name.clone(),
                    pattern: nested_str(cfg, "filter", "pattern"),
                    script: nested_str(cfg, "script", "path"),
                    description: child_str(cfg, "description"),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(out))
}

// ── HTTPS / API ─────────────────────────────────────────────────────────────────

async fn get_https(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<HttpsConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "https").await?;

    Ok(Json(HttpsConfig {
        listen_addresses: sorted_list(&data, "listen-address"),
        port: child_str(&data, "port"),
        api_enabled: data.get("api").is_some(),
        certificates: node_keys(&data, "certificates"),
        allow_clients: data
            .get("allow-client")
            .map(|a| sorted_list(a, "address"))
            .unwrap_or_default(),
    }))
}

// ── IPoE server ─────────────────────────────────────────────────────────────────

async fn get_ipoe_server(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<IpoeServerConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "ipoe-server").await?;

    Ok(Json(IpoeServerConfig {
        interfaces: node_keys(&data, "interface"),
        auth_mode: nested_str(&data, "authentication", "mode"),
        gateway_addresses: sorted_list(&data, "gateway-address"),
        pools: data
            .get("client-ip-pool")
            .map(|p| node_keys(p, "name"))
            .unwrap_or_default(),
    }))
}

// ── LLDP ────────────────────────────────────────────────────────────────────────

async fn get_lldp(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<LldpConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "lldp").await?;

    Ok(Json(LldpConfig {
        interfaces: node_keys(&data, "interface"),
        snmp: data.get("snmp").is_some(),
        legacy_protocols: sorted_list(&data, "legacy-protocols"),
    }))
}

// ── mDNS repeater ───────────────────────────────────────────────────────────────

async fn get_mdns_repeater(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<MdnsRepeaterConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service", "mdns"], "repeater").await?;

    Ok(Json(MdnsRepeaterConfig {
        interfaces: sorted_list(&data, "interface"),
        vrf: child_str(&data, "vrf"),
        enabled: is_enabled(&data),
    }))
}

// ── Monitoring ──────────────────────────────────────────────────────────────────

async fn get_monitoring(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<MonitoringConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "monitoring").await?;

    let mut exporters: Vec<String> = data
        .as_object()
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();
    exporters.sort();

    Ok(Json(MonitoringConfig {
        telegraf_enabled: data.get("telegraf").is_some(),
        prometheus_enabled: data.get("prometheus").is_some(),
        exporters,
    }))
}

// ── NTP ─────────────────────────────────────────────────────────────────────────

async fn get_ntp(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<NtpConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    // NTP lives under `system ntp` on 1.3 and `service ntp` on 1.4+.
    let data = match client.version {
        VyosVersion::V1_3 => config_node(&client, &["system"], "ntp").await?,
        _ => config_node(&client, &["service"], "ntp").await?,
    };

    Ok(Json(NtpConfig {
        servers: node_keys(&data, "server"),
        listen_addresses: sorted_list(&data, "listen-address"),
        allow_clients: data
            .get("allow-client")
            .map(|a| sorted_list(a, "address"))
            .unwrap_or_default(),
    }))
}

// ── PPPoE server ────────────────────────────────────────────────────────────────

async fn get_pppoe_server(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<PppoeServerConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "pppoe-server").await?;

    Ok(Json(PppoeServerConfig {
        access_concentrator: child_str(&data, "access-concentrator"),
        interfaces: node_keys(&data, "interface"),
        gateway_address: child_str(&data, "gateway-address"),
        auth_mode: nested_str(&data, "authentication", "mode"),
        pools: data
            .get("client-ip-pool")
            .map(|p| node_keys(p, "name"))
            .unwrap_or_default(),
    }))
}

// ── Router advertisements ───────────────────────────────────────────────────────

async fn get_router_advert(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<RouterAdvertInterface>>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "router-advert").await?;

    let mut out: Vec<RouterAdvertInterface> = data["interface"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(iface, cfg)| RouterAdvertInterface {
                    interface: iface.clone(),
                    prefixes: node_keys(cfg, "prefix"),
                    managed_flag: cfg.get("managed-flag").is_some(),
                    interval_max: nested_str(cfg, "interval", "max"),
                    default_lifetime: child_str(cfg, "default-lifetime"),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.interface.cmp(&b.interface));
    Ok(Json(out))
}

// ── Salt minion ─────────────────────────────────────────────────────────────────

async fn get_salt_minion(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<SaltMinionConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "salt-minion").await?;

    Ok(Json(SaltMinionConfig {
        id: child_str(&data, "id"),
        masters: sorted_list(&data, "master"),
        interval: child_str(&data, "interval"),
    }))
}

// ── SNMP ────────────────────────────────────────────────────────────────────────

async fn get_snmp(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<SnmpConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "snmp").await?;

    let mut communities: Vec<SnmpCommunity> = data["community"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(name, c)| SnmpCommunity {
                    name: name.clone(),
                    authorization: child_str(c, "authorization"),
                })
                .collect()
        })
        .unwrap_or_default();
    communities.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(Json(SnmpConfig {
        contact: child_str(&data, "contact"),
        location: child_str(&data, "location"),
        listen_addresses: node_keys(&data, "listen-address"),
        communities,
        v3_users: data.get("v3").map(|v| node_keys(v, "user")).unwrap_or_default(),
    }))
}

// ── SSH ─────────────────────────────────────────────────────────────────────────

async fn get_ssh(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<SshConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "ssh").await?;

    Ok(Json(SshConfig {
        ports: sorted_list(&data, "port"),
        listen_addresses: sorted_list(&data, "listen-address"),
        password_authentication_disabled: data.get("disable-password-authentication").is_some(),
        allow_users: data
            .get("access-control")
            .and_then(|a| a.get("allow"))
            .map(|al| sorted_list(al, "user"))
            .unwrap_or_default(),
    }))
}

// ── TFTP server ─────────────────────────────────────────────────────────────────

async fn get_tftp_server(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<TftpServerConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "tftp-server").await?;

    Ok(Json(TftpServerConfig {
        directory: child_str(&data, "directory"),
        allow_upload: data.get("allow-upload").is_some(),
        listen_addresses: sorted_list(&data, "listen-address"),
        port: child_str(&data, "port"),
    }))
}

// ── Web proxy ───────────────────────────────────────────────────────────────────

async fn get_web_proxy(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<WebProxyConfig>> {
    let client = fetch_client(&state, &claims, id).await?;
    let data = config_node(&client, &["service"], "webproxy").await?;

    Ok(Json(WebProxyConfig {
        listen_addresses: node_keys(&data, "listen-address"),
        cache_size: child_str(&data, "cache-size"),
        default_port: child_str(&data, "default-port"),
        url_filtering: data.get("url-filtering").is_some(),
    }))
}
