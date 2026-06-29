"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ModalShell, ModalHeader } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { NatRule } from "@/lib/api";
import { useConfigChanges } from "@/lib/ConfigChanges";

type Section = "source" | "destination";
type FormTab = "general" | "source" | "destination" | "advanced";
type InterfaceKind = "name" | "group";
type TranslationType = "masquerade" | "address" | "cidr" | "range";

const TABS: [FormTab, string][] = [
  ["general", "General"],
  ["source", "Source"],
  ["destination", "Destination"],
  ["advanced", "Advanced"],
];

const inputCls = "w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none";
const inputSt = { background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)" } as const;
const monoSt = { ...inputSt, fontFamily: "var(--qz-font-mono)" } as const;

const PROTOCOLS = ["all", "tcp", "udp", "tcp_udp", "icmp", "esp", "gre"];

// Placeholder shown for the translation address input, keyed by the chosen type.
const TRANSLATION_PLACEHOLDER: Record<Exclude<TranslationType, "masquerade">, string> = {
  address: "192.168.1.10",
  cidr: "192.168.1.0/24",
  range: "192.168.1.10-192.168.1.20",
};

/// Infer the translation type from a rule's stored translation string.
function translationTypeOf(translation: string | null, isSource: boolean): TranslationType {
  const t = translation?.trim() ?? "";
  if (!t) return isSource ? "masquerade" : "address";
  if (t === "masquerade") return "masquerade";
  if (t.includes("/")) return "cidr";
  if (t.includes("-")) return "range";
  return "address";
}

