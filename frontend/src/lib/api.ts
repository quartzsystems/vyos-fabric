// Central API base + helpers for talking to the Rust backend.
//
// Auth is an httpOnly cookie set by the backend. The browser calls /api on its OWN origin
// (Next.js rewrites proxy to the backend), so the cookie is first-party and sent automatically.
// JS can't read the token; the only client-side session state is a non-sensitive cached user
// (for display + role-based UI gating). The server is the real enforcement.

export const API = "/api";

const USER_KEY = "vyos-user";

export interface AuthUserInfo {
  id: string;
  first_name?: string;
  last_name?: string;
  username: string;
  role: string;
  site_access?: { site_id: string; site_name: string; role: string }[];
}

export function setUser(user: AuthUserInfo): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getCurrentUser(): AuthUserInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUserInfo) : null;
  } catch {
    return null;
  }
}

export function isAdmin(): boolean {
  return getCurrentUser()?.role === "admin";
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

/// Confirm the session with the backend (cookie is invisible to JS) and refresh the cached user.
export async function fetchMe(): Promise<AuthUserInfo> {
  const user = await apiFetch<AuthUserInfo>("/auth/me");
  setUser(user);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {}
  clearSession();
}

// ── Wire types (mirror backend models) ───────────────────────────────────────

export interface BackendRouter {
  id: string;
  site_id: string;
  hostname: string;
  description: string | null;
  role: string;
  mgmt_ip: string;
  status: string;
  version: string;
}

export interface Site {
  id: string;
  name: string;
}

export interface EthernetInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  hw_id: string | null;
  speed: string | null;
  duplex: string | null;
  enabled: boolean;
  vlan_count: number;
}

export interface VlanInterface {
  name: string;
  parent: string;
  vlan_id: number;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  enabled: boolean;
}

export interface BondingInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  mode: string | null;
  members: string[];
  enabled: boolean;
}

export interface BridgeInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  members: string[];
  enabled: boolean;
}

export interface DummyInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  enabled: boolean;
}

export interface GeneveInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  vni: string | null;
  remote: string | null;
  enabled: boolean;
}

export interface L2tpv3Interface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  source_address: string | null;
  remote: string | null;
  tunnel_id: string | null;
  peer_tunnel_id: string | null;
  session_id: string | null;
  peer_session_id: string | null;
  encapsulation: string | null;
  enabled: boolean;
}

export interface LoopbackInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  enabled: boolean;
}

export interface MacsecInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  source_interface: string | null;
  cipher: string | null;
  enabled: boolean;
}

export interface OpenvpnInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  mode: string | null;
  protocol: string | null;
  local_host: string | null;
  remote_host: string | null;
  enabled: boolean;
}

export interface WireguardInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  port: string | null;
  peer_count: number;
  enabled: boolean;
}

export interface PppoeInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  source_interface: string | null;
  username: string | null;
  enabled: boolean;
}

export interface MacvlanInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  source_interface: string | null;
  mode: string | null;
  enabled: boolean;
}

export interface SstpcInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  server: string | null;
  username: string | null;
  enabled: boolean;
}

export interface TunnelInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  encapsulation: string | null;
  source_address: string | null;
  remote: string | null;
  enabled: boolean;
}

export interface VethInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  peer_name: string | null;
  enabled: boolean;
}

export interface VtiInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  enabled: boolean;
}

export interface VxlanInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  vni: string | null;
  remote: string | null;
  source_address: string | null;
  port: string | null;
  enabled: boolean;
}

export interface WlanInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  interface_type: string | null;
  ssid: string | null;
  channel: string | null;
  enabled: boolean;
}

export interface WwanInterface {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  apn: string | null;
  enabled: boolean;
}

export interface DhcpRange {
  name: string;
  start: string | null;
  stop: string | null;
}

export interface DhcpStaticMapping {
  name: string;
  ip_address: string | null;
  mac_address: string | null;
  description: string | null;
}

