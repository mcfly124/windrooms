"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReservation, cancelReservation, type ReservationInput } from "@/app/actions/reservations";
import { addDays, eachDay, nightsBetween, todayYmd } from "@/lib/dates";
import type { CompanionPayment, ReservationSource, ReservationStatus, RoomType } from "@prisma/client";

type Loc = { id: number; name: string; slug: string };
type Room = { id: number; name: string; type: RoomType };
type Res = {
  id: number;
  roomId: number;
  clientId: number | null;
  clientName: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
  source: ReservationSource;
  usesCredits: boolean;
  companionCount: number;
  companionPayment: CompanionPayment | null;
  hotelOverflowCost: number | null;
  notes: string | null;
};

const STATUS_STYLE: Record<ReservationStatus, string> = {
  CONFIRMED: "bg-sky-600/80 border-sky-400",
  STANDBY: "bg-amber-600/70 border-amber-400",
  HOTEL_OVERFLOW: "bg-purple-600/70 border-purple-400",
  CANCELLED: "bg-zinc-700 border-zinc-500",
};

export default function CalendarClient(props: {
  locations: Loc[];
  selectedSlug: string;
  selectedLocationId: number;
  start: string;
  days: number;
  rooms: Room[];
  reservations: Res[];
  clients: { id: number; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const days = useMemo(() => eachDay(props.start, props.days), [props.start, props.days]);
  const today = todayYmd();
  const [editing, setEditing] = useState<Partial<Res> & { roomId: number } | null>(null);

  const byRoom = useMemo(() => {
    const map = new Map<number, Res[]>();
    for (const r of props.reservations) {
      if (!map.has(r.roomId)) map.set(r.roomId, []);
      map.get(r.roomId)!.push(r);
    }
    return map;
  }, [props.reservations]);

  function go(params: { loc?: string; start?: string }) {
    const q = new URLSearchParams({ loc: params.loc ?? props.selectedSlug, start: params.start ?? props.start });
    router.push(`/calendar?${q}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {props.locations.map((l) => (
          <button
            key={l.id}
            onClick={() => go({ loc: l.slug })}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              l.slug === props.selectedSlug ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {l.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => go({ start: addDays(props.start, -7) })} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">←</button>
          <button onClick={() => go({ start: addDays(today, -1) })} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Today</button>
          <button onClick={() => go({ start: addDays(props.start, 7) })} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">→</button>
        </div>
      </div>

      {props.rooms.length === 0 ? (
        <p className="text-zinc-500 text-sm">This location has no rooms yet{props.canEdit ? " — add them under Locations." : "."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="border-collapse w-full min-w-[900px] text-xs">
            <thead>
              <tr className="bg-zinc-900">
                <th className="sticky left-0 bg-zinc-900 z-10 text-left px-3 py-2 text-zinc-400 font-medium border-b border-zinc-800 w-24">Room</th>
                {days.map((d) => {
                  const date = new Date(`${d}T00:00:00Z`);
                  const weekend = [0, 6].includes(date.getUTCDay());
                  return (
                    <th
                      key={d}
                      className={`px-1 py-2 border-b border-l border-zinc-800 font-normal min-w-9 ${
                        d === today ? "bg-sky-950 text-sky-300" : weekend ? "bg-zinc-900/60 text-zinc-500" : "text-zinc-500"
                      }`}
                    >
                      <div>{date.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "UTC" })}</div>
                      <div className="text-[10px]">{date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {props.rooms.map((room) => {
                const resList = byRoom.get(room.id) ?? [];
                const cells: React.ReactNode[] = [];
                let i = 0;
                while (i < days.length) {
                  const d = days[i];
                  // A reservation occupies this column if it covers this night [d, d+1)
                  const res = resList.find((r) => r.checkIn <= d && r.checkOut > d);
                  if (res) {
                    const end = Math.min(
                      days.length,
                      days.findIndex((x) => x === res.checkOut) === -1 ? days.length : days.indexOf(res.checkOut)
                    );
                    const span = Math.max(1, end - i);
                    cells.push(
                      <td key={d} colSpan={span} className="border-l border-b border-zinc-800 p-0.5 align-middle">
                        <button
                          onClick={() => setEditing({ ...res })}
                          className={`w-full truncate rounded-md border px-1.5 py-1 text-left text-white ${STATUS_STYLE[res.status]} ${res.source === "PUBLIC" ? "italic" : ""}`}
                          title={`${res.clientName ?? res.guestName ?? ""} · ${res.checkIn} → ${res.checkOut} · ${res.status}`}
                        >
                          {res.clientName ?? res.guestName ?? "?"}
                        </button>
                      </td>
                    );
                    i += span;
                  } else {
                    cells.push(
                      <td key={d} className={`border-l border-b border-zinc-800 ${d === today ? "bg-sky-950/40" : ""}`}>
                        {props.canEdit && d >= today && (
                          <button
                            onClick={() =>
                              setEditing({ roomId: room.id, checkIn: d, checkOut: addDays(d, 1), status: "CONFIRMED" })
                            }
                            className="w-full h-8 hover:bg-zinc-800/80"
                            title={`New reservation ${room.name} ${d}`}
                          />
                        )}
                      </td>
                    );
                    i += 1;
                  }
                }
                return (
                  <tr key={room.id}>
                    <td className="sticky left-0 bg-zinc-950 z-10 px-3 py-1.5 border-b border-zinc-800 text-zinc-200 font-medium whitespace-nowrap">
                      {room.name} <span className="text-zinc-500">{room.type === "DOUBLE" ? "dbl" : "sgl"}</span>
                    </td>
                    {cells}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
        <Legend className="bg-sky-600/80" label="Confirmed" />
        <Legend className="bg-amber-600/70" label="Standby" />
        <Legend className="bg-purple-600/70" label="Hotel overflow" />
        <span className="italic">italic = public guest</span>
      </div>

      {editing && (
        <ReservationModal
          key={editing.id ?? `new-${editing.roomId}-${editing.checkIn}`}
          initial={editing}
          rooms={props.rooms}
          clients={props.clients}
          canEdit={props.canEdit}
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

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded ${className}`} /> {label}
    </span>
  );
}

function ReservationModal({
  initial,
  rooms,
  clients,
  canEdit,
  onClose,
  onSaved,
}: {
  initial: Partial<Res> & { roomId: number };
  rooms: Room[];
  clients: { id: number; name: string }[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    roomId: initial.roomId,
    clientId: initial.clientId ?? null,
    guestName: initial.guestName ?? "",
    guestEmail: initial.guestEmail ?? "",
    guestPhone: initial.guestPhone ?? "",
    checkIn: initial.checkIn ?? todayYmd(),
    checkOut: initial.checkOut ?? addDays(todayYmd(), 1),
    status: (initial.status ?? "CONFIRMED") as ReservationStatus,
    usesCredits: initial.usesCredits ?? true,
    companionCount: initial.companionCount ?? 0,
    companionPayment: (initial.companionPayment ?? "RECEPTION") as CompanionPayment,
    hotelOverflowCost: initial.hotelOverflowCost ?? null,
    notes: initial.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nights = nightsBetween(form.checkIn, form.checkOut);
  const isFlyspot = form.clientId !== null;

  function submit() {
    setError(null);
    const input: ReservationInput = {
      id: initial.id,
      roomId: form.roomId,
      clientId: form.clientId,
      guestName: form.guestName,
      guestEmail: form.guestEmail,
      guestPhone: form.guestPhone,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      status: form.status,
      source: isFlyspot ? "FLYSPOT" : "PUBLIC",
      usesCredits: isFlyspot && form.usesCredits,
      companionCount: form.companionCount,
      companionPayment: form.companionCount > 0 ? form.companionPayment : null,
      hotelOverflowCost: form.hotelOverflowCost,
      notes: form.notes,
    };
    startTransition(async () => {
      const result = await saveReservation(input);
      if (result.ok) onSaved();
      else setError(result.error);
    });
  }

  function cancel() {
    if (!initial.id) return;
    if (!confirm("Cancel this reservation? Used night credits will be refunded.")) return;
    startTransition(async () => {
      const result = await cancelReservation(initial.id!);
      if (result.ok) onSaved();
      else setError(result.error);
    });
  }

  const input = "w-full rounded-lg bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500 disabled:opacity-50";
  const label = "block text-xs text-zinc-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-700 p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold">
          {initial.id ? `Reservation #${initial.id}` : "New reservation"}
          <span className="text-zinc-500 font-normal text-sm ml-2">{nights > 0 ? `${nights} night(s)` : ""}</span>
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Room</label>
            <select disabled={!canEdit} className={input} value={form.roomId} onChange={(e) => setForm({ ...form, roomId: Number(e.target.value) })}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.type.toLowerCase()})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Status</label>
            <select disabled={!canEdit} className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ReservationStatus })}>
              <option value="CONFIRMED">Confirmed</option>
              <option value="STANDBY">Standby (no credits — waits until 7 days before)</option>
              <option value="HOTEL_OVERFLOW">Hotel overflow (sent to partner hotel)</option>
            </select>
          </div>
          <div>
            <label className={label}>Check-in</label>
            <input disabled={!canEdit} type="date" className={input} value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
          </div>
          <div>
            <label className={label}>Check-out</label>
            <input disabled={!canEdit} type="date" className={input} value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={label}>Flyspot client (or leave empty for a public guest)</label>
          <select
            disabled={!canEdit}
            className={input}
            value={form.clientId ?? ""}
            onChange={(e) => setForm({ ...form, clientId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">— public / external guest —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {!isFlyspot && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <label className={label}>Guest name</label>
              <input disabled={!canEdit} className={input} value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
            </div>
            <div>
              <label className={label}>Email</label>
              <input disabled={!canEdit} className={input} value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input disabled={!canEdit} className={input} value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} />
            </div>
          </div>
        )}

        {isFlyspot && (
          <div className="rounded-xl bg-zinc-800/50 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                disabled={!canEdit}
                type="checkbox"
                checked={form.usesCredits}
                onChange={(e) => setForm({ ...form, usesCredits: e.target.checked })}
              />
              Use night credits ({nights > 0 ? nights : "?"} night(s){form.companionCount > 0 && form.companionPayment === "CREDITS" ? ` × ${1 + form.companionCount} people` : ""})
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Companions</label>
                <input
                  disabled={!canEdit}
                  type="number"
                  min={0}
                  max={3}
                  className={input}
                  value={form.companionCount}
                  onChange={(e) => setForm({ ...form, companionCount: Math.max(0, Number(e.target.value)) })}
                />
              </div>
              {form.companionCount > 0 && (
                <div>
                  <label className={label}>Companion pays via</label>
                  <select disabled={!canEdit} className={input} value={form.companionPayment} onChange={(e) => setForm({ ...form, companionPayment: e.target.value as CompanionPayment })}>
                    <option value="CREDITS">Extra night credits</option>
                    <option value="RECEPTION">Pay at reception</option>
                    <option value="ONLINE_LINK">Online payment link</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {form.status === "HOTEL_OVERFLOW" && (
          <div>
            <label className={label}>Partner hotel cost (PLN, paid by Flyspot)</label>
            <input
              disabled={!canEdit}
              type="number"
              min={0}
              step="0.01"
              className={input}
              value={form.hotelOverflowCost ?? ""}
              onChange={(e) => setForm({ ...form, hotelOverflowCost: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        )}

        <div>
          <label className={label}>Notes</label>
          <textarea disabled={!canEdit} rows={2} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {canEdit && (
            <button onClick={submit} disabled={pending} className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">
              {pending ? "…" : "Save"}
            </button>
          )}
          {canEdit && initial.id && (
            <button onClick={cancel} disabled={pending} className="rounded-lg bg-red-900/60 hover:bg-red-800 text-red-200 px-4 py-2 text-sm">
              Cancel reservation
            </button>
          )}
          <button onClick={onClose} className="ml-auto rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
