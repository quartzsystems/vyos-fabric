"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Column, DataTable } from "@/components/dashboard/DataTable";
import { RowActions } from "@/components/dashboard/RowActions";
import {
  DhcpLease,
  Dhcpv6Server,
  Dhcpv6ServerConfig,
  fetchDhcpv6Server,
} from "@/lib/api";
import { useDevice } from "@/lib/DeviceContext";

type Tab = "subnets" | "ranges" | "mappings" | "leases";

const TABS: { id: Tab; label: string }[] = [
  { id: "subnets", label: "Subnets" },
  { id: "ranges", label: "Ranges" },
  { id: "mappings", label: "Static Mappings" },
  { id: "leases", label: "Leases" },
];

interface SubnetRow {
  subnet: string;
  name_servers: string;
  domain_search: string;
  lease: string | null;
  rangeCount: number;
  mappingCount: number;
}
interface RangeRow {
  id: string;
  subnet: string;
  name: string;
  start: string | null;
  stop: string | null;
}
interface MappingRow {
  id: string;
  subnet: string;
  name: string;
  identifier: string | null;
  ipv6_address: string | null;
  ipv6_prefix: string | null;
  description: string | null;
}

const dash = (v: string | null | undefined) => (v && v.length ? v : "—");

const subnetColumns: Column<SubnetRow>[] = [
  { key: "subnet", header: "Subnet", value: (r) => r.subnet, mono: true, sortable: true },
  { key: "name_servers", header: "DNS", value: (r) => r.name_servers, render: (r) => dash(r.name_servers), mono: true },
  { key: "domain_search", header: "Domain Search", value: (r) => r.domain_search, render: (r) => dash(r.domain_search) },
  { key: "lease", header: "Lease (s)", value: (r) => r.lease, render: (r) => dash(r.lease), mono: true, sortable: true, width: 110 },
  { key: "rangeCount", header: "Ranges", value: (r) => r.rangeCount, mono: true, sortable: true, width: 90 },
  { key: "mappingCount", header: "Mappings", value: (r) => r.mappingCount, mono: true, sortable: true, width: 100 },
];

const rangeColumns: Column<RangeRow>[] = [
  { key: "subnet", header: "Subnet", value: (r) => r.subnet, mono: true, sortable: true },
  { key: "name", header: "Range", value: (r) => r.name, mono: true, sortable: true },
  { key: "start", header: "Start", value: (r) => r.start, render: (r) => dash(r.start), mono: true },
  { key: "stop", header: "Stop", value: (r) => r.stop, render: (r) => dash(r.stop), mono: true },
];

const mappingColumns: Column<MappingRow>[] = [
  { key: "name", header: "Name", value: (r) => r.name, sortable: true },
  { key: "subnet", header: "Subnet", value: (r) => r.subnet, mono: true, sortable: true },
  { key: "identifier", header: "MAC / DUID", value: (r) => r.identifier, render: (r) => dash(r.identifier), mono: true },
  { key: "ipv6_address", header: "IPv6 Address", value: (r) => r.ipv6_address, render: (r) => dash(r.ipv6_address), mono: true },
  { key: "ipv6_prefix", header: "IPv6 Prefix", value: (r) => r.ipv6_prefix, render: (r) => dash(r.ipv6_prefix), mono: true },
  { key: "description", header: "Description", value: (r) => r.description, render: (r) => dash(r.description) },
];

const leaseColumns: Column<DhcpLease>[] = [
  { key: "ip_address", header: "IPv6 Address", value: (r) => r.ip_address, mono: true, sortable: true },
  {
    key: "state",
    header: "State",
    value: (r) => r.state,
    render: (r) =>
      r.state ? (
        <span className={r.state.toLowerCase() === "active" ? "badge badge-ok" : "badge badge-muted"}>{r.state}</span>
      ) : (
        "—"
      ),
    sortable: true,
    width: 110,
  },
  { key: "lease_expiration", header: "Expires", value: (r) => r.lease_expiration, render: (r) => dash(r.lease_expiration), mono: true },
  { key: "remaining", header: "Remaining", value: (r) => r.remaining, render: (r) => dash(r.remaining), mono: true },
  { key: "pool", header: "Pool", value: (r) => r.pool, render: (r) => dash(r.pool), mono: true },
];

