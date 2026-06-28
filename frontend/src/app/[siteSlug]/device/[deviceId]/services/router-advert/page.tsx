"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { BoolBadge } from "@/components/dashboard/InfoCard";
import { RouterAdvertInterface, fetchRouterAdvert } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const dash = (v: string | null) => (v && v.length ? v : "—");

const columns: Column<RouterAdvertInterface>[] = [
  { key: "interface", header: "Interface", value: (r) => r.interface, mono: true, sortable: true },
  { key: "prefixes", header: "Prefixes", value: (r) => r.prefixes.join(", "), render: (r) => (r.prefixes.length ? r.prefixes.join(", ") : "—"), mono: true },
  { key: "managed_flag", header: "Managed Flag", value: (r) => (r.managed_flag ? "on" : "off"), render: (r) => <BoolBadge on={r.managed_flag} onLabel="On" offLabel="Off" />, sortable: true, width: 130 },
  { key: "interval_max", header: "Max Interval", value: (r) => r.interval_max, render: (r) => dash(r.interval_max), mono: true, width: 120 },
  { key: "default_lifetime", header: "Default Lifetime", value: (r) => r.default_lifetime, render: (r) => dash(r.default_lifetime), mono: true, width: 140 },
];

export default function RouterAdvertPage() {
  const { deviceId } = useDevice();
  const [rows, setRows] = useState<RouterAdvertInterface[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setRows(await fetchRouterAdvert(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load router advertisements.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="Router Advertisements"
      subtitle="IPv6 router advertisement (RA) configuration per interface"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading router advertisements…"
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => r.interface}
        searchPlaceholder="Search interfaces…"
        emptyMessage="No router advertisements configured."
        toolbar={<Button kind="primary" size="sm" icon={Plus}>Add interface</Button>}
        actions={() => <RowActions />}
      />
    </ServiceScaffold>
  );
}
