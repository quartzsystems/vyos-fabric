"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceScaffold, LoadStatus } from "@/components/dashboard/ServiceScaffold";
import { InfoCard, BoolBadge, MonoList } from "@/components/dashboard/InfoCard";
import { TftpServerConfig, fetchTftpServer } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

export default function TftpServerPage() {
  const { deviceId } = useDevice();
  const [data, setData] = useState<TftpServerConfig | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await fetchTftpServer(deviceId));
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load TFTP server.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ServiceScaffold
      title="TFTP Server"
      subtitle="Trivial File Transfer Protocol server configuration"
      status={status}
      errorMsg={errorMsg}
      onRetry={load}
      loadingText="Loading TFTP server…"
    >
      {data && (
        <InfoCard
          rows={[
            { label: "Directory", value: data.directory ? <span className="mono">{data.directory}</span> : null },
            { label: "Allow Upload", value: <BoolBadge on={data.allow_upload} onLabel="Yes" offLabel="No" /> },
            { label: "Listen Addresses", value: <MonoList items={data.listen_addresses} /> },
            { label: "Port", value: data.port },
          ]}
        />
      )}
    </ServiceScaffold>
  );
}
