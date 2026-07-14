"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUser, resendInvite } from "@/app/actions/admin";
import { impersonateAction } from "@/app/actions/session";
import PasswordInput from "@/components/PasswordInput";
import type { Role } from "@prisma/client";

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: Role;
  locationIds: number[];
  locationNames: string[];
  active: boolean;
  invitePending: boolean;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function impersonate(id: number) {
    startTransition(async () => {
      await impersonateAction(id);
    });
  }

  function reinvite(id: number) {
    setNotice(null);
    startTransition(async () => {
      const result = await resendInvite(id);
      setNotice(result.ok ? "Invite email sent again." : result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold text-ink">Users</h1>
        <button onClick={() => setEditing({})} className="ml-auto rounded-lg bg-acc hover:bg-acc-strong text-white px-4 py-2 text-sm font-medium">
          + User
        </button>
      </div>

      {notice && <p className="text-sm text-mut rounded-xl bg-hovr px-3 py-2">{notice}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card text-left text-mut">
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
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-2 text-ink">{u.name}{u.id === currentUserId && <span className="text-faint text-xs"> (you)</span>}</td>
                <td className="px-4 py-2 text-mut">{u.email}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    u.role === "SUPERADMIN" ? "bg-purp-soft text-purp"
                    : u.role === "ADMIN" ? "bg-acc-soft text-acc"
                    : "bg-hovr text-mut"
                  }`}>{u.role.toLowerCase()}</span>
                </td>
                <td className="px-4 py-2 text-mut">{u.role === "OPERATOR" ? (u.locationNames.join(", ") || "—") : "all"}</td>
                <td className="px-4 py-2 text-xs">
                  {!u.active ? (
                    <span className="text-faint">disabled</span>
                  ) : u.invitePending ? (
                    <span className="px-2 py-0.5 rounded bg-warn-soft text-warn">invite pending</span>
                  ) : (
                    <span className="text-ok">active</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {u.invitePending && u.active && (
                    <button onClick={() => reinvite(u.id)} className="text-acc hover:underline text-xs mr-3">resend invite</button>
                  )}
                  {u.id !== currentUserId && u.active && !u.invitePending && (
                    <button onClick={() => impersonate(u.id)} className="text-warn hover:text-warn text-xs mr-3">impersonate</button>
                  )}
                  <button onClick={() => setEditing(u)} className="text-mut hover:text-ink text-xs">edit</button>
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
    locationIds: initial.locationIds ?? [],
    active: initial.active ?? true,
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = "w-full rounded-lg bg-hovr border border-line px-2.5 py-1.5 text-sm text-ink outline-none focus:border-acc";
  const label = "block text-xs text-mut mb-1";

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveUser({
        id: initial.id,
        email: form.email,
        name: form.name,
        role: form.role,
        locationIds: form.locationIds,
        active: form.active,
        password: form.password || undefined,
      });
      if (result.ok) onSaved();
      else setError(result.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-line p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-ink font-semibold">{initial.id ? "Edit user" : "New user"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className={label}>Email</label><input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div>
            <label className={label}>Role</label>
            <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPERADMIN">Superadmin</option>
            </select>
          </div>
          {form.role === "OPERATOR" && (
            <div className="col-span-2">
              <label className={label}>Locations (one or more)</label>
              <div className="flex flex-wrap gap-2">
                {locations.map((l) => {
                  const on = form.locationIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          locationIds: on ? form.locationIds.filter((id) => id !== l.id) : [...form.locationIds, l.id],
                        })
                      }
                      className={`px-3 py-1.5 rounded-full text-sm border ${
                        on ? "bg-acc text-white border-acc" : "bg-card text-mut border-line hover:bg-hovr"
                      }`}
                    >
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {initial.id ? (
          <div>
            <label className={label}>New password (leave empty to keep)</label>
            <PasswordInput autoComplete="new-password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          </div>
        ) : (
          <p className="rounded-xl bg-acc-softer text-sm text-mut px-3 py-2">
            No password needed — they&apos;ll receive an email with a link to set their own.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm text-mut">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={pending} className="rounded-lg bg-acc hover:bg-acc-strong disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">Save</button>
          <button onClick={onClose} className="ml-auto rounded-lg bg-hovr hover:bg-hovr text-mut px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
