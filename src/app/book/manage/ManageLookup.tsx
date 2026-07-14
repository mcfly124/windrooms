"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findPublicBooking } from "@/app/actions/public";

export default function ManageLookup() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await findPublicBooking(reference, email);
      if (result.ok) router.push(`/book/manage/${result.id}?sig=${result.sig}`);
      else setError(result.error);
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
      <div>
        <label className="block label-mono mb-1">Confirmation code</label>
        <input
          className="field font-mono uppercase"
          placeholder="FR-00012"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
      <div>
        <label className="block label-mono mb-1">Email used for the booking</label>
        <input type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button onClick={submit} disabled={pending || !reference || !email} className="btn-primary w-full py-2.5">
        {pending ? "Looking up…" : "Find my booking"}
      </button>
    </div>
  );
}
