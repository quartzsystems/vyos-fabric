"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DetailDrawer } from "@/components/dashboard/DetailDrawer";
import { CommandPalette } from "@/components/dashboard/CommandPalette";
import { ChangeTray } from "@/components/dashboard/ChangeTray";
import { Toast } from "@/components/dashboard/Toast";
import { DashboardProvider, useDashboard } from "@/lib/DashboardContext";
import { ConfigChangesProvider } from "@/lib/ConfigChanges";
import { DeviceProvider } from "@/lib/DeviceContext";

function Shell({ children }: { children: React.ReactNode }) {
  const nextRouter = useRouter();
  const { selectedRouter, setSelectedRouter, toast, setToast } = useDashboard();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div
      className="h-screen overflow-hidden"
      style={{ display: "grid", gridTemplateColumns: "240px 1fr", gridTemplateRows: "minmax(0, 1fr)" }}
    >
      <Sidebar onOpenPalette={() => setPaletteOpen(true)} />
      <main className="overflow-auto" style={{ background: "var(--qz-bg)" }}>
        {children}
      </main>

      <DetailDrawer router={selectedRouter} onClose={() => setSelectedRouter(null)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(href) => nextRouter.push(href)}
      />
      <ChangeTray />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export function DashboardShell({
  deviceId,
  siteSlug,
  children,
}: {
  deviceId: string;
  siteSlug: string;
  children: React.ReactNode;
}) {
  return (
    <DeviceProvider deviceId={deviceId} siteSlug={siteSlug}>
      <DashboardProvider>
        <ConfigChangesProvider>
          <Shell>{children}</Shell>
        </ConfigChangesProvider>
      </DashboardProvider>
    </DeviceProvider>
  );
}
