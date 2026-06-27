"use client";

import { X, RotateCw, Package } from "lucide-react";
import { Router } from "@/lib/types";
import { StatusBadge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Sparkline } from "@/components/ui/Sparkline";

function MetricBlock({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div
      className="p-[14px] rounded-lg"
      style={{
        background: "var(--qz-input-bg)",
        border: "1px solid var(--qz-border-subtle)",
      }}
    >
      <div
        className="text-[10px] text-[var(--qz-fg-4)] uppercase tracking-[0.1em]"
        style={{ fontFamily: "var(--qz-font-mono)" }}
      >
        {label}
      </div>
      <div
        className="text-[24px] text-[var(--qz-fg-1)] font-medium mt-1 leading-none"
        style={{ fontFamily: "var(--qz-font-mono)" }}
      >
        {value}
        {unit && (
          <span className="text-xs text-[var(--qz-fg-3)] ml-1 font-normal">{unit}</span>
        )}
      </div>
    </div>
  );
}

function DrawerSection({ label }: { label: string }) {
  return (
    <div
      className="text-[10px] text-[var(--qz-fg-4)] uppercase tracking-[0.12em] mb-[10px]"
      style={{ fontFamily: "var(--qz-font-mono)" }}
    >
      {label}
    </div>
  );
}

export function DetailDrawer({ router, onClose }: { router: Router | null; onClose: () => void }) {
  if (!router) return null;
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog">
        <div
          className="flex items-start gap-3 p-[16px_20px]"
          style={{ borderBottom: "1px solid var(--qz-border)" }}
        >
          <div className="flex-1">
            <div className="flex items-center gap-[10px] mb-[6px]">
              <StatusBadge status={router.status} />
              <span
                className="text-[11px] text-[var(--qz-fg-4)]"
                style={{ fontFamily: "var(--qz-font-mono)" }}
              >
                {router.id}
              </span>
            </div>
            <h2
              className="m-0 text-[18px] font-bold text-[var(--qz-fg-1)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              {router.hostname}
            </h2>
            <div
              className="text-[12px] text-[var(--qz-fg-4)] mt-1"
              style={{ fontFamily: "var(--qz-font-mono)" }}
            >
              {router.site} · {router.role}
            </div>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-auto flex flex-col gap-4 p-[18px_20px]">
          <div>
            <DrawerSection label="Live metrics" />
            <div className="grid grid-cols-3 gap-[10px]">
              <MetricBlock label="BGP Peers" value={router.bgpPeers?.toString() ?? "—"} />
              <MetricBlock label="Rx" value="1.2" unit="Gbps" />
              <MetricBlock label="Tx" value="0.8" unit="Gbps" />
            </div>
          </div>

          <div>
            <DrawerSection label="Traffic · last hour" />
            <div
              className="p-[14px] rounded-lg"
              style={{
                background: "var(--qz-input-bg)",
                border: "1px solid var(--qz-border-subtle)",
              }}
            >
              <Sparkline
                height={64}
                data={[1.1, 1.0, 1.2, 1.15, 1.3, 1.22, 1.18, 1.25, 1.3, 1.28, 1.21, 1.2]}
                color={router.status === "warn" ? "var(--qz-warn)" : "var(--qz-accent)"}
              />
            </div>
          </div>

          <div>
            <DrawerSection label="Device info" />
            <dl
              className="grid gap-x-4 gap-y-[6px] items-center text-[13px]"
              style={{ gridTemplateColumns: "120px 1fr" }}
            >
              {(
                [
                  ["HOSTNAME", router.hostname],
                  ["ROLE",     router.role],
                  ["VERSION",  router.vyosVersion],
                  ["UPTIME",   router.uptime ?? "—"],
                  ["LAST SEEN",router.lastSeen],
                  ["BGP PEERS",router.bgpPeers?.toString() ?? "—"],
                ] as const
              ).map(([k, v]) => (
                <>
                  <dt
                    key={`k-${k}`}
                    className="text-[11px] text-[var(--qz-fg-4)] tracking-[0.06em]"
                    style={{ fontFamily: "var(--qz-font-mono)" }}
                  >
                    {k}
                  </dt>
                  <dd
                    key={`v-${k}`}
                    className="m-0 text-[var(--qz-fg-1)]"
                    style={{ fontFamily: "var(--qz-font-mono)" }}
                  >
                    {v}
                  </dd>
                </>
              ))}
            </dl>
          </div>
        </div>

        <div
          className="flex gap-2 justify-end p-[12px_20px]"
          style={{
            borderTop: "1px solid var(--qz-border)",
            background: "var(--qz-surface-raised)",
          }}
        >
          <Button kind="ghost" icon={RotateCw}>Restart service</Button>
          <Button kind="primary" icon={Package}>Deploy config</Button>
        </div>
      </aside>
    </>
  );
}
