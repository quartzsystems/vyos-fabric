"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, BoolBadge, MonoList } from "@/components/dashboard/InfoCard";
import { MdnsRepeaterConfig, fetchMdnsRepeater } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function MdnsRepeaterPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<MdnsRepeaterConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchMdnsRepeater(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load mDNS repeater.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="mDNS Repeater"
      subtitle="Relay multicast DNS (Bonjour/Avahi) between interfaces"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading mDNS repeater…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Interfaces", value: <MonoList items={data.interfaces} /> },
            { label: "VRF", value: data.vrf },
            { label: "Status", value: <BoolBadge on={data.enabled} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
