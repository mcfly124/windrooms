"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReservation, cancelReservation, findAlternatives, saveSplitStay, type Alternatives, type ReservationInput } from "@/app/actions/reservations";
import { addDays, eachDay, nightsBetween, todayYmd } from "@/lib/dates";
import { bookingRef } from "@/lib/ref";
import DateRangePicker from "@/components/DateRangePicker";
import TimeSelect from "@/components/TimeSelect";
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
  checkInTime: string;
  checkOutTime: string;
  status: ReservationStatus;
  source: ReservationSource;
  usesCredits: boolean;
  companionCount: number;
  companionPayment: CompanionPayment | null;
  hotelOverflowCost: number | null;
  overflowHotel: string | null;
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start">
          <div className="flex-1 min-w-0">
            <MonthGrid
              days={days}
              anchor={props.anchor}
              today={today}
              selectedDay={selectedDay}
              reservations={props.reservations}
              canEdit={props.canEdit}
              rooms={props.rooms}
              onSelectDay={(day) => setSelectedDay(selectedDay === day ? null : day)}
              onOpen={(r) => setEditing({ ...r })}
            />
          </div>
          {selectedDay && (
            <DayPanel
              day={selectedDay}
              today={today}
              rooms={props.rooms}
              reservations={props.reservations}
              canEdit={props.canEdit}
              onClose={() => setSelectedDay(null)}
              onOpen={(r) => setEditing({ ...r })}
              onNew={(roomId) => setEditing({ roomId, checkIn: selectedDay, checkOut: addDays(selectedDay, 1) })}
            />
          )}
        </div>
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
          locationId={props.locations.find((l) => l.slug === props.selectedSlug)?.id ?? 0}
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
  selectedDay,
  reservations,
  rooms,
  canEdit,
  onSelectDay,
  onOpen,
}: {
  days: string[];
  anchor: string;
  today: string;
  selectedDay: string | null;
  reservations: Res[];
  rooms: Room[];
  canEdit: boolean;
  onSelectDay: (day: string) => void;
  onOpen: (r: Res) => void;
}) {
  void rooms;
  const month = anchor.slice(0, 7);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="rounded-2xl border border-line bg-card overflow-x-auto">
      <div className="min-w-[640px]">
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
                onClick={() => onSelectDay(day)}
                className={`min-h-28 border-l border-line first:border-l-0 p-1.5 cursor-pointer ${
                  day === selectedDay
                    ? "ring-2 ring-acc ring-inset bg-acc-softer/60"
                    : isToday
                      ? "bg-acc-softer"
                      : inMonth
                        ? "hover:bg-hovr/70"
                        : "bg-hovr/50 hover:bg-hovr/70"
                }`}
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

/** The code the guest quotes on the phone or in /book/manage. Click to copy. */
function RefBadge({ id }: { id: number }) {
  const [copied, setCopied] = useState(false);
  const ref = bookingRef(id);
  return (
    <button
      type="button"
      title="Confirmation code — click to copy"
      onClick={() => {
        navigator.clipboard?.writeText(ref).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => {}
        );
      }}
      className="font-mono text-xs px-2 py-1 rounded-lg bg-acc-softer text-acc hover:bg-acc-soft"
    >
      {copied ? "copied" : ref}
    </button>
  );
}

