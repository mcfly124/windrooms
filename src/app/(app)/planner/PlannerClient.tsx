"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { togglePublicDay } from "@/app/actions/planner";
import { addDays, eachDay, todayYmd } from "@/lib/dates";
import type { OverrideState, ReservationSource, RoomType } from "@prisma/client";

type Room = { id: number; name: string; type: RoomType; hasPrice: boolean };
type Res = { roomId: number; checkIn: string; checkOut: string; who: string; source: ReservationSource };
type Override = { roomId: number; date: string; state: OverrideState };

export default function PlannerClient(props: {
  locations: { id: number; name: string; slug: string }[];
  selectedSlug: string;
  releaseWindowDays: number;
  month: string;
  start: string;
  days: number;
  rooms: Room[];
  reservations: Res[];
  overrides: Override[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => eachDay(props.start, props.days), [props.start, props.days]);
  const today = todayYmd();
  const windowEnd = props.releaseWindowDays > 0 ? addDays(today, props.releaseWindowDays) : null;

  const overrideMap = useMemo(() => {
    const m = new Map<string, OverrideState>();
    for (const o of props.overrides) m.set(`${o.roomId}:${o.date}`, o.state);
    return m;
  }, [props.overrides]);

  const resMap = useMemo(() => {
    const m = new Map<string, Res>();
    for (const r of props.reservations) {
      for (const d of eachDay(r.checkIn, Math.max(1, daysBetween(r.checkIn, r.checkOut)))) {
        m.set(`${r.roomId}:${d}`, r);
      }
    }
    return m;
  }, [props.reservations]);

  function daysBetween(a: string, b: string): number {
    return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
  }

  function go(next: { loc?: string; month?: string }) {
    const q = new URLSearchParams({ loc: next.loc ?? props.selectedSlug, month: next.month ?? props.month });
    router.push(`/planner?${q}`);
  }

  function shiftMonth(delta: number) {
    const d = new Date(`${props.month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    go({ month: d.toISOString().slice(0, 7) });
  }

  const monthLabel = new Date(`${props.month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  function toggle(roomId: number, day: string) {
    setError(null);
    startTransition(async () => {
      const result = await togglePublicDay(roomId, day);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Planner</h1>
        <span className="label-mono">Public availability · {monthLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost px-2.5" onClick={() => shiftMonth(-1)}>‹</button>
          <button className="btn-ghost" onClick={() => go({ month: today.slice(0, 7) })}>{monthLabel === new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }) ? "This month" : "Today"}</button>
          <button className="btn-ghost px-2.5" onClick={() => shiftMonth(1)}>›</button>
        </div>
      </div>

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
        <span className="ml-auto text-xs text-mut">
          Default window: <b className="text-ink">{props.releaseWindowDays === 0 ? "always open" : `${props.releaseWindowDays} days`}</b> · click a day to flip it
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="border-collapse w-full min-w-[1100px] text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card z-10 text-left px-3 py-2 border-b border-line w-24">
                <span className="label-mono">Room</span>
              </th>
              {days.map((d) => {
                const date = new Date(`${d}T00:00:00Z`);
                const weekend = [0, 6].includes(date.getUTCDay());
                return (
                  <th
                    key={d}
                    className={`px-0.5 py-1.5 border-b border-l border-line font-normal min-w-8 ${
                      d === today ? "bg-acc-softer" : weekend ? "bg-hovr/60" : ""
                    }`}
                  >
                    <div className={`font-mono ${d === today ? "text-acc font-semibold" : "text-mut"}`}>{d.slice(8)}</div>
                    <div className="font-mono text-[9px] text-faint">
                      {date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {props.rooms.map((room) => (
              <tr key={room.id}>
                <td className="sticky left-0 bg-card z-10 px-3 py-1.5 border-b border-line font-medium whitespace-nowrap">
                  {room.name} <span className="text-faint">{room.type === "DOUBLE" ? "dbl" : "sgl"}</span>
                  {!room.hasPrice && <div className="text-[9px] text-warn font-mono">no price set</div>}
                </td>
                {days.map((d) => {
                  const res = resMap.get(`${room.id}:${d}`);
                  if (res) {
                    return (
                      <td
                        key={d}
                        className={`border-l border-b border-line text-center ${
                          res.source === "PUBLIC" ? "bg-ok-soft" : "bg-acc-soft"
                        }`}
                        title={`Booked · ${res.who} · ${res.checkIn} → ${res.checkOut}`}
                      >
                        <span className={`font-mono text-[9px] ${res.source === "PUBLIC" ? "text-ok" : "text-acc"}`}>●</span>
                      </td>
                    );
                  }
                  const override = overrideMap.get(`${room.id}:${d}`);
                  const defaultOpen = props.releaseWindowDays === 0 || (windowEnd !== null && d <= windowEnd);
                  const open = override ? override === "OPEN" : defaultOpen;
                  const isPast = d < today;
                  return (
                    <td key={d} className="border-l border-b border-line p-0">
                      <button
                        disabled={isPast || pending}
                        onClick={() => toggle(room.id, d)}
                        title={
                          isPast
                            ? d
                            : `${d} · ${open ? "open to public" : "held for Flyspot"}${override ? " (override)" : ""} — click to flip`
                        }
                        className={`w-full h-9 flex items-center justify-center ${
                          isPast
                            ? "opacity-30"
                            : open
                              ? "bg-ok-soft/50 hover:bg-ok-soft"
                              : "hover:bg-hovr"
                        }`}
                      >
                        {!isPast && (
                          <span
                            className={`w-2 h-2 rounded-full ${
                              open ? "bg-ok" : "bg-faint/40"
                            } ${override ? "ring-2 ring-warn" : ""}`}
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="flex flex-wrap gap-4 text-xs text-mut">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ok inline-block" /> open to public</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-faint/40 inline-block" /> held for Flyspot clients</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ok ring-2 ring-warn inline-block" /> manual override</span>
        <span className="flex items-center gap-1.5"><span className="font-mono text-acc">●</span> booked (Flyspot)</span>
        <span className="flex items-center gap-1.5"><span className="font-mono text-ok">●</span> booked (public)</span>
      </div>
    </div>
  );
}
