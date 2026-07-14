"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DatePicker from "@/components/DatePicker";
import { changePublicBookingDates, cancelPublicBooking } from "@/app/actions/public";
import { addDays, nightsBetween, todayYmd } from "@/lib/dates";

export default function ManageClient(props: {
  id: number;
  sig: string;
  reference: string;
  status: string;
  roomName: string;
  locationName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  nightlyLabel: string | null;
  nightlyPln: number | null;
  paidLabel: string;
  paidPln: number;
  changeable: boolean;
}) {
  const router = useRouter();
  const [inDate, setInDate] = useState(props.checkIn);
  const [outDate, setOutDate] = useState(props.checkOut);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string; link?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const today = todayYmd();

  const nights = nightsBetween(inDate, outDate);
  const newTotal = props.nightlyPln !== null ? nights * props.nightlyPln : null;
  const delta = newTotal !== null ? newTotal - props.paidPln : null;
  const datesChanged = inDate !== props.checkIn || outDate !== props.checkOut;

  function change() {
    setMessage(null);
    startTransition(async () => {
      const result = await changePublicBookingDates({ id: props.id, sig: props.sig, checkIn: inDate, checkOut: outDate });
      if (result.ok) {
        setMessage({
          kind: "ok",
          text: result.extraPayLink
            ? "Dates changed! Please pay the difference:"
            : result.refundDue
              ? `Dates changed! We'll refund ${result.refundDue.toLocaleString("pl-PL")} zł within a few days.`
              : "Dates changed!",
          link: result.extraPayLink,
        });
        router.refresh();
      } else setMessage({ kind: "err", text: result.error });
    });
  }

  function cancel() {
    if (!confirm("Cancel this booking? This cannot be undone.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await cancelPublicBooking(props.id, props.sig);
      if (result.ok) {
        setMessage({ kind: "ok", text: "Your booking is cancelled. If a refund is due, we'll process it within a few days." });
        router.refresh();
      } else setMessage({ kind: "err", text: result.error });
    });
  }

  return (
    <div className="max-w-md mx-auto space-y-4 py-4">
      <div className="text-center">
        <div className="label-mono">Booking</div>
        <h1 className="text-2xl font-mono font-semibold text-acc">{props.reference}</h1>
        <p className="text-sm text-mut mt-1">{props.guestName}</p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
        <RowKV k="Status" v={props.status === "CONFIRMED" ? "Confirmed ✓" : props.status.toLowerCase()} />
        <RowKV k="Room" v={`${props.roomName} · Flyspot ${props.locationName}`} />
        <RowKV k="Check-in" v={`${props.checkIn} · from ${props.checkInTime}`} />
        <RowKV k="Check-out" v={`${props.checkOut} · by ${props.checkOutTime}`} />
        <RowKV k="Paid" v={props.paidLabel} />
      </div>

      {props.changeable ? (
        <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
          <h2 className="text-sm font-medium">Change dates</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block label-mono mb-1">Check-in</label>
              <DatePicker value={inDate} min={addDays(today, 1)} onChange={(v) => { setInDate(v); if (outDate <= v) setOutDate(addDays(v, 1)); }} />
            </div>
            <div>
              <label className="block label-mono mb-1">Check-out</label>
              <DatePicker value={outDate} min={addDays(inDate, 1)} onChange={setOutDate} />
            </div>
          </div>
          {datesChanged && delta !== null && (
            <p className="text-sm text-mut">
              New total: {nights} night(s)
              {delta > 0 && <> — you&apos;ll be asked to pay <b className="text-ink">{delta.toLocaleString("pl-PL")} zł</b> extra.</>}
              {delta < 0 && <> — we&apos;ll refund <b className="text-ink">{(-delta).toLocaleString("pl-PL")} zł</b>.</>}
              {delta === 0 && <> — same price.</>}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={change} disabled={pending || !datesChanged} className="btn-primary">
              {pending ? "…" : "Save new dates"}
            </button>
            <button onClick={cancel} disabled={pending} className="ml-auto rounded-lg bg-bad-soft text-bad px-4 py-2 text-sm">
              Cancel booking
            </button>
          </div>
        </div>
      ) : (
        props.status === "CONFIRMED" && (
          <p className="text-center text-sm text-mut">
            This stay has already started — contact Flyspot directly for changes.
          </p>
        )
      )}

      {message && (
        <div className={`rounded-xl p-3 text-sm text-center ${message.kind === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
          {message.text}
          {message.link && (
            <a href={message.link} className="block underline font-medium mt-1">Open payment page</a>
          )}
        </div>
      )}

      <div className="text-center">
        <Link href="/book" className="text-sm text-mut hover:text-ink">← Flyspot Rooms</Link>
      </div>
    </div>
  );
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="label-mono">{k}</span>
      <span className="font-mono text-sm text-right">{v}</span>
    </div>
  );
}
