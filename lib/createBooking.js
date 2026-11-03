// The heart of the project: creating a booking.
// Levels 2, 3, 4 and 5 all meet here.
//
// Everything happens inside ONE database transaction ("all or nothing").
// We also use "advisory locks": a lock with a name we choose. While one
// request holds the lock "email:ada@example.com", another request for the
// same email waits its turn. That is how simultaneous requests stay safe.
import crypto from "crypto";
import { pool } from "./db.js";
import { formatBooking } from "./http.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 5; // LEVEL 5: attempts allowed...
// ...per email in any 60 seconds (the 60 is written inside the SQL below).

// Same data in a different key order must give the same fingerprint.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}

async function takeLock(client, name) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [name]);
}

export async function createBooking(body, idempotencyKey) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client, body, idempotencyKey);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function run(client, body, idempotencyKey) {
  const fingerprint = idempotencyKey
    ? crypto.createHash("sha256").update(stableStringify(body)).digest("hex")
    : null;

  // Remember our answer under the Idempotency-Key (if one was sent), then return it.
  async function finish(status, responseBody) {
    if (idempotencyKey) {
      await client.query(
        "INSERT INTO idempotency_keys (key, fingerprint, status_code, response_body) VALUES ($1, $2, $3, $4)",
        [idempotencyKey, fingerprint, status, JSON.stringify(responseBody)]
      );
    }
    return { status, body: responseBody };
  }

  // ---------------------------------------------------------- LEVEL 4
  // Have we seen this Idempotency-Key before?
  if (idempotencyKey) {
    await takeLock(client, "idem:" + idempotencyKey);
    const found = await client.query(
      "SELECT fingerprint, status_code, response_body FROM idempotency_keys WHERE key = $1",
      [idempotencyKey]
    );
    if (found.rows.length > 0) {
      const old = found.rows[0];
      if (old.fingerprint !== fingerprint) {
        return { status: 422, body: { error: "Idempotency-Key was already used with a different request body" } };
      }
      // Same key, same body: give back the very same answer. Nothing new is created.
      return { status: old.status_code, body: JSON.parse(old.response_body) };
    }
  }

  const fields = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const email = typeof fields.email === "string" ? fields.email.trim().toLowerCase() : "";

  // ---------------------------------------------------------- LEVEL 5
  // At most 5 attempts per email per minute. Failed attempts count too.
  if (email) {
    await takeLock(client, "email:" + email);
    const recent = await client.query(
      `SELECT count(*)::int AS n,
              EXTRACT(EPOCH FROM (min(created_at) + interval '60 seconds' - clock_timestamp())) AS wait
         FROM rate_attempts
        WHERE email = $1 AND created_at > clock_timestamp() - interval '60 seconds'`,
      [email]
    );
    if (recent.rows[0].n >= MAX_ATTEMPTS) {
      const wait = Math.max(1, Math.ceil(Number(recent.rows[0].wait)));
      return {
        status: 429,
        body: { error: "too many booking attempts for this email, please wait" },
        headers: { "Retry-After": String(wait) },
      };
    }
    await client.query("INSERT INTO rate_attempts (email) VALUES ($1)", [email]);
  }

  // ---------------------------------------------------------- LEVEL 2
  // Check the details.
  const slotId = typeof fields.slot_id === "string" ? fields.slot_id : "";
  const name = typeof fields.name === "string" ? fields.name.trim() : "";

  if (!slotId.trim()) return finish(400, { error: "slot_id is required" });
  if (!name) return finish(400, { error: "name is required" });
  if (!email) return finish(400, { error: "email is required" });
  if (!EMAIL_PATTERN.test(email)) return finish(400, { error: "email is not valid" });

  const slot = await client.query(
    "SELECT start_ts <= clock_timestamp() AS started FROM slots WHERE id = $1",
    [slotId]
  );
  if (slot.rows.length === 0) return finish(404, { error: "slot not found" });
  if (slot.rows[0].started) return finish(400, { error: "slot has already started" });

  // ---------------------------------------------------------- LEVEL 3
  // Try to book. If another confirmed booking already holds this slot, the
  // unique index in the database refuses, "DO NOTHING" kicks in, and no row comes back.
  const inserted = await client.query(
    `INSERT INTO bookings (id, slot_id, name, email)
          VALUES ($1, $2, $3, $4)
     ON CONFLICT (slot_id) WHERE status = 'confirmed' DO NOTHING
       RETURNING id, slot_id, name, email, status, created_at`,
    [crypto.randomUUID(), slotId, name, email]
  );
  if (inserted.rowCount === 0) return finish(409, { error: "slot is already booked" });

  return finish(201, formatBooking(inserted.rows[0]));
}
