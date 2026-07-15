"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  createPublicBookingByType,
  gdanskTypeAvailability,
  type TypeAvailability,
} from "@/app/actions/public";
import { DICT, PhotoSlot, type Cur, type Lang, type RoomType } from "./shared";

export default function Landing({
  todayIso,
  eurRate,
  types,
  bookingEnabled,
}: {
  todayIso: string;
  eurRate: number;
  /** From the DB: price + total room count per type */
  types: { type: RoomType; pricePln: number; count: number }[];
  bookingEnabled: boolean;
}) {
  const [lang, setLang] = useState<Lang>("en");
  const [cur, setCur] = useState<Cur>("pln");
  const [step, setStep] = useState(1);
  const [viewY, setViewY] = useState(Number(todayIso.slice(0, 4)));
  const [viewM, setViewM] = useState(Number(todayIso.slice(5, 7)) - 1);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomType | null>(null);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [avail, setAvail] = useState<TypeAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ reference: string; roomName: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const heroRef = useRef<HTMLDivElement>(null);

  const t = DICT[lang];

  // lang/currency persist
  useEffect(() => {
    const l = localStorage.getItem("bk_lang");
    const c = localStorage.getItem("bk_cur");
    if (l === "pl" || l === "en") setLang(l);
    if (c === "eur" || c === "pln") setCur(c);
  }, []);
  useEffect(() => localStorage.setItem("bk_lang", lang), [lang]);
  useEffect(() => localStorage.setItem("bk_cur", cur), [cur]);

  // hero parallax (translateY only, passive)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onScroll = () => {
      const el = heroRef.current;
      if (!el || !el.parentElement) return;
      const rect = el.parentElement.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
      el.style.transform = `translateY(${(progress * -40).toFixed(1)}px)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // availability when a full range exists
  useEffect(() => {
    if (!start || !end) {
      setAvail(null);
      return;
    }
    let alive = true;
    gdanskTypeAvailability(start, end).then((a) => alive && setAvail(a));
    return () => {
      alive = false;
    };
  }, [start, end]);

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

  const typeInfo = (type: RoomType) => types.find((x) => x.type === type);
  const liveFree = (type: RoomType) => avail?.types.find((x) => x.type === type)?.free ?? null;
  const priceOf = (type: RoomType) =>
    avail?.types.find((x) => x.type === type && x.pricePln > 0)?.pricePln ?? typeInfo(type)?.pricePln ?? 0;
  const total = room ? priceOf(room) * nights : 0;

  function clickDay(iso: string) {
    setError(null);
    if (!start || (start && end)) {
      setStart(iso);
      setEnd(null);
    } else if (iso > start) {
      setEnd(iso);
    } else {
      setStart(iso);
      setEnd(null);
    }
  }

  function scrollToBook() {
    const el = document.getElementById("book");
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: "smooth" });
  }

  function confirm() {
    if (!start || !end || !room) return;
    setError(null);
    startTransition(async () => {
      const result = await createPublicBookingByType({
        type: room,
        checkIn: start,
        checkOut: end,
        guestName: guest.name,
        guestEmail: guest.email,
        guestPhone: guest.phone,
      });
      if (result.ok) {
        setConfirmed({ reference: result.reference, roomName: result.roomName });
        setStep(4);
      } else setError(result.error);
    });
  }

  function restart() {
    setStep(1);
    setStart(null);
    setEnd(null);
    setRoom(null);
    setGuest({ name: "", email: "", phone: "" });
    setConfirmed(null);
    setError(null);
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

  const rangeLabel = !start
    ? t.pickDates
    : !end
      ? `${fmtDay(start)} → ?`
      : `${fmtDay(start)} → ${fmtDay(end)} · ${nightsLabel(nights)}`;

  const roomMeta: { type: RoomType; name: string; desc: string; guests: string; ph: string; img: string }[] = [
    { type: "SINGLE", name: t.singleName, desc: t.singleDesc, guests: t.chipGuests1, ph: t.phSingle, img: "/book/single.jpg" },
    { type: "DOUBLE", name: t.doubleName, desc: t.doubleDesc, guests: t.chipGuests2, ph: t.phDouble, img: "/book/double.jpg" },
  ];

  return (
    <div className="bk">
      {/* header */}
      <header className="bk-header">
        <div className="bk-wrap bk-header-row">
          <div className="mr-auto">
            <div className="bk-wordmark">WINDROOMS</div>
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
          <button className="bk-cta" style={{ boxShadow: "0 2px 8px rgba(201,111,74,.35)" }} onClick={() => scrollToBook()}>
            {t.cta}
          </button>
        </div>
      </header>

      {/* hero */}
      <section className="bk-hero">
        <div className="bk-wrap">
          <div className="bk-kicker">OPEN 24/7 · 5 MIN FROM GDAŃSK AIRPORT (GDN)</div>
          <h1 className="bk-serif bk-h1">{t.titleA}</h1>
          <p className="bk-sub">{t.sub}</p>
          <div className="bk-chips">
            <span className="bk-chip">🔑 {t.b1}</span>
            <span className="bk-chip">✈ {t.b2}</span>
            <span className="bk-chip">🕐 {t.b3}</span>
          </div>
          <div className="bk-heroimg">
            <div className="bk-par" ref={heroRef}>
              <PhotoSlot src="/book/hero.jpg" alt="Flyspot Gdańsk building" label={t.phHero} />
            </div>
          </div>
        </div>
      </section>

      {/* rooms */}
      <section className="bk-section off">
        <div className="bk-wrap">
          <h2 className="bk-serif bk-h2">{t.roomsTitle}</h2>
          <p className="bk-h2sub">{t.roomsSub}</p>
          <div className="bk-rooms">
            {roomMeta.map((r) => {
              const info = typeInfo(r.type);
              return (
                <div key={r.type} className="bk-roomcard">
                  <div className="ph" style={{ height: 220 }}>
                    <PhotoSlot src={r.img} alt={r.name} label={r.ph} />
                  </div>
                  <div className="bk-roombody">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div className="bk-serif bk-roomname">{r.name}</div>
                      <div className="bk-pricetag">
                        <b>{fmt(info?.pricePln ?? 0)}</b> <span>{t.perNight}</span>
                      </div>
                    </div>
                    <p style={{ color: "var(--slate)", fontSize: 14 }}>{r.desc}</p>
                    <div className="bk-minichips">
                      <span className="bk-minichip">{r.guests}</span>
                      <span className="bk-minichip">{t.chipWifi}</span>
                      <span className="bk-minichip">{t.chipCode}</span>
                      <span className="bk-minichip">{info?.count ?? 0} {t.availOfType}</span>
                    </div>
                    <div style={{ marginTop: "auto" }}>
                      <Link href={`/book/${r.type.toLowerCase()}`} className="bk-cta sq">{t.select}</Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* how-to */}
      <section className="bk-section">
        <div className="bk-wrap">
          <h2 className="bk-serif bk-h2" style={{ marginBottom: 36 }}>{t.howTitle}</h2>
          <div className="bk-steps">
            {[
              { n: "1", title: t.s1t, body: t.s1d },
              { n: "2", title: t.s2t, body: t.s2d },
              { n: "3", title: t.s3t, body: t.s3d },
            ].map((sItem) => (
              <div key={sItem.n} className="bk-stepcard">
                <div className="bk-serif bk-stepnum">{sItem.n}</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{sItem.title}</div>
                <div style={{ color: "var(--slate)", fontSize: 14 }}>{sItem.body}</div>
              </div>
            ))}
          </div>
          <div className="bk-note">
            <div className="ico">🌀</div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.whyTitle}</div>
              <div style={{ color: "var(--slate)", fontSize: 14 }}>{t.whyBody}</div>
            </div>
          </div>
        </div>
      </section>

      {/* booking flow */}
      <section className="bk-book" id="book">
        <div className="bk-wrap">
          <div className="bk-bookhead">
            <h2 className="bk-serif bk-h2b">{t.bookTitle}</h2>
            <span className="bk-stepcount">{t.stepOf(step)}</span>
          </div>
          <div className="bk-card">
            {!bookingEnabled ? (
              <p style={{ color: "var(--slate)" }}>Online booking is not open at the moment — please check back soon.</p>
            ) : step === 1 ? (
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
                  <span className="bk-cal-month">{t.months[viewM]} {viewY}</span>
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
                    const isEdge = dayIso === start || dayIso === end;
                    const inRange = start !== null && end !== null && dayIso > start && dayIso < end;
                    return (
                      <button
                        key={i}
                        disabled={past}
                        onClick={() => clickDay(dayIso)}
                        className={`bk-day ${isEdge ? "edge" : ""} ${inRange ? "range" : ""}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className="bk-cal-foot">
                  <span className="bk-rangelbl">{rangeLabel}</span>
                  <button className="bk-cta" disabled={!start || !end} onClick={() => setStep(2)}>
                    {t.checkAvailL}
                  </button>
                </div>
                <div className="bk-smallprint">{t.footTimes}</div>
              </>
            ) : step === 2 ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>{t.chooseRoom}</div>
                {roomMeta.map((r) => {
                  const free = liveFree(r.type);
                  const disabled = free !== null && free === 0;
                  return (
                    <button
                      key={r.type}
                      disabled={disabled}
                      className={`bk-roomrow ${room === r.type ? "on" : ""}`}
                      onClick={() => setRoom(r.type)}
                    >
                      <span>
                        <span className="nm">{r.name}</span>
                        <br />
                        <span className="meta">
                          {r.guests} · {free === null ? t.checking : disabled ? t.noneFree : t.freeNow(free)}
                        </span>
                      </span>
                      <span className="pr">{fmt(priceOf(r.type))}<span style={{ color: "var(--slate)", fontSize: 13, fontWeight: 400 }}> {t.perNight}</span></span>
                    </button>
                  );
                })}
                <div className="bk-cal-foot">
                  <button className="bk-back" onClick={() => setStep(1)}>← {t.backL}</button>
                  <button className="bk-cta" disabled={!room || liveFree(room) === 0} onClick={() => setStep(3)}>
                    {t.continueL}
                  </button>
                </div>
              </>
            ) : step === 3 ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>{t.detailsL}</div>
                <div className="bk-summary">
                  <span>{room === "SINGLE" ? t.singleName : t.doubleName}</span>
                  <span>
                    {start && fmtDay(start)} → {end && fmtDay(end)} · {nightsLabel(nights)}
                  </span>
                  <b className="total" style={{ marginLeft: "auto" }}>
                    {t.totalL}: {fmt(total)}
                  </b>
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
                {error && <p className="bk-err">{error}</p>}
                <div className="bk-cal-foot">
                  <button className="bk-back" onClick={() => setStep(2)}>← {t.backL}</button>
                  <button className="bk-cta" disabled={pending || !guest.name.trim() || !guest.email.trim()} onClick={confirm}>
                    {pending ? t.booking : t.confirmBtn}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="bk-serif" style={{ fontSize: 30, marginBottom: 8 }}>{t.confTitle}</h3>
                <p style={{ color: "var(--slate)", fontSize: 15 }}>
                  {confirmed?.roomName && `${room === "SINGLE" ? t.singleName : t.doubleName} · `}
                  {start && fmtDay(start)} → {end && fmtDay(end)} · {nightsLabel(nights)} · {t.totalL}: {fmt(total)}
                </p>
                <div className="bk-codecard">
                  <div className="lbl">{t.codeLbl}</div>
                  <div className="code">{confirmed?.reference}</div>
                </div>
                <p style={{ color: "var(--slate)", fontSize: 14, marginBottom: 18 }}>{t.confBody}</p>
                <button className="bk-cta sq" onClick={restart}>{t.restartL}</button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* location */}
      <section className="bk-section">
        <div className="bk-wrap bk-loc">
          <div>
            <h2 className="bk-serif bk-h2" style={{ textAlign: "left" }}>{t.locTitle}</h2>
            <p style={{ color: "var(--slate)", marginTop: 10 }}>{t.locBody}</p>
            <p style={{ marginTop: 10 }}>
              <a
                href="https://maps.google.com/?q=Flyspot+Gda%C5%84sk,+Juliusza+S%C5%82owackiego+197A,+80-298+Gda%C5%84sk"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--nav)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                {lang === "en" ? "Open in Google Maps →" : "Otwórz w Mapach Google →"}
              </a>
            </p>
            <div className="bk-fact">✈ {t.b2}</div>
            <div className="bk-fact">🕐 {t.b3}</div>
          </div>
          <div className="ph">
            <PhotoSlot src="/book/location.jpg" alt="Location" label={t.phLoc} />
          </div>
        </div>
      </section>

      {/* footer */}
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
