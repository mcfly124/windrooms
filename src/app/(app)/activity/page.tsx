import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const session = (await getSession())!;
  if (!atLeast(session.user.role, "ADMIN")) redirect("/dashboard");

  // Admins see operator activity (plus their own); superadmin sees everything
  const logs = await prisma.auditLog.findMany({
    where:
      session.user.role === "SUPERADMIN"
        ? {}
        : { OR: [{ user: { role: "OPERATOR" } }, { userId: session.user.id }] },
    include: { user: true, impersonator: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-ink">Activity log</h1>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card text-left text-mut">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Who</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-line">
                <td className="px-4 py-2 text-faint text-xs whitespace-nowrap">
                  {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-2 text-ink whitespace-nowrap">
                  {log.user.name}
                  {log.impersonator && (
                    <span className="text-warn text-xs"> (by {log.impersonator.name})</span>
                  )}
                </td>
                <td className="px-4 py-2 text-acc text-xs whitespace-nowrap">{log.action}</td>
                <td className="px-4 py-2 text-mut text-xs">
                  {log.entity}{log.entityId ? ` #${log.entityId}` : ""}{log.details ? ` — ${log.details}` : ""}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-faint">No activity yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
