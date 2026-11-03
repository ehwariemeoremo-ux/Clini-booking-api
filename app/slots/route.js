// GET /slots  (Level 1)
// Every slot, earliest first. Optional ?provider=Dr Ade (exact match).
import { pool } from "../../lib/db.js";
import { hasValidKey, unauthorized, json } from "../../lib/http.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  if (!hasValidKey(request)) return unauthorized();

  try {
    const provider = new URL(request.url).searchParams.get("provider");
    const params = [];
    let where = "";
    if (provider) {
      params.push(provider);
      where = "WHERE s.provider = $1";
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.provider, s.start_text, s.end_text,
              NOT EXISTS (
                SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed'
              ) AS available
         FROM slots s
         ${where}
        ORDER BY s.start_ts ASC, s.id ASC`,
      params
    );

    return json({
      slots: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        start: r.start_text,
        end: r.end_text,
        available: r.available,
      })),
    });
  } catch (err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  }
}
