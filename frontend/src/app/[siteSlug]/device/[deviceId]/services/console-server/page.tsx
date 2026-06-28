"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { ConsoleServerDevice, fetchConsoleServer } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const dash = (v: string | null) => (v && v.length ? v : "—");

const columns: Column<ConsoleServerDevice>[] = [
  { key: "name", header: "Device", value: (r) => r.name, mono: true, sortable: true },
  { key: "speed", header: "Speed", value: (r) => r.speed, render: (r) => dash(r.speed), mono: true, sortable: true, width: 100 },
  { key: "data_bits", header: "Data Bits", value: (r) => r.data_bits, render: (r) => dash(r.data_bits), mono: true, width: 100 },
  { key: "stop_bits", header: "Stop Bits", value: (r) => r.stop_bits, render: (r) => dash(r.stop_bits), mono: true, width: 100 },
  { key: "parity", header: "Parity", value: (r) => r.parity, render: (r) => dash(r.parity), mono: true, width: 90 },
  { key: "ssh_port", header: "SSH Port", value: (r) => r.ssh_port, render: (r) => dash(r.ssh_port), mono: true, width: 100 },
  { key: "description", header: "Description", value: (r) => r.description, render: (r) => dash(r.description) },
];

export default function ConsoleServerPage() {
  const { deviceId } = useDevice();
  const [rows, setRows] = useState<ConsoleServerDevice[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setRows(await fetchConsoleServer(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load console server.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="Console Server"
      subtitle="Serial console access to attached devices"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading console server…"
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => r.name}
        searchPlaceholder="Search devices…"
        emptyMessage="No console server devices configured."
        toolbar={<Button kind="primary" size="sm" icon={Plus}>Create device</Button>}
        actions={() => <RowActions />}
      />
    </ServiceScaffold>
  );
}
