"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, GitCommitVertical, History, Trash2, Upload, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { useConfigChanges } from "@/lib/ConfigChanges";
import { CommitWithChanges, ConfigChange, fetchCommits } from "@/lib/api";

type Tab = "pending" | "history";

function OpBadge({ op }: { op: ConfigChange["op"] }) {
  const isSet = op === "set";
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-[6px] py-[2px] rounded"
      style={{
        fontFamily: "var(--qz-font-mono)",
        background: isSet ? "var(--qz-accent-soft)" : "var(--qz-danger-soft)",
        color: isSet ? "var(--qz-accent)" : "var(--qz-danger)",
      }}
    >
      {op}
    </span>
  );
}

function ChangeRow({
  change,
  onDiscard,
}: {
  change: ConfigChange;
  onDiscard?: (id: string) => void;
}) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3"
      style={{ borderBottom: "1px solid var(--qz-border)" }}
    >
      <OpBadge op={change.op} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[var(--qz-fg-1)]">{change.summary}</div>
        <div
          className="text-[11px] text-[var(--qz-fg-4)] mt-[3px] truncate"
          style={{ fontFamily: "var(--qz-font-mono)" }}
        >
          {change.path.join(" ")}
        </div>
      </div>
      {onDiscard && (
        <button
          type="button"
          onClick={() => onDiscard(change.id)}
          aria-label="Discard change"
          className="text-[var(--qz-fg-4)] hover:text-[var(--qz-danger)] transition-colors cursor-pointer bg-transparent border-0 p-0 flex-shrink-0 mt-[2px]"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function PendingTab() {
  const { pendingChanges, count, discardOne, discardAll, commit } = useConfigChanges();
  const [committing, setCommitting] = useState(false);

  if (count === 0) {
    return (
      <div className="flex-1 grid place-items-center text-[13px] text-[var(--qz-fg-4)] px-6 text-center">
        No pending changes. Edits you stage across the dashboard will appear here for review.
      </div>
    );
  }

  // Group by section for readability.
  const sections = Array.from(new Set(pendingChanges.map((c) => c.section)));

  const doCommit = async () => {
    setCommitting(true);
    try {
      await commit();
    } finally {
      setCommitting(false);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-auto">
        {sections.map((section) => (
          <div key={section}>
            <div
              className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--qz-fg-4)]"
              style={{
                fontFamily: "var(--qz-font-mono)",
                background: "var(--qz-ink-1)",
                borderBottom: "1px solid var(--qz-border)",
              }}
            >
              {section}
            </div>
            {pendingChanges
              .filter((c) => c.section === section)
              .map((c) => (
                <ChangeRow key={c.id} change={c} onDiscard={discardOne} />
              ))}
          </div>
        ))}
      </div>

      <div
        className="flex gap-2 justify-between items-center p-[12px_20px]"
        style={{
          borderTop: "1px solid var(--qz-border)",
          background: "var(--qz-surface-raised)",
        }}
      >
        <Button kind="ghost" size="sm" icon={Trash2} onClick={discardAll} disabled={committing}>
          Discard all
        </Button>
        <Button kind="primary" icon={Upload} onClick={doCommit} disabled={committing}>
          {committing ? "Committing…" : `Commit & Save (${count})`}
        </Button>
      </div>
    </>
  );
}

function HistoryTab() {
  const { deviceId } = useConfigChanges();
  const [commits, setCommits] = useState<CommitWithChanges[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) {
      setLoading(false);
      return;
    }
    fetchCommits(deviceId)
      .then(setCommits)
      .catch(() => setCommits([]))
      .finally(() => setLoading(false));
  }, [deviceId]);

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center text-[13px] text-[var(--qz-fg-4)]">
        Loading history…
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-[13px] text-[var(--qz-fg-4)] px-6 text-center">
        No commits yet.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {commits.map((c) => {
        const ok = c.status === "success";
        return (
          <div key={c.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--qz-border)" }}>
            <div className="flex items-center gap-2">
              <span
                className="grid place-items-center w-5 h-5 rounded-full flex-shrink-0"
                style={{
                  background: ok ? "var(--qz-accent-soft)" : "var(--qz-danger-soft)",
                  color: ok ? "var(--qz-accent)" : "var(--qz-danger)",
                }}
              >
                {ok ? <Check size={12} /> : <X size={12} />}
              </span>
              <span className="text-[13px] text-[var(--qz-fg-1)] font-medium">
                {c.change_count} change{c.change_count === 1 ? "" : "s"}
              </span>
              {ok && c.saved && (
                <span className="text-[10px] text-[var(--qz-fg-4)] uppercase tracking-wider">
                  saved
                </span>
              )}
              <span className="flex-1" />
              <span
                className="text-[11px] text-[var(--qz-fg-4)]"
                style={{ fontFamily: "var(--qz-font-mono)" }}
              >
                {new Date(c.committed_at).toLocaleString()}
              </span>
            </div>
            {!ok && c.error && (
              <div className="text-[12px] text-[var(--qz-danger)] mt-[6px] ml-7">{c.error}</div>
            )}
            <div className="ml-7 mt-[6px] flex flex-col gap-[2px]">
              {c.changes.map((ch) => (
                <div
                  key={ch.id}
                  className="text-[11px] text-[var(--qz-fg-3)] truncate"
                  style={{ fontFamily: "var(--qz-font-mono)" }}
                >
                  <span className={ch.op === "set" ? "text-[var(--qz-accent)]" : "text-[var(--qz-danger)]"}>
                    {ch.op}
                  </span>{" "}
                  {ch.path.join(" ")}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ChangeTray() {
  const { count, open, setOpen, deviceId } = useConfigChanges();
  const [tab, setTab] = useState<Tab>("pending");

  const close = useCallback(() => setOpen(false), [setOpen]);

  // The tray is only meaningful when a device is being managed.
  if (!deviceId) return null;

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => {
          setTab("pending");
          setOpen(true);
        }}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-[10px] rounded-full cursor-pointer transition-all duration-150"
        style={{
          background: count > 0 ? "var(--qz-accent)" : "var(--qz-surface-raised)",
          color: count > 0 ? "var(--qz-fg-on-accent)" : "var(--qz-fg-2)",
          border: "1px solid var(--qz-border)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        <GitCommitVertical size={16} />
        <span className="text-[13px] font-semibold">
          {count > 0 ? `Review changes (${count})` : "No pending changes"}
        </span>
      </button>

      {open && (
        <>
          <div className="drawer-scrim" onClick={close} />
          <aside className="drawer" role="dialog" aria-label="Config review">
            <div
              className="flex items-center gap-3 p-[16px_20px]"
              style={{ borderBottom: "1px solid var(--qz-border)" }}
            >
              <h2 className="m-0 text-[16px] font-bold text-[var(--qz-fg-1)] flex-1">
                Config review
              </h2>
              <IconButton icon={X} label="Close" onClick={close} />
            </div>

            <div className="flex gap-0 px-5" style={{ borderBottom: "1px solid var(--qz-border)" }}>
              {(
                [
                  ["pending", "Pending", count],
                  ["history", "History", null],
                ] as const
              ).map(([id, label, badge]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className="px-3 pb-3 pt-1 text-[13px] font-medium cursor-pointer bg-transparent border-0 transition-colors relative flex items-center gap-[6px]"
                  style={{ color: tab === id ? "var(--qz-fg-1)" : "var(--qz-fg-3)" }}
                >
                  {id === "history" && <History size={13} />}
                  {label}
                  {badge ? (
                    <span className="text-[10px] text-[var(--qz-fg-4)]">({badge})</span>
                  ) : null}
                  {tab === id && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                      style={{ background: "var(--qz-accent)" }}
                    />
                  )}
                </button>
              ))}
            </div>

            {tab === "pending" ? <PendingTab /> : <HistoryTab />}
          </aside>
        </>
      )}
    </>
  );
}
