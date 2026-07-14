import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-line p-8">
        <h1 className="text-xl font-semibold text-ink mb-1">Flyspot Rooms</h1>
        <p className="text-sm text-mut mb-6">Sign in to manage rooms across all locations</p>
        <LoginForm />
      </div>
    </main>
  );
}
