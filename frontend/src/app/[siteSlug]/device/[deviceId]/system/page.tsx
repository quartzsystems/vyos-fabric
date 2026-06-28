"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Plus, Trash2, Clock, AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { fetchSystem } from "@/lib/api";
import { useConfigChanges } from "@/lib/ConfigChanges";
import { useDevice } from "@/lib/DeviceContext";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Helsinki",
  "Europe/Kiev",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const TABS = [{ id: "general", label: "General" }] as const;
type TabId = (typeof TABS)[number]["id"];

const inputStyle = {
  background: "var(--qz-input-bg)",
  border: "1px solid var(--qz-border)",
  fontFamily: "var(--qz-font-mono)",
} as const;

const selectStyle = {
  background: "var(--qz-input-bg)",
  border: "1px solid var(--qz-border)",
} as const;

interface NtpRow {
  key: string;
  server: string;
  refId: string | null;
  pull: number | null;
}

let ntpKeyCounter = 0;
const nextKey = () => `ntp-${ntpKeyCounter++}`;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0 mb-4"
      style={{ letterSpacing: "-0.01em" }}
    >
      {children}
    </h2>
  );
}

function Divider() {
  return <div style={{ borderTop: "1px solid var(--qz-border)" }} />;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 rounded-full transition-colors duration-200 outline-none cursor-pointer"
      style={{
        width: 36,
        height: 20,
        background: checked ? "var(--qz-accent)" : "var(--qz-border-strong)",
      }}
    >
      <span
        className="absolute top-[2px] rounded-full transition-all duration-200"
        style={{
          width: 16,
          height: 16,
          background: "white",
          left: checked ? "calc(100% - 18px)" : 2,
        }}
      />
    </button>
  );
}

