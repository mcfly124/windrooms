"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DatePicker from "@/components/DatePicker";
import { addDays, todayYmd } from "@/lib/dates";

export default function SearchForm({ checkIn, checkOut }: { checkIn: string; checkOut: string }) {
  const router = useRouter();
  const [inDate, setInDate] = useState(checkIn);
  const [outDate, setOutDate] = useState(checkOut);
  const today = todayYmd();

  return (
    <div className="rounded-2xl border border-line bg-card p-4 flex flex-wrap items-end gap-3 justify-center">
      <div className="w-40">
        <label className="block label-mono mb-1">Check-in · 15:00</label>
        <DatePicker
          value={inDate}
          min={today}
          onChange={(v) => {
            setInDate(v);
            if (outDate <= v) setOutDate(addDays(v, 1));
          }}
        />
      </div>
      <div className="w-40">
        <label className="block label-mono mb-1">Check-out · 11:00</label>
        <DatePicker value={outDate} min={addDays(inDate, 1)} onChange={setOutDate} />
      </div>
      <button
        onClick={() => router.push(`/book?in=${inDate}&out=${outDate}`)}
        className="btn-primary px-6 py-2"
      >
        Check availability
      </button>
    </div>
  );
}