export interface DhcpSubnet {
  subnet: string;
  default_router: string | null;
  name_servers: string[];
  domain_name: string | null;
  lease: string | null;
  ranges: DhcpRange[];
  static_mappings: DhcpStaticMapping[];
}

export interface DhcpServer {
  name: string;
  enabled: boolean;
  authoritative: boolean;
  description: string | null;
  subnets: DhcpSubnet[];
}

export interface DhcpLease {
  ip_address: string;
  mac_address: string | null;
  state: string | null;
  lease_start: string | null;
  lease_expiration: string | null;
  remaining: string | null;
  pool: string | null;
  hostname: string | null;
}

export interface DhcpServerConfig {
  servers: DhcpServer[];
  leases: DhcpLease[];
}

export interface DhcpRelayConfig {
  interfaces: string[];
  servers: string[];
}

export interface Dhcpv6RelayInterface {
  interface: string;
  address: string | null;
}

export interface Dhcpv6RelayConfig {
  listen_interfaces: Dhcpv6RelayInterface[];
  upstream_interfaces: Dhcpv6RelayInterface[];
}

export interface Dhcpv6Range {
  name: string;
  start: string | null;
  stop: string | null;
}

export interface Dhcpv6StaticMapping {
  name: string;
  identifier: string | null;
  ipv6_address: string | null;
  ipv6_prefix: string | null;
  description: string | null;
}

export interface Dhcpv6Subnet {
  subnet: string;
  name_servers: string[];
  domain_search: string[];
  lease: string | null;
  ranges: Dhcpv6Range[];
  static_mappings: Dhcpv6StaticMapping[];
}

export interface Dhcpv6Server {
  name: string;
  enabled: boolean;
  description: string | null;
  subnets: Dhcpv6Subnet[];
}

export interface Dhcpv6ServerConfig {
  servers: Dhcpv6Server[];
  leases: DhcpLease[];
}

export interface BroadcastRelayId {
  id: string;
  interfaces: string[];
  address: string | null;
  port: string | null;
  description: string | null;
  enabled: boolean;
}

export interface ConfigSyncConfig {
  mode: string | null;
  secondary_address: string | null;
  secondary_username: string | null;
  sections: string[];
}

export interface ConntrackSyncConfig {
  interfaces: string[];
  failover_mechanism: string | null;
  mcast_group: string | null;
  sync_queue_size: string | null;
  accept_protocols: string[];
}

export interface ConsoleServerDevice {
  name: string;
  speed: string | null;
  data_bits: string | null;
  stop_bits: string | null;
  parity: string | null;
  ssh_port: string | null;
  description: string | null;
}

export interface DnsForwardingDomain {
  name: string;
  name_servers: string[];
}

export interface DnsForwardingConfig {
  cache_size: string | null;
  listen_addresses: string[];
  allow_from: string[];
  name_servers: string[];
  system: boolean;
  dnssec: string | null;
  domains: DnsForwardingDomain[];
}

export interface DynamicDnsEntry {
  name: string;
  address: string | null;
  protocol: string | null;
  server: string | null;
  username: string | null;
  host_names: string[];
}

export interface EventHandlerEntry {
  name: string;
  pattern: string | null;
  script: string | null;
  description: string | null;
}

export interface HttpsConfig {
  listen_addresses: string[];
  port: string | null;
  api_enabled: boolean;
  certificates: string[];
  allow_clients: string[];
}

export interface IpoeServerConfig {
  interfaces: string[];
  auth_mode: string | null;
  gateway_addresses: string[];
  pools: string[];
}

export interface LldpConfig {
  interfaces: string[];
  snmp: boolean;
  legacy_protocols: string[];
}

export interface MdnsRepeaterConfig {
  interfaces: string[];
  vrf: string | null;
  enabled: boolean;
}

export interface MonitoringConfig {
  telegraf_enabled: boolean;
  prometheus_enabled: boolean;
  exporters: string[];
}

