"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { NatRulesView } from "@/components/dashboard/NatRulesView";
import { Nat44Config, fetchNat44 } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function Nat44Page() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<Nat44Config | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchNat44(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load NAT44.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="NAT44"
      subtitle="IPv4-to-IPv4 source (SNAT) and destination (DNAT) translation"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading NAT44…"
    >
      {data && <NatRulesView source={data.source} destination={data.destination} createLabel="Create rule" />}
    </ServiceScaffold>
  );
}
