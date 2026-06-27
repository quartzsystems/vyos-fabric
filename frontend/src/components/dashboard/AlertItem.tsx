"use client";

import { Alarm } from "@/lib/types";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function AlertItem({ alert, onAck }: { alert: Alarm; onAck: (id: string) => void }) {
  return (
    <div className="alert-item">
      <StatusBadge status={alert.severity} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[var(--qz-fg-1)] text-[13.5px] mb-[2px]">
          {alert.title}
        </div>
        <div
          className="text-[12.5px] text-[var(--qz-fg-3)]"
          style={{ fontFamily: "var(--qz-font-mono)" }}
        >
          <span className="text-[var(--qz-fg-2)]">{alert.routerId}</span>
          {" · "}
          {alert.detail}
          {" · "}
          <span className="text-[var(--qz-fg-4)]">{alert.when}</span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 self-center">
        {!alert.acked ? (
          <Button kind="secondary" size="sm" onClick={() => onAck(alert.id)}>
            Acknowledge
          </Button>
        ) : (
          <span className="badge badge-muted">ACKNOWLEDGED</span>
        )}
      </div>
    </div>
  );
}
