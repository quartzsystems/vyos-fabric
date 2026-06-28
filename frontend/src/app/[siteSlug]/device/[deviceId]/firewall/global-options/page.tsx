"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Save,
  AlertTriangle,
  RotateCw,
  Radio,
  Forward,
  Route,
  ShieldCheck,
  Shield,
  Globe,
  Workflow,
  LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { fetchGlobalOptions, GlobalOptionsConfig, GlobalOptionsUpdate } from "@/lib/api";
import { useConfigChanges } from "@/lib/ConfigChanges";
import { useDevice } from "@/lib/DeviceContext";

const inputStyle = {
  background: "var(--qz-input-bg)",
  border: "1px solid var(--qz-border)",
  fontFamily: "var(--qz-font-mono)",
} as const;

const selectStyle = {
  background: "var(--qz-input-bg)",
  border: "1px solid var(--qz-border)",
} as const;

type SingleKey =
  | "all_ping"
  | "broadcast_ping"
  | "directed_broadcast"
  | "ip_src_route"
  | "ipv6_src_route"
  | "ipv6_receive_redirects"
  | "receive_redirects"
  | "send_redirects"
  | "log_martians"
  | "syn_cookies"
  | "twa_hazards_protection"
  | "apply_to_bridge"
  | "source_validation"
  | "ipv6_source_validation";

interface Opt {
  value: string;
  label: string;
}

const ENABLE_OPTS: Opt[] = [
  { value: "", label: "Default" },
  { value: "enable", label: "Enable" },
  { value: "disable", label: "Disable" },
];

const VALIDATION_OPTS: Opt[] = [
  { value: "", label: "Default" },
  { value: "strict", label: "Strict" },
  { value: "loose", label: "Loose" },
  { value: "disable", label: "Disable" },
];

const ACTION_OPTS: Opt[] = [
  { value: "", label: "Default" },
  { value: "accept", label: "Accept" },
  { value: "reject", label: "Reject" },
  { value: "drop", label: "Drop" },
];

// Syslog levels accepted by VyOS firewall log-options.
const LEVEL_OPTS: Opt[] = [
  { value: "", label: "Default" },
  { value: "emerg", label: "Emergency" },
  { value: "alert", label: "Alert" },
  { value: "crit", label: "Critical" },
  { value: "err", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "notice", label: "Notice" },
  { value: "info", label: "Info" },
  { value: "debug", label: "Debug" },
];

// Per-option label, hover help, and which value set it accepts.
const META: Record<SingleKey, { label: string; help: string; opts: Opt[] }> = {
  all_ping: { label: "All ping", help: "Respond to ICMP echo requests addressed to the router", opts: ENABLE_OPTS },
  broadcast_ping: { label: "Broadcast ping", help: "Respond to broadcast/multicast ICMP echo & timestamp requests", opts: ENABLE_OPTS },
  directed_broadcast: { label: "Directed broadcast", help: "Forward directed broadcasts into the destination subnet", opts: ENABLE_OPTS },
  receive_redirects: { label: "IPv4 receive", help: "Accept ICMP redirect messages", opts: ENABLE_OPTS },
  ipv6_receive_redirects: { label: "IPv6 receive", help: "Accept ICMPv6 redirect messages", opts: ENABLE_OPTS },
  send_redirects: { label: "Send", help: "Send ICMP redirect messages", opts: ENABLE_OPTS },
  ip_src_route: { label: "IPv4 source route", help: "Process IPv4 packets carrying a source-route option", opts: ENABLE_OPTS },
  ipv6_src_route: { label: "IPv6 source route", help: "Process IPv6 packets carrying a routing header", opts: ENABLE_OPTS },
  log_martians: { label: "Log martians", help: "Log packets with impossible (martian) source addresses", opts: ENABLE_OPTS },
  syn_cookies: { label: "SYN cookies", help: "Enable TCP SYN cookies to mitigate SYN floods", opts: ENABLE_OPTS },
  twa_hazards_protection: { label: "TWA hazards", help: "RFC 1337 TIME-WAIT assassination hazards protection", opts: ENABLE_OPTS },
  apply_to_bridge: { label: "Apply to bridge", help: "Apply firewall rulesets to bridge interfaces", opts: ENABLE_OPTS },
  source_validation: { label: "IPv4", help: "IPv4 reverse-path filtering (RFC 3704)", opts: VALIDATION_OPTS },
  ipv6_source_validation: { label: "IPv6", help: "IPv6 reverse-path filtering", opts: VALIDATION_OPTS },
};

