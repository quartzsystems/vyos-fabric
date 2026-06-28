use serde::Serialize;

/// A DHCP address range within a subnet (`range <name> { start; stop }`).
#[derive(Debug, Serialize)]
pub struct DhcpRange {
    pub name: String,
    pub start: Option<String>,
    pub stop: Option<String>,
}

/// A DHCP static (reserved) mapping within a subnet.
#[derive(Debug, Serialize)]
pub struct DhcpStaticMapping {
    pub name: String,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    pub description: Option<String>,
}

/// A DHCP subnet under a shared network.
#[derive(Debug, Serialize)]
pub struct DhcpSubnet {
    pub subnet: String,
    pub default_router: Option<String>,
    pub name_servers: Vec<String>,
    pub domain_name: Option<String>,
    pub lease: Option<String>,
    pub ranges: Vec<DhcpRange>,
    pub static_mappings: Vec<DhcpStaticMapping>,
}

/// A DHCP "server" — in VyOS terms a shared network (`shared-network-name <name>`).
#[derive(Debug, Serialize)]
pub struct DhcpServer {
    pub name: String,
    pub enabled: bool,
    pub authoritative: bool,
    pub description: Option<String>,
    pub subnets: Vec<DhcpSubnet>,
}

/// An active/known DHCP lease, parsed from operational `show dhcp server leases`.
#[derive(Debug, Serialize)]
pub struct DhcpLease {
    pub ip_address: String,
    pub mac_address: Option<String>,
    pub state: Option<String>,
    pub lease_start: Option<String>,
    pub lease_expiration: Option<String>,
    pub remaining: Option<String>,
    pub pool: Option<String>,
    pub hostname: Option<String>,
}

/// Full DHCP server view: configured shared networks plus operational leases.
#[derive(Debug, Serialize)]
pub struct DhcpServerConfig {
    pub servers: Vec<DhcpServer>,
    pub leases: Vec<DhcpLease>,
}

// ── DHCP relay ────────────────────────────────────────────────────────────────

/// IPv4 DHCP relay (`service dhcp-relay`) — a single config, not a list.
#[derive(Debug, Serialize)]
pub struct DhcpRelayConfig {
    pub interfaces: Vec<String>,
    pub servers: Vec<String>,
}

// ── DHCPv6 relay ──────────────────────────────────────────────────────────────

/// A listen/upstream interface of the DHCPv6 relay, with its optional address.
#[derive(Debug, Serialize)]
pub struct Dhcpv6RelayInterface {
    pub interface: String,
    pub address: Option<String>,
}

/// IPv6 DHCP relay (`service dhcpv6-relay`).
#[derive(Debug, Serialize)]
pub struct Dhcpv6RelayConfig {
    pub listen_interfaces: Vec<Dhcpv6RelayInterface>,
    pub upstream_interfaces: Vec<Dhcpv6RelayInterface>,
}

// ── DHCPv6 server ─────────────────────────────────────────────────────────────

/// A DHCPv6 address range within a subnet.
#[derive(Debug, Serialize)]
pub struct Dhcpv6Range {
    pub name: String,
    pub start: Option<String>,
    pub stop: Option<String>,
}

/// A DHCPv6 static mapping within a subnet.
#[derive(Debug, Serialize)]
pub struct Dhcpv6StaticMapping {
    pub name: String,
    /// MAC (1.4) / DUID identifier (1.3) the mapping is keyed on.
    pub identifier: Option<String>,
    pub ipv6_address: Option<String>,
    pub ipv6_prefix: Option<String>,
    pub description: Option<String>,
}

/// A DHCPv6 subnet under a shared network.
#[derive(Debug, Serialize)]
pub struct Dhcpv6Subnet {
    pub subnet: String,
    pub name_servers: Vec<String>,
    pub domain_search: Vec<String>,
    pub lease: Option<String>,
    pub ranges: Vec<Dhcpv6Range>,
    pub static_mappings: Vec<Dhcpv6StaticMapping>,
}

/// A DHCPv6 "server" — a shared network (`shared-network-name <name>`).
#[derive(Debug, Serialize)]
pub struct Dhcpv6Server {
    pub name: String,
    pub enabled: bool,
    pub description: Option<String>,
    pub subnets: Vec<Dhcpv6Subnet>,
}

/// Full DHCPv6 server view: configured shared networks plus operational leases.
#[derive(Debug, Serialize)]
pub struct Dhcpv6ServerConfig {
    pub servers: Vec<Dhcpv6Server>,
    pub leases: Vec<DhcpLease>,
}

// ── UDP broadcast relay (`service broadcast-relay`) ─────────────────────────────

#[derive(Debug, Serialize)]
pub struct BroadcastRelayId {
    pub id: String,
    pub interfaces: Vec<String>,
    pub address: Option<String>,
    pub port: Option<String>,
    pub description: Option<String>,
    pub enabled: bool,
}