export interface NtpConfig {
  servers: string[];
  listen_addresses: string[];
  allow_clients: string[];
}

export interface PppoeServerConfig {
  access_concentrator: string | null;
  interfaces: string[];
  gateway_address: string | null;
  auth_mode: string | null;
  pools: string[];
}

export interface RouterAdvertInterface {
  interface: string;
  prefixes: string[];
  managed_flag: boolean;
  interval_max: string | null;
  default_lifetime: string | null;
}

export interface SaltMinionConfig {
  id: string | null;
  masters: string[];
  interval: string | null;
}

export interface SnmpCommunity {
  name: string;
  authorization: string | null;
}

export interface SnmpConfig {
  contact: string | null;
  location: string | null;
  listen_addresses: string[];
  communities: SnmpCommunity[];
  v3_users: string[];
}

export interface SshConfig {
  ports: string[];
  listen_addresses: string[];
  password_authentication_disabled: boolean;
  allow_users: string[];
}

export interface TftpServerConfig {
  directory: string | null;
  allow_upload: boolean;
  listen_addresses: string[];
  port: string | null;
}

export interface WebProxyConfig {
  listen_addresses: string[];
  cache_size: string | null;
  default_port: string | null;
  url_filtering: boolean;
}

export interface NatRule {
  rule: string;
  description: string | null;
  interface: string | null;
  source: string | null;
  destination: string | null;
  translation: string | null;
  translation_port: string | null;
  protocol: string | null;
  log: boolean;
  enabled: boolean;
}

export interface Nat44Config {
  source: NatRule[];
  destination: NatRule[];
}

export interface Nat64Config {
  source: NatRule[];
}

export interface Nat66Config {
  source: NatRule[];
  destination: NatRule[];
}

export interface CgnatPool {
  kind: string;
  name: string;
  ranges: string[];
  external_port_range: string | null;
}

export interface CgnatRule {
  rule: string;
  description: string | null;
  source_pool: string | null;
  translation_pool: string | null;
  enabled: boolean;
}

export interface CgnatConfig {
  pools: CgnatPool[];
  rules: CgnatRule[];
}

export interface NtpServerLive {
  server: string;
  ref_id: string | null;
  pull: number | null;
}

export interface DeviceSystemConfig {
  hostname: string | null;
  domain_name: string | null;
  time_zone: string | null;
  ntp_enabled: boolean;
  ntp_servers: NtpServerLive[];
  current_time: string | null;
}

export interface LoadAverage {
  one: number | null;
  five: number | null;
  fifteen: number | null;
}

export interface MemoryInfo {
  total_bytes: number | null;
  used_bytes: number | null;
  free_bytes: number | null;
  used_pct: number | null;
}

export interface StorageMount {
  filesystem: string;
  size_bytes: number | null;
  used_bytes: number | null;
  avail_bytes: number | null;
  used_pct: number | null;
  mount: string | null;
}

/// Live operational system info for the dashboard pod. All fields best-effort (may be null).
export interface DeviceSystemInfo {
  version: string | null;
  release_train: string | null;
  built_on: string | null;
  hardware_vendor: string | null;
  hardware_model: string | null;
  uptime: string | null;
  load: LoadAverage;
  memory: MemoryInfo;
  storage: StorageMount[];
}

export interface SystemUpdate {
  hostname?: string;
  domain_name?: string;
  time_zone?: string;
  ntp_enabled?: boolean;
  ntp_servers?: string[];
}

export interface ConfigChange {
  id: string;
  router_id: string;
  op: "set" | "delete";
  path: string[];
  summary: string;
  section: string;
  created_by: string | null;
  created_at: string;
  status: "pending" | "committed" | "failed";
  commit_id: string | null;
}

export interface ConfigCommit {
  id: string;
  router_id: string;
  committed_by: string | null;
  committed_at: string;
  status: "success" | "failed";
  change_count: number;
  saved: boolean;
  error: string | null;
  vyos_response: unknown;
}

