"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, BoolBadge, MonoList } from "@/components/dashboard/InfoCard";
import { WebProxyConfig, fetchWebProxy } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function WebProxyPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<WebProxyConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchWebProxy(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load web proxy.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="Web Proxy"
      subtitle="Squid-based forward web proxy configuration"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading web proxy…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Listen Addresses", value: <MonoList items={data.listen_addresses} /> },
            { label: "Default Port", value: data.default_port },
            { label: "Cache Size (MB)", value: data.cache_size },
            { label: "URL Filtering", value: <BoolBadge on={data.url_filtering} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
