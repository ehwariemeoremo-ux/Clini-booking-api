// GET    /bookings/{id}  (Level 1) -> look up one booking
// DELETE /bookings/{id}  (Level 3) -> cancel it and free the slot
import { pool } from "../../../lib/db.js";
import { hasValidKey, unauthorized, json, formatBooking } from "../../../lib/http.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COLUMNS = "id, slot_id, name, email, status, created_at";

export async function GET(request, { params }) {
  if (!hasValidKey(request)) return unauthorized();

  try {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM bookings WHERE id = $1`, [params.id]);
    if (rows.length === 0) return json({ error: "booking not found" }, 404);
    return json(formatBooking(rows[0]));
  } catch (err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  }
}

export async function DELETE(request, { params }) {
  if (!hasValidKey(request)) return unauthorized();

  try {
    // One single statement: only a confirmed booking can be cancelled.
    // Because the unique index only covers confirmed bookings, this frees the slot.
    const cancelled = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
        WHERE id = $1 AND status = 'confirmed'
        RETURNING ${COLUMNS}`,
      [params.id]
    );
    if (cancelled.rows.length > 0) return json(formatBooking(cancelled.rows[0]));

    const exists = await pool.query("SELECT 1 FROM bookings WHERE id = $1", [params.id]);
    if (exists.rows.length === 0) return json({ error: "booking not found" }, 404);
    return json({ error: "booking is already cancelled" }, 409);
  } catch (err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  }
}
