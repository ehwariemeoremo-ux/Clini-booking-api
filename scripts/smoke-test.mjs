// A self-check you run from your own laptop AFTER deploying, BEFORE you submit.
// Usage:  node scripts/smoke-test.mjs https://your-app.vercel.app YOUR_API_KEY
// WARNING: it calls /reset, which wipes all slots and bookings.
// Do not run it again after you have submitted the form.

const [base, key] = process.argv.slice(2);
if (!base || !key) {
  console.log("Usage: node scripts/smoke-test.mjs https://your-app.vercel.app YOUR_API_KEY");
  process.exit(1);
}

let failed = 0;
function check(name, ok, detail = "") {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "   -> " + detail));
  if (!ok) failed += 1;
}

async function call(method, path, body, extraHeaders = {}, withKey = true) {
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (withKey) headers["X-API-Key"] = key;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, headers: res.headers };
}

const future = (n) => "2030-01-" + String(10 + n).padStart(2, "0") + "T09:00:00Z";
const futureEnd = (n) => "2030-01-" + String(10 + n).padStart(2, "0") + "T09:30:00Z";
const slots = [
  { id: "s1", provider: "Dr Ade", start: future(1), end: futureEnd(1) },
  { id: "s2", provider: "Dr Ade", start: future(2), end: futureEnd(2) },
  { id: "s3", provider: "Dr Bola", start: future(3), end: futureEnd(3) },
  { id: "s4", provider: "Dr Bola", start: future(4), end: futureEnd(4) },
  { id: "s5", provider: "Dr Ade", start: future(5), end: futureEnd(5) },
  { id: "s6", provider: "Dr Ade", start: future(6), end: futureEnd(6) },
  { id: "s7", provider: "Dr Ade", start: future(7), end: futureEnd(7) },
  { id: "s8", provider: "Dr Ade", start: future(8), end: futureEnd(8) },
  { id: "past", provider: "Dr Ade", start: "2020-01-01T09:00:00Z", end: "2020-01-01T09:30:00Z" },
];

// ---- Level 2: key
let r = await call("GET", "/slots", null, {}, false);
check("no API key gives 401", r.status === 401, "got " + r.status);
r = await fetch(base + "/slots", { headers: { "X-API-Key": "wrong-key" } });
check("wrong API key gives 401", r.status === 401, "got " + r.status);

// ---- Level 1
r = await call("POST", "/reset", { slots });
check("reset gives 200", r.status === 200, "got " + r.status + " " + JSON.stringify(r.data));
r = await call("GET", "/slots");
check("slots listed, earliest first", r.status === 200 && r.data.slots.length === 9 && r.data.slots[0].id === "past", JSON.stringify(r.data));
check("slot has start, end and available", r.data.slots[1].start === future(1) && r.data.slots[1].available === true, JSON.stringify(r.data.slots[1]));
r = await call("GET", "/slots?provider=Dr%20Bola");
check("provider filter works", r.status === 200 && r.data.slots.length === 2, JSON.stringify(r.data));

r = await call("POST", "/bookings", { slot_id: "s1", name: "  Ada Obi ", email: "  ADA@Example.com " });
check("book gives 201 confirmed", r.status === 201 && r.data.status === "confirmed", r.status + " " + JSON.stringify(r.data));
check("name trimmed, email lower-cased", r.data.name === "Ada Obi" && r.data.email === "ada@example.com", JSON.stringify(r.data));
const adaId = r.data.id;
r = await call("GET", "/bookings/" + adaId);
check("look up booking gives 200", r.status === 200 && r.data.id === adaId, r.status);
r = await call("GET", "/bookings/does-not-exist");
check("unknown booking gives 404", r.status === 404, r.status);
r = await call("GET", "/slots");
check("booked slot is no longer available", r.data.slots.find((s) => s.id === "s1").available === false);

// ---- Level 2: details
r = await call("POST", "/bookings", { slot_id: "s2", email: "v1@example.com" });
check("missing name gives 400", r.status === 400, r.status);
r = await call("POST", "/bookings", { slot_id: "s2", name: "V", email: "not-an-email" });
check("bad email gives 400", r.status === 400, r.status);
r = await call("POST", "/bookings", { name: "V", email: "v3@example.com" });
check("missing slot_id gives 400", r.status === 400, r.status);
r = await call("POST", "/bookings", { slot_id: "nope", name: "V", email: "v4@example.com" });
check("unknown slot gives 404", r.status === 404, r.status);
r = await call("POST", "/bookings", { slot_id: "past", name: "V", email: "v5@example.com" });
check("slot already started gives 400", r.status === 400, r.status);

