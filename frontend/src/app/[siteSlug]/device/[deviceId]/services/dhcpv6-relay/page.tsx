"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { Dhcpv6RelayConfig, Dhcpv6RelayInterface, fetchDhcpv6Relay } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const dash = (v: string | null | undefined) => (v && v.length ? v : "—");

const columns: Column<Dhcpv6RelayInterface>[] = [
  { key: "interface", header: "Interface", value: (r) => r.interface, mono: true, sortable: true },
  { key: "address", header: "Address", value: (r) => r.address, render: (r) => dash(r.address), mono: true },
];

export default function Dhcpv6RelayPage() {
  const { deviceId, device } = useDevice();
  const [data, setData] = useState<Dhcpv6RelayConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchDhcpv6Relay(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load DHCPv6 relay.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const configured = (data?.listen_interfaces.length ?? 0) > 0 || (data?.upstream_interfaces.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-[36px] pt-[28px] pb-5 flex-shrink-0">
        <h1 className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.015em" }}>
          DHCPv6 Relay
        </h1>
        {device && <p className="text-[13px] text-[var(--qz-fg-4)] mt-1">{"Forward DHCPv6 requests between listen and upstream interfaces"}</p>}
      </div>

      <div className="flex-1 overflow-auto px-[36px] pb-[28px]">
        {status === "loading" && (
          <div className="text-[13px] text-[var(--qz-fg-4)]">Loading DHCPv6 relay…</div>
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
              <div className="text-[13px] text-[var(--qz-fg-4)]">DHCPv6 relay is not configured.</div>
            )}

            <section className="flex flex-col gap-3">
              <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">Listen Interfaces</h2>
              <DataTable
                rows={data.listen_interfaces}
                columns={columns}
                rowId={(r) => r.interface}
                searchPlaceholder="Search interfaces…"
                emptyMessage="No listen interfaces configured."
                toolbar={<Button kind="primary" size="sm" icon={Plus}>Add listen interface</Button>}
                actions={() => <RowActions />}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">Upstream Interfaces</h2>
              <DataTable
                rows={data.upstream_interfaces}
                columns={columns}
                rowId={(r) => r.interface}
                searchPlaceholder="Search interfaces…"
                emptyMessage="No upstream interfaces configured."
                toolbar={<Button kind="primary" size="sm" icon={Plus}>Add upstream interface</Button>}
                actions={() => <RowActions />}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
