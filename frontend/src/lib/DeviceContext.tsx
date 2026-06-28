"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchRouter, fetchSites } from "./api";

export interface DeviceInfo {
  id: string;
  hostname: string;
  role: string;
  status: string;
  version: string;
  siteId: string;
  siteName: string;
}

interface DeviceState {
  deviceId: string;
  siteSlug: string;
  basePath: string;
  device: DeviceInfo | null;
  loading: boolean;
}

const DeviceContext = createContext<DeviceState | null>(null);

export function DeviceProvider({
  deviceId,
  siteSlug,
  children,
}: {
  deviceId: string;
  siteSlug: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [r, sites] = await Promise.all([fetchRouter(deviceId), fetchSites()]);
        if (cancelled) return;
        setDevice({
          id: r.id,
          hostname: r.hostname,
          role: r.role,
          status: r.status,
          version: r.version,
          siteId: r.site_id,
          siteName: sites.find((s) => s.id === r.site_id)?.name ?? "Unknown site",
        });
      } catch {
        // Unknown/removed device — bounce back to the device picker.
        if (!cancelled) router.replace("/controller/sites");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId, router]);

  return (
    <DeviceContext.Provider
      value={{
        deviceId,
        siteSlug,
        basePath: `/${siteSlug}/device/${deviceId}`,
        device,
        loading,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error("useDevice must be inside DeviceProvider");
  return ctx;
}
