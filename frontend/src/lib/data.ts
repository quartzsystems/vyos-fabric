import { Router, Alarm, Deployment } from "./types";

export const ROUTERS: Router[] = [
  { id: "vyos-core-01", hostname: "core-01.fabric", role: "Core router", site: "DC1 · Rack A3", vyosVersion: "1.4.0-rc5", lastSeen: "4 s ago", bgpPeers: 8, uptime: "42d 06h", status: "ok" },
  { id: "vyos-edge-02", hostname: "edge-02.fabric", role: "Edge router", site: "DC1 · Rack B1", vyosVersion: "1.4.0-rc4", lastSeen: "2 min ago", bgpPeers: 3, uptime: "18d 12h", status: "warn" },
  { id: "vyos-edge-03", hostname: "edge-03.fabric", role: "Edge router", site: "DC2 · Rack C4", vyosVersion: "1.3.8", lastSeen: "22 min ago", bgpPeers: null, uptime: null, status: "crit" },
  { id: "vyos-agg-04", hostname: "agg-04.fabric", role: "Aggregation", site: "DC1 · Rack A1", vyosVersion: "1.4.0-rc5", lastSeen: "8 s ago", bgpPeers: 12, uptime: "61d 04h", status: "ok" },
  { id: "vyos-agg-05", hostname: "agg-05.fabric", role: "Aggregation", site: "DC2 · Rack C2", vyosVersion: "1.4.0-rc5", lastSeen: "3 s ago", bgpPeers: 11, uptime: "61d 03h", status: "ok" },
  { id: "vyos-vpn-06", hostname: "vpn-06.fabric", role: "VPN concentrator", site: "DC1 · Rack A4", vyosVersion: "1.4.0-rc4", lastSeen: "1 min ago", bgpPeers: 2, uptime: "30d 09h", status: "ok" },
  { id: "vyos-br-07", hostname: "br-07.fabric", role: "Border router", site: "DC2 · Rack D1", vyosVersion: "1.4.0-rc5", lastSeen: "12 s ago", bgpPeers: 4, uptime: "55d 11h", status: "ok" },
  { id: "vyos-edge-08", hostname: "edge-08.fabric", role: "Edge router", site: "DC3 · Rack E2", vyosVersion: "1.3.8", lastSeen: "47 min ago", bgpPeers: null, uptime: null, status: "off" },
];

export const ALARMS: Alarm[] = [
  { id: "al-1", severity: "crit", title: "edge-03 BGP session down — all peers lost.", routerId: "vyos-edge-03", detail: "Last seen 22 min ago. No route updates received.", when: "14:03 UTC", acked: false },
  { id: "al-2", severity: "warn", title: "Version drift: 3 routers on 1.3.8 (EOL).", routerId: "vyos-edge-02", detail: "edge-02, edge-03, edge-08 running unsupported builds.", when: "13:42 UTC", acked: false },
  { id: "al-3", severity: "warn", title: "edge-02 BGP prefix count trending low.", routerId: "vyos-edge-02", detail: "Received 2 / 3 expected peers. 18-min trend.", when: "13:30 UTC", acked: false },
  { id: "al-4", severity: "info", title: "Scheduled maintenance window in 2 h.", routerId: "ops", detail: "DC1 rack A row. Acknowledged: 4.", when: "12:00 UTC", acked: true },
];

export const DEPLOYMENTS: Deployment[] = [
  { id: "dpl-9182", bundle: "vyos/1.4.0-rc5", target: "prod · all", started: "12 min ago", progress: 88, status: "ok" },
  { id: "dpl-9181", bundle: "vyos/1.4.0-rc4", target: "prod · dc1", started: "2 h ago", progress: 100, status: "ok" },
  { id: "dpl-9179", bundle: "vyos/1.3.8", target: "prod · dc2", started: "1 d ago", progress: 100, status: "warn" },
  { id: "dpl-9168", bundle: "config-baseline/v2.1", target: "staging · all", started: "3 d ago", progress: 100, status: "ok" },
];
