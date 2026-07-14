import { prisma } from "./db";

/**
 * PLN is the only real currency; EUR is display-only.
 * Rate comes from the Polish National Bank (NBP) free API, cached for 24h in the Setting table.
 */
export async function getEurRate(): Promise<number | null> {
  const cached = await prisma.setting.findUnique({ where: { key: "eur_rate" } });
  if (cached) {
    try {
      const { rate, at } = JSON.parse(cached.value) as { rate: number; at: number };
      if (Date.now() - at < 24 * 60 * 60 * 1000) return rate;
    } catch {
      // fall through to refetch
    }
  }
  try {
    const res = await fetch("https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`NBP ${res.status}`);
    const data = (await res.json()) as { rates: { mid: number }[] };
    const rate = data.rates[0]?.mid;
    if (!rate) throw new Error("NBP: no rate");
    await prisma.setting.upsert({
      where: { key: "eur_rate" },
      create: { key: "eur_rate", value: JSON.stringify({ rate, at: Date.now() }) },
      update: { value: JSON.stringify({ rate, at: Date.now() }) },
    });
    return rate;
  } catch {
    // Stale cache is better than nothing
    if (cached) {
      try {
        return (JSON.parse(cached.value) as { rate: number }).rate;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Formats "320 zł" or, with a rate and showEur, "320 zł (~75 €)". */
export function fmtPln(amount: number, eurRate: number | null, showEur: boolean): string {
  const pln = `${amount.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} zł`;
  if (!showEur || !eurRate) return pln;
  const eur = amount / eurRate;
  return `${pln} (~${eur.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} €)`;
}
