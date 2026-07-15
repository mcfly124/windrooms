"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createPublicBookingByType, typeMonthAvailability } from "@/app/actions/public";
import { DICT, PhotoSlot, type Cur, type Lang, type RoomType } from "../shared";

export default function RoomDetail({
  type,
  todayIso,
  eurRate,
  pricePln,
  count,
  bookingEnabled,
}: {
  type: RoomType;
  todayIso: string;
  eurRate: number;
  pricePln: number;
  count: number;
  bookingEnabled: boolean;
}) {
  const [lang, setLang] = useState<Lang>("en");
  const [cur, setCur] = useState<Cur>("pln");
  const [viewY, setViewY] = useState(Number(todayIso.slice(0, 4)));
  const [viewM, setViewM] = useState(Number(todayIso.slice(5, 7)) - 1);
  const [avail, setAvail] = useState<Record<string, number>>({});
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ reference: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const t = DICT[lang];

  useEffect(() => {
    const l = localStorage.getItem("bk_lang");
    const c = localStorage.getItem("bk_cur");
    if (l === "pl" || l === "en") setLang(l);
    if (c === "eur" || c === "pln") setCur(c);
  }, []);
  useEffect(() => localStorage.setItem("bk_lang", lang), [lang]);
  useEffect(() => localStorage.setItem("bk_cur", cur), [cur]);

  // month availability from the backend (merges across month switches, so ranges can span months)
  useEffect(() => {
    let alive = true;
    setLoadingAvail(true);
    typeMonthAvailability(type, viewY, viewM + 1).then((a) => {
      if (!alive) return;
      setAvail((prev) => ({ ...prev, ...a }));
      setLoadingAvail(false);
    });
    return () => {
      alive = false;
    };
  }, [type, viewY, viewM]);

  const nights = useMemo(() => {
    if (!start || !end) return 0;
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 864e5);
  }, [start, end]);

  const fmt = (pln: number) => (cur === "pln" ? `${pln} zł` : `€${Math.round(pln / eurRate)}`);

  function nightsLabel(n: number): string {
    if (lang === "en") return `${n} ${n === 1 ? "night" : "nights"}`;
    if (n === 1) return "1 noc";
    const m10 = n % 10;
    const m100 = n % 100;
    return m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? `${n} noce` : `${n} nocy`;
  }

  const fmtDay = (iso: string) => {
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${t.months[m - 1].slice(0, 3)}`;
  };

  const isFree = (iso: string) => (avail[iso] ?? 0) > 0;

  function rangeAllFree(a: string, b: string): boolean {
    const d = new Date(`${a}T00:00:00Z`);
    const endD = new Date(`${b}T00:00:00Z`);
    while (d < endD) {
      const iso = d.toISOString().slice(0, 10);
      if (!isFree(iso)) return false;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return true;
  }

  function clickDay(iso: string) {
    setError(null);
    if (!start || (start && end)) {
      setStart(iso);
      setEnd(null);
    } else if (iso > start) {
      if (rangeAllFree(start, iso)) setEnd(iso);
      else {
        setError(t.rangeUnavail);
        setStart(iso);
        setEnd(null);
      }
    } else {
      setStart(iso);
      setEnd(null);
    }
  }

  function confirm() {
    if (!start || !end) return;
    setError(null);
    startTransition(async () => {
      const result = await createPublicBookingByType({
        type,
        checkIn: start,
        checkOut: end,
        guestName: guest.name,
        guestEmail: guest.email,
        guestPhone: guest.phone,
      });
      if (result.ok) setConfirmed({ reference: result.reference });
      else setError(result.error);
    });
  }

  // calendar cells
  const first = new Date(Date.UTC(viewY, viewM, 1));
  const daysIn = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const iso = (d: number) => `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const atCurrentMonth = viewY === Number(todayIso.slice(0, 4)) && viewM === Number(todayIso.slice(5, 7)) - 1;

  const name = type === "SINGLE" ? t.singleName : t.doubleName;
  const desc = type === "SINGLE" ? t.singleDesc : t.doubleDesc;
  const guests = type === "SINGLE" ? t.chipGuests1 : t.chipGuests2;
  const slug = type.toLowerCase();
  const total = pricePln * nights;

  const rangeLabel = !start
    ? t.pickDates
    : !end
      ? `${fmtDay(start)} → ?`
      : `${fmtDay(start)} → ${fmtDay(end)} · ${nightsLabel(nights)}`;

  return (
    <div className="bk" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* header */}
      <header className="bk-header">
        <div className="bk-wrap bk-header-row">
          <div className="mr-auto">
            <Link href="/book" className="bk-wordmark">WINDROOMS</Link>
            <div className="bk-kicker" style={{ fontSize: 11 }}>{t.kicker}</div>
          </div>
          <div className="bk-pillgroup">
            {(["en", "pl"] as const).map((l) => (
              <button key={l} className={`bk-pill ${lang === l ? "on" : ""}`} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="bk-pillgroup">
            {(["pln", "eur"] as const).map((c) => (
              <button key={c} className={`bk-pill ${cur === c ? "on" : ""}`} onClick={() => setCur(c)}>
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="bk-wrap" style={{ padding: "28px 20px 56px", flex: 1, width: "100%" }}>
        <Link href="/book" className="bk-back">{t.backAllL}</Link>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 32,
            marginTop: 18,
            alignItems: "start",
          }}
        >
          {/* left: photos + about */}
          <div>
            <div style={{ borderRadius: 18, overflow: "hidden", height: "clamp(260px, 38vw, 420px)" }}>
              <PhotoSlot src={`/book/${slug}.jpg`} alt={name} label={type === "SINGLE" ? t.phSingle : t.phDouble} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              {[2, 3].map((n) => (
                <div key={n} style={{ borderRadius: 12, overflow: "hidden", height: 150 }}>
                  <PhotoSlot src={`/book/${slug}-${n}.jpg`} alt={`${name} ${n}`} label={type === "SINGLE" ? t.phSingle : t.phDouble} />
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 24 }}>
              <h1 className="bk-serif" style={{ fontSize: "clamp(30px, 4.5vw, 40px)", lineHeight: 1.1 }}>{name}</h1>
              <div className="bk-pricetag">
                <b>{fmt(pricePln)}</b> <span>{t.perNight}</span>
              </div>
            </div>
            <p style={{ color: "var(--slate)", marginTop: 10 }}>{desc}</p>
            <div className="bk-minichips" style={{ marginTop: 14 }}>
              <span className="bk-minichip">{guests}</span>
              <span className="bk-minichip">{t.chipWifi}</span>
              <span className="bk-minichip">{t.chipCode}</span>
              <span className="bk-minichip">{count} {t.availOfType}</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{t.aboutL}</div>
              <p style={{ color: "var(--slate)", fontSize: 14 }}>{t.whyBody}</p>
              <p style={{ color: "var(--slate)", fontSize: 14, marginTop: 8 }}>{t.footTimes}</p>
            </div>
          </div>

          {/* right: availability calendar + booking */}
          <div className="bk-card" style={{ border: "1px solid var(--line)", maxWidth: "none" }}>
            {confirmed ? (
              <>
                <h3 className="bk-serif" style={{ fontSize: 30, marginBottom: 8 }}>{t.confTitle}</h3>
                <p style={{ color: "var(--slate)", fontSize: 15 }}>
                  {name} · {start && fmtDay(start)} → {end && fmtDay(end)} · {nightsLabel(nights)} · {t.totalL}: {fmt(total)}
                </p>
                <div className="bk-codecard">
                  <div className="lbl">{t.codeLbl}</div>
                  <div className="code">{confirmed.reference}</div>
                </div>
                <p style={{ color: "var(--slate)", fontSize: 14, marginBottom: 18 }}>{t.confBody}</p>
                <Link href="/book" className="bk-cta sq" style={{ textAlign: "center" }}>{t.restartL}</Link>
              </>
            ) : !bookingEnabled ? (
              <p style={{ color: "var(--slate)" }}>Online booking is not open at the moment — please check back soon.</p>
            ) : (
              <>
                <div className="bk-cal-head">
                  <button
                    className="bk-cal-nav"
                    disabled={atCurrentMonth}
                    onClick={() => {
                      const m = viewM - 1;
                      setViewM((m + 12) % 12);
                      if (m < 0) setViewY(viewY - 1);
                    }}
                  >
                    ←
                  </button>
                  <span className="bk-cal-month">
                    {t.months[viewM]} {viewY}
                    {loadingAvail && <span style={{ color: "var(--slate)", fontWeight: 400, fontSize: 12 }}> · {t.checking}</span>}
                  </span>
                  <button
                    className="bk-cal-nav"
                    onClick={() => {
                      const m = viewM + 1;
                      setViewM(m % 12);
                      if (m > 11) setViewY(viewY + 1);
                    }}
                  >
                    →
                  </button>
                </div>
                <div className="bk-dows">
                  {t.dows.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="bk-days">
                  {cells.map((d, i) => {
                    if (d === null) return <span key={i} />;
                    const dayIso = iso(d);
                    const past = dayIso < todayIso;
                    const free = isFree(dayIso);
                    const isEdge = dayIso === start || dayIso === end;
                    const inRange = start !== null && end !== null && dayIso > start && dayIso < end;
                    // checkout day only needs the previous night — allow ending on an unavailable day
                    const selectable = !past && (free || (start !== null && !end && dayIso > start));
                    return (
                      <button
                        key={i}
                        disabled={!selectable}
                        onClick={() => clickDay(dayIso)}
                        title={free ? `${avail[dayIso]} ${t.availLegend.toLowerCase()}` : t.unavailLegend}
                        className={`bk-day ${isEdge ? "edge" : ""} ${inRange ? "range" : ""}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12, color: "var(--slate)" }}>
                  <span>■ {t.availLegend}</span>
                  <span style={{ opacity: 0.4 }}>■ {t.unavailLegend}</span>
                </div>
                <div className="bk-cal-foot">
                  <span className="bk-rangelbl">{rangeLabel}</span>
                </div>

                {start && end && (
                  <div style={{ marginTop: 16 }}>
                    <div className="bk-summary">
                      <span>{name}</span>
                      <span>{nightsLabel(nights)}</span>
                      <b className="total" style={{ marginLeft: "auto" }}>{t.totalL}: {fmt(total)}</b>
                    </div>
                    <div className="bk-fld">
                      <label>{t.nameL}</label>
                      <input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} autoComplete="name" />
                    </div>
                    <div className="bk-fld">
                      <label>{t.emailL}</label>
                      <input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} autoComplete="email" />
                    </div>
                    <div className="bk-fld">
                      <label>{t.phoneL}</label>
                      <input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} autoComplete="tel" />
                    </div>
                    <button
                      className="bk-cta sq"
                      disabled={pending || !guest.name.trim() || !guest.email.trim()}
                      onClick={confirm}
                    >
                      {pending ? t.booking : t.confirmBtn}
                    </button>
                  </div>
                )}
                {error && <p className="bk-err">{error}</p>}
                <div className="bk-smallprint">{t.footTimes}</div>
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="bk-footer">
        <div className="bk-wrap row">
          <span className="bk-wordmark">WINDROOMS</span>
          <span>{t.footTimes}</span>
          <span>
            {t.footContact} · <Link href="/book/manage">{t.manageL}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
