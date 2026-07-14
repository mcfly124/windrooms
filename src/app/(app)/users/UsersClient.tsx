"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUser } from "@/app/actions/admin";
import { impersonateAction } from "@/app/actions/session";
import type { Role } from "@prisma/client";

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: Role;
  locationId: number | null;
  locationName: string | null;
  active: boolean;
};

export default function UsersClient({
  users,
  locations,
  currentUserId,
}: {
  users: UserRow[];
  locations: { id: number; name: string }[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<UserRow> | null>(null);
  const [, startTransition] = useTransition();

  function impersonate(id: number) {
    startTransition(async () => {
      await impersonateAction(id);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold text-white">Users</h1>
        <button onClick={() => setEditing({})} className="ml-auto rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 text-sm font-medium">
          + User
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-left text-zinc-400">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Location</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-800">
                <td className="px-4 py-2 text-white">{u.name}{u.id === currentUserId && <span className="text-zinc-500 text-xs"> (you)</span>}</td>
                <td className="px-4 py-2 text-zinc-400">{u.email}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    u.role === "SUPERADMIN" ? "bg-purple-900/60 text-purple-300"
                    : u.role === "ADMIN" ? "bg-sky-900/60 text-sky-300"
                    : "bg-zinc-800 text-zinc-300"
                  }`}>{u.role.toLowerCase()}</span>
                </td>
                <td className="px-4 py-2 text-zinc-400">{u.locationName ?? "all"}</td>
                <td className="px-4 py-2 text-xs">{u.active ? <span className="text-emerald-400">active</span> : <span className="text-zinc-600">disabled</span>}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {u.id !== currentUserId && u.active && (
                    <button onClick={() => impersonate(u.id)} className="text-amber-400 hover:text-amber-300 text-xs mr-3">impersonate</button>
                  )}
                  <button onClick={() => setEditing(u)} className="text-zinc-400 hover:text-white text-xs">edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <UserModal
          initial={editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  initial,
  locations,
  onClose,
  onSaved,
}: {
  initial: Partial<UserRow>;
  locations: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial.name ?? "",
    email: initial.email ?? "",
    role: (initial.role ?? "OPERATOR") as Role,
    locationId: initial.locationId ?? null,
    active: initial.active ?? true,
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = "w-full rounded-lg bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500";
  const label = "block text-xs text-zinc-400 mb-1";

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveUser({
        id: initial.id,
        email: form.email,
        name: form.name,
        role: form.role,
        locationId: form.locationId,
        active: form.active,
        password: form.password || undefined,
      });
      if (result.ok) onSaved();
      else setError(result.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-white font-semibold">{initial.id ? "Edit user" : "New user"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className={label}>Email</label><input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div>
            <label className={label}>Role</label>
            <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPERADMIN">Superadmin</option>
            </select>
          </div>
          {form.role === "OPERATOR" && (
            <div>
              <label className={label}>Location</label>
              <select className={input} value={form.locationId ?? ""} onChange={(e) => setForm({ ...form, locationId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className={label}>{initial.id ? "New password (leave empty to keep)" : "Password"}</label>
          <input type="password" className={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={pending} className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">Save</button>
          <button onClick={onClose} className="ml-auto rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
