type DeltaKind = "up" | "down" | "neutral";

const deltaColor: Record<DeltaKind, string> = {
  up: "var(--qz-success)",
  down: "var(--qz-danger)",
  neutral: "var(--qz-fg-3)",
};

const deltaGlyph: Record<DeltaKind, string> = {
  up: "▲",
  down: "▼",
  neutral: "—",
};

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaKind?: DeltaKind;
}

export function KpiCard({ label, value, unit, delta, deltaKind = "neutral" }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && (
          <span className="text-sm text-[var(--qz-fg-3)] font-normal ml-1">{unit}</span>
        )}
      </div>
      {delta && (
        <div
          className="mt-[10px] text-[11px] flex items-center gap-2"
          style={{ fontFamily: "var(--qz-font-mono)", color: deltaColor[deltaKind] }}
        >
          <span>{deltaGlyph[deltaKind]}</span>
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}
