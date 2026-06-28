import { AuthGuard } from "@/components/AuthGuard";
import { ControllerShell } from "@/components/controller/ControllerShell";

export default function ControllerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ControllerShell>{children}</ControllerShell>
    </AuthGuard>
  );
}
