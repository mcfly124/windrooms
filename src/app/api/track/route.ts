import { prisma } from "@/lib/db";
import { parseYmd, todayYmd } from "@/lib/dates";
import { attribute, clientIp, deviceOf, isBot, visitorHash } from "@/lib/traffic";

/** Analytics beacon for the public site. Never blocks or fails the page. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { path?: unknown; referrer?: unknown; search?: unknown };
    const path = typeof body.path === "string" ? body.path.slice(0, 200) : null;
    // Only the public booking site is tracked — the ops app never is.
    if (!path || !path.startsWith("/book")) return new Response(null, { status: 204 });

    const h = request.headers;
    const ua = h.get("user-agent") ?? "";
    if (isBot(ua)) return new Response(null, { status: 204 });

    const referrer = typeof body.referrer === "string" && body.referrer ? body.referrer.slice(0, 500) : null;
    const search = typeof body.search === "string" ? body.search.slice(0, 500) : null;
    const { source, medium, campaign } = attribute(referrer, search, h.get("host"));

    await prisma.pageView.create({
      data: {
        path,
        referrer,
        source: source.slice(0, 100),
        medium: medium?.slice(0, 50) ?? null,
        campaign: campaign?.slice(0, 100) ?? null,
        device: deviceOf(ua),
        country: h.get("x-vercel-ip-country")?.slice(0, 2) ?? null,
        visitor: visitorHash(clientIp(h), ua),
        date: parseYmd(todayYmd()),
      },
    });
  } catch {
    // A dropped view is never worth a client-visible error.
  }
  return new Response(null, { status: 204 });
}
