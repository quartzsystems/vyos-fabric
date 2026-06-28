"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, MonoList } from "@/components/dashboard/InfoCard";
import { SaltMinionConfig, fetchSaltMinion } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function SaltMinionPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<SaltMinionConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchSaltMinion(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load Salt minion.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="Salt Minion"
      subtitle="SaltStack minion configuration for remote management"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading Salt minion…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Minion ID", value: data.id },
            { label: "Masters", value: <MonoList items={data.masters} /> },
            { label: "Update Interval", value: data.interval },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
