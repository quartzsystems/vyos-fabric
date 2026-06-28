"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, BoolBadge, MonoList } from "@/components/dashboard/InfoCard";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { DnsForwardingConfig, DnsForwardingDomain, fetchDnsForwarding } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

const domainColumns: Column<DnsForwardingDomain>[] = [
  { key: "name", header: "Domain", value: (r) => r.name, mono: true, sortable: true },
  { key: "name_servers", header: "Name Servers", value: (r) => r.name_servers.join(", "), render: (r) => (r.name_servers.length ? r.name_servers.join(", ") : "—"), mono: true },
];

export default function DnsForwardingPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<DnsForwardingConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchDnsForwarding(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load DNS forwarding.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="DNS Forwarding"
      subtitle="Recursive DNS forwarder / cache configuration"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading DNS forwarding…"
    >
      {data && (
        <div className="flex flex-col gap-7">
          <InfoCard
            rows={[
              { label: "Listen Addresses", value: <MonoList items={data.listen_addresses} /> },
              { label: "Allow From", value: <MonoList items={data.allow_from} /> },
              { label: "Upstream Name Servers", value: <MonoList items={data.name_servers} /> },
              { label: "Use System Name Servers", value: <BoolBadge on={data.system} onLabel="Yes" offLabel="No" /> },
              { label: "Cache Size", value: data.cache_size },
              { label: "DNSSEC", value: data.dnssec },
            ]}
          />

          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--qz-fg-1)] m-0">Conditional Domains</h2>
            <DataTable
              rows={data.domains}
              columns={domainColumns}
              rowId={(r) => r.name}
              searchPlaceholder="Search domains…"
              emptyMessage="No conditional forwarding domains configured."
            />
          </section>
        </div>
      )}
    </ServiceScaffold>
  );
}
