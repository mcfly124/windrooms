import { prisma } from "@/lib/db";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set your password — Flyspot Rooms" };

export default async function SetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  const valid = !!user && user.active && (!user.inviteExpiresAt || user.inviteExpiresAt > new Date());

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-line p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-acc text-white flex items-center justify-center font-semibold text-sm">FR</div>
          <div>
            <div className="text-sm font-semibold">Flyspot Rooms</div>
            <div className="label-mono">Account setup</div>
          </div>
        </div>
        {valid ? (
          <>
            <p className="text-sm text-mut mb-5">
              Welcome, <b className="text-ink">{user!.name}</b> — choose a password for your{" "}
              {user!.role.toLowerCase()} account.
            </p>
            <SetupForm token={token} />
          </>
        ) : (
          <p className="text-sm text-mut">
            This invite link is not valid or has expired. Ask the superadmin to send you a new one.
          </p>
        )}
      </div>
    </main>
  );
}