// Category pods of single-value options. Each pod becomes one card.
const PODS: { title: string; icon: LucideIcon; keys: SingleKey[] }[] = [
  { title: "ICMP & Ping", icon: Radio, keys: ["all_ping", "broadcast_ping", "directed_broadcast"] },
  { title: "ICMP Redirects", icon: Forward, keys: ["receive_redirects", "ipv6_receive_redirects", "send_redirects"] },
  { title: "Source Routing", icon: Route, keys: ["ip_src_route", "ipv6_src_route"] },
  { title: "Source Validation", icon: ShieldCheck, keys: ["source_validation", "ipv6_source_validation"] },
  { title: "Protection", icon: Shield, keys: ["log_martians", "syn_cookies", "twa_hazards_protection", "apply_to_bridge"] },
];

const SINGLE_KEYS = Object.keys(META) as SingleKey[];

const STATES = ["established", "related", "invalid"] as const;
type StateName = (typeof STATES)[number];

interface StatePolicyForm {
  action: string;
  log: boolean;
  logLevel: string;
}

interface FormState {
  options: Record<SingleKey, string>;
  resolverCache: boolean;
  resolverInterval: string;
  statePolicy: Record<StateName, StatePolicyForm>;
}

function emptyForm(): FormState {
  return {
    options: Object.fromEntries(SINGLE_KEYS.map((k) => [k, ""])) as Record<SingleKey, string>,
    resolverCache: false,
    resolverInterval: "",
    statePolicy: {
      established: { action: "", log: false, logLevel: "" },
      related: { action: "", log: false, logLevel: "" },
      invalid: { action: "", log: false, logLevel: "" },
    },
  };
}

function fromConfig(cfg: GlobalOptionsConfig): FormState {
  return {
    options: Object.fromEntries(SINGLE_KEYS.map((k) => [k, cfg[k] ?? ""])) as Record<SingleKey, string>,
    resolverCache: cfg.resolver_cache,
    resolverInterval: cfg.resolver_interval ?? "",
    statePolicy: {
      established: spFrom(cfg.state_policy.established),
      related: spFrom(cfg.state_policy.related),
      invalid: spFrom(cfg.state_policy.invalid),
    },
  };
}

function spFrom(e: GlobalOptionsConfig["state_policy"]["established"]): StatePolicyForm {
  return { action: e.action ?? "", log: e.log, logLevel: e.log_level ?? "" };
}

function toUpdate(f: FormState): GlobalOptionsUpdate {
  return {
    ...f.options,
    resolver_cache: f.resolverCache,
    resolver_interval: f.resolverInterval,
    state_policy: {
      established: spTo(f.statePolicy.established),
      related: spTo(f.statePolicy.related),
      invalid: spTo(f.statePolicy.invalid),
    },
  };
}

function spTo(sp: StatePolicyForm): { action: string | null; log: boolean; log_level: string | null } {
  return {
    action: sp.action || null,
    log: sp.log,
    // A level only applies while logging is on.
    log_level: sp.log ? sp.logLevel || null : null,
  };
}

