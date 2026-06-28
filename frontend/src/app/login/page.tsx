"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { API, setUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Invalid username or password.");
        return;
      }
      // Session is set via httpOnly cookie; the body is the user (for display/role).
      setUser(await res.json());
      router.push("/controller");
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const inputBase =
    "w-full rounded-md px-3 py-[10px] text-[13px] text-[var(--qz-fg-1)] outline-none transition-colors";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "var(--qz-bg)" }}
    >
      <div
        className="w-full max-w-[360px] rounded-xl p-8 flex flex-col gap-6"
        style={{
          background: "var(--qz-ink-0)",
          border: "1px solid var(--qz-border)",
          boxShadow: "var(--qz-shadow-lg)",
        }}
      >
        {/* Logo + heading */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo-mark.png" alt="Quartz Systems" className="w-10 h-10" />
          <h1
            className="text-[22px] font-bold text-[var(--qz-fg-1)] m-0"
            style={{ letterSpacing: "-0.02em" }}
          >
            VyOS Fabric
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              className={inputBase}
              style={{
                background: "var(--qz-input-bg)",
                border: "1px solid var(--qz-border)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qz-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
            />
          </div>

          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className={`${inputBase} pr-10`}
                style={{
                  background: "var(--qz-input-bg)",
                  border: "1px solid var(--qz-border)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qz-accent)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-2)] transition-colors cursor-pointer bg-transparent border-0 p-0"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <p
              className="text-[12px] m-0"
              style={{ color: "var(--qz-status-crit)" }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md py-[10px] text-[13.5px] font-semibold transition-opacity cursor-pointer border-0 mt-1"
            style={{
              background: "var(--qz-accent)",
              color: "var(--qz-fg-on-accent)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
