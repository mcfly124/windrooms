import { todayYmd } from "@/lib/dates";
import { sendStandbyReminders } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Daily standby reminders — scheduled in vercel.json. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set the route
 * stays closed rather than open, so a missing env var can never expose it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = todayYmd();
  const result = await sendStandbyReminders(today);
  return Response.json({ ok: true, today, ...result });
}
