<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Flyspot Rooms (windrooms)

Internal platform managing hotel rooms at Flyspot's 4 wind-tunnel locations (Gdańsk, Katowice, Warsaw, Wrocław). Replaces an Excel workflow. Phase 2 adds a public booking frontend for Gdańsk's 6 rooms; phase 3 adds Nuki smart locks + a Flyspot tunnel-reservation watcher.

## Stack
Next.js (App Router, Turbopack) · React 19 · Tailwind v4 · Neon Postgres + Prisma 6 (do NOT upgrade to Prisma 7 without migrating config) · HMAC cookie auth · deployed on Vercel.

## Commands
- `npm run dev` / `npm run build` / `npx tsc --noEmit`
- `npm run seed` — idempotent: superadmin (from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`), 4 locations, Gdańsk rooms S1–S3 (single) + D1–D3 (double)
- `npx prisma db push` — sync schema to Neon (no migration files yet)

## Env (.env, never commit)
`DATABASE_URL` (Neon), `AUTH_SECRET` (HMAC), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`. Vercel needs the first two.

## Roles & auth
- SUPERADMIN > ADMIN > OPERATOR (`ROLE_RANK` in `src/lib/auth.ts`). Operators are tied to one location (`user.locationId`), read-only + payments.
- Cookie `wr_session = userId.impersonatorId.issuedMs.hmac`. Impersonation: superadmin only; every write is audit-logged with both ids.
- `getSession()` is the only auth gate (called in `(app)/layout.tsx` + `requireRole()` in every server action).

## Domain rules (business logic — do not change casually)
- **Night credits are a ledger** (`CreditEntry`): grants positive, usage negative. Scope: `scopeLocationId` null = valid at all locations. Usage consumes the location-scoped pool first, then global (`src/lib/credits.ts`). Balance is always a SUM, never a stored number.
- Credits are charged only for CONFIRMED and HOTEL_OVERFLOW reservations; STANDBY holds nothing. Edits refund-then-recharge; cancel refunds (all inside one transaction in `src/app/actions/reservations.ts`).
- 1 night credit covers single or double room. Companions: extra credits, pay at reception, or online link (`companionPayment`).
- Reservations carry `checkInTime`/`checkOutTime` (24h "HH:MM", defaults 15:00/11:00). All times in the app are 24h.
- Client email is mandatory (door codes/confirmations will be emailed); the client modal can grant credits on create/edit via `saveClient`'s `credit` param.
- STANDBY = client without credits waiting; must be resolved by 7 days before check-in (dashboard surfaces these).
- Overlap check blocks only CONFIRMED reservations on the same room.
- `Location.releaseWindowDays` (default 14, 0 = always) = days before check-in when free rooms open to the public (phase 2, Gdańsk).
- Currency: PLN only. EUR is display-only (`wr_eur` cookie + NBP API cached 24h in `Setting`, `src/lib/currency.ts`).

## Conventions
- Dates are `YYYY-MM-DD` strings at UTC midnight everywhere (`src/lib/dates.ts`); Prisma `@db.Date` columns. Check-in 15:00 / check-out 11:00 (informational).
- i18n: `wr_lang` cookie, dictionaries in `src/lib/i18n.ts` (en default, pl). Other prefs cookies: `wr_eur` (EUR display), `wr_theme` (light|dark).
- Server actions in `src/app/actions/*` return `{ ok } | { ok:false, error }`, never throw to the client; each calls `requireRole()` then `audit()`.
- UI: light/dark theme via `wr_theme` cookie → `dark` class on `<html>`; design tokens in `globals.css` (`bg-bg`, `bg-card`, `border-line`, `text-ink`, `text-mut`, `text-faint`, `bg-hovr`, accent `bg-acc`/`acc-soft`/`acc-softer`, status `ok`/`warn`/`bad`/`purp` + `-soft`). Never use raw zinc/sky classes. Mono micro-labels via `.label-mono`; shared `.field`, `.btn-primary`, `.btn-ghost`. Sidebar layout in `(app)/layout.tsx` + `SidebarNav.tsx`; pages are thin server components passing serialized props to `*Client.tsx`.

## Public booking (built, demo payments)
`/book` (no auth) — Gdańsk only: search dates → available rooms (active + `pricePln` set, no CONFIRMED overlap, whole stay inside `releaseWindowDays`; rules in `src/lib/booking.ts`) → guest details + demo checkout (`src/app/actions/public.ts` creates CONFIRMED PUBLIC reservation + PAID payment marked "DEMO payment") → `/book/confirmed?id&sig` (HMAC `bookingSig`, prevents enumeration). Room prices editable per-room in Locations; `publicDescription` shown on the landing page. Real Stripe replaces the demo checkout later (`PAYMENTS_MODE` = demo|test|live).

## Stats
`/stats` (admins+) — occupancy % by location, Flyspot-vs-public room-nights, payments by month (chart.js + react-chartjs-2), tiles incl. credits granted/used and hotel-overflow cost.

## Shared components
`src/components/DatePicker.tsx` (in-house popover calendar, "YYYY-MM-DD") and `TimeSelect.tsx` (24h, 30-min steps) — use these instead of native date/time inputs; native selects get styled via `select.field` in globals.css.

## Planned (not built)
Excel importer (waiting for a sample file) · real Stripe checkout for `/book` · Nuki lock API · tunnel-booking alerts (see coaching-booking's `src/lib/flyspot.ts`) · email notifications (booking confirmations, door codes, cleaning).
