import crypto from "crypto";
import { todayYmd } from "./dates";

/**
 * Traffic attribution helpers for the public site. Everything here runs on the
 * request path in /api/track — keep it cheap and never throw.
 */

/** Search engines → an "organic" visit, whatever the exact host. */
const SEARCH = [
  "google.",
  "bing.",
  "duckduckgo.",
  "yahoo.",
  "yandex.",
  "ecosia.",
  "baidu.",
  "brave.",
  "startpage.",
];

/** Social networks, incl. the shortener/app hosts they actually send. */
const SOCIAL = [
  "facebook.",
  "fb.",
  "instagram.",
  "l.instagram.",
  "t.co",
  "twitter.",
  "x.com",
  "linkedin.",
  "lnkd.in",
  "youtube.",
  "youtu.be",
  "tiktok.",
  "pinterest.",
  "reddit.",
  "wykop.",
];

const EMAIL = ["mail.google.", "outlook.", "mail.yahoo.", "webmail."];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function matches(host: string, list: string[]): boolean {
  return list.some((p) => (p.endsWith(".") ? host.startsWith(p) || host.includes(`.${p}`) : host === p));
}

export type Attribution = { source: string; medium: string | null; campaign: string | null };

/**
 * Where a view came from. UTM tags win when present (that is the point of
 * tagging a link); otherwise the referrer host decides, and no referrer at all
 * means someone typed the URL, used a bookmark, or came from an app.
 */
export function attribute(referrer: string | null, search: string | null, selfHost: string | null): Attribution {
  const params = new URLSearchParams(search ?? "");
  const utmSource = params.get("utm_source")?.trim().toLowerCase() || null;
  const utmMedium = params.get("utm_medium")?.trim().toLowerCase() || null;
  const campaign = params.get("utm_campaign")?.trim().toLowerCase() || null;
  if (utmSource) return { source: utmSource, medium: utmMedium, campaign };

  const host = referrer ? hostOf(referrer) : null;
  // Internal navigation is not a new source — treat it as direct.
  if (!host || (selfHost && host === selfHost.replace(/^www\./, "").toLowerCase())) {
    return { source: "direct", medium: utmMedium ?? "none", campaign };
  }
  if (matches(host, SEARCH)) return { source: host, medium: utmMedium ?? "organic", campaign };
  if (matches(host, SOCIAL)) return { source: host, medium: utmMedium ?? "social", campaign };
  if (matches(host, EMAIL)) return { source: host, medium: utmMedium ?? "email", campaign };
  return { source: host, medium: utmMedium ?? "referral", campaign };
}

/** Coarse buckets — enough to answer "is the booking flow mostly phones?". */
export function deviceOf(ua: string): "mobile" | "tablet" | "desktop" {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  return "desktop";
}

const BOT = /bot|crawl|spider|slurp|preview|monitor|fetch|curl|wget|headless|lighthouse|pingdom|gtmetrix|python-requests|axios|node-fetch|facebookexternalhit|whatsapp|telegram|vercel-screenshot/i;

export function isBot(ua: string): boolean {
  return !ua || BOT.test(ua);
}

/**
 * Daily-rotating visitor id: hash(AUTH_SECRET + today + ip + ua). Same person
 * on the same day hashes the same; tomorrow they are a new id and no hash can
 * be traced back to an IP. Falls back to a random id when the host gives us no
 * IP, which only ever inflates unique counts — never links people.
 */
export function visitorHash(ip: string | null, ua: string): string {
  if (!ip) return crypto.randomBytes(12).toString("hex");
  return crypto
    .createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? "dev"}|${todayYmd()}|${ip}|${ua}`)
    .digest("hex")
    .slice(0, 32);
}

/** First hop of x-forwarded-for is the client; the rest are proxies. */
export function clientIp(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || null;
  return h.get("x-real-ip") || null;
}

/** Pretty label for a source in the admin table. */
export function sourceLabel(source: string): string {
  if (source === "direct") return "Direct / bookmark";
  return source;
}