export interface CommitWithChanges extends ConfigCommit {
  changes: ConfigChange[];
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

/// Authenticated fetch against the API. Attaches the Bearer token, and on a 401
/// clears the session and bounces to /login (enforcement is real on the server).
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Please sign in again.");
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }

  // Some endpoints (DELETE) may return an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const request = apiFetch;

/// Lower-level variant returning the raw Response (for callers that inspect status
/// or read the body themselves). Attaches the Bearer token; bounces to /login on 401.
/// `url` is a full URL (typically `${API}/...`).
export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
  return res;
}

// ── Devices / sites ──────────────────────────────────────────────────────────

export function fetchRouter(deviceId: string): Promise<BackendRouter> {
  return request(`/routers/${deviceId}`);
}

export function fetchSites(): Promise<Site[]> {
  return request(`/sites`);
}

export function fetchEthernet(deviceId: string): Promise<EthernetInterface[]> {
  return request(`/routers/${deviceId}/interfaces/ethernet`);
}

/// All physical ethernet NICs present on the device (configured or not). The UI subtracts
/// already-configured interfaces from this to find which NICs are free to add.
export function fetchPhysicalEthernet(deviceId: string): Promise<string[]> {
  return request(`/routers/${deviceId}/interfaces/ethernet/physical`);
}

/// Desired physical ethernet config. `speed`/`duplex` are null for auto (the default).
export interface EthernetConfigUpdate {
  name: string;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  speed: string | null;
  duplex: string | null;
  enabled: boolean;
}

