"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, X, Building2, Pencil } from "lucide-react";

const API = "http://localhost:3001/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type SiteRole = "admin" | "viewer";

interface SiteAccess {
  site_id: string;
  site_name: string;
  role: SiteRole;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  username: string;
  role: string;
  created_at: string;
  site_access: SiteAccess[];
}

interface Site {
  id: string;
  name: string;
  description: string | null;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md px-3 py-[9px] text-[13px] text-[var(--qz-fg-1)] outline-none";

const inputSt = {
  background: "var(--qz-input-bg)",
  border: "1px solid var(--qz-border)",
} as const;

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--qz-accent)";
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--qz-border)";
}

// ── Small components ──────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, username }: { firstName: string; lastName: string; username: string }) {
  const f = firstName?.[0] ?? "";
  const l = lastName?.[0] ?? "";
  const ini = f || l ? (f + l).toUpperCase() : username.slice(0, 2).toUpperCase();
  return (
    <div
      className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0"
      style={{
        background: "linear-gradient(135deg, var(--qz-green-700), var(--qz-green-500))",
        color: "var(--qz-fg-on-accent)",
      }}
    >
      {ini}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <span
      className="text-[11px] font-semibold px-[6px] py-[2px] rounded"
      style={{
        background: isAdmin ? "var(--qz-accent-soft)" : "color-mix(in oklab,white 5%,transparent)",
        color: isAdmin ? "var(--qz-accent)" : "var(--qz-fg-3)",
        border: isAdmin
          ? "1px solid color-mix(in oklab,var(--qz-accent) 30%,transparent)"
          : "1px solid var(--qz-border)",
      }}
    >
      {isAdmin ? "Admin" : "Viewer"}
    </span>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--qz-ink-0)",
          border: "1px solid var(--qz-border)",
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 28,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-[17px] font-bold text-[var(--qz-fg-1)] m-0" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </h2>
        {subtitle && <p className="text-[13px] text-[var(--qz-fg-3)] m-0 mt-[3px]">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] transition-colors cursor-pointer bg-transparent border-0 p-0 mt-[2px]"
      >
        <X size={18} />
      </button>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div style={{ flex: 1, height: 1, background: "var(--qz-border)" }} />
      <span className="text-[11px] font-semibold text-[var(--qz-fg-4)] uppercase tracking-wider">{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--qz-border)" }} />
    </div>
  );
}

