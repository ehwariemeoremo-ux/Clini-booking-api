// Connection to the database (Supabase Postgres).
// A "pool" keeps a few connections open and shares them between requests.
import pg from "pg";

const { Pool } = pg;

// On the server, the same pool is reused between requests.
const globalForPool = globalThis;

if (!globalForPool.__pgPool) {
  globalForPool.__pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  });
  globalForPool.__pgPool.on("error", (err) => {
    console.error("Database pool error:", err.message);
  });
}

export const pool = globalForPool.__pgPool;
