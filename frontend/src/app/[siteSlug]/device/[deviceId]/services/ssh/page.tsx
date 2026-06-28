"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, BoolBadge, MonoList } from "@/components/dashboard/InfoCard";
import { SshConfig, fetchSsh } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function SshPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<SshConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchSsh(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load SSH.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="SSH"
      subtitle="Secure Shell server configuration"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading SSH…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Ports", value: <MonoList items={data.ports} /> },
            { label: "Listen Addresses", value: <MonoList items={data.listen_addresses} /> },
            { label: "Password Authentication", value: <BoolBadge on={!data.password_authentication_disabled} onLabel="Enabled" offLabel="Disabled" /> },
            { label: "Allowed Users", value: <MonoList items={data.allow_users} /> },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
