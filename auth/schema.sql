-- Exceptionel AI — database schema (PostgreSQL / Supabase)
-- Run this in the Supabase SQL editor (or any PostgreSQL) to enable persistence.
-- The auth module accesses these tables via the PostgREST API using the
-- service_role key (server-side only).

-- Merchant accounts (each user = one merchant/org for the MVP)
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  brand_name    text default '',
  created_at    timestamptz default now()
);

-- Leads captured by the sales chatbot
-- NOTE: user_id is TEXT (not uuid) so it accepts the merchant's uuid, a public
-- widget identifier, or the "demo" fallback.
create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  user_id       text,
  email         text,
  need          text,
  budget_cents  integer,
  score         integer,
  status        text default 'new',
  created_at    timestamptz default now()
);

-- Marketing videos generated
create table if not exists videos (
  id            uuid primary key default gen_random_uuid(),
  user_id       text,
  product_id    text,
  script        jsonb,
  provider      text,
  status        text default 'draft',
  video_url     text,
  caption       text,
  created_at    timestamptz default now()
);

-- Orders (from Stripe checkout)
create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       text,
  stripe_id     text,
  product_id    text,
  amount_cents  integer,
  currency      text default 'usd',
  email         text,
  status        text default 'paid',
  created_at    timestamptz default now()
);

create index if not exists idx_leads_user on leads(user_id);
create index if not exists idx_videos_user on videos(user_id);
create index if not exists idx_orders_user on orders(user_id);

-- Row Level Security: enabled as a good practice. The auth module uses the
-- service_role key which BYPASSES RLS (server-side, trusted). If you later
-- expose the tables to the browser with the anon key, add appropriate policies.
alter table users  enable row level security;
alter table leads  enable row level security;
alter table videos enable row level security;
alter table orders enable row level security;