function GeneralTab() {
  const { stageSystemChanges } = useConfigChanges();
  const { deviceId, device } = useDevice();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Editable desired state.
  const [hostname, setHostname] = useState("");
  const [domain, setDomain] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [ntpEnabled, setNtpEnabled] = useState(true);
  const [ntpServers, setNtpServers] = useState<NtpRow[]>([]);

  // Live device clock (read-only).
  const [deviceTime, setDeviceTime] = useState<string | null>(null);

  const load = useCallback(async (mode: "load" | "refresh" = "load") => {
    if (mode === "load") setStatus("loading");
    try {
      const cfg = await fetchSystem(deviceId);
      setHostname(cfg.hostname ?? "");
      setDomain(cfg.domain_name ?? "");
      setTimezone(cfg.time_zone ?? "UTC");
      setNtpEnabled(cfg.ntp_enabled);
      setNtpServers(
        cfg.ntp_servers.map((s) => ({
          key: nextKey(),
          server: s.server,
          refId: s.ref_id,
          pull: s.pull,
        })),
      );
      setDeviceTime(cfg.current_time);
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load configuration.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const addNtp = () =>
    setNtpServers((prev) => [...prev, { key: nextKey(), server: "", refId: null, pull: null }]);

  const removeNtp = (key: string) =>
    setNtpServers((prev) => prev.filter((s) => s.key !== key));

  const updateNtp = (key: string, server: string) =>
    setNtpServers((prev) => prev.map((s) => (s.key === key ? { ...s, server } : s)));

  const save = async () => {
    if (!deviceId) return;
    setSaving(true);
    try {
      await stageSystemChanges({
        hostname,
        domain_name: domain,
        time_zone: timezone,
        ntp_enabled: ntpEnabled,
        ntp_servers: ntpServers.map((s) => s.server.trim()).filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  };

  // Parse device clock for the (read-only) Day/Month/Year display.
  const parsedDate = deviceTime ? new Date(deviceTime) : null;
  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

  if (status === "loading") {
    return (
      <div className="max-w-[640px] text-[13px] text-[var(--qz-fg-4)]">
        Loading system configuration{device ? ` from ${device.hostname}` : ""}…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-[640px] flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[13px] text-[var(--qz-danger)]">
          <AlertTriangle size={15} />
          {errorMsg}
        </div>
        <div>
          <Button kind="secondary" icon={RotateCw} onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load("refresh");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="max-w-[640px] flex flex-col gap-8">
      <div className="flex justify-end -mb-4">
        <Button kind="secondary" size="sm" icon={RotateCw} onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {/* Hostname & Domain */}
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-5">
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Hostname</label>
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="vyos-router"
              className="w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qz-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
            />
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Domain Name</label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qz-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button kind="primary" icon={Save} type="submit" disabled={saving}>
            {saving ? "Staging…" : "Save changes"}
          </Button>
          <span className="text-[12px] text-[var(--qz-fg-4)]">
            Stages all System changes for review before commit.
          </span>
        </div>
      </form>

      <Divider />

      {/* Date */}
      <div>
        <SectionHeading>Date</SectionHeading>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Day</label>
            <select
              value={validDate ? String(validDate.getDate()) : ""}
              disabled
              className="rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-2)] outline-none disabled:opacity-60"
              style={{ ...selectStyle, width: 72 }}
            >
              {validDate ? (
                <option>{validDate.getDate()}</option>
              ) : (
                <option value="">—</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Month</label>
            <select
              value={validDate ? MONTHS[validDate.getMonth()] : ""}
              disabled
              className="rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-2)] outline-none disabled:opacity-60"
              style={{ ...selectStyle, width: 130 }}
            >
              {validDate ? (
                <option>{MONTHS[validDate.getMonth()]}</option>
              ) : (
                <option value="">—</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Year</label>
            <select
              value={validDate ? String(validDate.getFullYear()) : ""}
              disabled
              className="rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-2)] outline-none disabled:opacity-60"
              style={{ ...selectStyle, width: 96 }}
            >
              {validDate ? (
                <option>{validDate.getFullYear()}</option>
              ) : (
                <option value="">—</option>
              )}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--qz-fg-2)] select-none pb-[10px]">
            <input
              type="checkbox"
              checked={ntpEnabled}
              onChange={(e) => setNtpEnabled(e.target.checked)}
              className="w-[15px] h-[15px] cursor-pointer accent-[var(--qz-accent)]"
            />
            Synchronize with internet (NTP)
          </label>
        </div>
        <p className="text-[11px] text-[var(--qz-fg-4)] mt-3">
          The device clock is managed by NTP and read directly from the device. Manual date
          setting is not exposed by the VyOS API.
        </p>
      </div>

      <Divider />

      {/* Timezone & NTP */}
      <div>
        <SectionHeading>Timezone & NTP</SectionHeading>

        <div className="grid gap-x-6 gap-y-4 mb-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none cursor-pointer"
              style={selectStyle}
            >
              {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </div>
          {deviceTime && (
            <div className="flex flex-col justify-end">
              <span className="text-[11px] text-[var(--qz-fg-4)] mb-[6px]">Current Time</span>
              <span
                className="text-[13px] text-[var(--qz-fg-2)]"
                style={{ fontFamily: "var(--qz-font-mono)" }}
              >
                {deviceTime}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-4">
          <label className="flex items-center gap-[10px] cursor-pointer select-none">
            <Toggle checked={ntpEnabled} onChange={setNtpEnabled} />
            <span className="text-[13px] text-[var(--qz-fg-2)]">Enable NTP Sync</span>
          </label>
          <button
            type="button"
            onClick={addNtp}
            disabled={!ntpEnabled}
            className="flex items-center gap-[6px] px-3 py-[7px] text-[13px] font-medium rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "transparent",
              border: "1px solid var(--qz-border)",
              color: "var(--qz-fg-2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--qz-border-strong)";
              e.currentTarget.style.color = "var(--qz-fg-1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--qz-border)";
              e.currentTarget.style.color = "var(--qz-fg-2)";
            }}
          >
            <Plus size={13} />
            Add NTP
          </button>
        </div>

        {ntpServers.length > 0 && (
          <div
            className="rounded-md overflow-hidden"
            style={{ border: "1px solid var(--qz-border)", opacity: ntpEnabled ? 1 : 0.4, transition: "opacity 200ms" }}
          >
            <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--qz-border)",
                    background: "color-mix(in oklab, var(--qz-ink-1) 80%, transparent)",
                  }}
                >
                  {["Server", "Ref ID", "Pull"].map((col) => (
                    <th
                      key={col}
                      className="text-left px-4 py-[10px] text-[11px] font-semibold text-[var(--qz-fg-3)] uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {ntpServers.map((s, i) => (
                  <tr
                    key={s.key}
                    style={{
                      borderBottom: i < ntpServers.length - 1 ? "1px solid var(--qz-border)" : "none",
                      background: "var(--qz-ink-0)",
                    }}
                  >
                    <td className="px-4 py-[8px] text-[var(--qz-fg-2)]">
                      <div className="flex items-center gap-2">
                        <Clock size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
                        <input
                          value={s.server}
                          onChange={(e) => updateNtp(s.key, e.target.value)}
                          disabled={!ntpEnabled}
                          placeholder="pool.ntp.org"
                          className="flex-1 bg-transparent outline-none text-[13px] text-[var(--qz-fg-1)] disabled:opacity-60"
                          style={{ fontFamily: "var(--qz-font-mono)", border: "none" }}
                        />
                      </div>
                    </td>
                    <td
                      className="px-4 py-[8px] text-[var(--qz-fg-3)]"
                      style={{ fontFamily: "var(--qz-font-mono)" }}
                    >
                      {s.refId ?? "—"}
                    </td>
                    <td
                      className="px-4 py-[8px] text-[var(--qz-fg-3)]"
                      style={{ fontFamily: "var(--qz-font-mono)" }}
                    >
                      {s.pull ?? "—"}
                    </td>
                    <td className="px-4 py-[8px] text-right">
                      <button
                        type="button"
                        onClick={() => removeNtp(s.key)}
                        disabled={!ntpEnabled}
                        className="text-[var(--qz-fg-4)] hover:text-[var(--qz-status-crit)] transition-colors cursor-pointer bg-transparent border-0 p-0 disabled:pointer-events-none"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SystemPage() {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <div className="flex flex-col h-full">
      <div className="px-[36px] pt-[28px] pb-0 flex-shrink-0">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0 mb-5"
          style={{ letterSpacing: "-0.015em" }}
        >
          System
        </h1>
        <div className="flex gap-0" style={{ borderBottom: "1px solid var(--qz-border)" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="px-4 pb-3 text-[13.5px] font-medium cursor-pointer bg-transparent border-0 transition-colors duration-[120ms] relative"
              style={{ color: activeTab === tab.id ? "var(--qz-fg-1)" : "var(--qz-fg-3)" }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                  style={{ background: "var(--qz-accent)" }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-[36px] py-[28px]">
        {activeTab === "general" && <GeneralTab />}
      </div>
    </div>
  );
}
