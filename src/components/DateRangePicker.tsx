"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, eachDay, nightsBetween, todayYmd } from "@/lib/dates";

function mondayOf(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  return addDays(dateYmd, -((d.getUTCDay() + 6) % 7));
}

function addMonths(anchor: string, delta: number): string {
  const d = new Date(`${anchor.slice(0, 8)}01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * One calendar for the whole stay: first click sets check-in, second sets
 * check-out. Values are "YYYY-MM-DD"; checkOut is exclusive (departure day).
 */
export default function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  disabled,
  min,
}: {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  disabled?: boolean;
  min?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState((checkIn || todayYmd()).slice(0, 8) + "01");
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const today = todayYmd();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingStart(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const gridStart = mondayOf(view);
  const days = eachDay(gridStart, 42);
  const month = view.slice(0, 7);
  const monthLabel = new Date(`${view}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const nights = nightsBetween(checkIn, checkOut);

  function pick(d: string) {
    if (pendingStart === null) {
      setPendingStart(d);
    } else if (d > pendingStart) {
      onChange(pendingStart, d);
      setPendingStart(null);
      setOpen(false);
    } else {
      // clicked on/before the pending start — restart the range from here
      setPendingStart(d);
    }
  }

  const rangeStart = pendingStart ?? checkIn;
  const rangeEnd = pendingStart ? null : checkOut;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setView((checkIn || today).slice(0, 8) + "01");
          setPendingStart(null);
          setOpen(!open);
        }}
        className="field text-left font-mono flex items-center justify-between gap-2"
      >
        <span>
          {checkIn} → {checkOut}
          <span className="text-faint ml-1.5">· {nights}n</span>
        </span>
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-faint shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-xl border border-line bg-card shadow-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <button type="button" onClick={() => setView(addMonths(view, -1))} className="px-2 py-0.5 rounded-md hover:bg-hovr text-mut">‹</button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <button type="button" onClick={() => setView(addMonths(view, 1))} className="px-2 py-0.5 rounded-md hover:bg-hovr text-mut">›</button>
          </div>
          <p className="label-mono text-center mb-2">
            {pendingStart ? `check-in ${pendingStart} — now pick check-out` : "pick check-in day"}
          </p>
          <div className="grid grid-cols-7 mb-1">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <div key={d} className="text-center label-mono py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const inMonth = d.startsWith(month);
              const isToday = d === today;
              const isDisabled = min ? d < min : false;
              const isStart = d === rangeStart;
              const isEnd = rangeEnd !== null && d === rangeEnd;
              const inRange = rangeEnd !== null && d > rangeStart && d < rangeEnd;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => pick(d)}
                  className={`h-8 text-xs font-mono ${
                    isStart || isEnd
                      ? `bg-acc text-white font-semibold ${isStart ? "rounded-l-md" : ""} ${isEnd ? "rounded-r-md" : ""}`
                      : inRange
                        ? "bg-acc-soft text-acc"
                        : isDisabled
                          ? "text-faint/50"
                          : inMonth
                            ? `rounded-md hover:bg-hovr ${isToday ? "text-acc font-semibold" : ""}`
                            : "rounded-md text-faint hover:bg-hovr"
                  }`}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
