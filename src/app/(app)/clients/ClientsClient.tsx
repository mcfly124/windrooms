"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveClient } from "@/app/actions/clients";

type ClientRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  notes: string | null;
  balance: number;
};

export default function ClientsClient({
  clients,
  canEdit,
  locations,
}: {
  clients: ClientRow[];
  canEdit: boolean;
  locations: { id: number; name: string }[];
}) {
  void locations;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<ClientRow> | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q)
    );
  }, [clients, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          placeholder="Search name, email, phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg bg-card border border-line px-3 py-2 text-sm text-ink outline-none focus:border-acc"
        />
        {canEdit && (
          <button onClick={() => setEditing({})} className="ml-auto rounded-lg bg-acc hover:bg-acc-strong text-white px-4 py-2 text-sm font-medium whitespace-nowrap">
            + Client
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card text-left text-mut">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium text-right">Nights balance</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-line hover:bg-hovr">
                <td className="px-4 py-2 text-ink">
                  <Link href={`/clients/${c.id}`} className="hover:text-acc">{c.name}</Link>
                </td>
                <td className="px-4 py-2 text-mut">{c.email ?? "—"}</td>
                <td className="px-4 py-2 text-mut">{c.phone ?? "—"}</td>
                <td className={`px-4 py-2 text-right font-medium ${c.balance > 0 ? "text-ok" : "text-faint"}`}>
                  {c.balance}
                </td>
                <td className="px-4 py-2 text-right">
                  {canEdit && (
                    <button onClick={() => setEditing(c)} className="text-mut hover:text-ink text-xs">edit</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-faint">No clients</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ClientModal
          initial={editing}
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

function ClientModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<ClientRow>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial.name ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    country: initial.country ?? "",
    notes: initial.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = "w-full rounded-lg bg-hovr border border-line px-2.5 py-1.5 text-sm text-ink outline-none focus:border-acc";
  const label = "block text-xs text-mut mb-1";

  function submit() {
    startTransition(async () => {
      const result = await saveClient({ id: initial.id, ...form });
      if (result.ok) onSaved();
      else setError(result.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-line p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-ink font-semibold">{initial.id ? "Edit client" : "New client"}</h2>
        <div><label className={label}>Name *</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Email</label><input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className={label}>Phone</label><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div><label className={label}>Country</label><input className={input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
        <div><label className={label}>Notes</label><textarea rows={2} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={pending} className="rounded-lg bg-acc hover:bg-acc-strong disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">Save</button>
          <button onClick={onClose} className="ml-auto rounded-lg bg-hovr hover:bg-hovr text-mut px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
