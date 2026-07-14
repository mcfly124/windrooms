"use client";

import { useState, useTransition } from "react";
import { payDemoLink } from "@/app/actions/paylink";

export default function PayClient({
  paymentId,
  sig,
  amountLabel,
  summary,
  alreadyPaid,
  cancelled,
}: {
  paymentId: number;
  sig: string;
  amountLabel: string;
  summary: string[];
  alreadyPaid: boolean;
  cancelled: boolean;
}) {
  const [form, setForm] = useState({ card: "", exp: "", cvc: "" });
  const [done, setDone] = useState(alreadyPaid);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = "block label-mono mb-1";

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await payDemoLink(paymentId, sig);
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  }

  if (cancelled) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-center text-mut">
        This payment link is no longer active.
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-full bg-ok-soft text-ok flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h1 className="font-semibold">Payment received — thank you!</h1>
        <p className="text-sm text-mut">Flyspot has been notified. See you at the tunnel.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-6 space-y-4">
      <div className="text-center space-y-1">
        <div className="label-mono">Amount due</div>
        <div className="text-3xl font-mono font-semibold">{amountLabel}</div>
      </div>
      <div className="rounded-xl bg-hovr p-3 text-sm text-mut space-y-0.5">
        {summary.map((line, i) => (
          <div key={i} className={i === 0 ? "text-ink font-medium" : ""}>{line}</div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Card payment</span>
        <span className="rounded-full bg-warn-soft text-warn label-mono px-2.5 py-1">Demo — no charge</span>
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
      {error && <p className="text-sm text-bad text-center">{error}</p>}
      <button onClick={submit} disabled={pending} className="btn-primary w-full py-3">
        {pending ? "Processing…" : `Pay ${amountLabel}`}
      </button>
      <p className="text-xs text-faint text-center">
        Demo checkout — real Stripe payments (cards, BLIK) arrive before launch.
      </p>
    </div>
  );
}
