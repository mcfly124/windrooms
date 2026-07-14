"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, eachDay, todayYmd } from "@/lib/dates";

function mondayOf(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  return addDays(dateYmd, -((d.getUTCDay() + 6) % 7));
}

function addMonths(anchor: string, delta: number): string {
  const d = new Date(`${anchor.slice(0, 8)}01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

/** In-house date picker styled like the rest of the app. Value is "YYYY-MM-DD". */
export default function DatePicker({
  value,
  onChange,
  disabled,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  min?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState((value || todayYmd()).slice(0, 8) + "01");
  const ref = useRef<HTMLDivElement>(null);
  const today = todayYmd();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setView((value || today).slice(0, 8) + "01");
          setOpen(!open);
        }}
        className="field text-left font-mono flex items-center justify-between gap-2"
      >
        {value || "—"}
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-faint shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl border border-line bg-card shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setView(addMonths(view, -1))} className="px-2 py-0.5 rounded-md hover:bg-hovr text-mut">‹</button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <button type="button" onClick={() => setView(addMonths(view, 1))} className="px-2 py-0.5 rounded-md hover:bg-hovr text-mut">›</button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <div key={d} className="text-center label-mono py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const inMonth = d.startsWith(month);
              const isSel = d === value;
              const isToday = d === today;
              const isDisabled = min ? d < min : false;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={`h-8 rounded-md text-xs font-mono ${
                    isSel
                      ? "bg-acc text-white font-semibold"
                      : isDisabled
                        ? "text-faint/50"
                        : inMonth
                          ? `hover:bg-hovr ${isToday ? "text-acc font-semibold" : ""}`
                          : "text-faint hover:bg-hovr"
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