export default function Dhcpv6ServerPage() {
  const { deviceId, device } = useDevice();
  const [data, setData] = useState<Dhcpv6ServerConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("subnets");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const cfg = await fetchDhcpv6Server(deviceId);
      setData(cfg);
      setSelectedName((prev) =>
        prev && cfg.servers.some((s) => s.name === prev) ? prev : cfg.servers[0]?.name ?? null,
      );
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load DHCPv6 servers.");
      setStatus("error");
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected: Dhcpv6Server | null = useMemo(
    () => data?.servers.find((s) => s.name === selectedName) ?? null,
    [data, selectedName],
  );

  const subnetRows: SubnetRow[] = useMemo(
    () =>
      (selected?.subnets ?? []).map((s) => ({
        subnet: s.subnet,
        name_servers: s.name_servers.join(", "),
        domain_search: s.domain_search.join(", "),
        lease: s.lease,
        rangeCount: s.ranges.length,
        mappingCount: s.static_mappings.length,
      })),
    [selected],
  );

  const rangeRows: RangeRow[] = useMemo(
    () =>
      (selected?.subnets ?? []).flatMap((s) =>
        s.ranges.map((r) => ({ id: `${s.subnet}/${r.name}`, subnet: s.subnet, name: r.name, start: r.start, stop: r.stop })),
      ),
    [selected],
  );

  const mappingRows: MappingRow[] = useMemo(
    () =>
      (selected?.subnets ?? []).flatMap((s) =>
        s.static_mappings.map((m) => ({
          id: `${s.subnet}/${m.name}`,
          subnet: s.subnet,
          name: m.name,
          identifier: m.identifier,
          ipv6_address: m.ipv6_address,
          ipv6_prefix: m.ipv6_prefix,
          description: m.description,
        })),
      ),
    [selected],
  );

  const leaseRows: DhcpLease[] = useMemo(() => {
    if (!data || !selected) return [];
    const name = selected.name.toLowerCase();
    return data.leases.filter((l) => !l.pool || l.pool.toLowerCase() === name);
  }, [data, selected]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-[36px] pt-[28px] pb-5 flex-shrink-0">
        <h1 className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.015em" }}>
          DHCPv6 Servers
        </h1>
        {device && <p className="text-[13px] text-[var(--qz-fg-4)] mt-1">{"Configured DHCPv6 shared networks, their subnets, ranges, static mappings, and active leases"}</p>}
      </div>

      <div className="flex-1 overflow-auto px-[36px] pb-[28px]">
        {status === "loading" && (
          <div className="text-[13px] text-[var(--qz-fg-4)]">Loading DHCPv6 servers…</div>
        )}
        {status === "error" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[13px] text-[var(--qz-danger)]">
              <AlertTriangle size={15} />
              {errorMsg}
            </div>
            <div>
              <Button kind="secondary" icon={RotateCw} onClick={load}>Retry</Button>
            </div>
          </div>
        )}
        {status === "ready" && data && (
          <div className="flex flex-col gap-5">
            {/* Server selector */}
            <div className="flex items-center gap-3 flex-wrap">
              {data.servers.length === 0 ? (
                <div className="text-[13px] text-[var(--qz-fg-4)]">No DHCPv6 servers configured.</div>
              ) : (
                data.servers.map((s) => {
                  const active = s.name === selectedName;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setSelectedName(s.name)}
                      className={[
                        "flex flex-col items-start gap-[6px] px-4 py-3 rounded-lg border text-left transition-all duration-[120ms] cursor-pointer min-w-[180px]",
                        active
                          ? "bg-[var(--qz-accent-soft)] border-[color-mix(in_oklab,var(--qz-accent)_40%,transparent)]"
                          : "bg-[var(--qz-input-bg)] border-[var(--qz-border)] hover:border-[var(--qz-border-strong)]",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        <span className={["text-[14px] font-semibold", active ? "text-[var(--qz-accent)]" : "text-[var(--qz-fg-1)]"].join(" ")}>
                          {s.name}
                        </span>
                        <span className={s.enabled ? "badge badge-ok" : "badge badge-muted"}>{s.enabled ? "Enabled" : "Disabled"}</span>
                      </div>
                      <span className="text-[12px] text-[var(--qz-fg-4)]">
                        {s.subnets.length} {s.subnets.length === 1 ? "subnet" : "subnets"}
                        {s.description ? ` · ${s.description}` : ""}
                      </span>
                    </button>
                  );
                })
              )}
              <div className="ml-auto">
                <Button kind="primary" size="sm" icon={Plus}>Create DHCPv6 server</Button>
              </div>
            </div>

            {selected && (
              <>
                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-[var(--qz-border)]">
                  {TABS.map((t) => {
                    const counts: Record<Tab, number> = {
                      subnets: subnetRows.length,
                      ranges: rangeRows.length,
                      mappings: mappingRows.length,
                      leases: leaseRows.length,
                    };
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={[
                          "px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors cursor-pointer",
                          active
                            ? "text-[var(--qz-accent)] border-[var(--qz-accent)]"
                            : "text-[var(--qz-fg-3)] border-transparent hover:text-[var(--qz-fg-1)]",
                        ].join(" ")}
                      >
                        {t.label}
                        <span className="ml-[6px] text-[12px] text-[var(--qz-fg-4)]">{counts[t.id]}</span>
                      </button>
                    );
                  })}
                </div>

                {tab === "subnets" && (
                  <DataTable
                    rows={subnetRows}
                    columns={subnetColumns}
                    rowId={(r) => r.subnet}
                    searchPlaceholder="Search subnets…"
                    emptyMessage="No subnets configured for this server."
                    actions={() => <RowActions />}
                  />
                )}
                {tab === "ranges" && (
                  <DataTable
                    rows={rangeRows}
                    columns={rangeColumns}
                    rowId={(r) => r.id}
                    searchPlaceholder="Search ranges…"
                    emptyMessage="No address ranges configured for this server."
                    actions={() => <RowActions />}
                  />
                )}
                {tab === "mappings" && (
                  <DataTable
                    rows={mappingRows}
                    columns={mappingColumns}
                    rowId={(r) => r.id}
                    searchPlaceholder="Search static mappings…"
                    emptyMessage="No static mappings configured for this server."
                    actions={() => <RowActions />}
                  />
                )}
                {tab === "leases" && (
                  <DataTable
                    rows={leaseRows}
                    columns={leaseColumns}
                    rowId={(r) => r.ip_address}
                    searchPlaceholder="Search leases…"
                    emptyMessage="No active leases for this server."
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
