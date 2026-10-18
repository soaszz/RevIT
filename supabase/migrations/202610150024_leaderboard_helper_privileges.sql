-- Independent privacy hardening; keep this after any Strasinger feature rollback.
-- Only SECURITY DEFINER leaderboard wrappers need these raw participant rows.
begin;

revoke all on function public.leaderboard_metric_rows(text, text, text) from public, anon, authenticated;
revoke all on function public.leaderboard_metric_rows(text, text, text, text) from public, anon, authenticated;

commit;
