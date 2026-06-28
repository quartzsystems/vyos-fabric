"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, MonoList } from "@/components/dashboard/InfoCard";
import { ConntrackSyncConfig, fetchConntrackSync } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function ConntrackSyncPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<ConntrackSyncConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchConntrackSync(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load conntrack sync.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="Conntrack Sync"
      subtitle="Synchronise the connection-tracking table for failover"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading conntrack sync…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Sync Interfaces", value: <MonoList items={data.interfaces} /> },
            { label: "Failover Mechanism", value: data.failover_mechanism },
            { label: "Multicast Group", value: data.mcast_group },
            { label: "Sync Queue Size", value: data.sync_queue_size },
            { label: "Accept Protocols", value: <MonoList items={data.accept_protocols} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
