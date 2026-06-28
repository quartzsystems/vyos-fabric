"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { BoolBadge } from "@/components/dashboard/InfoCard";
import { NatRule, Nat64Config, fetchNat64 } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const dash = (v: string | null) => (v && v.length ? v : "—");

const columns: Column<NatRule>[] = [
  { key: "rule", header: "Rule", value: (r) => Number(r.rule), mono: true, sortable: true, width: 80 },
  { key: "description", header: "Description", value: (r) => r.description, render: (r) => dash(r.description), sortable: true },
  { key: "source", header: "Source Prefix", value: (r) => r.source, render: (r) => dash(r.source), mono: true },
  { key: "translation", header: "Translation Pool", value: (r) => r.translation, render: (r) => dash(r.translation), mono: true },
  { key: "protocol", header: "Protocol", value: (r) => r.protocol, render: (r) => dash(r.protocol), mono: true, width: 90 },
  { key: "status", header: "Status", value: (r) => (r.enabled ? "enabled" : "disabled"), render: (r) => <BoolBadge on={r.enabled} />, sortable: true, width: 110 },
];

export default function Nat64Page() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<Nat64Config | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchNat64(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load NAT64.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="NAT64"
      subtitle="Stateful IPv6-to-IPv4 translation (source rules)"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading NAT64…"
    >
      {data && (
        <DataTable
          rows={data.source}
          columns={columns}
          rowId={(r) => r.rule}
          searchPlaceholder="Search rules…"
          emptyMessage="No NAT64 source rules configured."
          toolbar={<Button kind="primary" size="sm" icon={Plus}>Create rule</Button>}
          actions={() => <RowActions />}
        />
      )}
    </ServiceScaffold>
  );
}
