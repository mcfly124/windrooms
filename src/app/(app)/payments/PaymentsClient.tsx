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

  const input = "rounded-lg bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-500";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-sm font-medium text-zinc-300 mb-3">Record a payment</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Client (optional)</label>
            <select className={input} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Amount (PLN)</label>
            <input type="number" min={0} step="0.01" className={`${input} w-28`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Method</label>
            <select className={input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="ONLINE">Online</option>
              <option value="PAYMENT_LINK">Payment link</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300 pb-1.5">
            <input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />
            Paid now
          </label>
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-zinc-400 mb-1">Note</label>
            <input className={`${input} w-full`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button onClick={submit} disabled={pending || !form.amount} className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-4 py-1.5 text-sm font-medium">
            Record
          </button>
        </div>
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-left text-zinc-400">
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
              <tr key={p.id} className="border-t border-zinc-800">
                <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap">{p.createdAt}</td>
                <td className="px-4 py-2 text-white">{p.clientName ?? p.note ?? "—"}</td>
                <td className="px-4 py-2 text-right text-white whitespace-nowrap">{fmtPln(p.amountPln, eurRate, showEur)}</td>
                <td className="px-4 py-2 text-zinc-400 text-xs">{p.method.toLowerCase().replace("_", " ")}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    p.status === "PAID" ? "bg-emerald-900/60 text-emerald-300"
                    : p.status === "PENDING" ? "bg-amber-900/60 text-amber-300"
                    : "bg-zinc-800 text-zinc-500"
                  }`}>{p.status.toLowerCase()}</span>
                </td>
                <td className="px-4 py-2 text-zinc-500 text-xs">{p.recordedBy ?? "—"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {p.status === "PENDING" && (
                    <>
                      <button onClick={() => mark(p.id, "PAID")} className="text-emerald-400 hover:text-emerald-300 text-xs mr-2">mark paid</button>
                      <button onClick={() => mark(p.id, "CANCELLED")} className="text-zinc-500 hover:text-zinc-300 text-xs">cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-zinc-600">No payments yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
