"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable, FilterDef } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { WlanInterface, fetchWlan } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

function StatePill({ enabled }: { enabled: boolean }) {
  return <span className={enabled ? "badge badge-ok" : "badge badge-muted"}>{enabled ? "Enabled" : "Disabled"}</span>;
}

const columns: Column<WlanInterface>[] = [
  { key: "name", header: "Interface", value: (r) => r.name, mono: true, sortable: true, width: 130 },
  { key: "description", header: "Description", value: (r) => r.description ?? "", sortable: true },
  {
    key: "interface_type",
    header: "Type",
    value: (r) => r.interface_type ?? "",
    render: (r) => r.interface_type ?? "—",
    mono: true,
    sortable: true,
    width: 110,
  },
  {
    key: "ssid",
    header: "SSID",
    value: (r) => r.ssid ?? "",
    render: (r) => r.ssid ?? "—",
  },
  {
    key: "channel",
    header: "Channel",
    value: (r) => r.channel ?? "",
    render: (r) => r.channel ?? "—",
    mono: true,
    width: 90,
  },
  {
    key: "addresses",
    header: "IP Address",
    value: (r) => r.addresses.join(", "),
    render: (r) => (r.addresses.length ? r.addresses.join(", ") : "—"),
    mono: true,
  },
  {
    key: "status",
    header: "Status",
    value: (r) => (r.enabled ? "enabled" : "disabled"),
    render: (r) => <StatePill enabled={r.enabled} />,
    sortable: true,
    width: 120,
  },
];

const filters: FilterDef<WlanInterface>[] = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "enabled", label: "Enabled" },
      { value: "disabled", label: "Disabled" },
    ],
    predicate: (r, v) => (v === "enabled" ? r.enabled : !r.enabled),
  },
];

export default function WlanPage() {
  const { deviceId, device } = useDevice();
  const [rows, setRows] = useState<WlanInterface[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async (mode: "load" | "refresh" = "load") => {
    if (mode === "load") setStatus("loading");
    try {
      setRows(await fetchWlan(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load WLAN interfaces.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-[36px] pt-[28px] pb-5 flex-shrink-0">
        <h1 className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.015em" }}>
          WLAN Interfaces
        </h1>
        {device && <p className="text-[13px] text-[var(--qz-fg-4)] mt-1">{"Wireless (WLAN) interfaces"}</p>}
      </div>

      <div className="flex-1 overflow-auto px-[36px] pb-[28px]">
        {status === "loading" && (
          <div className="text-[13px] text-[var(--qz-fg-4)]">Loading WLAN interfaces…</div>
        )}
        {status === "error" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[13px] text-[var(--qz-danger)]">
              <AlertTriangle size={15} />
              {errorMsg}
            </div>
            <div>
              <Button kind="secondary" icon={RotateCw} onClick={load}>Retry</Button>
            </div>
          </div>
        )}
        {status === "ready" && (
          <DataTable
            rows={rows}
            columns={columns}
            filters={filters}
            rowId={(r) => r.name}
            searchPlaceholder="Search WLAN interfaces…"
            emptyMessage="No WLAN interfaces configured."
            toolbar={<Button kind="primary" size="sm" icon={Plus}>Create WLAN</Button>}
            actions={() => <RowActions />}
            onRefresh={() => load("refresh")}
          />
        )}
      </div>
    </div>
  );
}
