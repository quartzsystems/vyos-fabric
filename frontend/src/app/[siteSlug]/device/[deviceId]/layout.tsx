"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function DeviceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ siteSlug: string; deviceId: string }>();

  return (
    <AuthGuard>
      <DashboardShell deviceId={params.deviceId} siteSlug={params.siteSlug}>
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}
