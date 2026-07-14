/**
 * Email via the Resend HTTP API (no SDK needed). Configure in .env / Vercel:
 *   RESEND_API_KEY  — from resend.com (without it, emails are logged and skipped)
 *   EMAIL_FROM      — e.g. "Flyspot Rooms <rooms@yourdomain.com>" (must be a
 *                     verified Resend domain; resend.dev sender works for testing)
 *   PUBLIC_BASE_URL — absolute base for links in emails
 */

export function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? "https://windrooms.vercel.app";
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${input.to} subject="${input.subject}"`);
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Flyspot Rooms <onboarding@resend.dev>",
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email failed] ${res.status}: ${body}`);
      return { sent: false, error: `Resend ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email failed]", e);
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

const wrap = (inner: string) => `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
    <div style="width:34px;height:34px;border-radius:10px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">FR</div>
    <div style="font-weight:600">Flyspot Rooms</div>
  </div>
  ${inner}
  <p style="font-size:12px;color:#94a3b8;margin-top:28px">Flyspot Rooms · Gdańsk · check-in from 15:00, check-out by 11:00</p>
</div>`;

const row = (k: string, v: string) =>
  `<tr><td style="padding:6px 0;color:#64748b;font-size:13px">${k}</td><td style="padding:6px 0;text-align:right;font-family:ui-monospace,monospace;font-size:13px">${v}</td></tr>`;

export function bookingConfirmationEmail(b: {
  reference: string;
  guestName: string;
  roomName: string;
  locationName: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  totalLabel: string;
  manageUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Booking confirmed ${b.reference} — Flyspot Rooms ${b.locationName}`,
    html: wrap(`
      <h2 style="font-size:18px;margin:0 0 6px">You're booked, ${b.guestName}!</h2>
      <p style="font-size:14px;color:#64748b;margin:0 0 16px">Keep this confirmation code — you'll need it to view or change your booking.</p>
      <div style="background:#eff6ff;border-radius:12px;padding:14px;text-align:center;margin-bottom:16px">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b">Confirmation code</div>
        <div style="font-family:ui-monospace,monospace;font-size:24px;font-weight:700;color:#2563eb">${b.reference}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        ${row("Room", `${b.roomName} · Flyspot ${b.locationName}`)}
        ${row("Check-in", `${b.checkIn} · from ${b.checkInTime}`)}
        ${row("Check-out", `${b.checkOut} · by ${b.checkOutTime}`)}
        ${row("Paid", b.totalLabel)}
      </table>
      <a href="${b.manageUrl}" style="display:block;background:#2563eb;color:#fff;text-decoration:none;text-align:center;border-radius:10px;padding:12px;font-size:14px;font-weight:600;margin-top:18px">View or change your booking</a>
      <p style="font-size:13px;color:#64748b;margin-top:16px">Before arrival you'll receive the building door code and your room code — check in any time after ${b.checkInTime}, no reception needed.</p>
    `),
  };
}

export function bookingChangedEmail(b: {
  reference: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  manageUrl: string;
  extraPaymentUrl?: string | null;
}): { subject: string; html: string } {
  return {
    subject: `Booking updated ${b.reference} — Flyspot Rooms`,
    html: wrap(`
      <h2 style="font-size:18px;margin:0 0 6px">Your booking was updated</h2>
      <p style="font-size:14px;color:#64748b">New dates for <b style="font-family:ui-monospace,monospace">${b.reference}</b>: ${b.checkIn} → ${b.checkOut}.</p>
      ${b.extraPaymentUrl ? `<a href="${b.extraPaymentUrl}" style="display:block;background:#2563eb;color:#fff;text-decoration:none;text-align:center;border-radius:10px;padding:12px;font-size:14px;font-weight:600;margin-top:14px">Pay the difference</a>` : ""}
      <a href="${b.manageUrl}" style="display:block;color:#2563eb;text-align:center;font-size:13px;margin-top:14px">View your booking</a>
    `),
  };
}

export function bookingCancelledEmail(b: { reference: string; guestName: string }): {
  subject: string;
  html: string;
} {
  return {
    subject: `Booking cancelled ${b.reference} — Flyspot Rooms`,
    html: wrap(`
      <h2 style="font-size:18px;margin:0 0 6px">Booking ${b.reference} is cancelled</h2>
      <p style="font-size:14px;color:#64748b">Sorry to see you go, ${b.guestName}. If a refund is due, our team will process it within a few days.</p>
    `),
  };
}

export function userInviteEmail(u: {
  name: string;
  role: string;
  setupUrl: string;
  invitedBy: string;
}): { subject: string; html: string } {
  return {
    subject: "You're invited to Flyspot Rooms",
    html: wrap(`
      <h2 style="font-size:18px;margin:0 0 6px">Hi ${u.name},</h2>
      <p style="font-size:14px;color:#64748b">${u.invitedBy} added you to Flyspot Rooms as <b>${u.role.toLowerCase()}</b>. Set your password to get started — the link is valid for 7 days.</p>
      <a href="${u.setupUrl}" style="display:block;background:#2563eb;color:#fff;text-decoration:none;text-align:center;border-radius:10px;padding:12px;font-size:14px;font-weight:600;margin-top:18px">Set your password</a>
    `),
  };
}

export function paymentLinkEmail(p: {
  name: string;
  amountLabel: string;
  payUrl: string;
  note?: string | null;
}): { subject: string; html: string } {
  return {
    subject: `Payment request ${p.amountLabel} — Flyspot Rooms`,
    html: wrap(`
      <h2 style="font-size:18px;margin:0 0 6px">Hi ${p.name},</h2>
      <p style="font-size:14px;color:#64748b">There's a payment of <b>${p.amountLabel}</b> waiting for you${p.note ? ` — ${p.note}` : ""}.</p>
      <a href="${p.payUrl}" style="display:block;background:#2563eb;color:#fff;text-decoration:none;text-align:center;border-radius:10px;padding:12px;font-size:14px;font-weight:600;margin-top:18px">Pay ${p.amountLabel}</a>
    `),
  };
}
