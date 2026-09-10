begin;

revoke all on function public.finalize_ai_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public.reserve_ai_request() from public, anon, authenticated;
drop function if exists public.finalize_ai_request(uuid, boolean);
drop function if exists public.reserve_ai_request();
drop table if exists public.ai_request_usage;
drop table if exists public.ai_entitlements;
drop table if exists public.ai_rate_limit_tiers;

commit;