function focusBorder(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--qz-accent)";
}
function blurBorder(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--qz-border)";
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[var(--qz-fg-4)] m-0 mt-[5px]">{hint}</p>}
    </div>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
  mono,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  mono?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${inputCls} cursor-pointer appearance-none pr-9`}
        style={mono ? monoSt : inputSt}
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--qz-fg-4)]"
      />
    </div>
  );
}

/// Create/edit a single NAT44 source (SNAT) or destination (DNAT) rule. Stages the
/// minimal diff into the change tray rather than touching the device directly. Fields
/// are grouped across General / Source / Destination / Advanced tabs. General carries
/// the rule's identity and translation setup (interface, translation, protocol); the
/// Source/Destination tabs hold only their match criteria.
export function Nat44RuleFormModal({
  section,
  initial,
  interfaces,
  interfaceGroups,
  existing,
  onClose,
}: {
  section: Section;
  /** Present when editing an existing rule; absent when creating. */
  initial?: NatRule;
  /** Interface names offered in the interface picker (kind = name). */
  interfaces: string[];
  /** Firewall interface-group names offered in the interface picker (kind = group). */
  interfaceGroups: string[];
  /** Existing rules in this section, for duplicate rule-number detection. */
  existing: NatRule[];
  onClose: () => void;
}) {
  const { stageNat44Rule } = useConfigChanges();
  const isEdit = !!initial;
  const isSource = section === "source";

  const [tab, setTab] = useState<FormTab>("general");

  const [rule, setRule] = useState(initial?.rule ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // No "any" entry in the pickers, so a new rule defaults to the first available
  // interface; an existing rule keeps its stored name/group.
  const [iface, setIface] = useState(initial?.interface ?? interfaces[0] ?? "");
  const [ifaceKind, setIfaceKind] = useState<InterfaceKind>(initial?.interface_group ? "group" : "name");
  const [sourceAddress, setSourceAddress] = useState(initial?.source ?? "");
  const [sourcePort, setSourcePort] = useState(initial?.source_port ?? "");
  const [destAddress, setDestAddress] = useState(initial?.destination ?? "");
  const [destPort, setDestPort] = useState(initial?.destination_port ?? "");
  const [translationType, setTranslationType] = useState<TranslationType>(
    translationTypeOf(initial?.translation ?? null, isSource),
  );
  const [translationAddress, setTranslationAddress] = useState(
    initial?.translation && initial.translation !== "masquerade" ? initial.translation : "",
  );
  const [translationPort, setTranslationPort] = useState(initial?.translation_port ?? "");
  // VyOS treats an unset protocol as "all"; show that explicitly so the field is never blank.
  const [protocol, setProtocol] = useState(initial?.protocol ?? "all");
  const [exclude, setExclude] = useState(initial?.exclude ?? false);
  const [log, setLog] = useState(initial?.log ?? false);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isMasquerade = translationType === "masquerade";

  const interfaceTypes: [InterfaceKind, string][] = [
    ["name", "Interface Name"],
    ["group", "Interface Group"],
  ];
  // Masquerade only applies to source (SNAT) translation.
  const translationTypes: [TranslationType, string][] = [
    ...(isSource ? ([["masquerade", "Masquerade"]] as [TranslationType, string][]) : []),
    ["address", "IP Address"],
    ["cidr", "CIDR Block"],
    ["range", "IP Range"],
  ];

  // Interface picker options for the chosen kind, with the current value guaranteed
  // present (handles values absent from the lists). No blank "any" entry — a rule must
  // target a specific interface or group.
  const ifaceNames = [...new Set([iface, ...(ifaceKind === "name" ? interfaces : interfaceGroups)].filter(Boolean))];
  const ifaceOptions: [string, string][] = ifaceNames.map((n) => [n, n] as [string, string]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const num = Number(rule);
    if (!Number.isInteger(num) || num < 1 || num > 999999) {
      setError("Rule number must be a whole number between 1 and 999999.");
      setTab("general");
      return;
    }
    // Block collisions with another rule in this section (allow re-saving the edited one).
    const clash = existing.some((r) => Number(r.rule) === num && !(isEdit && r.rule === initial!.rule));
    if (clash) {
      setError(`Rule ${num} already exists in this section.`);
      setTab("general");
      return;
    }

    setSaving(true);
    try {
      await stageNat44Rule({
        section,
        rule: num,
        description: description.trim() || null,
        interface: iface.trim() || null,
        interface_group: ifaceKind === "group",
        source_address: sourceAddress.trim() || null,
        source_port: sourcePort.trim() || null,
        destination_address: destAddress.trim() || null,
        destination_port: destPort.trim() || null,
        translation_address: isMasquerade ? "masquerade" : translationAddress.trim() || null,
        translation_port: isMasquerade ? null : translationPort.trim() || null,
        // "all" is the VyOS default — store it as unset rather than an explicit leaf.
        protocol: protocol.trim() && protocol.trim().toLowerCase() !== "all" ? protocol.trim() : null,
        exclude,
        log,
        enabled,
        original_rule: initial ? Number(initial.rule) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stage rule.");
    } finally {
      setSaving(false);
    }
  };

  const title = `${isEdit ? "Edit" : "Create"} ${isSource ? "Source" : "Destination"} NAT Rule`;
  const ifaceLabel = isSource ? "Outbound Interface" : "Inbound Interface";

  return (
    <ModalShell onClose={onClose} maxWidth={580}>
      <ModalHeader
        title={title}
        subtitle={isSource ? "IPv4 SNAT / Masquerade" : "IPv4 DNAT / Port-Forward"}
        onClose={onClose}
      />

      <form onSubmit={submit} className="flex flex-col gap-5">
        <datalist id="nat44-protocols">
          {PROTOCOLS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <Field label="Rule Number">
          <input
            type="number"
            min={1}
            max={999999}
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            placeholder="100"
            className={inputCls}
            style={monoSt}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </Field>

        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Office Outbound NAT"
            className={inputCls}
            style={inputSt}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </Field>

        <div className="flex items-center gap-1 border-b border-[var(--qz-border)]">
          {TABS.map(([id, label]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={[
                  "px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors cursor-pointer",
                  active
                    ? "text-[var(--qz-accent)] border-[var(--qz-accent)]"
                    : "text-[var(--qz-fg-3)] border-transparent hover:text-[var(--qz-fg-1)]",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Panels stay mounted (display toggled) so field state and scroll position
            persist when switching tabs. */}
        <div style={{ minHeight: 232 }}>
          <div className={tab === "general" ? "flex flex-col gap-4" : "hidden"}>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label={`${ifaceLabel} Type`}>
                <Select
                  value={ifaceKind}
                  onChange={(k) => {
                    setIfaceKind(k);
                    // Names and groups are different domains — reset to the first available
                    // entry of the new kind (no "any" option to fall back to).
                    setIface((k === "group" ? interfaceGroups[0] : interfaces[0]) ?? "");
                  }}
                  options={interfaceTypes}
                />
              </Field>
              <Field
                label={ifaceKind === "group" ? "Interface Group" : ifaceLabel}
                hint={
                  ifaceKind === "group"
                    ? "Firewall interface group to match."
                    : "Interface this rule applies to."
                }
              >
                <Select value={iface} onChange={setIface} options={ifaceOptions} mono />
              </Field>
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: isMasquerade ? "1fr" : "1fr 1fr" }}>
              <Field label="Translation Type">
                <Select value={translationType} onChange={setTranslationType} options={translationTypes} />
              </Field>
              {!isMasquerade && (
                <Field label={isSource ? "Translation Address" : "Forward-to address"}>
                  <input
                    value={translationAddress}
                    onChange={(e) => setTranslationAddress(e.target.value)}
                    placeholder={TRANSLATION_PLACEHOLDER[translationType]}
                    className={inputCls}
                    style={monoSt}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                  />
                </Field>
              )}
            </div>

            {!isMasquerade && (
              <Field label="Translation Port" hint="Optional — leave blank to keep the original port.">
                <input
                  value={translationPort}
                  onChange={(e) => setTranslationPort(e.target.value)}
                  placeholder="any"
                  className={inputCls}
                  style={monoSt}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </Field>
            )}

            <Field label="Protocol" hint="Optional — e.g. tcp, udp, tcp_udp, icmp.">
              <input
                list="nat44-protocols"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                placeholder="all"
                className={inputCls}
                style={monoSt}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </Field>

            <label className="flex items-center gap-[10px] cursor-pointer select-none pt-1">
              <Switch on={enabled} onChange={setEnabled} />
              <span className="text-[13px] text-[var(--qz-fg-2)]">Enabled</span>
            </label>
          </div>

          <div className={tab === "source" ? "flex flex-col gap-4" : "hidden"}>
            <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
              <Field
                label="Source address"
                hint={initial?.source_group ? `Matches group “${initial.source_group}” — managed under Firewall groups.` : undefined}
              >
                <input
                  value={sourceAddress}
                  onChange={(e) => setSourceAddress(e.target.value)}
                  placeholder="10.0.0.0/24"
                  className={inputCls}
                  style={monoSt}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </Field>
              <Field label="Source port">
                <input
                  value={sourcePort}
                  onChange={(e) => setSourcePort(e.target.value)}
                  placeholder="any"
                  className={inputCls}
                  style={monoSt}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </Field>
            </div>
          </div>

          <div className={tab === "destination" ? "flex flex-col gap-4" : "hidden"}>
            <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
              <Field
                label="Destination address"
                hint={initial?.destination_group ? `Matches group “${initial.destination_group}” — managed under Firewall groups.` : undefined}
              >
                <input
                  value={destAddress}
                  onChange={(e) => setDestAddress(e.target.value)}
                  placeholder={isSource ? "any" : "203.0.113.5"}
                  className={inputCls}
                  style={monoSt}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </Field>
              <Field label="Destination port">
                <input
                  value={destPort}
                  onChange={(e) => setDestPort(e.target.value)}
                  placeholder={isSource ? "any" : "443"}
                  className={inputCls}
                  style={monoSt}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </Field>
            </div>
          </div>

          <div className={tab === "advanced" ? "flex flex-col gap-4" : "hidden"}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex items-center gap-[10px] cursor-pointer select-none">
                <Switch on={log} onChange={setLog} />
                <span className="text-[13px] text-[var(--qz-fg-2)]">Log</span>
              </label>
              <label
                className="flex items-center gap-[10px] cursor-pointer select-none"
                title="Matched traffic is excluded from NAT"
              >
                <Switch on={exclude} onChange={setExclude} />
                <span className="text-[13px] text-[var(--qz-fg-2)]">Exclude</span>
              </label>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-[12px] m-0" style={{ color: "var(--qz-status-crit)" }}>
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-1">
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
            {saving ? "Staging…" : isEdit ? "Stage changes" : "Stage rule"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
