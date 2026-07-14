"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/session";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm text-zinc-300 mb-1" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white outline-none focus:border-sky-500"
        />
      </div>
      <div>
        <label className="block text-sm text-zinc-300 mb-1" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-white outline-none focus:border-sky-500"
        />
      </div>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white py-2 font-medium"
      >
        {pending ? "…" : "Log in"}
      </button>
    </form>
  );
}
