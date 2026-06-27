"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { Router, Alarm } from "./types";
import { ROUTERS, ALARMS } from "./data";

interface DashboardState {
  routers: Router[];
  alarms: Alarm[];
  selectedRouter: Router | null;
  setSelectedRouter: (r: Router | null) => void;
  ackAlarm: (id: string) => void;
  toast: string | null;
  setToast: (msg: string | null) => void;
}

const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [alarms, setAlarms] = useState<Alarm[]>(ALARMS);
  const [selectedRouter, setSelectedRouter] = useState<Router | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const ackAlarm = useCallback((id: string) => {
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, acked: true } : a)));
    setToast("Alarm acknowledged.");
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        routers: ROUTERS,
        alarms,
        selectedRouter,
        setSelectedRouter,
        ackAlarm,
        toast,
        setToast,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be inside DashboardProvider");
  return ctx;
}
