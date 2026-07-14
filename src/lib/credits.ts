import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Night credits live in a ledger (CreditEntry). A grant is scoped to one location
 * (scopeLocationId) or valid everywhere (null). Usage consumes location-scoped
 * credit first, then the global pool, so balances stay correct at every location.
 */

export async function locationBalance(tx: Tx, clientId: number, locationId: number) {
  const [loc, global] = await Promise.all([
    tx.creditEntry.aggregate({ where: { clientId, scopeLocationId: locationId }, _sum: { nights: true } }),
    tx.creditEntry.aggregate({ where: { clientId, scopeLocationId: null }, _sum: { nights: true } }),
  ]);
  const locBal = loc._sum.nights ?? 0;
  const globalBal = global._sum.nights ?? 0;
  return { locBal, globalBal, available: locBal + globalBal };
}

/** Sum of credits already consumed by a reservation (positive number). */
export async function chargedForReservation(tx: Tx, reservationId: number): Promise<number> {
  const sum = await tx.creditEntry.aggregate({ where: { reservationId }, _sum: { nights: true } });
  return -(sum._sum.nights ?? 0);
}

/** Refund whatever a reservation has consumed so far (used on cancel and before re-charging on edit). */
export async function refundReservation(
  tx: Tx,
  reservationId: number,
  clientId: number,
  userId: number,
  note: string
) {
  const entries = await tx.creditEntry.findMany({ where: { reservationId } });
  // Negate per-scope so location-scoped and global credits both return to the right pool
  const byScope = new Map<number | null, number>();
  for (const e of entries) {
    byScope.set(e.scopeLocationId, (byScope.get(e.scopeLocationId) ?? 0) + e.nights);
  }
  for (const [scope, sum] of byScope) {
    if (sum === 0) continue;
    await tx.creditEntry.create({
      data: {
        clientId,
        nights: -sum,
        scopeLocationId: scope,
        reservationId,
        note,
        createdById: userId,
      },
    });
  }
}

/**
 * Consume `nights` credits at a location: location-scoped pool first, then global.
 * Throws if the client doesn't have enough.
 */
export async function chargeCredits(
  tx: Tx,
  clientId: number,
  locationId: number,
  nights: number,
  reservationId: number,
  userId: number,
  note: string
) {
  if (nights <= 0) return;
  const { locBal, globalBal, available } = await locationBalance(tx, clientId, locationId);
  if (available < nights) {
    throw new Error(`Insufficient night credits: needs ${nights}, has ${available} usable at this location`);
  }
  const fromLoc = Math.min(nights, Math.max(0, locBal));
  const fromGlobal = nights - fromLoc;
  if (fromGlobal > Math.max(0, globalBal)) {
    throw new Error(`Insufficient night credits: needs ${nights}, has ${available} usable at this location`);
  }
  if (fromLoc > 0) {
    await tx.creditEntry.create({
      data: { clientId, nights: -fromLoc, scopeLocationId: locationId, reservationId, note, createdById: userId },
    });
  }
  if (fromGlobal > 0) {
    await tx.creditEntry.create({
      data: { clientId, nights: -fromGlobal, scopeLocationId: null, reservationId, note, createdById: userId },
    });
  }
}
