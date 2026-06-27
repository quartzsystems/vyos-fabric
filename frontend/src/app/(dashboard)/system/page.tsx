"use client";

import { useState, useEffect } from "react";
import { Save, Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";

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

let ntpIdCounter = 4;

function GeneralTab() {
  const [hostname, setHostname] = useState("vyos-core-01");
  const [domain, setDomain] = useState("fabric.quartz.internal");

  const now = new Date();
  const [day, setDay] = useState(String(now.getDate()));
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [syncWithInternet, setSyncWithInternet] = useState(true);

  const [timezone, setTimezone] = useState("UTC");
  const [currentTime, setCurrentTime] = useState("");
  const [ntpEnabled, setNtpEnabled] = useState(true);
  const [ntpServers, setNtpServers] = useState([
    { id: 1, server: "0.pool.ntp.org", refId: ".POOL.", pull: 64 },
    { id: 2, server: "1.pool.ntp.org", refId: ".POOL.", pull: 64 },
    { id: 3, server: "2.pool.ntp.org", refId: ".POOL.", pull: 64 },
  ]);

  useEffect(() => {
    const update = () => setCurrentTime(new Date().toUTCString().replace("GMT", "UTC"));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const addNtp = () => {
    setNtpServers((prev) => [
      ...prev,
      { id: ntpIdCounter++, server: "", refId: "", pull: 64 },
    ]);
  };

  const removeNtp = (id: number) =>
    setNtpServers((prev) => prev.filter((s) => s.id !== id));

  return (
    <div className="max-w-[640px] flex flex-col gap-8">
      {/* Hostname & Domain */}
      <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-5">
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
        <div>
          <Button kind="primary" icon={Save} type="submit">Save changes</Button>
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
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none cursor-pointer"
              style={{ ...selectStyle, width: 72 }}
            >
              {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none cursor-pointer"
              style={{ ...selectStyle, width: 130 }}
            >
              {MONTHS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none cursor-pointer"
              style={{ ...selectStyle, width: 96 }}
            >
              {Array.from({ length: 10 }, (_, i) => String(2020 + i)).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--qz-fg-2)] select-none pb-[10px]">
            <input
              type="checkbox"
              checked={syncWithInternet}
              onChange={(e) => setSyncWithInternet(e.target.checked)}
              className="w-[15px] h-[15px] cursor-pointer accent-[var(--qz-accent)]"
            />
            Synchronize with internet
          </label>
        </div>
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
              {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
            </select>
          </div>
          {currentTime && (
            <div className="flex flex-col justify-end">
              <span className="text-[11px] text-[var(--qz-fg-4)] mb-[6px]">Current Time</span>
              <span
                className="text-[13px] text-[var(--qz-fg-2)]"
                style={{ fontFamily: "var(--qz-font-mono)" }}
              >
                {currentTime}
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
            className="flex items-center gap-[6px] px-3 py-[7px] text-[13px] font-medium rounded-md transition-colors cursor-pointer"
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
                    key={s.id}
                    style={{
                      borderBottom: i < ntpServers.length - 1 ? "1px solid var(--qz-border)" : "none",
                      background: "var(--qz-ink-0)",
                    }}
                  >
                    <td
                      className="px-4 py-[10px] text-[var(--qz-fg-2)]"
                      style={{ fontFamily: "var(--qz-font-mono)" }}
                    >
                      <div className="flex items-center gap-2">
                        <Clock size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
                        {s.server}
                      </div>
                    </td>
                    <td
                      className="px-4 py-[10px] text-[var(--qz-fg-3)]"
                      style={{ fontFamily: "var(--qz-font-mono)" }}
                    >
                      {s.refId}
                    </td>
                    <td
                      className="px-4 py-[10px] text-[var(--qz-fg-3)]"
                      style={{ fontFamily: "var(--qz-font-mono)" }}
                    >
                      {s.pull}
                    </td>
                    <td className="px-4 py-[10px] text-right">
                      <button
                        type="button"
                        onClick={() => removeNtp(s.id)}
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
