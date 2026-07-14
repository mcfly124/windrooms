import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-8">
        <h1 className="text-xl font-semibold text-white mb-1">Flyspot Rooms</h1>
        <p className="text-sm text-zinc-400 mb-6">Sign in to manage rooms across all locations</p>
        <LoginForm />
      </div>
    </main>
  );
}
