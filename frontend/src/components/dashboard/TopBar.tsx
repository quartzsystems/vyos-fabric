"use client";

import { Bell, CircleHelp, Search } from "lucide-react";
import { IconButton } from "@/components/ui/Button";

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <div
      className="flex items-center gap-3 px-[18px] h-14"
      style={{
        background: "var(--qz-ink-0)",
        borderBottom: "1px solid var(--qz-border)",
        gridColumn: "1 / -1",
      }}
    >
      <div
        className="flex items-center gap-[10px] font-bold text-[var(--qz-fg-1)]"
        style={{ letterSpacing: "-0.01em" }}
      >
        <div
          className="w-[28px] h-[28px] rounded-md grid place-items-center text-[var(--qz-fg-on-accent)] text-[11px] font-black"
          style={{ background: "var(--qz-accent)" }}
        >
          VF
        </div>
        <span>VyOS Fabric</span>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[7px] min-w-[260px] cursor-pointer hover:border-[var(--qz-border-strong)] transition-colors"
      >
        <Search size={14} className="text-[var(--qz-fg-4)]" />
        <span
          className="flex-1 text-[13px] text-[var(--qz-fg-4)] text-left"
          style={{ fontFamily: "var(--qz-font-sans)" }}
        >
          Search routers, alarms…
        </span>
        <span
          className="text-[10px] text-[var(--qz-fg-4)] border border-[var(--qz-border)] px-[6px] py-[1px] rounded"
          style={{ fontFamily: "var(--qz-font-mono)" }}
        >
          ⌘K
        </span>
      </button>

      <IconButton icon={Bell} label="Notifications" />
      <IconButton icon={CircleHelp} label="Help" />
    </div>
  );
}
