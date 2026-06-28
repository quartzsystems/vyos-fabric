"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { BoolBadge } from "@/components/dashboard/InfoCard";
import { CgnatConfig, CgnatPool, CgnatRule, fetchCgnat } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const dash = (v: string | null) => (v && v.length ? v : "—");

const poolColumns: Column<CgnatPool>[] = [
  { key: "kind", header: "Type", value: (r) => r.kind, render: (r) => <span className="badge badge-muted">{r.kind}</span>, sortable: true, width: 110 },
  { key: "name", header: "Pool", value: (r) => r.name, mono: true, sortable: true },
  { key: "ranges", header: "Ranges", value: (r) => r.ranges.join(", "), render: (r) => (r.ranges.length ? r.ranges.join(", ") : "—"), mono: true },
  { key: "external_port_range", header: "External Port Range", value: (r) => r.external_port_range, render: (r) => dash(r.external_port_range), mono: true, width: 170 },
];

const ruleColumns: Column<CgnatRule>[] = [
  { key: "rule", header: "Rule", value: (r) => Number(r.rule), mono: true, sortable: true, width: 80 },
  { key: "description", header: "Description", value: (r) => r.description, render: (r) => dash(r.description), sortable: true },
  { key: "source_pool", header: "Source (internal)", value: (r) => r.source_pool, render: (r) => dash(r.source_pool), mono: true },
  { key: "translation_pool", header: "Translation (external)", value: (r) => r.translation_pool, render: (r) => dash(r.translation_pool), mono: true },
  { key: "status", header: "Status", value: (r) => (r.enabled ? "enabled" : "disabled"), render: (r) => <BoolBadge on={r.enabled} />, sortable: true, width: 110 },
];

export default function CgnatPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<CgnatConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchCgnat(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load CGNAT.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="CGNAT"
      subtitle="Carrier-grade NAT pools and port-block allocation rules"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading CGNAT…"
    >
      {data && (
        <div className="flex flex-col gap-7">
          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">Pools</h2>
            <DataTable
              rows={data.pools}
              columns={poolColumns}
              rowId={(r) => `${r.kind}/${r.name}`}
              searchPlaceholder="Search pools…"
              emptyMessage="No CGNAT pools configured."
              toolbar={<Button kind="primary" size="sm" icon={Plus}>Create pool</Button>}
              actions={() => <RowActions />}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">Rules</h2>
            <DataTable
              rows={data.rules}
              columns={ruleColumns}
              rowId={(r) => r.rule}
              searchPlaceholder="Search rules…"
              emptyMessage="No CGNAT rules configured."
              toolbar={<Button kind="primary" size="sm" icon={Plus}>Create rule</Button>}
              actions={() => <RowActions />}
            />
          </section>
        </div>
      )}
    </ServiceScaffold>
  );
}
