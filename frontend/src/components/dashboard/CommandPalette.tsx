"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ArrowRight, Play } from "lucide-react";

interface PaletteAction {
  id: string;
  section: string;
  label: string;
  kbd: string;
  href?: string;
}

const ACTIONS: PaletteAction[] = [
  { id: "nav-overview",    section: "Go to",   label: "Overview",               kbd: "G O", href: "/" },
  { id: "nav-fleet",       section: "Go to",   label: "Routers",                kbd: "G R", href: "/fleet" },
  { id: "nav-alarms",      section: "Go to",   label: "Alarms",                 kbd: "G A", href: "/alarms" },
  { id: "nav-deployments", section: "Go to",   label: "Deployments",            kbd: "G D", href: "/deployments" },
  { id: "nav-settings",    section: "Go to",   label: "Settings",               kbd: "G S", href: "/settings" },
  { id: "act-ack",         section: "Actions", label: "Acknowledge active alarms", kbd: "⌘⇧A" },
  { id: "act-refresh",     section: "Actions", label: "Refresh fleet",          kbd: "⌘⇧R" },
];

export function CommandPalette({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ("");
  }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!open) return null;

  const filtered = ACTIONS.filter((a) =>
    a.label.toLowerCase().includes(q.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, PaletteAction[]>>((acc, a) => {
    (acc[a.section] = acc[a.section] || []).push(a);
    return acc;
  }, {});

  return (
    <div className="palette-scrim" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div
          className="flex items-center gap-[10px] p-[14px_18px]"
          style={{ borderBottom: "1px solid var(--qz-border)" }}
        >
          <Search size={16} className="text-[var(--qz-fg-3)]" />
          <input
            ref={inputRef}
            placeholder="Run a command, jump to a router…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-none text-[var(--qz-fg-1)] text-[15px]"
            style={{ fontFamily: "var(--qz-font-sans)" }}
          />
          <span
            className="text-[10px] text-[var(--qz-fg-4)]"
            style={{ fontFamily: "var(--qz-font-mono)" }}
          >
            esc
          </span>
        </div>

        <div className="p-2 max-h-[50vh] overflow-auto">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section}>
              <div
                className="px-[10px] py-[6px] pb-[2px] text-[10px] tracking-[0.1em] text-[var(--qz-fg-4)] uppercase"
                style={{ fontFamily: "var(--qz-font-mono)" }}
              >
                {section}
              </div>
              {items.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-[10px] px-3 py-2 rounded-md text-[13.5px] text-[var(--qz-fg-2)] cursor-pointer hover:bg-[var(--qz-accent-soft)] hover:text-[var(--qz-fg-1)]"
                  onClick={() => {
                    if (a.href) onNavigate(a.href);
                    onClose();
                  }}
                >
                  {a.href ? (
                    <ArrowRight size={14} className="text-[var(--qz-fg-4)]" />
                  ) : (
                    <Play size={14} className="text-[var(--qz-fg-4)]" />
                  )}
                  <span className="flex-1">{a.label}</span>
                  <span
                    className="text-[10px] text-[var(--qz-fg-4)] border border-[var(--qz-border)] px-[5px] py-[1px] rounded"
                    style={{ fontFamily: "var(--qz-font-mono)" }}
                  >
                    {a.kbd}
                  </span>
                </div>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-5 text-[13px] text-[var(--qz-fg-3)]">No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