// ---- Level 3
r = await call("POST", "/bookings", { slot_id: "s1", name: "Bola", email: "bola@example.com" });
check("slot already booked gives 409", r.status === 409, r.status);
const race = await Promise.all(
  Array.from({ length: 20 }, (_, i) => call("POST", "/bookings", { slot_id: "s2", name: "Racer " + i, email: "racer" + i + "@example.com" }))
);
const wins = race.filter((x) => x.status === 201).length;
const losses = race.filter((x) => x.status === 409).length;
check("20 simultaneous bookings: exactly one wins", wins === 1 && losses === 19, wins + " won, " + losses + " got 409");
r = await call("DELETE", "/bookings/" + adaId);
check("cancel gives 200 cancelled", r.status === 200 && r.data.status === "cancelled", r.status + " " + JSON.stringify(r.data));
r = await call("DELETE", "/bookings/" + adaId);
check("cancel twice gives 409", r.status === 409, r.status);
r = await call("DELETE", "/bookings/does-not-exist");
check("cancel unknown gives 404", r.status === 404, r.status);
r = await call("POST", "/bookings", { slot_id: "s1", name: "Bola", email: "bola@example.com" });
check("cancelled slot can be booked again", r.status === 201, r.status);

// ---- Level 4: idempotency
const body = { slot_id: "s3", name: "Idem Potent", email: "idem@example.com" };
const first = await call("POST", "/bookings", body, { "Idempotency-Key": "key-1" });
const again = await call("POST", "/bookings", body, { "Idempotency-Key": "key-1" });
check("same key + same body: same status and id", first.status === 201 && again.status === 201 && first.data.id === again.data.id, JSON.stringify([first.data, again.data]));
const different = await call("POST", "/bookings", { ...body, name: "Someone Else" }, { "Idempotency-Key": "key-1" });
check("same key + different body gives 422", different.status === 422, different.status);
const parallel = await Promise.all(
  Array.from({ length: 8 }, () => call("POST", "/bookings", { slot_id: "s4", name: "Twin", email: "twin@example.com" }, { "Idempotency-Key": "key-2" }))
);
const ids = new Set(parallel.map((x) => x.data && x.data.id));
check("8 simultaneous retries create one booking", parallel.every((x) => x.status === 201) && ids.size === 1, JSON.stringify(parallel.map((x) => x.status)));

// ---- Level 4: paging
for (const id of ["s5", "s6", "s7", "s8"]) {
  await call("POST", "/bookings", { slot_id: id, name: "Pager", email: "pager@example.com" });
}
await call("POST", "/bookings", { slot_id: "s2", name: "Pager", email: "pager@example.com" }); // 409, still an attempt
r = await call("GET", "/bookings?email=PAGER@example.com&limit=2");
check("page 1 has 2 bookings and a cursor", r.status === 200 && r.data.bookings.length === 2 && typeof r.data.next_cursor === "string", JSON.stringify(r.data));
const seenIds = r.data.bookings.map((b) => b.id);
let cursor = r.data.next_cursor;
let pages = 1;
while (cursor && pages < 10) {
  r = await call("GET", "/bookings?email=pager@example.com&limit=2&cursor=" + encodeURIComponent(cursor));
  seenIds.push(...r.data.bookings.map((b) => b.id));
  cursor = r.data.next_cursor;
  pages += 1;
}
check("paging walks through all 4 bookings once", seenIds.length === 4 && new Set(seenIds).size === 4 && cursor === null, seenIds.length + " seen, last cursor " + cursor);
r = await call("GET", "/bookings?email=pager@example.com&limit=0");
check("limit=0 gives 400", r.status === 400, r.status);
r = await call("GET", "/bookings?email=pager@example.com&limit=51");
check("limit=51 gives 400", r.status === 400, r.status);

// ---- Level 5: rate limit
const limited = [];
for (let i = 0; i < 6; i++) {
  limited.push(await call("POST", "/bookings", { slot_id: "nope", name: "Spam", email: "spam@example.com" }));
}
check("first 5 attempts are answered normally (404)", limited.slice(0, 5).every((x) => x.status === 404), JSON.stringify(limited.map((x) => x.status)));
check("6th attempt gives 429", limited[5].status === 429, limited[5].status);
const retry = limited[5].headers.get("retry-after");
check("Retry-After is a whole number of seconds", /^\d+$/.test(retry || "") && Number(retry) >= 1 && Number(retry) <= 60, retry);
r = await call("POST", "/bookings", { slot_id: "nope", name: "Other", email: "other@example.com" });
check("another email is not affected", r.status === 404, r.status);

console.log(failed === 0 ? "\nAll checks passed." : "\n" + failed + " check(s) failed.");
process.exit(failed === 0 ? 0 : 1);
