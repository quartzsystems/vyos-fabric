"use client";

import { Gauge, Settings, Search, LogOut, Network, Route, ArrowLeftRight, Shield, Server, LucideIcon, Building2, ArrowLeft } from "lucide-react";
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

interface ManagedDevice {
  deviceId: string;
  hostname: string;
  siteId: string;
  siteName: string;
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

export function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [managedDevice, setManagedDevice] = useState<ManagedDevice | null>(null);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem("vyos-user");
      if (rawUser) setUser(JSON.parse(rawUser));
      const rawDevice = localStorage.getItem("vyos-managed-device");
      if (rawDevice) setManagedDevice(JSON.parse(rawDevice));
    } catch {}
  }, []);

  const items: NavItem[] = [
    { id: "overview",    label: "Dashboard",  icon: Gauge,           href: "/" },
    { id: "interfaces",  label: "Interfaces", icon: Network,         href: "/interfaces" },
    { id: "routing",     label: "Routing",    icon: Route,           href: "/routing" },
    { id: "nat",         label: "NAT",        icon: ArrowLeftRight,  href: "/nat" },
    { id: "firewall",    label: "Firewall",   icon: Shield,          href: "/firewall" },
    { id: "services",    label: "Services",   icon: Server,          href: "/services" },
    { id: "system",      label: "System",     icon: Settings,        href: "/system" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const logout = () => {
    localStorage.removeItem("vyos-auth");
    localStorage.removeItem("vyos-user");
    router.push("/login");
  };

  const exitDevice = () => {
    localStorage.removeItem("vyos-managed-device");
    setManagedDevice(null);
    router.push("/controller/sites");
  };

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        borderRight: "1px solid var(--qz-border)",
        background: "var(--qz-ink-0)",
      }}
    >
      {/* Logo */}
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

      {/* Search */}
      <div className="px-3 py-3 flex-shrink-0">
        <button
          type="button"
          onClick={onOpenPalette}
          className="w-full flex items-center gap-2 bg-[var(--qz-input-bg)] border border-[var(--qz-border)] rounded-md px-[10px] py-[7px] cursor-pointer hover:border-[var(--qz-border-strong)] transition-colors text-left"
        >
          <Search size={13} className="text-[var(--qz-fg-4)] flex-shrink-0" />
          <span
            className="flex-1 text-[13px] text-[var(--qz-fg-4)]"
            style={{ fontFamily: "var(--qz-font-sans)" }}
          >
            Search…
          </span>
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-auto px-3 flex flex-col gap-[2px] pt-1">
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

      {/* Managed device context */}
      {managedDevice && (
        <div
          className="flex-shrink-0 px-3 pb-3"
          style={{ borderTop: "1px solid var(--qz-border)" }}
        >
          <div
            className="rounded-md p-3 mt-3"
            style={{
              background: "var(--qz-input-bg)",
              border: "1px solid var(--qz-border)",
            }}
          >
            <p className="text-[10px] font-semibold text-[var(--qz-fg-4)] uppercase tracking-wider m-0 mb-[8px]">
              Managing
            </p>
            <div className="flex items-center gap-[7px] mb-[4px]">
              <Server size={12} className="text-[var(--qz-accent)] flex-shrink-0" />
              <span className="text-[13px] font-semibold text-[var(--qz-fg-1)] truncate">
                {managedDevice.hostname}
              </span>
            </div>
            <div className="flex items-center gap-[7px] mb-3">
              <Building2 size={12} className="text-[var(--qz-fg-4)] flex-shrink-0" />
              <span className="text-[12px] text-[var(--qz-fg-3)] truncate">
                {managedDevice.siteName}
              </span>
            </div>
            <button
              type="button"
              onClick={exitDevice}
              className="flex items-center gap-[6px] w-full px-2 py-[6px] rounded-md text-[12px] font-medium cursor-pointer transition-colors"
              style={{
                background: "transparent",
                border: "1px solid var(--qz-border)",
                color: "var(--qz-fg-3)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--qz-border-strong)";
                e.currentTarget.style.color = "var(--qz-fg-1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--qz-border)";
                e.currentTarget.style.color = "var(--qz-fg-3)";
              }}
            >
              <ArrowLeft size={12} />
              Back to Sites
            </button>
          </div>
        </div>
      )}

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
