-- PROPOSAL ONLY. Do not execute during local development.
-- Production subscription_history currently has only the primary key and the
-- expired-event partial unique index. These indexes cover the reporting RPC's
-- per-subscriber history and global history/monthly access patterns.
-- Run each statement separately; do not wrap in BEGIN.
-- Requires separate approval, backup/recovery applicability and post-build
-- validation. No table, row, writer, RLS or grant changes are included.

-- Per-subscriber detail and latest-grant lookups.
create index if not exists subscription_history_user_created_idx
  on public.subscription_history (user_id, created_at desc, id desc);

-- Global history paging and monthly recorded-date ranges.
create index if not exists subscription_history_created_idx
  on public.subscription_history (created_at desc, id desc);

-- Post-install verification:
-- 1. Confirm both indexes are valid and ready.
-- 2. Confirm the per-subscriber detail plan uses the user/created index.
-- 3. Confirm global history/monthly plans use the created index or an
--    equivalent bounded plan, without sequential scans at production scale.
-- 4. Confirm no history, billing, writer, RLS or grant changes.
-- 5. Keep the existing expired-once partial index unchanged.