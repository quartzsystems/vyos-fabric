"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, BoolBadge, MonoList } from "@/components/dashboard/InfoCard";
import { LldpConfig, fetchLldp } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function LldpPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<LldpConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchLldp(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load LLDP.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="LLDP"
      subtitle="Link Layer Discovery Protocol neighbour advertisement"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading LLDP…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Interfaces", value: <MonoList items={data.interfaces} /> },
            { label: "SNMP Integration", value: <BoolBadge on={data.snmp} /> },
            { label: "Legacy Protocols", value: <MonoList items={data.legacy_protocols} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