function ReservationModal({
  initial,
  locationId,
  rooms,
  clients,
  canEdit,
  onClose,
  onSaved,
}: {
  initial: Partial<Res> & { roomId?: number };
  locationId: number;
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
    checkInTime: initial.checkInTime ?? "15:00",
    checkOutTime: initial.checkOutTime ?? "11:00",
    status: (initial.status ?? "CONFIRMED") as ReservationStatus,
    usesCredits: initial.usesCredits ?? true,
    companionCount: initial.companionCount ?? 0,
    companionPayment: (initial.companionPayment ?? "RECEPTION") as CompanionPayment,
    hotelOverflowCost: initial.hotelOverflowCost ?? null,
    overflowHotel: initial.overflowHotel ?? "",
    notes: initial.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [alts, setAlts] = useState<Alternatives | null>(null);
  const [splitHotel, setSplitHotel] = useState("Arche");
  const [pending, startTransition] = useTransition();
  const nights = nightsBetween(form.checkIn, form.checkOut);
  const isFlyspot = form.clientId !== null;

  function submit(roomOverride?: number) {
    setError(null);
    setAlts(null);
    const input: ReservationInput = {
      id: initial.id,
      roomId: roomOverride ?? form.roomId,
      clientId: form.clientId,
      guestName: form.guestName,
      guestEmail: form.guestEmail,
      guestPhone: form.guestPhone,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      checkInTime: form.checkInTime,
      checkOutTime: form.checkOutTime,
      status: form.status,
      source: isFlyspot ? "FLYSPOT" : "PUBLIC",
      usesCredits: isFlyspot && form.usesCredits,
      companionCount: form.companionCount,
      companionPayment: form.companionCount > 0 ? form.companionPayment : null,
      hotelOverflowCost: form.hotelOverflowCost,
      overflowHotel: form.overflowHotel || null,
      notes: form.notes,
    };
    startTransition(async () => {
      const result = await saveReservation(input);
      if (result.ok) onSaved();
      else {
        setError(result.error);
        if (result.conflict) {
          setAlts(await findAlternatives(locationId, form.checkIn, form.checkOut));
        }
      }
    });
  }

  function acceptSplit() {
    if (!alts?.split || !form.clientId) return;
    setError(null);
    startTransition(async () => {
      const result = await saveSplitStay({
        clientId: form.clientId!,
        roomId: alts.split!.roomId,
        splitDate: alts.split!.date,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
        usesCredits: form.usesCredits,
        overflowHotel: splitHotel,
        notes: form.notes,
      });
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
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="font-semibold">
            {initial.id ? `Reservation #${initial.id}` : "New reservation"}
            <span className="text-faint font-normal text-sm ml-2">{nights > 0 ? `${nights} night(s)` : ""}</span>
          </h2>
          {initial.id && <RefBadge id={initial.id} />}
        </div>

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
          <div className="col-span-2">
            <label className={label}>Stay · check-in → check-out</label>
            <DateRangePicker
              disabled={!canEdit}
              checkIn={form.checkIn}
              checkOut={form.checkOut}
              onChange={(ci, co) => setForm({ ...form, checkIn: ci, checkOut: co })}
            />
          </div>
          <div>
            <label className={label}>Arrival time</label>
            <TimeSelect disabled={!canEdit} value={form.checkInTime} onChange={(v) => setForm({ ...form, checkInTime: v })} />
          </div>
          <div>
            <label className={label}>Departure time</label>
            <TimeSelect disabled={!canEdit} value={form.checkOutTime} onChange={(v) => setForm({ ...form, checkOutTime: v })} />
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
              <label className={label}>Guest name *</label>
              <input disabled={!canEdit} className="field" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
            </div>
            <div>
              <label className={label}>Email * (adds them to clients)</label>
              <input disabled={!canEdit} type="email" className="field" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} />
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
          <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Partner hotel</label>
            <select disabled={!canEdit} className="field" value={form.overflowHotel || "Arche"} onChange={(e) => setForm({ ...form, overflowHotel: e.target.value })}>
              <option value="Arche">Arche</option>
              <option value="Hilton">Hilton</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className={label}>Hotel cost (PLN, paid by Flyspot)</label>
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
          </div>
        )}

        <div>
          <label className={label}>Notes</label>
          <textarea disabled={!canEdit} rows={2} className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}

        {alts && (
          <div className="rounded-xl border border-warn bg-warn-soft/30 p-3 space-y-2">
            {alts.freeRooms.length > 0 ? (
              <>
                <div className="label-mono">Free rooms for these dates — book one instead:</div>
                <div className="flex flex-wrap gap-1.5">
                  {alts.freeRooms.map((r) => (
                    <button
                      key={r.id}
                      disabled={pending}
                      onClick={() => {
                        setForm({ ...form, roomId: r.id });
                        submit(r.id);
                      }}
                      className="rounded-lg border border-line bg-card px-2.5 py-1 text-xs hover:bg-hovr"
                    >
                      → {r.name} ({r.type.toLowerCase()})
                    </button>
                  ))}
                </div>
              </>
            ) : alts.split && form.clientId ? (
              <>
                <div className="label-mono">All rooms full at the start — split the stay:</div>
                <p className="text-sm">
                  Partner hotel {form.checkIn} → {alts.split.date}, then room <b>{alts.split.roomName}</b>{" "}
                  {alts.split.date} → {form.checkOut}.
                </p>
                <div className="flex items-center gap-2">
                  <select className="field w-auto" value={splitHotel} onChange={(e) => setSplitHotel(e.target.value)}>
                    <option value="Arche">Arche</option>
                    <option value="Hilton">Hilton</option>
                    <option value="Other">Other</option>
                  </select>
                  <button onClick={acceptSplit} disabled={pending} className="btn-primary text-xs">
                    Book split stay
                  </button>
                </div>
                <p className="text-xs text-mut">Book the hotel room at {splitHotel} separately — this records both segments here.</p>
              </>
            ) : (
              <p className="text-sm">
                No room is free for any part of these dates — book a partner hotel (Arche / Hilton) for the whole
                stay and record it as a Hotel overflow reservation.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {canEdit && (
            <button onClick={() => submit()} disabled={pending} className="btn-primary">
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


function DayPanel({
  day,
  today,
  rooms,
  reservations,
  canEdit,
  onClose,
  onOpen,
  onNew,
}: {
  day: string;
  today: string;
  rooms: Room[];
  reservations: Res[];
  canEdit: boolean;
  onClose: () => void;
  onOpen: (r: Res) => void;
  onNew: (roomId: number) => void;
}) {
  const dayRes = reservations
    .filter((r) => r.checkIn <= day && r.checkOut > day)
    .sort((a, b) => a.roomName.localeCompare(b.roomName));
  const busyRooms = new Set(dayRes.filter((r) => r.status === "CONFIRMED").map((r) => r.roomId));
  const freeRooms = rooms.filter((r) => !busyRooms.has(r.id));
  const dateLabel = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <aside className="w-full lg:w-72 shrink-0 rounded-2xl border border-line bg-card p-4 space-y-3 lg:sticky lg:top-20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label-mono">{day}</div>
          <h3 className="font-semibold text-sm">{dateLabel}</h3>
        </div>
        <button onClick={onClose} className="text-faint hover:text-ink text-sm">✕</button>
      </div>

      <div className="space-y-1.5">
        {dayRes.map((r) => (
          <button
            key={r.id}
            onClick={() => onOpen(r)}
            className="w-full text-left rounded-xl border border-line hover:bg-hovr p-2.5"
          >
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${CHIP[r.status]}`}>{r.roomName}</span>
              <span className="text-sm font-medium truncate">{r.clientName ?? r.guestName ?? "?"}</span>
              {r.source === "PUBLIC" && <span className="label-mono ml-auto">public</span>}
            </div>
            <div className="text-xs text-mut font-mono mt-1">
              {r.checkIn} → {r.checkOut}
              {r.checkIn === day && ` · arr ${r.checkInTime}`}
              {r.checkOut === addDays(day, 1) && ` · dep ${r.checkOutTime}`}
            </div>
          </button>
        ))}
        {dayRes.length === 0 && <p className="text-sm text-faint font-mono py-2">No reservations this night</p>}
      </div>

      <div className="border-t border-line pt-3 space-y-1.5">
        <div className="label-mono">Free rooms · {freeRooms.length}</div>
        <div className="flex flex-wrap gap-1.5">
          {freeRooms.map((r) => (
            <button
              key={r.id}
              disabled={!canEdit || day < today}
              onClick={() => onNew(r.id)}
              title={canEdit && day >= today ? `Book ${r.name} from ${day}` : r.name}
              className="rounded-lg border border-line px-2 py-1 text-xs hover:bg-hovr disabled:opacity-50"
            >
              + {r.name}
            </button>
          ))}
          {freeRooms.length === 0 && <span className="text-xs text-faint font-mono">fully booked</span>}
        </div>
      </div>
    </aside>
  );
}
