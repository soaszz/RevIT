begin;

-- Restore the pre-Free/Pro AI limits and reservation behavior before removing
-- the entitlement helper on which the new implementation depends.
insert into public.ai_rate_limit_tiers (tier, minute_limit, daily_limit)
values ('free', 5, 20), ('subscription', 15, 100)
on conflict (tier) do update set
  minute_limit = excluded.minute_limit,
  daily_limit = excluded.daily_limit,
  updated_at = now();

create or replace function public.reserve_ai_request()
returns table (
  allowed boolean,
  reservation_id uuid,
  tier text,
  minute_limit integer,
  daily_limit integer,
  minute_remaining integer,
  daily_remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_now timestamptz := now();
  v_day_start timestamptz;
  v_tier text;
  v_minute_limit integer;
  v_daily_limit integer;
  v_minute_successes integer;
  v_daily_successes integer;
  v_pending integer;
  v_minute_used integer;
  v_daily_used integer;
  v_retry_after integer := 0;
  v_reservation_id uuid;
begin
  if v_owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('revit-ai:' || v_owner::text, 0));

  delete from public.ai_request_usage
  where user_id = v_owner
    and (
      (completed_at is null and reserved_at < v_now - interval '2 minutes')
      or completed_at < v_now - interval '24 hours'
    );

  select entitlement.tier into v_tier
  from public.ai_entitlements entitlement
  where entitlement.user_id = v_owner;
  v_tier := coalesce(v_tier, 'free');

  select limits.minute_limit, limits.daily_limit
  into v_minute_limit, v_daily_limit
  from public.ai_rate_limit_tiers limits
  where limits.tier = v_tier;
  if v_minute_limit is null or v_daily_limit is null then
    raise exception 'AI rate-limit configuration is unavailable.' using errcode = '55000';
  end if;

  v_day_start := date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  select
    count(*) filter (where completed_at >= v_now - interval '1 minute')::integer,
    count(*) filter (where completed_at >= v_day_start)::integer
  into v_minute_successes, v_daily_successes
  from public.ai_request_usage
  where user_id = v_owner and completed_at is not null;

  select count(*)::integer into v_pending
  from public.ai_request_usage
  where user_id = v_owner
    and completed_at is null
    and reserved_at >= v_now - interval '2 minutes';

  v_minute_used := v_minute_successes + v_pending;
  v_daily_used := v_daily_successes + v_pending;

  if v_daily_used >= v_daily_limit then
    if v_daily_successes >= v_daily_limit then
      v_retry_after := greatest(1, ceil(extract(epoch from (v_day_start + interval '1 day' - v_now)))::integer);
    else
      select greatest(1, ceil(extract(epoch from (min(reserved_at) + interval '2 minutes' - v_now)))::integer)
      into v_retry_after
      from public.ai_request_usage
      where user_id = v_owner and completed_at is null and reserved_at >= v_now - interval '2 minutes';
    end if;
  elsif v_minute_used >= v_minute_limit then
    select greatest(1, ceil(extract(epoch from min(
      case when completed_at is null then reserved_at + interval '2 minutes'
           else completed_at + interval '1 minute' end
      - v_now
    )))::integer)
    into v_retry_after
    from public.ai_request_usage
    where user_id = v_owner
      and (
        (completed_at is null and reserved_at >= v_now - interval '2 minutes')
        or (completed_at is not null and completed_at >= v_now - interval '1 minute')
      );
  end if;

  if v_retry_after > 0 then
    return query select
      false,
      null::uuid,
      v_tier,
      v_minute_limit,
      v_daily_limit,
      greatest(0, v_minute_limit - v_minute_used),
      greatest(0, v_daily_limit - v_daily_used),
      v_retry_after;
    return;
  end if;

  insert into public.ai_request_usage (user_id, tier, reserved_at)
  values (v_owner, v_tier, v_now)
  returning id into v_reservation_id;

  return query select
    true,
    v_reservation_id,
    v_tier,
    v_minute_limit,
    v_daily_limit,
    greatest(0, v_minute_limit - (v_minute_used + 1)),
    greatest(0, v_daily_limit - (v_daily_used + 1)),
    0;
end;
$$;

revoke all on function public.reserve_ai_request() from public, anon;
grant execute on function public.reserve_ai_request() to authenticated;

drop function if exists public.current_ai_tier(uuid);
drop function if exists public.revoke_pro(uuid);
drop function if exists public.grant_pro_month(uuid);
drop function if exists public.get_my_entitlement();
drop trigger if exists profiles_protect_subscription_fields on public.profiles;
drop function if exists public.protect_profile_subscription_fields();
drop table if exists public.ai_global_rate_limit;

-- Restore the broad table privileges that existed before this migration.
grant select, insert, update, delete on public.profiles to authenticated;
revoke all on public.profiles from anon;

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  drop column if exists pro_note,
  drop column if exists pro_expires_at,
  drop column if exists pro_started_at,
  drop column if exists plan;

commit;
