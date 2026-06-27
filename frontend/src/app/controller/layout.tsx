import { ControllerShell } from "@/components/controller/ControllerShell";

export default function ControllerLayout({ children }: { children: React.ReactNode }) {
  return <ControllerShell>{children}</ControllerShell>;
}
