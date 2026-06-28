"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { BoolBadge } from "@/components/dashboard/InfoCard";
import { NatRule } from "@/lib/api";

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

/// Tabbed Source/Destination NAT rule view shared by NAT44 and NAT66.
export function NatRulesView({
  source,
  destination,
  createLabel,
}: {
  source: NatRule[];
  destination: NatRule[];
  createLabel: string;
}) {
  const [tab, setTab] = useState<"source" | "destination">("source");
  const rows = tab === "source" ? source : destination;

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
        toolbar={<Button kind="primary" size="sm" icon={Plus}>{createLabel}</Button>}
        actions={() => <RowActions />}
      />
    </div>
  );
}
