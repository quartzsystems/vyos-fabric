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

export function commitChanges(deviceId: string): Promise<CommitWithChanges> {
  return request(`/routers/${deviceId}/commit`, { method: "POST" });
}

export function fetchCommits(deviceId: string): Promise<CommitWithChanges[]> {
  return request(`/routers/${deviceId}/commits`);
}
