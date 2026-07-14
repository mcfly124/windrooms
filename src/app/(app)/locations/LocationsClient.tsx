"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLocation, saveRoom } from "@/app/actions/admin";
import type { RoomType } from "@prisma/client";

type Loc = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  publicBookingEnabled: boolean;
  releaseWindowDays: number;
  hotelPartnerInfo: string | null;
  notes: string | null;
  rooms: { id: number; name: string; type: RoomType; active: boolean }[];
};

const input = "rounded-lg bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500";
const label = "block text-xs text-zinc-400 mb-1";

export default function LocationsClient({ locations }: { locations: Loc[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold text-white">Locations</h1>
        <button onClick={() => setAdding(true)} className="ml-auto rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 text-sm font-medium">
          + Location
        </button>
      </div>
      {adding && (
        <LocationCard
          loc={{ id: 0, name: "", slug: "", active: true, publicBookingEnabled: false, releaseWindowDays: 14, hotelPartnerInfo: null, notes: null, rooms: [] }}
          isNew
          onDone={() => setAdding(false)}
        />
      )}
      {locations.map((loc) => (
        <LocationCard key={loc.id} loc={loc} />
      ))}
    </div>
  );
}

function LocationCard({ loc, isNew, onDone }: { loc: Loc; isNew?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: loc.name,
    slug: loc.slug,
    active: loc.active,
    publicBookingEnabled: loc.publicBookingEnabled,
    releaseWindowDays: loc.releaseWindowDays,
    hotelPartnerInfo: loc.hotelPartnerInfo ?? "",
    notes: loc.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveLocation({ id: isNew ? undefined : loc.id, ...form });
      if (result.ok) {
        onDone?.();
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className={`rounded-2xl bg-zinc-900 border p-4 space-y-4 ${form.active ? "border-zinc-800" : "border-zinc-800 opacity-60"}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={label}>Slug</label><input className={`${input} w-28`} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
        <div>
          <label className={label}>Public release window (days, 0 = always)</label>
          <input type="number" min={0} className={`${input} w-24`} value={form.releaseWindowDays} onChange={(e) => setForm({ ...form, releaseWindowDays: Number(e.target.value) })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300 pb-1.5">
          <input type="checkbox" checked={form.publicBookingEnabled} onChange={(e) => setForm({ ...form, publicBookingEnabled: e.target.checked })} />
          Public booking
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300 pb-1.5">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
        <button onClick={submit} disabled={pending} className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-4 py-1.5 text-sm font-medium">
          Save
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Partner hotel info</label><input className={`${input} w-full`} value={form.hotelPartnerInfo} onChange={(e) => setForm({ ...form, hotelPartnerInfo: e.target.value })} /></div>
        <div><label className={label}>Notes</label><input className={`${input} w-full`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!isNew && <RoomsEditor locationId={loc.id} rooms={loc.rooms} />}
    </div>
  );
}

function RoomsEditor({ locationId, rooms }: { locationId: number; rooms: Loc["rooms"] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<RoomType>("SINGLE");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await saveRoom({ locationId, name, type, active: true });
      if (result.ok) {
        setName("");
        router.refresh();
      } else setError(result.error);
    });
  }

  function toggle(room: Loc["rooms"][number]) {
    startTransition(async () => {
      await saveRoom({ id: room.id, locationId, name: room.name, type: room.type, active: !room.active });
      router.refresh();
    });
  }

  return (
    <div className="border-t border-zinc-800 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500 mr-1">Rooms:</span>
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => toggle(r)}
            title={r.active ? "Click to deactivate" : "Click to activate"}
            className={`px-2.5 py-1 rounded-lg text-xs border ${
              r.active ? "bg-zinc-800 border-zinc-600 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-600 line-through"
            }`}
          >
            {r.name} · {r.type === "DOUBLE" ? "dbl" : "sgl"}
          </button>
        ))}
        <span className="flex items-center gap-2 ml-auto">
          <input placeholder="New room" className={`${input} w-28`} value={name} onChange={(e) => setName(e.target.value)} />
          <select className={input} value={type} onChange={(e) => setType(e.target.value as RoomType)}>
            <option value="SINGLE">Single</option>
            <option value="DOUBLE">Double</option>
          </select>
          <button onClick={add} disabled={pending || !name.trim()} className="rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-3 py-1.5 text-xs">
            Add
          </button>
        </span>
      </div>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}
