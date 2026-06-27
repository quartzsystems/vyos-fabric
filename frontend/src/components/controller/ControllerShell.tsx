"use client";

import { Building2, Users, LogOut, LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

interface AuthUser {
  first_name: string;
  last_name: string;
  username: string;
}

function initials(user: AuthUser): string {
  const f = user.first_name?.[0] ?? "";
  const l = user.last_name?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return user.username.slice(0, 2).toUpperCase();
}

function displayName(user: AuthUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return full || user.username;
}

const items: NavItem[] = [
  { id: "sites", label: "Sites", icon: Building2, href: "/controller/sites" },
  { id: "users", label: "Users", icon: Users,     href: "/controller/users" },
];

function ControllerSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vyos-user");
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const isActive = (href: string) => pathname.startsWith(href);

  const logout = () => {
    localStorage.removeItem("vyos-auth");
    localStorage.removeItem("vyos-user");
    router.push("/login");
  };

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        borderRight: "1px solid var(--qz-border)",
        background: "var(--qz-ink-0)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-[10px] px-4 h-14 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--qz-border)" }}
      >
        <img src="/logo-mark.png" alt="Quartz Systems" className="w-7 h-7 flex-shrink-0" />
        <span
          className="font-bold text-[var(--qz-fg-1)] text-[15px]"
          style={{ letterSpacing: "-0.01em" }}
        >
          VyOS Fabric
        </span>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-auto px-3 flex flex-col gap-[2px] pt-3">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={[
                "flex items-center gap-[10px] px-[10px] py-[8px] rounded-md text-[13.5px] font-medium border transition-all duration-[120ms] no-underline",
                active
                  ? "bg-[var(--qz-accent-soft)] text-[var(--qz-accent)] border-[color-mix(in_oklab,var(--qz-accent)_30%,transparent)]"
                  : "text-[var(--qz-fg-3)] border-transparent hover:text-[var(--qz-fg-1)] hover:bg-[color-mix(in_oklab,white_4%,transparent)]",
              ].join(" ")}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 px-4 py-3 flex items-center gap-[10px]"
        style={{ borderTop: "1px solid var(--qz-border)" }}
      >
        <div
          className="w-7 h-7 rounded-full grid place-items-center text-[var(--qz-fg-on-accent)] font-bold text-xs flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, var(--qz-green-700), var(--qz-green-500))",
          }}
        >
          {user ? initials(user) : "…"}
        </div>
        <span className="text-[var(--qz-fg-1)] font-semibold text-[13px] truncate flex-1 min-w-0">
          {user ? displayName(user) : ""}
        </span>
        <button
          type="button"
          title="Log out"
          onClick={logout}
          className="flex-shrink-0 text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] transition-colors cursor-pointer bg-transparent border-0 p-0"
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}

export function ControllerShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-screen overflow-hidden"
      style={{ display: "grid", gridTemplateColumns: "240px 1fr" }}
    >
      <ControllerSidebar />
      <main className="overflow-auto" style={{ background: "var(--qz-bg)" }}>
        {children}
      </main>
    </div>
  );
}