export function stageEthernet(deviceId: string, body: EthernetConfigUpdate): Promise<ConfigChange[]> {
  return request(`/routers/${deviceId}/interfaces/ethernet/stage`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchVlans(deviceId: string): Promise<VlanInterface[]> {
  return request(`/routers/${deviceId}/interfaces/vlan`);
}

/// Desired VLAN sub-interface config sent to the staging endpoint. `original_*` carry
/// the edited row's identity so a changed parent/id is staged as delete-old + create-new.
export interface VlanConfigUpdate {
  parent: string;
  vlan_id: number;
  description: string | null;
  addresses: string[];
  mtu: number | null;
  enabled: boolean;
  original_parent?: string | null;
  original_vlan_id?: number | null;
}

export function stageVlan(deviceId: string, body: VlanConfigUpdate): Promise<ConfigChange[]> {
  return request(`/routers/${deviceId}/interfaces/vlan/stage`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteVlan(deviceId: string, parent: string, vlanId: number): Promise<ConfigChange[]> {
  return request(`/routers/${deviceId}/interfaces/vlan/delete`, {
    method: "POST",
    body: JSON.stringify({ parent, vlan_id: vlanId }),
  });
}

export function fetchBonding(deviceId: string): Promise<BondingInterface[]> {
  return request(`/routers/${deviceId}/interfaces/bonding`);
}

export function fetchBridge(deviceId: string): Promise<BridgeInterface[]> {
  return request(`/routers/${deviceId}/interfaces/bridge`);
}

export function fetchDummy(deviceId: string): Promise<DummyInterface[]> {
  return request(`/routers/${deviceId}/interfaces/dummy`);
}

export function fetchGeneve(deviceId: string): Promise<GeneveInterface[]> {
  return request(`/routers/${deviceId}/interfaces/geneve`);
}

export function fetchL2tpv3(deviceId: string): Promise<L2tpv3Interface[]> {
  return request(`/routers/${deviceId}/interfaces/l2tpv3`);
}

export function fetchLoopback(deviceId: string): Promise<LoopbackInterface[]> {
  return request(`/routers/${deviceId}/interfaces/loopback`);
}

export function fetchMacsec(deviceId: string): Promise<MacsecInterface[]> {
  return request(`/routers/${deviceId}/interfaces/macsec`);
}

export function fetchOpenvpn(deviceId: string): Promise<OpenvpnInterface[]> {
  return request(`/routers/${deviceId}/interfaces/openvpn`);
}

export function fetchWireguard(deviceId: string): Promise<WireguardInterface[]> {
  return request(`/routers/${deviceId}/interfaces/wireguard`);
}

export function fetchPppoe(deviceId: string): Promise<PppoeInterface[]> {
  return request(`/routers/${deviceId}/interfaces/pppoe`);
}

export function fetchMacvlan(deviceId: string): Promise<MacvlanInterface[]> {
  return request(`/routers/${deviceId}/interfaces/macvlan`);
}

export function fetchSstpc(deviceId: string): Promise<SstpcInterface[]> {
  return request(`/routers/${deviceId}/interfaces/sstpc`);
}

export function fetchTunnel(deviceId: string): Promise<TunnelInterface[]> {
  return request(`/routers/${deviceId}/interfaces/tunnel`);
}

export function fetchVeth(deviceId: string): Promise<VethInterface[]> {
  return request(`/routers/${deviceId}/interfaces/veth`);
}

export function fetchVti(deviceId: string): Promise<VtiInterface[]> {
  return request(`/routers/${deviceId}/interfaces/vti`);
}

export function fetchVxlan(deviceId: string): Promise<VxlanInterface[]> {
  return request(`/routers/${deviceId}/interfaces/vxlan`);
}

export function fetchWlan(deviceId: string): Promise<WlanInterface[]> {
  return request(`/routers/${deviceId}/interfaces/wlan`);
}

export function fetchWwan(deviceId: string): Promise<WwanInterface[]> {
  return request(`/routers/${deviceId}/interfaces/wwan`);
}

// ── Services ─────────────────────────────────────────────────────────────────

export function fetchDhcpServer(deviceId: string): Promise<DhcpServerConfig> {
  return request(`/routers/${deviceId}/services/dhcp-server`);
}

export function fetchDhcpRelay(deviceId: string): Promise<DhcpRelayConfig> {
  return request(`/routers/${deviceId}/services/dhcp-relay`);
}

export function fetchDhcpv6Server(deviceId: string): Promise<Dhcpv6ServerConfig> {
  return request(`/routers/${deviceId}/services/dhcpv6-server`);
}

export function fetchDhcpv6Relay(deviceId: string): Promise<Dhcpv6RelayConfig> {
  return request(`/routers/${deviceId}/services/dhcpv6-relay`);
}

export function fetchBroadcastRelay(deviceId: string): Promise<BroadcastRelayId[]> {
  return request(`/routers/${deviceId}/services/broadcast-relay`);
}

export function fetchConfigSync(deviceId: string): Promise<ConfigSyncConfig> {
  return request(`/routers/${deviceId}/services/config-sync`);
}

export function fetchConntrackSync(deviceId: string): Promise<ConntrackSyncConfig> {
  return request(`/routers/${deviceId}/services/conntrack-sync`);
}

export function fetchConsoleServer(deviceId: string): Promise<ConsoleServerDevice[]> {
  return request(`/routers/${deviceId}/services/console-server`);
}

export function fetchDnsForwarding(deviceId: string): Promise<DnsForwardingConfig> {
  return request(`/routers/${deviceId}/services/dns-forwarding`);
}

export function fetchDynamicDns(deviceId: string): Promise<DynamicDnsEntry[]> {
  return request(`/routers/${deviceId}/services/dynamic-dns`);
}

export function fetchEventHandler(deviceId: string): Promise<EventHandlerEntry[]> {
  return request(`/routers/${deviceId}/services/event-handler`);
}

export function fetchHttps(deviceId: string): Promise<HttpsConfig> {
  return request(`/routers/${deviceId}/services/https`);
}

export function fetchIpoeServer(deviceId: string): Promise<IpoeServerConfig> {
  return request(`/routers/${deviceId}/services/ipoe-server`);
}

export function fetchLldp(deviceId: string): Promise<LldpConfig> {
  return request(`/routers/${deviceId}/services/lldp`);
}

export function fetchMdnsRepeater(deviceId: string): Promise<MdnsRepeaterConfig> {
  return request(`/routers/${deviceId}/services/mdns-repeater`);
}

export function fetchMonitoring(deviceId: string): Promise<MonitoringConfig> {
  return request(`/routers/${deviceId}/services/monitoring`);
}

export function fetchNtp(deviceId: string): Promise<NtpConfig> {
  return request(`/routers/${deviceId}/services/ntp`);
}

export function fetchPppoeServer(deviceId: string): Promise<PppoeServerConfig> {
  return request(`/routers/${deviceId}/services/pppoe-server`);
}

export function fetchRouterAdvert(deviceId: string): Promise<RouterAdvertInterface[]> {
  return request(`/routers/${deviceId}/services/router-advert`);
}

export function fetchSaltMinion(deviceId: string): Promise<SaltMinionConfig> {
  return request(`/routers/${deviceId}/services/salt-minion`);
}

export function fetchSnmp(deviceId: string): Promise<SnmpConfig> {
  return request(`/routers/${deviceId}/services/snmp`);
}

export function fetchSsh(deviceId: string): Promise<SshConfig> {
  return request(`/routers/${deviceId}/services/ssh`);
}

export function fetchTftpServer(deviceId: string): Promise<TftpServerConfig> {
  return request(`/routers/${deviceId}/services/tftp-server`);
}

export function fetchWebProxy(deviceId: string): Promise<WebProxyConfig> {
  return request(`/routers/${deviceId}/services/web-proxy`);
}

// ── NAT ──────────────────────────────────────────────────────────────────────

export function fetchNat44(deviceId: string): Promise<Nat44Config> {
  return request(`/routers/${deviceId}/nat/nat44`);
}

export function fetchNat64(deviceId: string): Promise<Nat64Config> {
  return request(`/routers/${deviceId}/nat/nat64`);
}

export function fetchNat66(deviceId: string): Promise<Nat66Config> {
  return request(`/routers/${deviceId}/nat/nat66`);
}

export function fetchCgnat(deviceId: string): Promise<CgnatConfig> {
  return request(`/routers/${deviceId}/nat/cgnat`);
}

// ── System config ────────────────────────────────────────────────────────────

export function fetchSystem(deviceId: string): Promise<DeviceSystemConfig> {
  return request(`/routers/${deviceId}/system`);
}

/// Live operational system info (version, hardware, uptime, load, memory, disk).
export function fetchSystemInfo(deviceId: string): Promise<DeviceSystemInfo> {
  return request(`/routers/${deviceId}/system/info`);
}

export interface InterfaceStat {
  name: string;
  rx_bytes: number | null;
  rx_packets: number | null;
  tx_bytes: number | null;
  tx_packets: number | null;
}

/// Live RX/TX counters for every interface (from `show interfaces counters`).
export function fetchInterfaceStats(deviceId: string): Promise<InterfaceStat[]> {
  return request(`/routers/${deviceId}/interfaces/stats`);
}

export function stageSystem(deviceId: string, body: SystemUpdate): Promise<ConfigChange[]> {
  return request(`/routers/${deviceId}/system/stage`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Change tray ──────────────────────────────────────────────────────────────

export function fetchChanges(deviceId: string): Promise<ConfigChange[]> {
  return request(`/routers/${deviceId}/changes`);
}

export function discardChange(deviceId: string, changeId: string): Promise<void> {
  return request(`/routers/${deviceId}/changes/${changeId}`, { method: "DELETE" });
}

export function discardAllChanges(deviceId: string): Promise<void> {
  return request(`/routers/${deviceId}/changes`, { method: "DELETE" });
}

export function commitChanges(deviceId: string): Promise<CommitWithChanges> {
  return request(`/routers/${deviceId}/commit`, { method: "POST" });
}

export function fetchCommits(deviceId: string): Promise<CommitWithChanges[]> {
  return request(`/routers/${deviceId}/commits`);
}
