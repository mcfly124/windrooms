"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCleaningStaff, saveCleaningShift, deleteCleaningShift } from "@/app/actions/admin";

type Staff = { id: number; name: string; phone: string | null; active: boolean };
type Shift = { id: number; date: string; startTime: string; endTime: string; note: string | null; staffName: string; locationName: string };
type Cleaning = { id: number; date: string; room: string; turnover: boolean };

const input = "rounded-lg bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500";
const label = "block text-xs text-zinc-400 mb-1";

export default function CleaningClient({
  locations,
  shifts,
  cleanings,
}: {
  locations: { id: number; name: string; staff: Staff[] }[];
  shifts: Shift[];
  cleanings: Cleaning[];
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 overflow-hidden">
        <h2 className="bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300">
          Cleanings needed (next 14 days — every checkout)
        </h2>
        <table className="w-full text-sm">
          <tbody>
            {cleanings.map((c) => (
              <tr key={c.id} className="border-t border-zinc-800">
                <td className="px-4 py-2 text-zinc-400 whitespace-nowrap w-28">{c.date}</td>
                <td className="px-4 py-2 text-white">{c.room}</td>
                <td className="px-4 py-2 text-right">
                  {c.turnover && (
                    <span className="px-2 py-0.5 rounded text-xs bg-red-900/60 text-red-300">
                      same-day turnover · clean 11:00–15:00
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {cleanings.length === 0 && (
              <tr><td className="px-4 py-6 text-center text-zinc-600">No checkouts in the next 14 days</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Cleaning staff</h2>
          {locations.map((loc) => (
            <StaffBlock key={loc.id} locationId={loc.id} locationName={loc.name} staff={loc.staff} />
          ))}
        </section>

        <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Shifts (next 14 days)</h2>
          <ShiftForm allStaff={locations.flatMap((l) => l.staff.filter((s) => s.active).map((s) => ({ ...s, locationName: l.name })))} />
          <div className="mt-3 space-y-1.5">
            {shifts.map((s) => (
              <ShiftRow key={s.id} shift={s} />
            ))}
            {shifts.length === 0 && <p className="text-sm text-zinc-600">No shifts planned</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function StaffBlock({ locationId, locationName, staff }: { locationId: number; locationName: string; staff: Staff[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const result = await saveCleaningStaff({ locationId, name, phone, active: true });
      if (result.ok) {
        setName("");
        setPhone("");
        router.refresh();
      }
    });
  }

  function toggle(s: Staff) {
    startTransition(async () => {
      await saveCleaningStaff({ id: s.id, locationId, name: s.name, phone: s.phone ?? undefined, active: !s.active });
      router.refresh();
    });
  }

  return (
    <div className="mb-4">
      <div className="text-xs text-zinc-500 mb-1.5">{locationName}</div>
      <div className="flex flex-wrap items-center gap-2">
        {staff.map((s) => (
          <button
            key={s.id}
            onClick={() => toggle(s)}
            title={s.phone ?? ""}
            className={`px-2.5 py-1 rounded-lg text-xs border ${
              s.active ? "bg-zinc-800 border-zinc-600 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-600 line-through"
            }`}
          >
            {s.name}
          </button>
        ))}
        <input placeholder="Name" className={`${input} w-24`} value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Phone" className={`${input} w-28`} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button onClick={add} disabled={pending || !name.trim()} className="rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-3 py-1.5 text-xs">
          Add
        </button>
      </div>
    </div>
  );
}

function ShiftForm({ allStaff }: { allStaff: (Staff & { locationName: string })[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ staffId: "", date: "", startTime: "10:00", endTime: "15:00", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await saveCleaningShift({
        staffId: Number(form.staffId),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        note: form.note,
      });
      if (result.ok) {
        setForm({ ...form, note: "" });
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className={label}>Staff</label>
        <select className={input} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
          <option value="">—</option>
          {allStaff.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.locationName})</option>
          ))}
        </select>
      </div>
      <div><label className={label}>Date</label><input type="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
      <div><label className={label}>From</label><input type="time" className={input} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
      <div><label className={label}>To</label><input type="time" className={input} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
      <button onClick={add} disabled={pending || !form.staffId || !form.date} className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-3 py-1.5 text-sm">
        Plan
      </button>
      {error && <p className="text-sm text-red-400 w-full">{error}</p>}
    </div>
  );
}

function ShiftRow({ shift }: { shift: Shift }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function remove() {
    startTransition(async () => {
      await deleteCleaningShift(shift.id);
      router.refresh();
    });
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-800/60 px-3 py-1.5 text-sm">
      <span className="text-zinc-400 w-24">{shift.date}</span>
      <span className="text-white">{shift.staffName}</span>
      <span className="text-zinc-500 text-xs">{shift.locationName}</span>
      <span className="text-zinc-400 text-xs ml-auto">{shift.startTime}–{shift.endTime}</span>
      <button onClick={remove} disabled={pending} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
    </div>
  );
}
