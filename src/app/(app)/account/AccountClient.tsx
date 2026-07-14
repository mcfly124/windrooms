"use client";

import { useState, useTransition } from "react";
import { changeOwnPassword } from "@/app/actions/account";
import PasswordInput from "@/components/PasswordInput";

export default function AccountClient({
  name,
  email,
  role,
  locations,
}: {
  name: string;
  email: string;
  role: string;
  locations: number | null;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const checks = [
    { ok: next.length >= 8, label: "At least 8 characters" },
    { ok: /[a-zA-Z]/.test(next) && /\d/.test(next), label: "Letters and at least one number" },
    { ok: confirm.length > 0 && next === confirm, label: "Passwords match" },
  ];
  const allOk = checks.every((c) => c.ok) && current.length > 0;

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await changeOwnPassword(current, next, confirm);
      if (result.ok) {
        setMessage({ ok: true, text: "Password updated." });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else setMessage({ ok: false, text: result.error });
    });
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="text-sm text-mut mt-1">
          {name} · {email} · {role.toLowerCase()}
          {locations !== null && ` · ${locations} location(s)`}
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
        <h2 className="text-sm font-medium">Change password</h2>
        <div>
          <label className="block label-mono mb-1">Current password</label>
          <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" />
        </div>
        <div>
          <label className="block label-mono mb-1">New password</label>
          <PasswordInput value={next} onChange={setNext} autoComplete="new-password" />
        </div>
        <div>
          <label className="block label-mono mb-1">Repeat new password</label>
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        <ul className="space-y-1">
          {checks.map((c) => (
            <li key={c.label} className={`text-xs flex items-center gap-2 ${c.ok ? "text-ok" : "text-faint"}`}>
              <span className="font-mono">{c.ok ? "✓" : "○"}</span> {c.label}
            </li>
          ))}
        </ul>
        {message && <p className={`text-sm ${message.ok ? "text-ok" : "text-bad"}`}>{message.text}</p>}
        <button onClick={submit} disabled={pending || !allOk} className="btn-primary">
          {pending ? "…" : "Update password"}
        </button>
      </div>
    </div>
  );
}
