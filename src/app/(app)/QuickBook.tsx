"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clientBalanceAt, quickBook } from "@/app/actions/quickbook";
import { sendPaymentLink } from "@/app/actions/payments";
import { saveClient } from "@/app/actions/clients";
import DateRangePicker from "@/components/DateRangePicker";
import { findAlternatives } from "@/app/actions/reservations";
import TimeSelect from "@/components/TimeSelect";
import { addDays, nightsBetween, todayYmd } from "@/lib/dates";
import type { RoomType } from "@prisma/client";

type ClientOpt = { id: number; name: string; email: string | null };
type LocOpt = {
  id: number;
  name: string;
  rooms: { id: number; name: string; type: RoomType; pricePln: number | null }[];
};

export default function QuickBook({ clients, locations }: { clients: ClientOpt[]; locations: LocOpt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
        <span className="text-base leading-none">+</span> Quick booking
      </button>
      {open && <QuickBookModal clients={clients} locations={locations} onClose={() => setOpen(false)} />}
    </>
  );
}

function ClientPicker({
  clients,
  value,
  onPick,
  placeholder,
  allowCreate,
}: {
  clients: ClientOpt[];
  value: ClientOpt | null;
  onPick: (c: ClientOpt | null) => void;
  placeholder: string;
  allowCreate?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", category: "FLYSPOT" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  function create() {
    setCreateError(null);
    startTransition(async () => {
      const result = await saveClient({
        name: newClient.name,
        email: newClient.email,
        phone: newClient.phone,
        category: newClient.category as "FLYSPOT" | "EXTERNAL" | "COACH",
      });
      if (result.ok && result.id) {
        onPick({ id: result.id, name: newClient.name.trim(), email: newClient.email.trim().toLowerCase() });
        setCreating(false);
        setQuery("");
      } else if (!result.ok) setCreateError(result.error);
    });
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setFocus(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, query]);

  if (value) {
    return (
      <div className="field flex items-center justify-between gap-2">
        <span className="truncate">{value.name}</span>
        <button type="button" onClick={() => onPick(null)} className="text-faint hover:text-bad text-xs shrink-0">✕</button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="rounded-xl border border-acc/50 bg-hovr p-3 space-y-2">
        <div className="label-mono">New client — email is required</div>
        <input className="field" placeholder="Full name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input type="email" className="field" placeholder="Email *" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
          <input className="field" placeholder="Phone" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
        </div>
        <select className="field" value={newClient.category} onChange={(e) => setNewClient({ ...newClient, category: e.target.value })}>
          <option value="FLYSPOT">Flyspot client</option>
          <option value="EXTERNAL">External client</option>
          <option value="COACH">Coach</option>
        </select>
        {createError && <p className="text-xs text-bad">{createError}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={create} disabled={pending || !newClient.name.trim() || !newClient.email.trim()} className="btn-primary text-xs">
            {pending ? "…" : "Add client"}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="btn-ghost text-xs ml-auto">Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <input
        className="field"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocus(true)}
      />
      {focus && (matches.length > 0 || (allowCreate && query.trim().length > 1)) && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-line bg-card shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick(c);
                setQuery("");
                setFocus(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-hovr"
            >
              <div className="text-sm">{c.name}</div>
              {c.email && <div className="text-xs text-faint">{c.email}</div>}
            </button>
          ))}
          {allowCreate && query.trim().length > 1 && (
            <button
              type="button"
              onClick={() => {
                setNewClient({ name: query.trim(), email: "", phone: "", category: "FLYSPOT" });
                setCreating(true);
                setFocus(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-hovr border-t border-line text-acc text-sm"
            >
              + Add “{query.trim()}” as a new client
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QuickBookModal({
  clients,
  locations,
  onClose,
}: {
  clients: ClientOpt[];
  locations: LocOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const today = todayYmd();
  const [client, setClient] = useState<ClientOpt | null>(null);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? 0);
  const location = locations.find((l) => l.id === locationId);
  const [roomId, setRoomId] = useState(location?.rooms[0]?.id ?? 0);
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addDays(today, 1));
  const [checkInTime, setCheckInTime] = useState("15:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [notes, setNotes] = useState("");

  const [balance, setBalance] = useState<number | null>(null);
  const [freeRoomIds, setFreeRoomIds] = useState<Set<number> | null>(null);
  const [ownCredits, setOwnCredits] = useState(0);
  const [ownTouched, setOwnTouched] = useState(false);
  const [donor, setDonor] = useState<ClientOpt | null>(null);
  const [donorNights, setDonorNights] = useState(0);
  const [remainderVia, setRemainderVia] = useState<"LINK" | "RECEPTION">("LINK");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [payLink, setPayLink] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const nights = nightsBetween(checkIn, checkOut);
  const room = location?.rooms.find((r) => r.id === roomId);
  const remaining = Math.max(0, nights - ownCredits - donorNights);

  // Which rooms are free for the chosen dates (occupied ones get disabled)
  useEffect(() => {
    let alive = true;
    setFreeRoomIds(null);
    findAlternatives(locationId, checkIn, checkOut).then((a) => {
      if (!alive) return;
      const free = new Set(a.freeRooms.map((r) => r.id));
      setFreeRoomIds(free);
      if (!free.has(roomId) && free.size > 0) setRoomId([...free][0]);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, checkIn, checkOut]);

  // Balance lookup whenever client/location changes; default own credits to min(balance, nights)
  useEffect(() => {
    let alive = true;
    setBalance(null);
    if (!client) {
      setOwnCredits(0);
      return;
    }
    clientBalanceAt(client.id, locationId).then((b) => {
      if (!alive) return;
      setBalance(b);
      if (!ownTouched) setOwnCredits(Math.max(0, Math.min(b, nights)));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, locationId, nights]);

  // Default link amount from the room's public price
  useEffect(() => {
    if (!amountTouched && room?.pricePln) setAmount(remaining > 0 ? String(remaining * room.pricePln) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, roomId]);

  function submit() {
    if (!client) return;
    setError(null);
    startTransition(async () => {
      const result = await quickBook({
        clientId: client.id,
        roomId,
        checkIn,
        checkOut,
        checkInTime,
        checkOutTime,
        creditsFromClient: ownCredits,
        donorClientId: donor?.id ?? null,
        donorNights,
        remainderVia: remaining > 0 ? remainderVia : "NONE",
        remainderAmountPln: amount ? Number(amount) : null,
        notes,
      });
      if (result.ok) {
        setSavedId(result.id);
        setPayLink(result.payLink ?? null);
        setPaymentId(result.paymentId ?? null);
        router.refresh();
      } else setError(result.error);
    });
  }

  const label = "block label-mono mb-1";

  if (savedId) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl bg-card border border-line shadow-xl p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="mx-auto w-12 h-12 rounded-full bg-ok-soft text-ok flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h2 className="font-semibold">Booked — reservation #{savedId}</h2>
          {payLink && (
            <div className="space-y-2">
              {paymentId && (
                <button
                  disabled={pending || linkSent}
                  onClick={() =>
                    startTransition(async () => {
                      setSendError(null);
                      const r = await sendPaymentLink(paymentId);
                      if (r.ok) setLinkSent(true);
                      else setSendError(r.error);
                    })
                  }
                  className={`w-full rounded-lg py-2 text-sm font-medium ${
                    linkSent ? "bg-ok-soft text-ok" : "bg-acc hover:bg-acc-strong text-white"
                  }`}
                >
                  {linkSent ? "✓ Payment link sent" : "Send payment link"}
                </button>
              )}
              {sendError && <p className="text-xs text-warn">{sendError}</p>}
              <p className="text-sm text-mut">Payment link:</p>
              <div className="flex items-center gap-2">
                <input readOnly className="field font-mono text-xs" value={typeof window !== "undefined" ? window.location.origin + payLink : payLink} />
                <button
                  className="btn-ghost text-xs"
                  onClick={() => navigator.clipboard.writeText(window.location.origin + payLink)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          <button onClick={onClose} className="btn-primary w-full">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-card border border-line shadow-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold">
          Quick booking
          <span className="text-faint font-normal text-sm ml-2">{nights > 0 ? `${nights} night(s)` : ""}</span>
        </h2>

        <div>
          <label className={label}>Client</label>
          <ClientPicker clients={clients} value={client} onPick={setClient} placeholder="Start typing a name or email…" allowCreate />
          {client && balance !== null && (
            <p className="text-xs mt-1 text-mut">
              Night credits here: <b className={balance > 0 ? "text-ok" : "text-faint"}>{balance}</b>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Location</label>
            <select
              className="field"
              value={locationId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setLocationId(id);
                setRoomId(locations.find((l) => l.id === id)?.rooms[0]?.id ?? 0);
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Room</label>
            <select className="field" value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
              {location?.rooms.map((r) => {
                const occupied = freeRoomIds !== null && !freeRoomIds.has(r.id);
                return (
                  <option key={r.id} value={r.id} disabled={occupied}>
                    {r.name} ({r.type.toLowerCase()}){occupied ? " · occupied" : ""}
                  </option>
                );
              })}
            </select>
            {freeRoomIds !== null && freeRoomIds.size === 0 && (
              <p className="text-xs text-warn mt-1">All rooms taken for these dates — use the calendar to book a split stay via a partner hotel.</p>
            )}
          </div>
          <div className="col-span-2">
            <label className={label}>Stay · check-in → check-out</label>
            <DateRangePicker
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={(ci, co) => {
                setCheckIn(ci);
                setCheckOut(co);
              }}
            />
          </div>
          <div>
            <label className={label}>Arrival time</label>
            <TimeSelect value={checkInTime} onChange={setCheckInTime} />
          </div>
          <div>
            <label className={label}>Departure time</label>
            <TimeSelect value={checkOutTime} onChange={setCheckOutTime} />
          </div>
        </div>

        {client && (
          <div className="rounded-xl bg-hovr p-3 space-y-3">
            <div className="label-mono">Payment · {nights} night(s) to cover</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Client&apos;s own credits</label>
                <input
                  inputMode="numeric"
                  className="field"
                  value={ownCredits}
                  onChange={(e) => {
                    setOwnTouched(true);
                    setOwnCredits(Math.max(0, Math.min(Number(e.target.value) || 0, Math.min(balance ?? 0, nights))));
                  }}
                />
              </div>
              <div>
                <label className={label}>Nights from another client</label>
                <input
                  inputMode="numeric"
                  className="field"
                  value={donorNights}
                  onChange={(e) => setDonorNights(Math.max(0, Math.min(Number(e.target.value) || 0, nights - ownCredits)))}
                />
              </div>
            </div>
            {donorNights > 0 && (
              <div>
                <label className={label}>Covering client</label>
                <ClientPicker
                  clients={clients.filter((c) => c.id !== client.id)}
                  value={donor}
                  onPick={setDonor}
                  placeholder="Whose credits cover these nights?"
                />
              </div>
            )}
            {remaining > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Remaining {remaining} night(s) via</label>
                  <select className="field" value={remainderVia} onChange={(e) => setRemainderVia(e.target.value as "LINK" | "RECEPTION")}>
                    <option value="LINK">Payment link</option>
                    <option value="RECEPTION">Pay at reception</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Amount (PLN)</label>
                  <input
                    inputMode="decimal"
                    className="field font-mono"
                    value={amount}
                    onChange={(e) => {
                      setAmountTouched(true);
                      setAmount(e.target.value);
                    }}
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-faint">
              {ownCredits} own + {donorNights} donated + {remaining} {remainderVia === "LINK" ? "via link" : "at reception"} = {nights} night(s)
            </p>
          </div>
        )}

        <div>
          <label className={label}>Notes</label>
          <textarea rows={2} className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={submit} disabled={pending || !client || nights <= 0} className="btn-primary">
            {pending ? "…" : "Book"}
          </button>
          <button onClick={onClose} className="btn-ghost ml-auto">Close</button>
        </div>
      </div>
    </div>
  );
}
