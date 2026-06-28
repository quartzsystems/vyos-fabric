"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, MonoList } from "@/components/dashboard/InfoCard";
import { NtpConfig, fetchNtp } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function NtpPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<NtpConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchNtp(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load NTP.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="NTP"
      subtitle="Network Time Protocol servers and access"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading NTP…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Servers", value: <MonoList items={data.servers} /> },
            { label: "Listen Addresses", value: <MonoList items={data.listen_addresses} /> },
            { label: "Allowed Clients", value: <MonoList items={data.allow_clients} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
