"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { BoolBadge } from "@/components/dashboard/InfoCard";
import { BroadcastRelayId, fetchBroadcastRelay } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const dash = (v: string | null) => (v && v.length ? v : "—");

const columns: Column<BroadcastRelayId>[] = [
  { key: "id", header: "ID", value: (r) => r.id, mono: true, sortable: true, width: 80 },
  { key: "interfaces", header: "Interfaces", value: (r) => r.interfaces.join(", "), render: (r) => (r.interfaces.length ? r.interfaces.join(", ") : "—"), mono: true },
  { key: "address", header: "Address", value: (r) => r.address, render: (r) => dash(r.address), mono: true },
  { key: "port", header: "Port", value: (r) => r.port, render: (r) => dash(r.port), mono: true, sortable: true, width: 90 },
  { key: "description", header: "Description", value: (r) => r.description, render: (r) => dash(r.description) },
  { key: "status", header: "Status", value: (r) => (r.enabled ? "enabled" : "disabled"), render: (r) => <BoolBadge on={r.enabled} />, sortable: true, width: 120 },
];

export default function BroadcastRelayPage() {
  const { deviceId } = useDevice();
  const [rows, setRows] = useState<BroadcastRelayId[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setRows(await fetchBroadcastRelay(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load UDP broadcast relay.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="UDP Broadcast Relay"
      subtitle="Relay UDP broadcast traffic between interfaces"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading UDP broadcast relay…"
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => r.id}
        searchPlaceholder="Search relays…"
        emptyMessage="No broadcast relays configured."
        toolbar={<Button kind="primary" size="sm" icon={Plus}>Create relay</Button>}
        actions={() => <RowActions />}
      />
    </ServiceScaffold>
  );
}
