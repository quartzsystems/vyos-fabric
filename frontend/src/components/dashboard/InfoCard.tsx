"use client";

export interface InfoRow {
  label: string;
  value: React.ReactNode;
}

const dash = (v: React.ReactNode) =>
  v === null || v === undefined || v === "" ? <span className="text-[var(--qz-fg-4)]">—</span> : v;

/// A compact bordered key/value card for single-object service config.
export function InfoCard({ title, rows }: { title?: string; rows: InfoRow[] }) {
  return (
    <section className="flex flex-col gap-3">
      {title && <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">{title}</h2>}
      <div
        className="rounded-md overflow-hidden"
        style={{ border: "1px solid var(--qz-border)" }}
      >
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="grid grid-cols-[200px_1fr] gap-4 px-4 py-[10px] text-[13px]"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--qz-border)" }}
          >
            <span className="text-[var(--qz-fg-4)]">{r.label}</span>
            <span className="text-[var(--qz-fg-1)] min-w-0 break-words">{dash(r.value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/// Renders a boolean as an Enabled/Disabled (or On/Off) badge.
export function BoolBadge({ on, onLabel = "Enabled", offLabel = "Disabled" }: { on: boolean; onLabel?: string; offLabel?: string }) {
  return <span className={on ? "badge badge-ok" : "badge badge-muted"}>{on ? onLabel : offLabel}</span>;
}

/// Renders a list of strings as monospace, comma-joined, with an em dash fallback.
export function MonoList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-[var(--qz-fg-4)]">—</span>;
  return <span className="mono">{items.join(", ")}</span>;
}
