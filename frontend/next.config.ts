import type { NextConfig } from "next";

// Proxy /api to the backend so the browser talks to its own origin — this makes the
// session cookie first-party (httpOnly, SameSite=Lax).
// Use 127.0.0.1 (not "localhost") so Node doesn't resolve to IPv6 ::1 — the backend binds
// IPv4 127.0.0.1 only, so ::1 would be refused.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
