"use client";
// The simple web page: see free slots, book one, see the confirmation.
// It talks to our own API (/slots and /bookings) with fetch().
import { useEffect, useState } from "react";

function when(text) {
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function hasStarted(slot) {
  const t = new Date(slot.start).getTime();
  return !Number.isNaN(t) && t <= Date.now();
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [slots, setSlots] = useState([]);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState(null);
  const [idemKey, setIdemKey] = useState("");

  // Remember the key while this browser tab stays open.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("clinicApiKey");
      if (saved) setApiKey(saved);
    } catch {}
  }, []);

  // A fresh Idempotency-Key whenever the form changes. If someone double-clicks
  // "Confirm", both clicks carry the SAME key, so only one booking is created.
  useEffect(() => {
    setIdemKey(crypto.randomUUID());
  }, [selected, name, email]);

  function changeKey(value) {
    setApiKey(value);
    try {
      sessionStorage.setItem("clinicApiKey", value);
    } catch {}
  }

  async function loadSlots(chosenProvider) {
    setLoading(true);
    setError("");
    try {
      const url = chosenProvider ? "/slots?provider=" + encodeURIComponent(chosenProvider) : "/slots";
      const res = await fetch(url, { headers: { "X-API-Key": apiKey }, cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load slots");
      setSlots(data.slots);
      if (!chosenProvider) setProviders([...new Set(data.slots.map((s) => s.provider))]);
      setLoaded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function chooseProvider(value) {
    setProvider(value);
    loadSlots(value);
  }

  async function book(event) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({ slot_id: selected.id, name, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          const wait = res.headers.get("Retry-After");
          throw new Error(data.error + " (try again in " + wait + " seconds)");
        }
        throw new Error(data.error || "Booking failed");
      }
      setBooking(data);
      setSelected(null);
      setName("");
      setEmail("");
      loadSlots(provider);
    } catch (err) {
      setError(err.message);
      loadSlots(provider);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <h1>Clinic Booking</h1>
      <p className="muted">Pick a time, enter your details, and get your confirmation.</p>

      <section className="card">
        <label htmlFor="key">API key</label>
        <div className="row">
          <input
            id="key"
            type="password"
            value={apiKey}
            onChange={(e) => changeKey(e.target.value)}
            placeholder="Paste the API key"
            autoComplete="off"
          />
          <button onClick={() => loadSlots(provider)} disabled={!apiKey || loading}>
            {loading ? "Loading..." : loaded ? "Refresh" : "Load slots"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </section>

      {booking && (
        <section className="card success">
          <h2>Booking confirmed</h2>
          <dl>
            <dt>Booking ID</dt><dd>{booking.id}</dd>
            <dt>Slot</dt><dd>{booking.slot_id}</dd>
            <dt>Name</dt><dd>{booking.name}</dd>
            <dt>Email</dt><dd>{booking.email}</dd>
            <dt>Status</dt><dd>{booking.status}</dd>
            <dt>Booked at</dt><dd>{when(booking.created_at)}</dd>
          </dl>
        </section>
      )}

      {selected && (
        <section className="card">
          <h2>Book: {selected.provider}</h2>
          <p className="muted">{when(selected.start)} to {when(selected.end)}</p>
          <form onSubmit={book}>
            <label htmlFor="name">Your name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            <label htmlFor="email">Your email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {error && <div className="error">{error}</div>}
            <div className="row" style={{ marginTop: 14 }}>
              <button type="submit" disabled={saving}>{saving ? "Booking..." : "Confirm booking"}</button>
              <button type="button" className="ghost" onClick={() => setSelected(null)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {loaded && (
        <section className="card">
          <h2>Available slots</h2>
          {providers.length > 1 && (
            <>
              <label htmlFor="provider">Doctor</label>
              <select id="provider" value={provider} onChange={(e) => chooseProvider(e.target.value)}>
                <option value="">All doctors</option>
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </>
          )}
          {slots.length === 0 ? (
            <p className="muted">No slots found.</p>
          ) : (
            <ul className="slots">
              {slots.map((s) => (
                <li key={s.id} className={s.available && !hasStarted(s) ? "slot" : "slot taken"}>
                  <div>
                    <strong>{s.provider}</strong>
                    <div className="muted">{when(s.start)} to {when(s.end)}</div>
                  </div>
                  {hasStarted(s) ? (
                    <span className="badge">Past</span>
                  ) : s.available ? (
                    <button
                      onClick={() => {
                        setSelected(s);
                        setBooking(null);
                        setError("");
                      }}
                    >
                      Book
                    </button>
                  ) : (
                    <span className="badge">Booked</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
