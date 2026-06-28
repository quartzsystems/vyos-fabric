// Central API base + helpers for talking to the Rust backend.

export const API = "http://localhost:3001/api";

// ── Local session ────────────────────────────────────────────────────────────

const TOKEN_KEY = "vyos-token";
const USER_KEY = "vyos-user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw)?.id ?? null) : null;
  } catch {
    return null;
  }
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

export interface SystemUpdate {
  hostname?: string;
  domain_name?: string;
  time_zone?: string;
  ntp_enabled?: boolean;
  ntp_servers?: string[];
  created_by?: string | null;
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
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
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
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
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

export function fetchVlans(deviceId: string): Promise<VlanInterface[]> {
  return request(`/routers/${deviceId}/interfaces/vlan`);
}

// ── System config ────────────────────────────────────────────────────────────

export function fetchSystem(deviceId: string): Promise<DeviceSystemConfig> {
  return request(`/routers/${deviceId}/system`);
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

export function commitChanges(
  deviceId: string,
  createdBy: string | null,
): Promise<CommitWithChanges> {
  return request(`/routers/${deviceId}/commit`, {
    method: "POST",
    body: JSON.stringify({ created_by: createdBy }),
  });
}

export function fetchCommits(deviceId: string): Promise<CommitWithChanges[]> {
  return request(`/routers/${deviceId}/commits`);
}
