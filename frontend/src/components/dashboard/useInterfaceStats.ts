"use client";

import { useEffect, useState } from "react";
import { InterfaceStat, fetchInterfaceStats } from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

/// Polls live interface RX/TX counters for the current device on an interval.
/// When `enabled` is false, polling stops and the last-fetched data is retained
/// (used to "pause" a tile).
export function useInterfaceStats(intervalMs: number, enabled = true) {
  const { deviceId } = useDevice();
  const [stats, setStats] = useState<InterfaceStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const data = await fetchInterfaceStats(deviceId);
        if (alive) {
          setStats(data);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load interface statistics.");
      }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [deviceId, intervalMs, enabled]);

  return { stats, error };
}
