"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, BoolBadge, MonoList } from "@/components/dashboard/InfoCard";
import { MonitoringConfig, fetchMonitoring } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function MonitoringPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<MonitoringConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchMonitoring(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load monitoring.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="Monitoring"
      subtitle="Telemetry exporters (Telegraf, Prometheus)"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading monitoring…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Telegraf", value: <BoolBadge on={data.telegraf_enabled} /> },
            { label: "Prometheus", value: <BoolBadge on={data.prometheus_enabled} /> },
            { label: "Configured Exporters", value: <MonoList items={data.exporters} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
