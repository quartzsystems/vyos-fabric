"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { BoolBadge } from "@/components/dashboard/InfoCard";
import { NatRule } from "@/lib/api";

type Section = "source" | "destination";

const dash = (v: string | null) => (v && v.length ? v : "—");

export const natRuleColumns: Column<NatRule>[] = [
  { key: "rule", header: "Rule", value: (r) => Number(r.rule), mono: true, sortable: true, width: 80 },
  { key: "description", header: "Description", value: (r) => r.description, render: (r) => dash(r.description), sortable: true },
  { key: "interface", header: "Interface", value: (r) => r.interface, render: (r) => dash(r.interface), mono: true, width: 110 },
  { key: "source", header: "Source", value: (r) => r.source, render: (r) => dash(r.source), mono: true },
  { key: "destination", header: "Destination", value: (r) => r.destination, render: (r) => dash(r.destination), mono: true },
  {
    key: "translation",
    header: "Translation",
    value: (r) => r.translation,
    render: (r) => (r.translation ? `${r.translation}${r.translation_port ? `:${r.translation_port}` : ""}` : "—"),
    mono: true,
  },
  { key: "protocol", header: "Protocol", value: (r) => r.protocol, render: (r) => dash(r.protocol), mono: true, width: 90 },
  { key: "status", header: "Status", value: (r) => (r.enabled ? "enabled" : "disabled"), render: (r) => <BoolBadge on={r.enabled} />, sortable: true, width: 110 },
];

/// Per-row edit/delete for an editable rule. Delete asks for inline confirmation.
function NatRowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  return (
    <div className="inline-flex items-center gap-1 justify-end">
      {confirming ? (
        <>
          <button
            type="button"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              try {
                await onDelete();
              } finally {
                setWorking(false);
                setConfirming(false);
              }
            }}
            className="text-[12px] font-semibold px-[10px] py-[5px] rounded cursor-pointer border-0 disabled:opacity-60"
            style={{ background: "var(--qz-danger)", color: "white" }}
          >
            {working ? "…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[12px] px-[10px] py-[5px] rounded cursor-pointer"
            style={{ background: "transparent", border: "1px solid var(--qz-border)", color: "var(--qz-fg-3)" }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            title="Edit rule"
            aria-label="Edit"
            onClick={onEdit}
            className="grid place-items-center w-7 h-7 rounded-md bg-transparent border-0 text-[var(--qz-fg-4)] hover:text-[var(--qz-accent)] hover:bg-[color-mix(in_oklab,white_5%,transparent)] transition-colors cursor-pointer"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            title="Delete rule"
            aria-label="Delete"
            onClick={() => setConfirming(true)}
            className="grid place-items-center w-7 h-7 rounded-md bg-transparent border-0 text-[var(--qz-fg-4)] hover:text-[var(--qz-danger)] hover:bg-[color-mix(in_oklab,white_5%,transparent)] transition-colors cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}

/// Tabbed Source/Destination NAT rule view shared by NAT44 and NAT66.
/// Passing the `on*` handlers turns the create button and per-row actions live;
/// without them (e.g. NAT66) the view stays read-only.
export function NatRulesView({
  source,
  destination,
  createLabel,
  onCreate,
  onEdit,
  onDelete,
}: {
  source: NatRule[];
  destination: NatRule[];
  createLabel: string;
  onCreate?: (section: Section) => void;
  onEdit?: (rule: NatRule, section: Section) => void;
  onDelete?: (rule: NatRule, section: Section) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<Section>("source");
  const rows = tab === "source" ? source : destination;
  const editable = !!(onEdit || onDelete);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-[var(--qz-border)]">
        {([
          ["source", "Source NAT", source.length],
          ["destination", "Destination NAT", destination.length],
        ] as const).map(([id, label, count]) => {
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
              <span className="ml-[6px] text-[12px] text-[var(--qz-fg-4)]">{count}</span>
            </button>
          );
        })}
      </div>

      <DataTable
        rows={rows}
        columns={natRuleColumns}
        rowId={(r) => r.rule}
        searchPlaceholder="Search rules…"
        emptyMessage={`No ${tab === "source" ? "source" : "destination"} NAT rules configured.`}
        toolbar={
          <Button kind="primary" size="sm" icon={Plus} onClick={onCreate ? () => onCreate(tab) : undefined}>
            {createLabel}
          </Button>
        }
        actions={
          editable
            ? (row) => (
                <NatRowActions
                  onEdit={() => onEdit?.(row, tab)}
                  onDelete={() => onDelete?.(row, tab) ?? Promise.resolve()}
                />
              )
            : () => <RowActions />
        }
      />
    </div>
  );
}
