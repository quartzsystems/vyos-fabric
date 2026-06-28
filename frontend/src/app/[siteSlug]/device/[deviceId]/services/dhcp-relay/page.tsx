"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { DhcpRelayConfig, fetchDhcpRelay } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

interface NameRow {
  value: string;
}

const interfaceColumns: Column<NameRow>[] = [
  { key: "value", header: "Interface", value: (r) => r.value, mono: true, sortable: true },
];

const serverColumns: Column<NameRow>[] = [
  { key: "value", header: "Upstream Server", value: (r) => r.value, mono: true, sortable: true },
];

export default function DhcpRelayPage() {
  const { deviceId, device } = useDevice();
  const [data, setData] = useState<DhcpRelayConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchDhcpRelay(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load DHCP relay.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const interfaceRows: NameRow[] = useMemo(() => (data?.interfaces ?? []).map((value) => ({ value })), [data]);
  const serverRows: NameRow[] = useMemo(() => (data?.servers ?? []).map((value) => ({ value })), [data]);

  const configured = (data?.interfaces.length ?? 0) > 0 || (data?.servers.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-[36px] pt-[28px] pb-5 flex-shrink-0">
        <h1 className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.015em" }}>
          DHCP Relay
        </h1>
        {device && <p className="text-[13px] text-[var(--qz-fg-4)] mt-1">{"Forward DHCP requests to upstream servers across subnets"}</p>}
      </div>

      <div className="flex-1 overflow-auto px-[36px] pb-[28px]">
        {status === "loading" && (
          <div className="text-[13px] text-[var(--qz-fg-4)]">Loading DHCP relay…</div>
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
        {status === "ready" && data && (
          <div className="flex flex-col gap-7">
            {!configured && (
              <div className="text-[13px] text-[var(--qz-fg-4)]">DHCP relay is not configured.</div>
            )}

            <section className="flex flex-col gap-3">
              <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">Listen Interfaces</h2>
              <DataTable
                rows={interfaceRows}
                columns={interfaceColumns}
                rowId={(r) => r.value}
                searchPlaceholder="Search interfaces…"
                emptyMessage="No relay interfaces configured."
                toolbar={<Button kind="primary" size="sm" icon={Plus}>Add interface</Button>}
                actions={() => <RowActions />}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">Upstream Servers</h2>
              <DataTable
                rows={serverRows}
                columns={serverColumns}
                rowId={(r) => r.value}
                searchPlaceholder="Search servers…"
                emptyMessage="No upstream servers configured."
                toolbar={<Button kind="primary" size="sm" icon={Plus}>Add server</Button>}
                actions={() => <RowActions />}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
