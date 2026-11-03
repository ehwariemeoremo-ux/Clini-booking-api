// POST /bookings  (Levels 1 to 5)  -> book a slot
// GET  /bookings  (Level 4)        -> list one person's bookings, page by page
import { pool } from "../../lib/db.js";
import { createBooking } from "../../lib/createBooking.js";
import { hasValidKey, unauthorized, json, readJson, formatBooking } from "../../lib/http.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  if (!hasValidKey(request)) return unauthorized();

  try {
    const parsed = await readJson(request);
    if (!parsed.ok) return json({ error: "request body must be valid JSON" }, 400);

    const key = (request.headers.get("idempotency-key") || "").trim();
    if (key.length > 255) return json({ error: "Idempotency-Key is too long" }, 400);

    const result = await createBooking(parsed.value, key || null);
    return json(result.body, result.status, result.headers || {});
  } catch (err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  }
}

// A "cursor" is a bookmark: it remembers where the last page ended.
function encodeCursor(seq) {
  return Buffer.from(String(seq)).toString("base64url");
}
function decodeCursor(text) {
  try {
    const value = Buffer.from(text, "base64url").toString();
    return /^\d+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  if (!hasValidKey(request)) return unauthorized();

  try {
    const params = new URL(request.url).searchParams;

    const email = (params.get("email") || "").trim().toLowerCase();
    if (!email) return json({ error: "email query parameter is required" }, 400);

    let limit = 10;
    if (params.has("limit")) {
      const raw = params.get("limit").trim();
      if (!/^\d+$/.test(raw)) return json({ error: "limit must be a whole number from 1 to 50" }, 400);
      limit = parseInt(raw, 10);
      if (limit < 1 || limit > 50) return json({ error: "limit must be a whole number from 1 to 50" }, 400);
    }

    let after = "0";
    const cursor = params.get("cursor");
    if (cursor) {
      after = decodeCursor(cursor);
      if (after === null) return json({ error: "cursor is not valid" }, 400);
    }

    // Ask for one extra row: if it exists, there is another page.
    const { rows } = await pool.query(
      `SELECT seq, id, slot_id, name, email, status, created_at
         FROM bookings
        WHERE email = $1 AND seq > $2
        ORDER BY seq ASC
        LIMIT $3`,
      [email, after, limit + 1]
    );

    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? encodeCursor(page[page.length - 1].seq) : null;

    return json({ bookings: page.map(formatBooking), next_cursor: nextCursor });
  } catch (err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  }
}
