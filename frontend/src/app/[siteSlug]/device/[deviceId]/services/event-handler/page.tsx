"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { EventHandlerEntry, fetchEventHandler } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const dash = (v: string | null) => (v && v.length ? v : "—");

const columns: Column<EventHandlerEntry>[] = [
  { key: "name", header: "Name", value: (r) => r.name, sortable: true },
  { key: "pattern", header: "Match Pattern", value: (r) => r.pattern, render: (r) => dash(r.pattern), mono: true },
  { key: "script", header: "Script", value: (r) => r.script, render: (r) => dash(r.script), mono: true },
  { key: "description", header: "Description", value: (r) => r.description, render: (r) => dash(r.description) },
];

export default function EventHandlerPage() {
  const { deviceId } = useDevice();
  const [rows, setRows] = useState<EventHandlerEntry[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setRows(await fetchEventHandler(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load event handler.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="Event Handler"
      subtitle="Run scripts in response to matched log events"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading event handler…"
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => r.name}
        searchPlaceholder="Search events…"
        emptyMessage="No event handlers configured."
        toolbar={<Button kind="primary" size="sm" icon={Plus}>Create event</Button>}
        actions={() => <RowActions />}
      />
    </ServiceScaffold>
  );
}
