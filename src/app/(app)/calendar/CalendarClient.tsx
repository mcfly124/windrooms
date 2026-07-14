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
  roomName: string;
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

const CHIP: Record<ReservationStatus, string> = {
  CONFIRMED: "bg-acc-soft text-acc dark:text-acc-strong",
  STANDBY: "bg-warn-soft text-warn",
  HOTEL_OVERFLOW: "bg-purp-soft text-purp",
  CANCELLED: "bg-hovr text-faint",
};

function addMonths(anchor: string, delta: number): string {
  const d = new Date(`${anchor.slice(0, 8)}01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

export default function CalendarClient(props: {
  locations: Loc[];
  selectedSlug: string;
  view: "month" | "week";
  anchor: string;
  rangeStart: string;
  rangeDays: number;
  rooms: Room[];
  reservations: Res[];
  clients: { id: number; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const days = useMemo(() => eachDay(props.rangeStart, props.rangeDays), [props.rangeStart, props.rangeDays]);
  const today = todayYmd();
  const [editing, setEditing] = useState<(Partial<Res> & { roomId?: number }) | null>(null);

  function go(next: { loc?: string; view?: string; anchor?: string }) {
    const q = new URLSearchParams({
      loc: next.loc ?? props.selectedSlug,
      view: next.view ?? props.view,
      anchor: next.anchor ?? props.anchor,
    });
    router.push(`/calendar?${q}`);
  }

  const monthLabel = new Date(`${props.anchor.slice(0, 8)}01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const weekLabel = `${days[0]} → ${days[days.length - 1]}`;

  const seg = (active: boolean) =>
    `px-3 py-1 rounded-md text-xs font-mono uppercase tracking-wider ${
      active ? "bg-acc text-white" : "text-mut hover:text-ink"
    }`;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <span className="label-mono">
          {props.view === "month" ? monthLabel : weekLabel} · {props.view}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
            <button className={seg(props.view === "month")} onClick={() => go({ view: "month" })}>Month</button>
            <button className={seg(props.view === "week")} onClick={() => go({ view: "week" })}>Week</button>
          </div>
          <button
            className="btn-ghost px-2.5"
            onClick={() =>
              go({ anchor: props.view === "month" ? addMonths(props.anchor, -1) : addDays(props.anchor, -7) })
            }
          >
            ‹
          </button>
          <button className="btn-ghost" onClick={() => go({ anchor: today })}>Today</button>
          <button
            className="btn-ghost px-2.5"
            onClick={() =>
              go({ anchor: props.view === "month" ? addMonths(props.anchor, 1) : addDays(props.anchor, 7) })
            }
          >
            ›
          </button>
        </div>
      </div>

      {/* Location pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono mr-1">Location</span>
        {props.locations.map((l) => (
          <button
            key={l.id}
            onClick={() => go({ loc: l.slug })}
            className={`px-3.5 py-1.5 rounded-full text-sm border ${
              l.slug === props.selectedSlug
                ? "bg-acc text-white border-acc"
                : "bg-card text-mut border-line hover:bg-hovr hover:text-ink"
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      {props.rooms.length === 0 ? (
        <p className="text-mut text-sm">
          This location has no rooms yet{props.canEdit ? " — add them under Locations." : "."}
        </p>
      ) : props.view === "month" ? (
        <MonthGrid
          days={days}
          anchor={props.anchor}
          today={today}
          reservations={props.reservations}
          canEdit={props.canEdit}
          rooms={props.rooms}
          onNew={(day) => setEditing({ roomId: props.rooms[0]?.id, checkIn: day, checkOut: addDays(day, 1) })}
          onOpen={(r) => setEditing({ ...r })}
        />
      ) : (
        <WeekGrid
          days={days}
          today={today}
          rooms={props.rooms}
          reservations={props.reservations}
          canEdit={props.canEdit}
          onNew={(roomId, day) => setEditing({ roomId, checkIn: day, checkOut: addDays(day, 1) })}
          onOpen={(r) => setEditing({ ...r })}
        />
      )}

      <div className="flex flex-wrap gap-4 text-xs text-mut">
        <Legend className="bg-acc-soft" label="Confirmed" />
        <Legend className="bg-warn-soft" label="Standby" />
        <Legend className="bg-purp-soft" label="Hotel overflow" />
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

function MonthGrid({
  days,
  anchor,
  today,
  reservations,
  rooms,
  canEdit,
  onNew,
  onOpen,
}: {
  days: string[];
  anchor: string;
  today: string;
  reservations: Res[];
  rooms: Room[];
  canEdit: boolean;
  onNew: (day: string) => void;
  onOpen: (r: Res) => void;
}) {
  void rooms;
  const month = anchor.slice(0, 7);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="rounded-2xl border border-line bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="label-mono px-3 py-2.5">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className={`grid grid-cols-7 ${wi > 0 ? "border-t border-line" : ""}`}>
          {week.map((day) => {
            const inMonth = day.startsWith(month);
            const isToday = day === today;
            const dayRes = reservations
              .filter((r) => r.checkIn <= day && r.checkOut > day)
              .sort((a, b) => a.roomName.localeCompare(b.roomName));
            return (
              <div
                key={day}
                onClick={() => canEdit && day >= today && onNew(day)}
                className={`min-h-28 border-l border-line first:border-l-0 p-1.5 ${
                  isToday ? "bg-acc-softer" : inMonth ? "" : "bg-hovr/50"
                } ${canEdit && day >= today ? "cursor-pointer hover:bg-hovr/70" : ""}`}
              >
                <div className={`font-mono text-xs mb-1 px-1 ${isToday ? "text-acc font-semibold" : inMonth ? "text-ink" : "text-faint"}`}>
                  {day.slice(8)}
                </div>
                <div className="space-y-0.5">
                  {dayRes.slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r);
                      }}
                      className={`w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] ${CHIP[r.status]}`}
                      title={`${r.roomName} · ${r.clientName ?? r.guestName ?? ""} · ${r.checkIn} → ${r.checkOut}`}
                    >
                      {r.checkIn === day ? "▸ " : ""}{r.roomName} {r.clientName ?? r.guestName ?? "?"}
                    </button>
                  ))}
                  {dayRes.length > 4 && <div className="font-mono text-[11px] text-faint px-1">+{dayRes.length - 4}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WeekGrid({
  days,
  today,
  rooms,
  reservations,
  canEdit,
  onNew,
  onOpen,
}: {
  days: string[];
  today: string;
  rooms: Room[];
  reservations: Res[];
  canEdit: boolean;
  onNew: (roomId: number, day: string) => void;
  onOpen: (r: Res) => void;
}) {
  const byRoom = useMemo(() => {
    const map = new Map<number, Res[]>();
    for (const r of reservations) {
      if (!map.has(r.roomId)) map.set(r.roomId, []);
      map.get(r.roomId)!.push(r);
    }
    return map;
  }, [reservations]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-card">
      <table className="border-collapse w-full min-w-[760px] text-sm">
        <thead>
          <tr>
            <th className="text-left px-4 py-2.5 border-b border-line w-28"><span className="label-mono">Room</span></th>
            {days.map((d) => {
              const date = new Date(`${d}T00:00:00Z`);
              return (
                <th key={d} className={`px-2 py-2 border-b border-l border-line ${d === today ? "bg-acc-softer" : ""}`}>
                  <div className={`font-mono text-xs ${d === today ? "text-acc font-semibold" : "text-mut"}`}>
                    {date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).toUpperCase()} {d.slice(8)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => {
            const resList = byRoom.get(room.id) ?? [];
            const cells: React.ReactNode[] = [];
            let i = 0;
            while (i < days.length) {
              const d = days[i];
              const res = resList.find((r) => r.checkIn <= d && r.checkOut > d);
              if (res) {
                const endIdx = days.indexOf(res.checkOut);
                const span = Math.max(1, (endIdx === -1 ? days.length : endIdx) - i);
                cells.push(
                  <td key={d} colSpan={span} className="border-l border-b border-line p-1 align-middle">
                    <button
                      onClick={() => onOpen(res)}
                      className={`w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-xs ${CHIP[res.status]}`}
                      title={`${res.clientName ?? res.guestName ?? ""} · ${res.checkIn} → ${res.checkOut} · ${res.status}`}
                    >
                      {res.clientName ?? res.guestName ?? "?"}
                    </button>
                  </td>
                );
                i += span;
              } else {
                cells.push(
                  <td key={d} className={`border-l border-b border-line ${d === today ? "bg-acc-softer/50" : ""}`}>
                    {canEdit && d >= today && (
                      <button onClick={() => onNew(room.id, d)} className="w-full h-10 hover:bg-hovr" title={`New reservation ${room.name} ${d}`} />
                    )}
                  </td>
                );
                i += 1;
              }
            }
            return (
              <tr key={room.id}>
                <td className="px-4 py-2 border-b border-line font-medium whitespace-nowrap">
                  {room.name} <span className="text-faint text-xs">{room.type === "DOUBLE" ? "dbl" : "sgl"}</span>
                </td>
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>
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
  initial: Partial<Res> & { roomId?: number };
  rooms: Room[];
  clients: { id: number; name: string }[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    roomId: initial.roomId ?? rooms[0]?.id ?? 0,
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

  const label = "block label-mono mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-card border border-line shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold">
          {initial.id ? `Reservation #${initial.id}` : "New reservation"}
          <span className="text-faint font-normal text-sm ml-2">{nights > 0 ? `${nights} night(s)` : ""}</span>
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Room</label>
            <select disabled={!canEdit} className="field" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: Number(e.target.value) })}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.type.toLowerCase()})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Status</label>
            <select disabled={!canEdit} className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ReservationStatus })}>
              <option value="CONFIRMED">Confirmed</option>
              <option value="STANDBY">Standby (waits until 7 days before)</option>
              <option value="HOTEL_OVERFLOW">Hotel overflow (partner hotel)</option>
            </select>
          </div>
          <div>
            <label className={label}>Check-in</label>
            <input disabled={!canEdit} type="date" className="field" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
          </div>
          <div>
            <label className={label}>Check-out</label>
            <input disabled={!canEdit} type="date" className="field" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={label}>Flyspot client (or leave empty for a public guest)</label>
          <select
            disabled={!canEdit}
            className="field"
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
              <input disabled={!canEdit} className="field" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
            </div>
            <div>
              <label className={label}>Email</label>
              <input disabled={!canEdit} className="field" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input disabled={!canEdit} className="field" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} />
            </div>
          </div>
        )}

        {isFlyspot && (
          <div className="rounded-xl bg-hovr p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                disabled={!canEdit}
                type="checkbox"
                checked={form.usesCredits}
                onChange={(e) => setForm({ ...form, usesCredits: e.target.checked })}
              />
              Use night credits ({nights > 0 ? nights : "?"} night(s)
              {form.companionCount > 0 && form.companionPayment === "CREDITS" ? ` × ${1 + form.companionCount} people` : ""})
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Companions</label>
                <input
                  disabled={!canEdit}
                  type="number"
                  min={0}
                  max={3}
                  className="field"
                  value={form.companionCount}
                  onChange={(e) => setForm({ ...form, companionCount: Math.max(0, Number(e.target.value)) })}
                />
              </div>
              {form.companionCount > 0 && (
                <div>
                  <label className={label}>Companion pays via</label>
                  <select disabled={!canEdit} className="field" value={form.companionPayment} onChange={(e) => setForm({ ...form, companionPayment: e.target.value as CompanionPayment })}>
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
              className="field"
              value={form.hotelOverflowCost ?? ""}
              onChange={(e) => setForm({ ...form, hotelOverflowCost: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        )}

        <div>
          <label className={label}>Notes</label>
          <textarea disabled={!canEdit} rows={2} className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {canEdit && (
            <button onClick={submit} disabled={pending} className="btn-primary">
              {pending ? "…" : "Save"}
            </button>
          )}
          {canEdit && initial.id && (
            <button onClick={cancel} disabled={pending} className="rounded-lg bg-bad-soft text-bad px-4 py-2 text-sm">
              Cancel reservation
            </button>
          )}
          <button onClick={onClose} className="btn-ghost ml-auto">Close</button>
        </div>
      </div>
    </div>
  );
}
