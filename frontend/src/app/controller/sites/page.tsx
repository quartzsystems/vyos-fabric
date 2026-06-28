"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, X, Pencil, ChevronRight, Server, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slug";
import { API, fetchWithAuth } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type DeviceStatus = "ok" | "warn" | "crit" | "off";

interface Site {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface Device {
  id: string;
  site_id: string;
  hostname: string;
  description: string | null;
  role: string;
  mgmt_ip: string;
  status: DeviceStatus;
  version: string;
  uptime_secs: number;
  api_port: number | null;
  api_protocol: string;
  api_key: string | null;
  api_timeout: number;
  ssh_username: string | null;
  ssh_password: string | null;
  ssh_port: number;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none";

const inputSt = {
  background: "var(--qz-input-bg)",
  border: "1px solid var(--qz-border)",
} as const;

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "var(--qz-accent)";
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "var(--qz-border)";
}

// ── Status badge ──────────────────────────────────────────────────────────────

const statusConfig: Record<DeviceStatus, { label: string; bg: string; color: string; border: string }> = {
  ok:   { label: "Online",  bg: "color-mix(in oklab,var(--qz-status-ok) 12%,transparent)",   color: "var(--qz-status-ok)",   border: "color-mix(in oklab,var(--qz-status-ok) 30%,transparent)" },
  warn: { label: "Warning", bg: "color-mix(in oklab,var(--qz-status-warn) 12%,transparent)", color: "var(--qz-status-warn)", border: "color-mix(in oklab,var(--qz-status-warn) 30%,transparent)" },
  crit: { label: "Critical",bg: "color-mix(in oklab,var(--qz-status-crit) 12%,transparent)", color: "var(--qz-status-crit)", border: "color-mix(in oklab,var(--qz-status-crit) 30%,transparent)" },
  off:  { label: "Offline", bg: "color-mix(in oklab,white 5%,transparent)",                  color: "var(--qz-fg-4)",        border: "var(--qz-border)" },
};

function StatusBadge({ status }: { status: DeviceStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.off;
  return (
    <span
      className="text-[11px] font-semibold px-[7px] py-[3px] rounded"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--qz-ink-0)", border: "1px solid var(--qz-border)", borderRadius: 12, boxShadow: "0 24px 64px rgba(0,0,0,0.4)", width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-[17px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </h2>
        {subtitle && <p className="text-[13px] text-[var(--qz-fg-3)] m-0 mt-[3px]">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} className="text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] transition-colors cursor-pointer bg-transparent border-0 p-0 mt-[2px]">
        <X size={18} />
      </button>
    </div>
  );
}

function FormActions({ onClose, saving, saveLabel }: { onClose: () => void; saving: boolean; saveLabel: string }) {
  return (
    <div className="flex gap-2 justify-end mt-5">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-[9px] rounded-md text-[13px] font-medium cursor-pointer"
        style={{ background: "transparent", border: "1px solid var(--qz-border)", color: "var(--qz-fg-2)" }}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-[9px] rounded-md text-[13px] font-semibold cursor-pointer border-0"
        style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)", opacity: saving ? 0.7 : 1 }}
      >
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

// ── Site modals ───────────────────────────────────────────────────────────────

function SiteModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Site;
  onClose: () => void;
  onSaved: (site: Site) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const editing = !!initial;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) { setError("Site name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const url = editing ? `${API}/sites/${initial!.id}` : `${API}/sites`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetchWithAuth(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save site.");
        return;
      }
      onSaved(await res.json());
      onClose();
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={editing ? "Edit Site" : "Add Site"} onClose={onClose} />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
            Site Name <span style={{ color: "var(--qz-status-crit)" }}>*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="HQ – Seattle"
            autoFocus
            className={inputCls}
            style={inputSt}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>
        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes about this site…"
            rows={3}
            className="w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none resize-none"
            style={inputSt}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>
        {error && <p className="text-[12px] m-0" style={{ color: "var(--qz-status-crit)" }}>{error}</p>}
        <FormActions onClose={onClose} saving={saving} saveLabel={editing ? "Save Changes" : "Add Site"} />
      </form>
    </ModalShell>
  );
}

