"use client";

import { Router } from "@/lib/types";
import { StatusBadge } from "@/components/ui/Badge";

const statusDot: Record<string, string> = {
  ok:   "var(--qz-success)",
  warn: "var(--qz-warn)",
  crit: "var(--qz-danger)",
  off:  "var(--qz-ink-7)",
};

export function RouterTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: Router[];
  selectedId: string | null;
  onSelect: (r: Router) => void;
}) {
  return (
    <div className="overflow-hidden">
      <table className="qz-table">
        <thead>
          <tr>
            <th style={{ width: 220 }}>Router</th>
            <th>Site</th>
            <th>VyOS Version</th>
            <th>Last Seen</th>
            <th>BGP Peers</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={selectedId === r.id ? "selected" : ""}
              onClick={() => onSelect(r)}
            >
              <td>
                <div className="flex items-center gap-[10px]">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: statusDot[r.status] }}
                  />
                  <span className="mono">{r.hostname}</span>
                </div>
              </td>
              <td>{r.site}</td>
              <td className="mono">{r.vyosVersion}</td>
              <td className="mono">{r.lastSeen}</td>
              <td className="mono">{r.bgpPeers != null ? r.bgpPeers : "—"}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
