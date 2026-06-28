"use client";

import { useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type LoadStatus = "loading" | "ready" | "error";

/// Shared chrome for a service page: title block + loading/error/ready states.
/// `onRetry` doubles as the refresh handler — the header Refresh button re-runs it in
/// place, keeping the already-rendered content visible while the data refetches.
export function ServiceScaffold({
  title,
  subtitle,
  status,
  errorMsg,
  onRetry,
  loadingText,
  children,
}: {
  title: string;
  subtitle?: string;
  status: LoadStatus;
  errorMsg?: string;
  onRetry: () => void | Promise<void>;
  loadingText?: string;
  children: React.ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRetry();
    } finally {
      setRefreshing(false);
    }
  };

  // Keep content mounted while refreshing even though onRetry flips status to "loading".
  const showContent = status === "ready" || refreshing;

  return (
    <div className="flex flex-col h-full">
      <div className="px-[36px] pt-[28px] pb-5 flex-shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.015em" }}>
            {title}
          </h1>
          {subtitle && <p className="text-[13px] text-[var(--qz-fg-4)] mt-1">{subtitle}</p>}
        </div>
        {showContent && (
          <Button kind="secondary" size="sm" icon={RotateCw} onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-[36px] pb-[28px]">
        {status === "loading" && !refreshing && (
          <div className="text-[13px] text-[var(--qz-fg-4)]">{loadingText ?? "Loading…"}</div>
        )}
        {status === "error" && !refreshing && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[13px] text-[var(--qz-danger)]">
              <AlertTriangle size={15} />
              {errorMsg}
            </div>
            <div>
              <Button kind="secondary" icon={RotateCw} onClick={onRetry}>Retry</Button>
            </div>
          </div>
        )}
        {showContent && children}
      </div>
    </div>
  );
}
