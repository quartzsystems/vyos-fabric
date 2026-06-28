"use client";

import { useState } from "react";
import { ModalShell, ModalHeader } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { NatRule } from "@/lib/api";
import { useConfigChanges } from "@/lib/ConfigChanges";

type Section = "source" | "destination";

const inputCls = "w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none";
const inputSt = { background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)" } as const;
const monoSt = { ...inputSt, fontFamily: "var(--qz-font-mono)" } as const;

const PROTOCOLS = ["all", "tcp", "udp", "tcp_udp", "icmp", "esp", "gre"];

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

/// Create/edit a single NAT44 source (SNAT) or destination (DNAT) rule. Stages the
/// minimal diff into the change tray rather than touching the device directly.
export function Nat44RuleFormModal({
  section,
  initial,
  interfaces,
  existing,
  onClose,
}: {
  section: Section;
  /** Present when editing an existing rule; absent when creating. */
  initial?: NatRule;
  /** Interface names offered as a datalist for the interface field. */
  interfaces: string[];
  /** Existing rules in this section, for duplicate rule-number detection. */
  existing: NatRule[];
  onClose: () => void;
}) {
  const { stageNat44Rule } = useConfigChanges();
  const isEdit = !!initial;
  const isSource = section === "source";

  const [rule, setRule] = useState(initial?.rule ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [iface, setIface] = useState(initial?.interface ?? "");
  const [sourceAddress, setSourceAddress] = useState(initial?.source ?? "");
  const [sourcePort, setSourcePort] = useState(initial?.source_port ?? "");
  const [destAddress, setDestAddress] = useState(initial?.destination ?? "");
  const [destPort, setDestPort] = useState(initial?.destination_port ?? "");
  const [translationAddress, setTranslationAddress] = useState(initial?.translation ?? "");
  const [translationPort, setTranslationPort] = useState(initial?.translation_port ?? "");
  const [protocol, setProtocol] = useState(initial?.protocol ?? "");
  const [exclude, setExclude] = useState(initial?.exclude ?? false);
  const [log, setLog] = useState(initial?.log ?? false);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const num = Number(rule);
    if (!Number.isInteger(num) || num < 1 || num > 999999) {
      setError("Rule number must be a whole number between 1 and 999999.");
      return;
    }
    // Block collisions with another rule in this section (allow re-saving the edited one).
    const clash = existing.some((r) => Number(r.rule) === num && !(isEdit && r.rule === initial!.rule));
    if (clash) {
      setError(`Rule ${num} already exists in this section.`);
      return;
    }

    setSaving(true);
    try {
      await stageNat44Rule({
        section,
        rule: num,
        description: description.trim() || null,
        interface: iface.trim() || null,
        source_address: sourceAddress.trim() || null,
        source_port: sourcePort.trim() || null,
        destination_address: destAddress.trim() || null,
        destination_port: destPort.trim() || null,
        translation_address: translationAddress.trim() || null,
        translation_port: translationPort.trim() || null,
        protocol: protocol.trim() || null,
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

  const title = `${isEdit ? "Edit" : "Create"} ${isSource ? "source" : "destination"} NAT rule`;
  const ifaceLabel = isSource ? "Outbound interface" : "Inbound interface";

  return (
    <ModalShell onClose={onClose} maxWidth={580}>
      <ModalHeader
        title={title}
        subtitle={isSource ? "IPv4 SNAT / masquerade" : "IPv4 DNAT / port-forward"}
        onClose={onClose}
      />

      <form onSubmit={submit} className="flex flex-col gap-4">
        <datalist id="nat44-interfaces">
          {interfaces.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Rule number">
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
          <Field label={ifaceLabel} hint="Optional — leave blank to match any interface.">
            <input
              list="nat44-interfaces"
              value={iface}
              onChange={(e) => setIface(e.target.value)}
              placeholder="eth0"
              className={inputCls}
              style={monoSt}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </Field>
        </div>

        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Office outbound NAT"
            className={inputCls}
            style={inputSt}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </Field>

        <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <Field label="Source address">
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

        <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <Field label="Destination address">
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

        <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <Field
            label="Translation address"
            hint={isSource ? "An IP/range, or “masquerade” to use the outbound interface address." : "Internal host the traffic is forwarded to."}
          >
            <input
              value={translationAddress}
              onChange={(e) => setTranslationAddress(e.target.value)}
              placeholder={isSource ? "masquerade" : "192.168.1.10"}
              className={inputCls}
              style={monoSt}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </Field>
          <Field label="Translation port">
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
        </div>

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
          <datalist id="nat44-protocols">
            {PROTOCOLS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
          <label className="flex items-center gap-[10px] cursor-pointer select-none">
            <Switch on={enabled} onChange={setEnabled} />
            <span className="text-[13px] text-[var(--qz-fg-2)]">Enabled</span>
          </label>
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
