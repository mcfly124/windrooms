"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPayment, setPaymentStatus } from "@/app/actions/payments";
import { fmtPln } from "@/lib/currency";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";

type PaymentRow = {
  id: number;
  clientName: string | null;
  reservationId: number | null;
  amountPln: number;
  method: PaymentMethod;
  status: PaymentStatus;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
  payLink: string | null;
};

export default function PaymentsClient({
  payments,
  clients,
  eurRate,
  showEur,
}: {
  payments: PaymentRow[];
  clients: { id: number; name: string }[];
  eurRate: number | null;
  showEur: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ clientId: "", amount: "", method: "CASH" as PaymentMethod, paid: true, note: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await recordPayment({
        clientId: form.clientId ? Number(form.clientId) : null,
        amountPln: Number(form.amount),
        method: form.method,
        paid: form.paid,
        note: form.note,
      });
      if (result.ok) {
        setForm({ ...form, amount: "", note: "" });
        router.refresh();
      } else setError(result.error);
    });
  }

  function mark(id: number, status: "PAID" | "CANCELLED") {
    startTransition(async () => {
      await setPaymentStatus(id, status);
      router.refresh();
    });
  }

  const input = "rounded-lg bg-hovr border border-line px-2.5 py-1.5 text-sm text-ink outline-none focus:border-acc";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card border border-line p-4">
        <h2 className="text-sm font-medium text-mut mb-3">Record a payment</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-mut mb-1">Client (optional)</label>
            <select className="field" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-mut mb-1">Amount (PLN)</label>
            <input type="number" min={0} step="0.01" className={`${input} w-28`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-mut mb-1">Method</label>
            <select className="field" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="ONLINE">Online</option>
              <option value="PAYMENT_LINK">Payment link</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-mut pb-1.5">
            <input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />
            Paid now
          </label>
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-mut mb-1">Note</label>
            <input className={`${input} w-full`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button onClick={submit} disabled={pending || !form.amount} className="rounded-lg bg-acc hover:bg-acc-strong disabled:opacity-50 text-white px-4 py-1.5 text-sm font-medium">
            Record
          </button>
        </div>
        {error && <p className="text-sm text-bad mt-2">{error}</p>}
        <p className="text-xs text-faint mt-2">
          “Paid now” = money already received. Untick it to record a pending amount — with method “Payment link” you
          get a shareable link to send to the customer (demo checkout for now, Stripe later).
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card text-left text-mut">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium text-right">Amount</th>
              <th className="px-4 py-2.5 font-medium">Method</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">By</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-2 text-faint text-xs whitespace-nowrap">{p.createdAt}</td>
                <td className="px-4 py-2 text-ink">{p.clientName ?? p.note ?? "—"}</td>
                <td className="px-4 py-2 text-right text-ink whitespace-nowrap">{fmtPln(p.amountPln, eurRate, showEur)}</td>
                <td className="px-4 py-2 text-mut text-xs">{p.method.toLowerCase().replace("_", " ")}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    p.status === "PAID" ? "bg-ok-soft text-ok"
                    : p.status === "PENDING" ? "bg-warn-soft text-warn"
                    : "bg-hovr text-faint"
                  }`}>{p.status.toLowerCase()}</span>
                </td>
                <td className="px-4 py-2 text-faint text-xs">{p.recordedBy ?? "—"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {p.status === "PENDING" && (
                    <>
                      <button onClick={() => mark(p.id, "PAID")} className="text-ok hover:text-ok text-xs mr-2">mark paid</button>
                      <button onClick={() => mark(p.id, "CANCELLED")} className="text-faint hover:text-mut text-xs">cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-faint">No payments yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
