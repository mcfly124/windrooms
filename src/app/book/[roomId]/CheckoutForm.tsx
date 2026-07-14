"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPublicBooking } from "@/app/actions/public";

export default function CheckoutForm({
  roomId,
  checkIn,
  checkOut,
  totalLabel,
}: {
  roomId: number;
  checkIn: string;
  checkOut: string;
  totalLabel: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "", card: "", exp: "", cvc: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = "block label-mono mb-1";

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createPublicBooking({
        roomId,
        checkIn,
        checkOut,
        guestName: form.name,
        guestEmail: form.email,
        guestPhone: form.phone,
        notes: form.notes,
      });
      if (result.ok) router.push(`/book/confirmed?id=${result.id}&sig=${result.sig}`);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
        <h2 className="text-sm font-medium">Your details</h2>
        <div>
          <label className={label}>Full name</label>
          <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Email</label>
            <input type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className={label}>Phone (optional)</label>
            <input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label}>Anything we should know? (optional)</label>
          <textarea rows={2} className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Payment</h2>
          <span className="rounded-full bg-warn-soft text-warn label-mono px-2.5 py-1">Demo mode — no charge</span>
        </div>
        <div>
          <label className={label}>Card number</label>
          <input className="field font-mono" placeholder="4242 4242 4242 4242" value={form.card} onChange={(e) => setForm({ ...form, card: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Expiry</label>
            <input className="field font-mono" placeholder="MM/YY" value={form.exp} onChange={(e) => setForm({ ...form, exp: e.target.value })} />
          </div>
          <div>
            <label className={label}>CVC</label>
            <input className="field font-mono" placeholder="123" value={form.cvc} onChange={(e) => setForm({ ...form, cvc: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-faint">
          This is a demonstration checkout — no real payment is processed. Live card payments (Stripe, BLIK) arrive
          before public launch.
        </p>
      </div>

      {error && <p className="text-sm text-bad text-center">{error}</p>}

      <button onClick={submit} disabled={pending || !form.name || !form.email} className="btn-primary w-full py-3 text-base">
        {pending ? "Confirming…" : `Pay ${totalLabel} & confirm`}
      </button>
    </div>
  );
}
