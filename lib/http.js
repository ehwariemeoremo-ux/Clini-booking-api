// Small helpers so every endpoint answers in the same way.
import crypto from "crypto";

// Send a JSON answer.
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// LEVEL 2: is the X-API-Key header the same as our secret API_KEY?
// We compare "fingerprints" of the two keys so timing cannot leak hints.
export function hasValidKey(request) {
  const real = process.env.API_KEY || "";
  if (!real) return false;
  const given = request.headers.get("x-api-key") || "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

export function unauthorized() {
  return json({ error: "missing or invalid API key" }, 401);
}

// Read the request body as JSON without crashing on bad input.
export async function readJson(request) {
  try {
    const text = await request.text();
    if (!text.trim()) return { ok: false };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

// Turn a database row into the booking shape the spec asks for.
export function formatBooking(row) {
  return {
    id: row.id,
    slot_id: row.slot_id,
    name: row.name,
    email: row.email,
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
  };
}