// ── Device modals ─────────────────────────────────────────────────────────────

const VYOS_VERSIONS = ["1.3", "1.4", "1.5"];

function normalizeVersion(v: string): string {
  for (const ver of VYOS_VERSIONS) {
    if (v.startsWith(ver)) return ver;
  }
  return "1.4";
}

function AddDeviceModal({
  siteId,
  siteName,
  onClose,
  onCreated,
}: {
  siteId: string;
  siteName: string;
  onClose: () => void;
  onCreated: (device: Device) => void;
}) {
  const [hostname, setHostname]       = useState("");
  const [description, setDescription] = useState("");
  const [mgmtIp, setMgmtIp]         = useState("");
  const [version, setVersion]         = useState("1.4");
  const [error, setError]             = useState("");
  const [saving, setSaving]           = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hostname.trim() || !mgmtIp.trim()) {
      setError("Hostname and Management IP are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API}/routers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          hostname: hostname.trim(),
          role: "",
          description: description.trim() || null,
          mgmt_ip: mgmtIp.trim(),
          version,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to add device.");
        return;
      }
      onCreated(await res.json());
      onClose();
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Add Device" subtitle={siteName} onClose={onClose} />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
            Hostname <span style={{ color: "var(--qz-status-crit)" }}>*</span>
          </label>
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="vyos-core-01"
            autoFocus
            className={inputCls}
            style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>
        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description…"
            className={inputCls}
            style={inputSt}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>
        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
            Management IP <span style={{ color: "var(--qz-status-crit)" }}>*</span>
          </label>
          <input
            value={mgmtIp}
            onChange={(e) => setMgmtIp(e.target.value)}
            placeholder="10.0.0.1"
            className={inputCls}
            style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>
        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">VyOS Version</label>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className={`${inputCls} cursor-pointer`}
            style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
          >
            {VYOS_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        {error && <p className="text-[12px] m-0" style={{ color: "var(--qz-status-crit)" }}>{error}</p>}
        <FormActions onClose={onClose} saving={saving} saveLabel="Add Device" />
      </form>
    </ModalShell>
  );
}

// ── Edit Device Modal (tabbed) ────────────────────────────────────────────────

type DeviceTab = "General" | "Connection" | "SSH";
const DEVICE_TABS: DeviceTab[] = ["General", "Connection", "SSH"];

function RevealInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pr-10`}
        style={inputSt}
        onFocus={focusBorder}
        onBlur={blurBorder}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-2)] transition-colors cursor-pointer bg-transparent border-0 p-0"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function EditDeviceModal({
  device,
  siteName,
  onClose,
  onSaved,
}: {
  device: Device;
  siteName: string;
  onClose: () => void;
  onSaved: (device: Device) => void;
}) {
  const [tab, setTab] = useState<DeviceTab>("General");

  // General
  const [hostname, setHostname]       = useState(device.hostname);
  const [description, setDescription] = useState(device.description ?? "");
  const [version, setVersion]         = useState(normalizeVersion(device.version));

  // Connection
  const [mgmtIp, setMgmtIp]         = useState(device.mgmt_ip);
  const [apiPort, setApiPort]         = useState(device.api_port?.toString() ?? "");
  const [apiProtocol, setApiProtocol] = useState(device.api_protocol);
  const [apiKey, setApiKey]           = useState(device.api_key ?? "");
  const [apiTimeout, setApiTimeout]   = useState(device.api_timeout.toString());

  // SSH
  const [sshUser, setSshUser]       = useState(device.ssh_username ?? "");
  const [sshPass, setSshPass]       = useState(device.ssh_password ?? "");
  const [sshPort, setSshPort]       = useState(device.ssh_port.toString());

  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hostname.trim() || !mgmtIp.trim()) {
      setError("Hostname and Management IP are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API}/routers/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname:     hostname.trim(),
          description:  description.trim() || null,
          mgmt_ip:      mgmtIp.trim(),
          version,
          api_port:     apiPort ? parseInt(apiPort, 10) : null,
          api_protocol: apiProtocol,
          api_key:      apiKey.trim() || null,
          api_timeout:  parseInt(apiTimeout, 10) || 10,
          ssh_username: sshUser.trim() || null,
          ssh_password: sshPass || null,
          ssh_port:     parseInt(sshPort, 10) || 22,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save device.");
        return;
      }
      onSaved(await res.json());
      onClose();
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        title="Edit Device"
        subtitle={`${device.hostname} · ${siteName}`}
        onClose={onClose}
      />

      {/* Tab bar */}
      <div
        className="flex gap-0 mb-6"
        style={{ borderBottom: "1px solid var(--qz-border)" }}
      >
        {DEVICE_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-4 py-[9px] text-[13px] font-medium cursor-pointer bg-transparent border-0 border-b-2 -mb-px transition-colors"
            style={{
              color: tab === t ? "var(--qz-accent)" : "var(--qz-fg-4)",
              borderBottomColor: tab === t ? "var(--qz-accent)" : "transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {/* ── General ── */}
        {tab === "General" && (
          <>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
                Hostname <span style={{ color: "var(--qz-status-crit)" }}>*</span>
              </label>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                autoFocus
                className={inputCls}
                style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description…"
                className={inputCls}
                style={inputSt}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">VyOS Version</label>
              <select
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className={`${inputCls} cursor-pointer`}
                style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
              >
                {VYOS_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </>
        )}

        {/* ── Connection ── */}
        {tab === "Connection" && (
          <>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
                Management IP <span style={{ color: "var(--qz-status-crit)" }}>*</span>
              </label>
              <input
                value={mgmtIp}
                onChange={(e) => setMgmtIp(e.target.value)}
                placeholder="10.0.0.1"
                className={inputCls}
                style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">API Protocol</label>
                <select
                  value={apiProtocol}
                  onChange={(e) => setApiProtocol(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                  style={inputSt}
                >
                  <option value="https">HTTPS</option>
                  <option value="http">HTTP</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">API Port</label>
                <input
                  type="number"
                  value={apiPort}
                  onChange={(e) => setApiPort(e.target.value)}
                  placeholder="443"
                  min={1}
                  max={65535}
                  className={inputCls}
                  style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
            </div>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">API Key</label>
              <RevealInput
                value={apiKey}
                onChange={setApiKey}
                placeholder="API key…"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
                API Timeout <span className="text-[var(--qz-fg-4)]">(seconds)</span>
              </label>
              <input
                type="number"
                value={apiTimeout}
                onChange={(e) => setApiTimeout(e.target.value)}
                min={1}
                className={inputCls}
                style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>
          </>
        )}

        {/* ── SSH ── */}
        {tab === "SSH" && (
          <>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">SSH Username</label>
              <input
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                placeholder="vyos"
                className={inputCls}
                style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">SSH Password</label>
              <RevealInput
                value={sshPass}
                onChange={setSshPass}
                placeholder="Password…"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">SSH Port</label>
              <input
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
                min={1}
                max={65535}
                className={inputCls}
                style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>
          </>
        )}

        {error && <p className="text-[12px] m-0" style={{ color: "var(--qz-status-crit)" }}>{error}</p>}
        <FormActions onClose={onClose} saving={saving} saveLabel="Save Changes" />
      </form>
    </ModalShell>
  );
}

// ── Device sub-table ──────────────────────────────────────────────────────────

function DeviceTable({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const router = useRouter();
  const [devices, setDevices]         = useState<Device[]>([]);
  const [loading, setLoading]         = useState(true);
  const [addOpen, setAddOpen]         = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleManage = (device: Device) => {
    router.push(`/${slugify(siteName)}/device/${device.id}`);
  };

  useEffect(() => {
    fetchWithAuth(`${API}/sites/${siteId}/routers`)
      .then((r) => r.json())
      .then(setDevices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId]);

  const deleteDevice = async (id: string) => {
    await fetchWithAuth(`${API}/routers/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    setDevices((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div
      style={{ background: "color-mix(in oklab,var(--qz-bg) 60%,transparent)" }}
      onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
    >
      {loading ? (
        <p className="px-10 py-4 text-[12px] text-[var(--qz-fg-4)]">Loading devices…</p>
      ) : devices.length === 0 ? (
        <div className="px-10 py-4 flex items-center gap-4">
          <p className="text-[12px] text-[var(--qz-fg-4)] m-0">No devices in this site.</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAddOpen(true); }}
            className="flex items-center gap-[5px] text-[12px] font-semibold cursor-pointer border-0 px-3 py-[6px] rounded-md"
            style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
          >
            <Plus size={12} />
            Add Device
          </button>
        </div>
      ) : (
        <>
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--qz-border)" }}>
                {["Hostname", "Management IP", "Status", "Version", ""].map((col) => (
                  <th
                    key={col}
                    className="text-left text-[11px] font-semibold text-[var(--qz-fg-4)] uppercase tracking-wider"
                    style={{ padding: "8px 16px 8px", paddingLeft: col === "Hostname" ? 40 : 16 }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map((d, i) => (
                <tr
                  key={d.id}
                  style={{ borderBottom: i < devices.length - 1 ? "1px solid var(--qz-border)" : "none" }}
                >
                  <td className="py-[9px] text-[var(--qz-fg-2)]" style={{ paddingLeft: 40, paddingRight: 16, fontFamily: "var(--qz-font-mono)" }}>
                    <div className="flex items-center gap-2">
                      <Server size={12} className="text-[var(--qz-fg-4)] flex-shrink-0" />
                      {d.hostname}
                    </div>
                  </td>
                  <td className="px-4 py-[9px] text-[var(--qz-fg-3)]" style={{ fontFamily: "var(--qz-font-mono)" }}>{d.mgmt_ip}</td>
                  <td className="px-4 py-[9px]"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-[9px] text-[var(--qz-fg-4)]" style={{ fontFamily: "var(--qz-font-mono)" }}>{d.version || "—"}</td>
                  <td className="px-4 py-[9px]">
                    <div
                      className="flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleManage(d)}
                        className="flex items-center gap-[5px] text-[12px] font-medium px-[9px] py-[4px] rounded cursor-pointer transition-colors"
                        style={{ background: "transparent", border: "1px solid var(--qz-border)", color: "var(--qz-fg-3)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "var(--qz-accent)";
                          e.currentTarget.style.color = "var(--qz-accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--qz-border)";
                          e.currentTarget.style.color = "var(--qz-fg-3)";
                        }}
                      >
                        <ExternalLink size={11} />
                        Manage
                      </button>
                      <button
                        type="button"
                        title="Edit device"
                        onClick={() => { setEditingDevice(d); setConfirmDelete(null); }}
                        className="text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] transition-colors cursor-pointer bg-transparent border-0 p-0"
                      >
                        <Pencil size={13} />
                      </button>
                      {confirmDelete === d.id ? (
                        <button
                          type="button"
                          onClick={() => deleteDevice(d.id)}
                          className="text-[11px] font-semibold px-2 py-[4px] rounded cursor-pointer border-0"
                          style={{ background: "var(--qz-status-crit)", color: "white" }}
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(d.id)}
                          className="text-[var(--qz-fg-4)] hover:text-[var(--qz-status-crit)] transition-colors cursor-pointer bg-transparent border-0 p-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-10 py-3" style={{ borderTop: "1px solid var(--qz-border)" }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAddOpen(true); }}
              className="flex items-center gap-[5px] text-[12px] font-semibold cursor-pointer border-0 px-3 py-[6px] rounded-md"
              style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
            >
              <Plus size={12} />
              Add Device
            </button>
          </div>
        </>
      )}

      {addOpen && (
        <AddDeviceModal
          siteId={siteId}
          siteName={siteName}
          onClose={() => setAddOpen(false)}
          onCreated={(d) => setDevices((prev) => [...prev, d])}
        />
      )}

      {editingDevice && (
        <EditDeviceModal
          device={editingDevice}
          siteName={siteName}
          onClose={() => setEditingDevice(null)}
          onSaved={(updated) => {
            setDevices((prev) => prev.map((d) => d.id === updated.id ? updated : d));
            setEditingDevice(null);
          }}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SitesPage() {
  const [sites, setSites]               = useState<Site[]>([]);
  const [loading, setLoading]           = useState(true);
  const [addOpen, setAddOpen]           = useState(false);
  const [editingSite, setEditingSite]   = useState<Site | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API}/sites`);
      setSites(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteSite = async (id: string) => {
    await fetchWithAuth(`${API}/sites/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    setSites((prev) => prev.filter((s) => s.id !== id));
    setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleExpand = (id: string) => {
    setConfirmDelete(null);
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="p-[28px_36px]" onClick={() => setConfirmDelete(null)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.015em" }}>
          Sites
        </h1>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAddOpen(true); }}
          className="flex items-center gap-[7px] px-4 py-[9px] rounded-md text-[13.5px] font-semibold cursor-pointer border-0"
          style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
        >
          <Plus size={15} />
          Add Site
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-[13px] text-[var(--qz-fg-4)]">Loading…</p>
      ) : (
        <div className="rounded-md overflow-hidden" style={{ border: "1px solid var(--qz-border)" }}>
          {sites.length === 0 ? (
            <div className="px-6 py-12 text-center text-[var(--qz-fg-4)] text-[13px]">
              No sites yet. Add your first site to get started.
            </div>
          ) : (
            <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--qz-border)", background: "color-mix(in oklab,var(--qz-ink-1) 80%,transparent)" }}>
                  {["Site", "Description", ""].map((col) => (
                    <th
                      key={col}
                      className="text-left px-4 py-[10px] text-[11px] font-semibold text-[var(--qz-fg-3)] uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((site, i) => {
                  const isExpanded = expanded.has(site.id);
                  const isLast = i === sites.length - 1;
                  return (
                    <React.Fragment key={site.id}>
                      <tr
                        style={{
                          borderBottom: isExpanded || !isLast ? "1px solid var(--qz-border)" : "none",
                          background: isExpanded ? "color-mix(in oklab,var(--qz-ink-1) 40%,transparent)" : "var(--qz-ink-0)",
                          cursor: "pointer",
                        }}
                        onClick={() => toggleExpand(site.id)}
                      >
                        {/* Site name + chevron */}
                        <td className="px-4 py-[12px]">
                          <div className="flex items-center gap-[10px]">
                            <ChevronRight
                              size={15}
                              className="text-[var(--qz-fg-4)] flex-shrink-0 transition-transform duration-150"
                              style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}
                            />
                            <span className="text-[var(--qz-fg-1)] font-semibold">{site.name}</span>
                          </div>
                        </td>
                        {/* Description */}
                        <td className="px-4 py-[12px] text-[var(--qz-fg-3)]">
                          {site.description ?? <span className="text-[var(--qz-fg-4)]">—</span>}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-[12px]">
                          <div
                            className="flex items-center justify-end gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              title="Edit site"
                              onClick={() => { setEditingSite(site); setConfirmDelete(null); }}
                              className="text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] transition-colors cursor-pointer bg-transparent border-0 p-0"
                            >
                              <Pencil size={14} />
                            </button>

                            {confirmDelete === site.id ? (
                              <button
                                type="button"
                                onClick={() => deleteSite(site.id)}
                                className="text-[12px] font-semibold px-3 py-[5px] rounded cursor-pointer border-0"
                                style={{ background: "var(--qz-status-crit)", color: "white" }}
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(site.id)}
                                className="text-[var(--qz-fg-4)] hover:text-[var(--qz-status-crit)] transition-colors cursor-pointer bg-transparent border-0 p-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr style={{ borderBottom: isLast ? "none" : "1px solid var(--qz-border)" }}>
                          <td colSpan={3} style={{ padding: 0 }}>
                            <DeviceTable siteId={site.id} siteName={site.name} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {addOpen && (
        <SiteModal
          onClose={() => setAddOpen(false)}
          onSaved={(site) => setSites((prev) => [...prev, site].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}

      {editingSite && (
        <SiteModal
          initial={editingSite}
          onClose={() => setEditingSite(null)}
          onSaved={(updated) => setSites((prev) => prev.map((s) => s.id === updated.id ? updated : s))}
        />
      )}
    </div>
  );
}
