"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { DynamicDnsEntry, fetchDynamicDns } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const dash = (v: string | null) => (v && v.length ? v : "—");

const columns: Column<DynamicDnsEntry>[] = [
  { key: "name", header: "Name", value: (r) => r.name, sortable: true },
  { key: "protocol", header: "Protocol", value: (r) => r.protocol, render: (r) => dash(r.protocol), mono: true, sortable: true, width: 120 },
  { key: "server", header: "Server", value: (r) => r.server, render: (r) => dash(r.server), mono: true },
  { key: "host_names", header: "Hostnames", value: (r) => r.host_names.join(", "), render: (r) => (r.host_names.length ? r.host_names.join(", ") : "—"), mono: true },
  { key: "address", header: "Address Source", value: (r) => r.address, render: (r) => dash(r.address), mono: true },
  { key: "username", header: "Username", value: (r) => r.username, render: (r) => dash(r.username), mono: true },
];

export default function DynamicDnsPage() {
  const { deviceId } = useDevice();
  const [rows, setRows] = useState<DynamicDnsEntry[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setRows(await fetchDynamicDns(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load dynamic DNS.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="Dynamic DNS"
      subtitle="Update external DNS providers with the device's address"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading dynamic DNS…"
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => r.name}
        searchPlaceholder="Search services…"
        emptyMessage="No dynamic DNS services configured."
        toolbar={<Button kind="primary" size="sm" icon={Plus}>Create service</Button>}
        actions={() => <RowActions />}
      />
    </ServiceScaffold>
  );
}
