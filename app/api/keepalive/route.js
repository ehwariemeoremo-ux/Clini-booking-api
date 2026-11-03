// GET /api/keepalive
// A tiny "are you awake?" check. A daily scheduled job (see vercel.json) calls it,
// and it asks the database one harmless question. This keeps the free Supabase
// project active so it does not get paused for being unused.
// It returns no data, so it is safe to leave without an API key.
import { pool } from "../../../lib/db.js";
import { json } from "../../../lib/http.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await pool.query("SELECT count(*)::int AS n FROM slots");
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: "database not reachable" }, 500);
  }
}
