-- Exceptionel AI — Billing migration (run in the Supabase SQL editor)
-- Adds subscription/plan fields to the existing `users` table. Safe to run
-- multiple times (IF NOT EXISTS). Existing merchants default to the free plan.

alter table users add column if not exists plan                   text default 'free';
alter table users add column if not exists subscription_status     text default 'none';
alter table users add column if not exists stripe_customer_id       text;
alter table users add column if not exists stripe_subscription_id   text;
alter table users add column if not exists current_period_end       timestamptz;

-- Fast lookup by Stripe customer id (used by subscription webhooks).
create index if not exists idx_users_stripe_customer on users(stripe_customer_id);

-- Backfill any pre-existing rows to the free plan.
update users set plan = 'free' where plan is null;
