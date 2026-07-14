"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeSetup } from "@/app/actions/setup";
import PasswordInput from "@/components/PasswordInput";

export default function SetupForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const checks = [
    { ok: password.length >= 8, label: "At least 8 characters" },
    { ok: /[a-zA-Z]/.test(password) && /\d/.test(password), label: "Letters and at least one number" },
    { ok: confirm.length > 0 && password === confirm, label: "Passwords match" },
  ];
  const allOk = checks.every((c) => c.ok);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await completeSetup(token, password, confirm);
      if (result.ok) router.push("/dashboard");
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block label-mono mb-1">Password</label>
        <PasswordInput autoComplete="new-password" value={password} onChange={setPassword} />
      </div>
      <div>
        <label className="block label-mono mb-1">Repeat password</label>
        <PasswordInput autoComplete="new-password" value={confirm} onChange={setConfirm} />
      </div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className={`text-xs flex items-center gap-2 ${c.ok ? "text-ok" : "text-faint"}`}>
            <span className="font-mono">{c.ok ? "✓" : "○"}</span> {c.label}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button onClick={submit} disabled={pending || !allOk} className="btn-primary w-full py-2.5">
        {pending ? "…" : "Set password & sign in"}
      </button>
    </div>
  );
}
