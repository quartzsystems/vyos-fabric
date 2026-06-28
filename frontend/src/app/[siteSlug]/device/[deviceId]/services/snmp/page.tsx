"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, MonoList } from "@/components/dashboard/InfoCard";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { SnmpCommunity, SnmpConfig, fetchSnmp } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const communityColumns: Column<SnmpCommunity>[] = [
  { key: "name", header: "Community", value: (r) => r.name, mono: true, sortable: true },
  { key: "authorization", header: "Authorization", value: (r) => r.authorization, render: (r) => r.authorization ?? "—", mono: true },
];

export default function SnmpPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<SnmpConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchSnmp(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load SNMP.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="SNMP"
      subtitle="Simple Network Management Protocol agent configuration"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading SNMP…"
    >
      {data && (
        <div className="flex flex-col gap-7">
          <InfoCard
            rows={[
              { label: "Contact", value: data.contact },
              { label: "Location", value: data.location },
              { label: "Listen Addresses", value: <MonoList items={data.listen_addresses} /> },
              { label: "SNMPv3 Users", value: <MonoList items={data.v3_users} /> },
            ]}
          />

          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">Communities</h2>
            <DataTable
              rows={data.communities}
              columns={communityColumns}
              rowId={(r) => r.name}
              searchPlaceholder="Search communities…"
              emptyMessage="No SNMP communities configured."
            />
          </section>
        </div>
      )}
    </ServiceScaffold>
  );
}