// ── Add User Modal ────────────────────────────────────────────────────────────

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName || null,
          last_name: lastName || null,
          email: email || null,
          username,
          password,
          role,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to create user.");
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError("Network error — is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Add User" onClose={onClose} />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">First Name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className={inputCls}
              style={inputSt}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Last Name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              className={inputCls}
              style={inputSt}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className={inputCls}
            style={inputSt}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>

        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
            Username <span style={{ color: "var(--qz-status-crit)" }}>*</span>
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="jsmith"
            className={inputCls}
            style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
              Password <span style={{ color: "var(--qz-status-crit)" }}>*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputCls}
              style={inputSt}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">System Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={`${inputCls} cursor-pointer`}
              style={inputSt}
            >
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-[12px] m-0" style={{ color: "var(--qz-status-crit)" }}>
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-[9px] rounded-md text-[13px] font-medium cursor-pointer"
            style={{ background: "transparent", border: "1px solid var(--qz-border)", color: "var(--qz-fg-2)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-[9px] rounded-md text-[13px] font-semibold cursor-pointer border-0"
            style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Adding…" : "Add User"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

function EditUserModal({
  user,
  sites,
  onClose,
  onSaved,
}: {
  user: User;
  sites: Site[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName]   = useState(user.last_name);
  const [email, setEmail]         = useState(user.email ?? "");
  const [username, setUsername]   = useState(user.username);
  const [password, setPassword]   = useState("");
  const [role, setRole]           = useState(user.role);
  const [saving, setSaving]       = useState(false);
  const [infoError, setInfoError] = useState("");

  // Site access state
  const [access, setAccess]     = useState<SiteAccess[]>(user.site_access);
  const [newSiteId, setNewSiteId] = useState("");
  const [newRole, setNewRole]   = useState<SiteRole>("viewer");
  const [accessWorking, setAccessWorking] = useState(false);

  const available = sites.filter((s) => !access.some((a) => a.site_id === s.id));

  const saveInfo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setInfoError("");
    try {
      const res = await fetch(`${API}/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName || null,
          last_name: lastName || null,
          email: email === "" ? "" : email || null,
          username: username || null,
          password: password || null,
          role: role || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setInfoError(d.error ?? "Failed to update user.");
        return;
      }
      onSaved();
    } catch {
      setInfoError("Network error — is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  const grantAccess = async (siteId: string, r: string) => {
    await fetch(`${API}/users/${user.id}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, role: r }),
    });
  };

  const addAccess = async () => {
    if (!newSiteId || accessWorking) return;
    setAccessWorking(true);
    await grantAccess(newSiteId, newRole);
    const site = sites.find((s) => s.id === newSiteId);
    setAccess((prev) => [...prev, { site_id: newSiteId, site_name: site?.name ?? "", role: newRole }]);
    setNewSiteId("");
    setAccessWorking(false);
  };

  const changeRole = async (siteId: string, r: SiteRole) => {
    setAccess((prev) => prev.map((a) => (a.site_id === siteId ? { ...a, role: r } : a)));
    await grantAccess(siteId, r);
  };

  const removeAccess = async (siteId: string) => {
    setAccess((prev) => prev.filter((a) => a.site_id !== siteId));
    await fetch(`${API}/users/${user.id}/access/${siteId}`, { method: "DELETE" });
  };

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Edit User" subtitle={`@${user.username} · ${fullName}`} onClose={onClose} />

      {/* ── User Info ── */}
      <form onSubmit={saveInfo} className="flex flex-col gap-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">First Name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className={inputCls}
              style={inputSt}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Last Name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              className={inputCls}
              style={inputSt}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className={inputCls}
            style={inputSt}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>

        <div>
          <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputCls}
            style={{ ...inputSt, fontFamily: "var(--qz-font-mono)" }}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">
              New Password <span className="text-[var(--qz-fg-4)]">(leave blank to keep)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputCls}
              style={inputSt}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          </div>
          <div>
            <label className="block text-[12px] text-[var(--qz-fg-3)] mb-[6px]">System Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={`${inputCls} cursor-pointer`}
              style={inputSt}
            >
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        {infoError && (
          <p className="text-[12px] m-0" style={{ color: "var(--qz-status-crit)" }}>
            {infoError}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-[9px] rounded-md text-[13px] font-semibold cursor-pointer border-0"
            style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>

      <SectionDivider label="Site Access" />

      {/* ── Site Access ── */}
      {access.length === 0 ? (
        <p className="text-[13px] text-[var(--qz-fg-4)] mb-4">No site access assigned.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {access.map((a) => (
            <div
              key={a.site_id}
              className="flex items-center gap-3 px-3 py-[9px] rounded-md"
              style={{ background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)" }}
            >
              <Building2 size={14} className="text-[var(--qz-fg-4)] flex-shrink-0" />
              <span className="flex-1 text-[13px] text-[var(--qz-fg-1)]">{a.site_name}</span>
              <select
                value={a.role}
                onChange={(e) => changeRole(a.site_id, e.target.value as SiteRole)}
                className="text-[12px] rounded px-2 py-[4px] cursor-pointer outline-none"
                style={{ background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)", color: "var(--qz-fg-2)" }}
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                onClick={() => removeAccess(a.site_id)}
                className="text-[var(--qz-fg-4)] hover:text-[var(--qz-status-crit)] transition-colors cursor-pointer bg-transparent border-0 p-0 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {sites.length === 0 ? (
        <p className="text-[12px] text-[var(--qz-fg-4)]">No sites configured — create sites first.</p>
      ) : available.length === 0 ? (
        <p className="text-[12px] text-[var(--qz-fg-4)]">All sites assigned.</p>
      ) : (
        <div>
          <p className="text-[12px] font-medium text-[var(--qz-fg-3)] mb-2">Add site access</p>
          <div className="flex gap-2">
            <select
              value={newSiteId}
              onChange={(e) => setNewSiteId(e.target.value)}
              className="flex-1 rounded-md px-3 py-[8px] text-[13px] text-[var(--qz-fg-1)] outline-none cursor-pointer"
              style={{ background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)" }}
            >
              <option value="">Select site…</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as SiteRole)}
              className="rounded-md px-3 py-[8px] text-[13px] text-[var(--qz-fg-1)] outline-none cursor-pointer"
              style={{ background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)", width: 100 }}
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={addAccess}
              disabled={!newSiteId || accessWorking}
              className="flex items-center gap-[6px] px-3 py-[8px] rounded-md text-[13px] font-semibold cursor-pointer border-0"
              style={{
                background: "var(--qz-accent)",
                color: "var(--qz-fg-on-accent)",
                opacity: !newSiteId || accessWorking ? 0.5 : 1,
              }}
            >
              <Plus size={13} />
              Add
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-[9px] rounded-md text-[13px] font-medium cursor-pointer"
          style={{ background: "transparent", border: "1px solid var(--qz-border)", color: "var(--qz-fg-2)" }}
        >
          Done
        </button>
      </div>
    </ModalShell>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ur, sr] = await Promise.all([
        fetch(`${API}/users`),
        fetch(`${API}/sites`),
      ]);
      setUsers(await ur.json());
      setSites(await sr.json());
    } catch {
      // backend may not be running in dev
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deleteUser = async (id: string) => {
    await fetch(`${API}/users/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div className="p-[28px_36px]" onClick={() => setConfirmDelete(null)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[28px] font-bold text-[var(--qz-fg-1)] m-0"
          style={{ letterSpacing: "-0.015em" }}
        >
          Users
        </h1>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAddOpen(true); }}
          className="flex items-center gap-[7px] px-4 py-[9px] rounded-md text-[13.5px] font-semibold cursor-pointer border-0"
          style={{ background: "var(--qz-accent)", color: "var(--qz-fg-on-accent)" }}
        >
          <Plus size={15} />
          Add User
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-[13px] text-[var(--qz-fg-4)]">Loading…</p>
      ) : (
        <div className="rounded-md overflow-hidden" style={{ border: "1px solid var(--qz-border)" }}>
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--qz-border)",
                  background: "color-mix(in oklab,var(--qz-ink-1) 80%,transparent)",
                }}
              >
                {["Name", "Email", "Username", "Sites", ""].map((col) => (
                  <th
                    key={col}
                    className="text-left px-4 py-[10px] text-[11px] font-semibold text-[var(--qz-fg-3)] uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--qz-fg-4)] text-[13px]">
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((user, i) => {
                  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                  return (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: i < users.length - 1 ? "1px solid var(--qz-border)" : "none",
                        background: "var(--qz-ink-0)",
                      }}
                    >
                      {/* Name */}
                      <td className="px-4 py-[11px]">
                        <div className="flex items-center gap-[10px]">
                          <Avatar firstName={user.first_name} lastName={user.last_name} username={user.username} />
                          <span className="text-[var(--qz-fg-1)] font-medium">
                            {fullName || <span style={{ color: "var(--qz-fg-4)" }}>—</span>}
                          </span>
                        </div>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-[11px] text-[var(--qz-fg-3)]">
                        {user.email ?? <span style={{ color: "var(--qz-fg-4)" }}>—</span>}
                      </td>
                      {/* Username */}
                      <td
                        className="px-4 py-[11px] text-[var(--qz-fg-2)]"
                        style={{ fontFamily: "var(--qz-font-mono)" }}
                      >
                        {user.username}
                      </td>
                      {/* Sites */}
                      <td className="px-4 py-[11px]">
                        {user.site_access.length === 0 ? (
                          <span style={{ color: "var(--qz-fg-4)" }}>—</span>
                        ) : (
                          <div className="flex flex-wrap gap-[6px]">
                            {user.site_access.map((a) => (
                              <span
                                key={a.site_id}
                                className="inline-flex items-center gap-[6px] text-[12px] px-[9px] py-[3px] rounded"
                                style={{
                                  background: "color-mix(in oklab,white 5%,transparent)",
                                  border: "1px solid var(--qz-border)",
                                  color: "var(--qz-fg-2)",
                                }}
                              >
                                {a.site_name}
                                <RoleBadge role={a.role} />
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-[11px]">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            title="Edit user"
                            onClick={() => { setEditingUser(user); setConfirmDelete(null); }}
                            className="text-[var(--qz-fg-4)] hover:text-[var(--qz-fg-1)] transition-colors cursor-pointer bg-transparent border-0 p-0"
                          >
                            <Pencil size={14} />
                          </button>

                          {confirmDelete === user.id ? (
                            <button
                              type="button"
                              onClick={() => deleteUser(user.id)}
                              className="text-[12px] font-semibold px-3 py-[5px] rounded cursor-pointer border-0"
                              style={{ background: "var(--qz-status-crit)", color: "white" }}
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(user.id)}
                              className="text-[var(--qz-fg-4)] hover:text-[var(--qz-status-crit)] transition-colors cursor-pointer bg-transparent border-0 p-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddUserModal onClose={() => setAddOpen(false)} onCreated={load} />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          sites={sites}
          onClose={() => { setEditingUser(null); load(); }}
          onSaved={() => { load(); }}
        />
      )}
    </div>
  );
}
