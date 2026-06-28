"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, MonoList } from "@/components/dashboard/InfoCard";
import { PppoeServerConfig, fetchPppoeServer } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function PppoeServerPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<PppoeServerConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchPppoeServer(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load PPPoE server.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="PPPoE Server"
      subtitle="PPP over Ethernet access concentrator configuration"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading PPPoE server…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Access Concentrator", value: data.access_concentrator },
            { label: "Interfaces", value: <MonoList items={data.interfaces} /> },
            { label: "Gateway Address", value: data.gateway_address },
            { label: "Authentication Mode", value: data.auth_mode },
            { label: "Client IP Pools", value: <MonoList items={data.pools} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
