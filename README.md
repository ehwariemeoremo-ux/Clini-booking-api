# Clinic Booking API

A booking API for clinic appointment slots, plus a simple web page that uses it.
Built for the Koya Cohort 4 assessment (Task 1), following the technical spec.

**Stack:** Next.js (API routes + page), Supabase Postgres, deployed on Vercel.

## What each level does and how
| Level | What | How |
|---|---|---|
| 1 | List slots, book, look up a booking | Plain SQL queries behind `/slots`, `/bookings`, `/bookings/{id}` |
| 2 | API key and validation | `X-API-Key` checked on every endpoint; fields validated, name and email trimmed, email lower-cased |
| 3 | No double booking, cancelling | A partial unique index allows only one *confirmed* booking per slot, so the database itself refuses the second one |
| 4 | Idempotency and paging | `Idempotency-Key` stored with a fingerprint of the body and the original response; cursor paging on a sequence number |
| 5 | Anti-spam | Every attempt is recorded per email; the 6th in 60 seconds returns 429 with `Retry-After` |

Concurrency is handled inside one database transaction per booking, using advisory locks named after the
idempotency key and the email, so simultaneous requests are handled one after another where it matters.

## Run it yourself
1. `npm install`
2. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor
3. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` and `API_KEY`
4. `npm run dev`, then open http://localhost:3000
5. Check everything: `node scripts/smoke-test.mjs http://localhost:3000 YOUR_API_KEY`
   (this wipes all slots and bookings)
