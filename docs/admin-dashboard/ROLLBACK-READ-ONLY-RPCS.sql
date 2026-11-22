-- ROLLBACK for the reporting RPC only. DROP ONLY this new function.
-- No history row, subscription writer, cron, table grant or existing RLS policy is touched.
-- Run after disabling the dashboard sections that call it.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '5s';
drop function if exists public.admin_read_subscriptions(text,jsonb,integer);
commit;

-- Optional, only if the index was installed under its OWN approval:
-- drop index if exists public.subscription_history_user_created_idx;
-- drop index if exists public.subscription_history_created_idx;
