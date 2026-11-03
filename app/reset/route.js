// POST /reset  (Level 1)
// Deletes every booking and replaces all slots with the ones we are sent.
import { pool } from "../../lib/db.js";
import { hasValidKey, unauthorized, json, readJson } from "../../lib/http.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  if (!hasValidKey(request)) return unauthorized();

  try {
    const parsed = await readJson(request);
    if (!parsed.ok || !parsed.value || !Array.isArray(parsed.value.slots)) {
      return json({ error: 'body must look like {"slots": [...]}' }, 400);
    }

    const ids = [];
    const providers = [];
    const starts = [];
    const ends = [];
    const startTimes = [];
    const seen = new Set();

    for (const slot of parsed.value.slots) {
      const ok =
        slot &&
        typeof slot === "object" &&
        typeof slot.id === "string" && slot.id.trim() !== "" &&
        typeof slot.provider === "string" && slot.provider.trim() !== "" &&
        typeof slot.start === "string" && !Number.isNaN(Date.parse(slot.start)) &&
        typeof slot.end === "string" && !Number.isNaN(Date.parse(slot.end));
      if (!ok) {
        return json({ error: "every slot needs id, provider, start and end (start and end as date-time text)" }, 400);
      }
      if (seen.has(slot.id)) return json({ error: "duplicate slot id: " + slot.id }, 400);
      seen.add(slot.id);

      ids.push(slot.id);
      providers.push(slot.provider);
      starts.push(slot.start);
      ends.push(slot.end);
      startTimes.push(new Date(slot.start).toISOString());
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM bookings");
      await client.query("DELETE FROM rate_attempts");
      await client.query("DELETE FROM idempotency_keys");
      await client.query("DELETE FROM slots");
      if (ids.length > 0) {
        await client.query(
          `INSERT INTO slots (id, provider, start_text, end_text, start_ts)
           SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])`,
          [ids, providers, starts, ends, startTimes]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw err;
    } finally {
      client.release();
    }

    return json({ ok: true, slots: ids.length });
  } catch (err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  }
}
