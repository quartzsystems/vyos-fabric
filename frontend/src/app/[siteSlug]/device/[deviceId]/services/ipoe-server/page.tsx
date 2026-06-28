"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, MonoList } from "@/components/dashboard/InfoCard";
import { IpoeServerConfig, fetchIpoeServer } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function IpoeServerPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<IpoeServerConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchIpoeServer(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load IPoE server.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="IPoE Server"
      subtitle="IP-over-Ethernet access server configuration"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading IPoE server…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Interfaces", value: <MonoList items={data.interfaces} /> },
            { label: "Authentication Mode", value: data.auth_mode },
            { label: "Gateway Addresses", value: <MonoList items={data.gateway_addresses} /> },
            { label: "Client IP Pools", value: <MonoList items={data.pools} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