// ── Config sync (`service config-sync`) ─────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConfigSyncConfig {
    pub mode: Option<String>,
    pub secondary_address: Option<String>,
    pub secondary_username: Option<String>,
    pub sections: Vec<String>,
}

// ── Conntrack sync (`service conntrack-sync`) ───────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConntrackSyncConfig {
    pub interfaces: Vec<String>,
    pub failover_mechanism: Option<String>,
    pub mcast_group: Option<String>,
    pub sync_queue_size: Option<String>,
    pub accept_protocols: Vec<String>,
}

// ── Console server (`service console-server`) ───────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConsoleServerDevice {
    pub name: String,
    pub speed: Option<String>,
    pub data_bits: Option<String>,
    pub stop_bits: Option<String>,
    pub parity: Option<String>,
    pub ssh_port: Option<String>,
    pub description: Option<String>,
}

// ── DNS forwarding (`service dns forwarding`) ───────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DnsForwardingDomain {
    pub name: String,
    pub name_servers: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DnsForwardingConfig {
    pub cache_size: Option<String>,
    pub listen_addresses: Vec<String>,
    pub allow_from: Vec<String>,
    pub name_servers: Vec<String>,
    pub system: bool,
    pub dnssec: Option<String>,
    pub domains: Vec<DnsForwardingDomain>,
}

// ── Dynamic DNS (`service dns dynamic`) ─────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DynamicDnsEntry {
    pub name: String,
    pub address: Option<String>,
    pub protocol: Option<String>,
    pub server: Option<String>,
    pub username: Option<String>,
    pub host_names: Vec<String>,
}

// ── Event handler (`service event-handler`) ─────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct EventHandlerEntry {
    pub name: String,
    pub pattern: Option<String>,
    pub script: Option<String>,
    pub description: Option<String>,
}

// ── HTTPS / API (`service https`) ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct HttpsConfig {
    pub listen_addresses: Vec<String>,
    pub port: Option<String>,
    pub api_enabled: bool,
    pub certificates: Vec<String>,
    pub allow_clients: Vec<String>,
}

// ── IPoE server (`service ipoe-server`) ─────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct IpoeServerConfig {
    pub interfaces: Vec<String>,
    pub auth_mode: Option<String>,
    pub gateway_addresses: Vec<String>,
    pub pools: Vec<String>,
}

// ── LLDP (`service lldp`) ───────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct LldpConfig {
    pub interfaces: Vec<String>,
    pub snmp: bool,
    pub legacy_protocols: Vec<String>,
}

// ── mDNS repeater (`service mdns repeater`) ─────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct MdnsRepeaterConfig {
    pub interfaces: Vec<String>,
    pub vrf: Option<String>,
    pub enabled: bool,
}

// ── Monitoring (`service monitoring`) ───────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct MonitoringConfig {
    pub telegraf_enabled: bool,
    pub prometheus_enabled: bool,
    pub exporters: Vec<String>,
}

// ── NTP (`service ntp` / `system ntp`) ──────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NtpConfig {
    pub servers: Vec<String>,
    pub listen_addresses: Vec<String>,
    pub allow_clients: Vec<String>,
}

// ── PPPoE server (`service pppoe-server`) ───────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct PppoeServerConfig {
    pub access_concentrator: Option<String>,
    pub interfaces: Vec<String>,
    pub gateway_address: Option<String>,
    pub auth_mode: Option<String>,
    pub pools: Vec<String>,
}

// ── Router advertisements (`service router-advert`) ─────────────────────────────

#[derive(Debug, Serialize)]
pub struct RouterAdvertInterface {
    pub interface: String,
    pub prefixes: Vec<String>,
    pub managed_flag: bool,
    pub interval_max: Option<String>,
    pub default_lifetime: Option<String>,
}

// ── Salt minion (`service salt-minion`) ─────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SaltMinionConfig {
    pub id: Option<String>,
    pub masters: Vec<String>,
    pub interval: Option<String>,
}

// ── SNMP (`service snmp`) ───────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SnmpCommunity {
    pub name: String,
    pub authorization: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SnmpConfig {
    pub contact: Option<String>,
    pub location: Option<String>,
    pub listen_addresses: Vec<String>,
    pub communities: Vec<SnmpCommunity>,
    pub v3_users: Vec<String>,
}

// ── SSH (`service ssh`) ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SshConfig {
    pub ports: Vec<String>,
    pub listen_addresses: Vec<String>,
    pub password_authentication_disabled: bool,
    pub allow_users: Vec<String>,
}

// ── TFTP server (`service tftp-server`) ─────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct TftpServerConfig {
    pub directory: Option<String>,
    pub allow_upload: bool,
    pub listen_addresses: Vec<String>,
    pub port: Option<String>,
}

// ── Web proxy (`service webproxy`) ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct WebProxyConfig {
    pub listen_addresses: Vec<String>,
    pub cache_size: Option<String>,
    pub default_port: Option<String>,
    pub url_filtering: bool,
}
