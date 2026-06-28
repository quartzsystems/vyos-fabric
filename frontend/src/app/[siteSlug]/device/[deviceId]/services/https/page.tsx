"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, BoolBadge, MonoList } from "@/components/dashboard/InfoCard";
import { HttpsConfig, fetchHttps } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function HttpsPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<HttpsConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchHttps(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load HTTPS API.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="HTTPS API"
      subtitle="Web GUI and REST API listener configuration"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading HTTPS API…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Listen Addresses", value: <MonoList items={data.listen_addresses} /> },
            { label: "Port", value: data.port },
            { label: "REST API", value: <BoolBadge on={data.api_enabled} /> },
            { label: "Certificates", value: <MonoList items={data.certificates} /> },
            { label: "Allowed Clients", value: <MonoList items={data.allow_clients} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
