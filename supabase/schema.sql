-- Run this ONCE in Supabase: SQL Editor > New query > paste > Run.
-- It creates 4 tables. Think of each table as one sheet in a spreadsheet.

-- 1) The appointment times the clinic offers.
create table if not exists slots (
  id         text primary key,          -- e.g. "s1"
  provider   text not null,             -- e.g. "Dr Ade"
  start_text text not null,             -- start exactly as it was sent to us
  end_text   text not null,             -- end exactly as it was sent to us
  start_ts   timestamptz not null       -- start as a real time, used for sorting and "has it started?"
);

-- 2) The bookings people make.
create table if not exists bookings (
  seq        bigserial primary key,     -- counts 1, 2, 3... in the order bookings are made (used for paging)
  id         text not null unique,      -- the booking id we give back
  slot_id    text not null,
  name       text not null,
  email      text not null,             -- always stored in lower case
  status     text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default clock_timestamp()
);

-- LEVEL 3: THE GOLDEN RULE.
-- A slot may have only ONE booking whose status is 'confirmed'.
-- The database itself enforces this, so even 100 people clicking at the same
-- moment cannot book the same slot. A cancelled booking does not count,
-- which is why cancelling frees the slot.
create unique index if not exists one_confirmed_booking_per_slot
  on bookings (slot_id) where status = 'confirmed';

create index if not exists bookings_by_email on bookings (email, seq);

-- 3) LEVEL 5: a note of every booking attempt, so we can count them per email.
create table if not exists rate_attempts (
  id         bigserial primary key,
  email      text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists rate_attempts_by_email on rate_attempts (email, created_at);

-- 4) LEVEL 4: remembers the answer we gave for each Idempotency-Key.
create table if not exists idempotency_keys (
  key           text primary key,
  fingerprint   text not null,          -- a short code that stands for the request body
  status_code   int  not null,
  response_body text not null,
  created_at    timestamptz not null default now()
);

-- Lock the tables so nobody can read them through Supabase's public web address.
-- Our server connects with the database password, which is allowed in.
alter table slots            enable row level security;
alter table bookings         enable row level security;
alter table rate_attempts    enable row level security;
alter table idempotency_keys enable row level security;
