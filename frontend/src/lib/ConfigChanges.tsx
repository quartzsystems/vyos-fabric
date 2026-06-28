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
  deleteVlan,
  discardAllChanges,
  discardChange,
  EthernetConfigUpdate,
  fetchChanges,
  stageEthernet,
  stageSystem,
  stageVlan,
  SystemUpdate,
  VlanConfigUpdate,
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
  stageVlanChanges: (update: VlanConfigUpdate) => Promise<ConfigChange[]>;
  removeVlan: (parent: string, vlanId: number) => Promise<ConfigChange[]>;
  stageEthernetChanges: (update: EthernetConfigUpdate) => Promise<ConfigChange[]>;
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

  // Shared post-stage handling: refresh the tray, toast a summary, open on changes.
  const announce = useCallback(
    async (staged: ConfigChange[], emptyMsg: string) => {
      await refresh();
      setToast(
        staged.length === 0
          ? emptyMsg
          : `${staged.length} change${staged.length === 1 ? "" : "s"} staged — review to commit.`,
      );
      if (staged.length > 0) setOpen(true);
      return staged;
    },
    [refresh, setToast],
  );

  const stageSystemChanges = useCallback(
    async (update: SystemUpdate) => {
      if (!deviceId) {
        setToast("No device selected.");
        return [];
      }
      const staged = await stageSystem(deviceId, update);
      return announce(staged, "No changes — config already matches.");
    },
    [deviceId, announce, setToast],
  );

  const stageVlanChanges = useCallback(
    async (update: VlanConfigUpdate) => {
      if (!deviceId) {
        setToast("No device selected.");
        return [];
      }
      const staged = await stageVlan(deviceId, update);
      return announce(staged, "No changes — VLAN already matches.");
    },
    [deviceId, announce, setToast],
  );

  const removeVlan = useCallback(
    async (parent: string, vlanId: number) => {
      if (!deviceId) {
        setToast("No device selected.");
        return [];
      }
      const staged = await deleteVlan(deviceId, parent, vlanId);
      return announce(staged, "Nothing to delete.");
    },
    [deviceId, announce, setToast],
  );

  const stageEthernetChanges = useCallback(
    async (update: EthernetConfigUpdate) => {
      if (!deviceId) {
        setToast("No device selected.");
        return [];
      }
      const staged = await stageEthernet(deviceId, update);
      return announce(staged, "No changes — interface already matches.");
    },
    [deviceId, announce, setToast],
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
      const result = await commitChanges(deviceId);
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
        stageVlanChanges,
        removeVlan,
        stageEthernetChanges,
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
