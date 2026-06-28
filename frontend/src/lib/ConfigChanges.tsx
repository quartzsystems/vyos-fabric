"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  commitChanges,
  ConfigChange,
  discardAllChanges,
  discardChange,
  fetchChanges,
  getCurrentUserId,
  stageSystem,
  SystemUpdate,
} from "./api";
import { useDashboard } from "./DashboardContext";
import { useDevice } from "./DeviceContext";

interface ConfigChangesState {
  deviceId: string;
  pendingChanges: ConfigChange[];
  count: number;
  loading: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  refresh: () => Promise<void>;
  stageSystemChanges: (update: SystemUpdate) => Promise<ConfigChange[]>;
  discardOne: (changeId: string) => Promise<void>;
  discardAll: () => Promise<void>;
  commit: () => Promise<boolean>;
}

const ConfigChangesContext = createContext<ConfigChangesState | null>(null);

export function ConfigChangesProvider({ children }: { children: React.ReactNode }) {
  const { setToast } = useDashboard();
  const { deviceId } = useDevice();
  const [pendingChanges, setPendingChanges] = useState<ConfigChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!deviceId) {
      setPendingChanges([]);
      return;
    }
    setLoading(true);
    try {
      setPendingChanges(await fetchChanges(deviceId));
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to load pending changes.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, setToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stageSystemChanges = useCallback(
    async (update: SystemUpdate) => {
      if (!deviceId) {
        setToast("No device selected.");
        return [];
      }
      const staged = await stageSystem(deviceId, {
        ...update,
        created_by: getCurrentUserId(),
      });
      await refresh();
      setToast(
        staged.length === 0
          ? "No changes — config already matches."
          : `${staged.length} change${staged.length === 1 ? "" : "s"} staged — review to commit.`,
      );
      if (staged.length > 0) setOpen(true);
      return staged;
    },
    [deviceId, refresh, setToast],
  );

  const discardOne = useCallback(
    async (changeId: string) => {
      if (!deviceId) return;
      await discardChange(deviceId, changeId);
      await refresh();
    },
    [deviceId, refresh],
  );

  const discardAll = useCallback(async () => {
    if (!deviceId) return;
    await discardAllChanges(deviceId);
    await refresh();
    setToast("Pending changes discarded.");
  }, [deviceId, refresh, setToast]);

  const commit = useCallback(async () => {
    if (!deviceId) return false;
    try {
      const result = await commitChanges(deviceId, getCurrentUserId());
      await refresh();
      if (result.status === "success") {
        setToast(
          `Committed ${result.change_count} change${result.change_count === 1 ? "" : "s"}${
            result.saved ? " and saved to boot config." : " (not saved to boot)."
          }`,
        );
        return true;
      }
      setToast(`Commit failed: ${result.error ?? "device rejected the configuration."}`);
      return false;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Commit failed.");
      return false;
    }
  }, [deviceId, refresh, setToast]);

  return (
    <ConfigChangesContext.Provider
      value={{
        deviceId,
        pendingChanges,
        count: pendingChanges.length,
        loading,
        open,
        setOpen,
        refresh,
        stageSystemChanges,
        discardOne,
        discardAll,
        commit,
      }}
    >
      {children}
    </ConfigChangesContext.Provider>
  );
}

export function useConfigChanges() {
  const ctx = useContext(ConfigChangesContext);
  if (!ctx) throw new Error("useConfigChanges must be inside ConfigChangesProvider");
  return ctx;
}
