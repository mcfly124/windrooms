"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/session";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm text-mut mb-1" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg bg-hovr border border-line px-3 py-2 text-ink outline-none focus:border-acc"
        />
      </div>
      <div>
        <label className="block text-sm text-mut mb-1" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg bg-hovr border border-line px-3 py-2 text-ink outline-none focus:border-acc"
        />
      </div>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-acc hover:bg-acc-strong disabled:opacity-50 text-white py-2 font-medium"
      >
        {pending ? "…" : "Log in"}
      </button>
    </form>
  );
}