function Pod({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-[var(--qz-fg-3)]" />
        <h2 className="text-[12px] font-semibold text-[var(--qz-fg-2)] uppercase tracking-wider m-0">
          {title}
        </h2>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/** A compact label + control row inside a pod; first row has no top border. */
function Row({ label, help, first, control }: { label: string; help?: string; first?: boolean; control: React.ReactNode }) {
  return (
    <div
      title={help}
      className="flex items-center justify-between gap-3 py-[8px]"
      style={{ borderTop: first ? "none" : "1px solid var(--qz-border)" }}
    >
      <span className="text-[13px] text-[var(--qz-fg-2)] min-w-0 truncate">{label}</span>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

function Select({
  value,
  opts,
  onChange,
  disabled,
  width = 118,
}: {
  value: string;
  opts: Opt[];
  onChange: (v: string) => void;
  disabled?: boolean;
  width?: number;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md px-[10px] py-[6px] text-[13px] text-[var(--qz-fg-1)] outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ ...selectStyle, width }}
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Flex/transform based so it renders correctly inside the CSS multi-column flow
// (absolutely-positioned children misrender across column fragments).
function Toggle({ checked, onChange, title }: { checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center flex-shrink-0 rounded-full transition-colors duration-200 outline-none cursor-pointer"
      style={{ width: 36, height: 20, padding: "0 2px", background: checked ? "var(--qz-accent)" : "var(--qz-border-strong)" }}
    >
      <span
        className="rounded-full"
        style={{
          width: 16,
          height: 16,
          background: "white",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform 200ms",
        }}
      />
    </button>
  );
}

export default function GlobalOptionsPage() {
  const { stageFirewallGlobalOptions } = useConfigChanges();
  const { deviceId, device } = useDevice();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (mode === "load") setStatus("loading");
      try {
        const cfg = await fetchGlobalOptions(deviceId);
        setForm(fromConfig(cfg));
        setStatus("ready");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to load global options.");
        setStatus("error");
      }
    },
    [deviceId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const setOption = (key: SingleKey, value: string) =>
    setForm((f) => ({ ...f, options: { ...f.options, [key]: value } }));

  const setStatePolicy = (state: StateName, patch: Partial<StatePolicyForm>) =>
    setForm((f) => ({
      ...f,
      statePolicy: { ...f.statePolicy, [state]: { ...f.statePolicy[state], ...patch } },
    }));

  const save = async () => {
    if (!deviceId) return;
    setSaving(true);
    try {
      await stageFirewallGlobalOptions(toUpdate(form));
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load("refresh");
    } finally {
      setRefreshing(false);
    }
  };

  // Pod renderers — composed into explicit columns below so each pod stacks where
  // intended (a flex column never fragments a pod, unlike CSS multi-column).
  const singlePod = (title: string) => {
    const pod = PODS.find((p) => p.title === title)!;
    return (
      <Pod title={pod.title} icon={pod.icon}>
        {pod.keys.map((key, i) => (
          <Row
            key={key}
            label={META[key].label}
            help={META[key].help}
            first={i === 0}
            control={<Select value={form.options[key]} opts={META[key].opts} onChange={(v) => setOption(key, v)} />}
          />
        ))}
      </Pod>
    );
  };

  const resolverPod = (
    <Pod title="Resolver" icon={Globe}>
      <Row
        label="Resolver cache"
        help="Keep the last successfully resolved address if a later lookup fails"
        first
        control={<Toggle checked={form.resolverCache} onChange={(v) => setForm((f) => ({ ...f, resolverCache: v }))} />}
      />
      <Row
        label="Resolve interval"
        help="Seconds between FQDN re-resolutions (blank for default)"
        control={
          <input
            value={form.resolverInterval}
            onChange={(e) => setForm((f) => ({ ...f, resolverInterval: e.target.value.replace(/[^0-9]/g, "") }))}
            inputMode="numeric"
            placeholder="300"
            className="rounded-md px-[10px] py-[6px] text-[13px] text-[var(--qz-fg-1)] outline-none text-right"
            style={{ ...inputStyle, width: 118 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qz-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
          />
        }
      />
    </Pod>
  );

  const statePolicyPod = (
    <Pod title="State Policy" icon={Workflow}>
      {STATES.map((state, i) => {
        const sp = form.statePolicy[state];
        return (
          <div
            key={state}
            className="py-[10px]"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--qz-border)" }}
          >
            <div className="flex items-center justify-between gap-3" title={`Default action for ${state} connections`}>
              <span className="text-[13px] text-[var(--qz-fg-1)] capitalize">{state}</span>
              <Select value={sp.action} opts={ACTION_OPTS} onChange={(v) => setStatePolicy(state, { action: v })} />
            </div>
            <div className="flex items-center justify-between gap-3 mt-[8px]">
              <label className="flex items-center gap-2 text-[12px] text-[var(--qz-fg-3)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sp.log}
                  onChange={(e) => setStatePolicy(state, { log: e.target.checked })}
                  className="w-[14px] h-[14px] cursor-pointer accent-[var(--qz-accent)]"
                />
                Log
              </label>
              <Select
                value={sp.logLevel}
                opts={LEVEL_OPTS}
                disabled={!sp.log}
                onChange={(v) => setStatePolicy(state, { logLevel: v })}
              />
            </div>
          </div>
        );
      })}
    </Pod>
  );

  const colStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 20,
    minWidth: 0,
  };

  return (
    <div className="p-[28px_36px]">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.015em" }}>
            Global Options
          </h1>
          <p className="text-[13px] text-[var(--qz-fg-4)] mt-1 mb-0">
            Device-wide firewall hardening (<code>firewall global-options</code>). “Default” leaves an option unset.
          </p>
        </div>
        {status === "ready" && (
          <div className="flex items-center gap-3">
            <Button kind="secondary" size="sm" icon={RotateCw} type="button" onClick={refresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <Button kind="primary" icon={Save} type="button" onClick={save} disabled={saving}>
              {saving ? "Staging…" : "Save changes"}
            </Button>
          </div>
        )}
      </div>

      {status === "loading" && (
        <div className="text-[13px] text-[var(--qz-fg-4)]">
          Loading global options{device ? ` from ${device.hostname}` : ""}…
        </div>
      )}

      {status === "error" && (
        <div className="max-w-[640px] flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[13px] text-[var(--qz-danger)]">
            <AlertTriangle size={15} />
            {errorMsg}
          </div>
          <div>
            <Button kind="secondary" icon={RotateCw} onClick={() => load()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {status === "ready" && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", maxWidth: 920 }}>
          <div style={colStyle}>
            {singlePod("ICMP & Ping")}
            {singlePod("Source Validation")}
            {statePolicyPod}
          </div>
          <div style={colStyle}>
            {singlePod("ICMP Redirects")}
            {singlePod("Protection")}
          </div>
          <div style={colStyle}>
            {singlePod("Source Routing")}
            {resolverPod}
          </div>
        </div>
      )}
    </div>
  );
}
