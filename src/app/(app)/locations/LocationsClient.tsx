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
  publicDescription: string | null;
  notes: string | null;
  rooms: { id: number; name: string; type: RoomType; active: boolean; pricePln: number | null }[];
};

const input = "rounded-lg bg-hovr border border-line px-2.5 py-1.5 text-sm text-ink outline-none focus:border-acc";
const label = "block text-xs text-mut mb-1";

export default function LocationsClient({ locations }: { locations: Loc[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold text-ink">Locations</h1>
        <button onClick={() => setAdding(true)} className="ml-auto rounded-lg bg-acc hover:bg-acc-strong text-white px-4 py-2 text-sm font-medium">
          + Location
        </button>
      </div>
      {adding && (
        <LocationCard
          loc={{ id: 0, name: "", slug: "", active: true, publicBookingEnabled: false, releaseWindowDays: 14, hotelPartnerInfo: null, publicDescription: null, notes: null, rooms: [] }}
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
    publicDescription: loc.publicDescription ?? "",
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
    <div className={`rounded-2xl bg-card border p-4 space-y-4 ${form.active ? "border-line" : "border-line opacity-60"}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={label}>Slug</label><input className={`${input} w-28`} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
        <div>
          <label className={label}>Public release window (days, 0 = always)</label>
          <input type="number" min={0} className={`${input} w-24`} value={form.releaseWindowDays} onChange={(e) => setForm({ ...form, releaseWindowDays: Number(e.target.value) })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-mut pb-1.5">
          <input type="checkbox" checked={form.publicBookingEnabled} onChange={(e) => setForm({ ...form, publicBookingEnabled: e.target.checked })} />
          Public booking
        </label>
        <label className="flex items-center gap-2 text-sm text-mut pb-1.5">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
        <button onClick={submit} disabled={pending} className="rounded-lg bg-acc hover:bg-acc-strong disabled:opacity-50 text-white px-4 py-1.5 text-sm font-medium">
          Save
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Partner hotel info</label><input className={`${input} w-full`} value={form.hotelPartnerInfo} onChange={(e) => setForm({ ...form, hotelPartnerInfo: e.target.value })} /></div>
        <div><label className={label}>Notes</label><input className={`${input} w-full`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      {form.publicBookingEnabled && (
        <div>
          <label className={label}>Public page description (shown to guests on the booking site)</label>
          <textarea rows={2} className={`${input} w-full`} value={form.publicDescription} onChange={(e) => setForm({ ...form, publicDescription: e.target.value })} />
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
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

  return (
    <div className="border-t border-line pt-3 space-y-2">
      <div className="label-mono">Rooms · price per night for public guests (empty = not publicly bookable)</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {rooms.map((r) => (
          <RoomRow key={r.id} locationId={locationId} room={r} />
        ))}
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1.5">
          <input placeholder="New room" className={`${input} w-24`} value={name} onChange={(e) => setName(e.target.value)} />
          <select className={`field w-auto`} value={type} onChange={(e) => setType(e.target.value as RoomType)}>
            <option value="SINGLE">Single</option>
            <option value="DOUBLE">Double</option>
          </select>
          <button onClick={add} disabled={pending || !name.trim()} className="btn-ghost text-xs px-3 py-1.5">Add</button>
        </div>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

function RoomRow({ locationId, room }: { locationId: number; room: Loc["rooms"][number] }) {
  const router = useRouter();
  const [price, setPrice] = useState(room.pricePln !== null ? String(room.pricePln) : "");
  const [pending, startTransition] = useTransition();

  function save(next: { active?: boolean }) {
    startTransition(async () => {
      await saveRoom({
        id: room.id,
        locationId,
        name: room.name,
        type: room.type,
        active: next.active ?? room.active,
        pricePln: price.trim() ? Number(price) : null,
      });
      router.refresh();
    });
  }

  return (
    <div className={`flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 ${room.active ? "" : "opacity-50"}`}>
      <span className={`text-sm font-medium ${room.active ? "" : "line-through"}`}>{room.name}</span>
      <span className="text-faint text-xs">{room.type === "DOUBLE" ? "dbl" : "sgl"}</span>
      <input
        placeholder="— zł"
        inputMode="decimal"
        className={`${input} w-20 ml-auto text-right font-mono`}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onBlur={() => save({})}
      />
      <span className="text-faint text-xs">zł</span>
      <button
        onClick={() => save({ active: !room.active })}
        disabled={pending}
        className="text-xs text-faint hover:text-ink"
        title={room.active ? "Deactivate" : "Activate"}
      >
        {room.active ? "on" : "off"}
      </button>
    </div>
  );
}
