-- Persistent, atomic RevIT AI quotas. The API route reserves capacity before
-- contacting Groq and finalizes it only after a usable provider response.
begin;

create table if not exists public.ai_rate_limit_tiers (
  tier text primary key check (tier in ('free', 'subscription')),
  minute_limit integer not null check (minute_limit > 0),
  daily_limit integer not null check (daily_limit >= minute_limit),
  updated_at timestamptz not null default now()
);

insert into public.ai_rate_limit_tiers (tier, minute_limit, daily_limit)
values ('free', 5, 20), ('subscription', 15, 100)
on conflict (tier) do update set
  minute_limit = excluded.minute_limit,
  daily_limit = excluded.daily_limit,
  updated_at = now();

create table if not exists public.ai_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null references public.ai_rate_limit_tiers(tier) default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_request_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null references public.ai_rate_limit_tiers(tier),
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  check (completed_at is null or completed_at >= reserved_at)
);

create index if not exists ai_request_usage_user_completed_idx
  on public.ai_request_usage (user_id, completed_at desc)
  where completed_at is not null;
create index if not exists ai_request_usage_user_pending_idx
  on public.ai_request_usage (user_id, reserved_at)
  where completed_at is null;

alter table public.ai_rate_limit_tiers enable row level security;
alter table public.ai_entitlements enable row level security;
alter table public.ai_request_usage enable row level security;

-- Browser roles cannot inspect or mutate quota, entitlement, or usage rows.
-- Future billing code must update ai_entitlements from a trusted service-role
-- environment after validating a provider webhook; the client never supplies a tier.
revoke all on public.ai_rate_limit_tiers, public.ai_entitlements, public.ai_request_usage
  from public, anon, authenticated;
grant select, insert, update, delete on
  public.ai_rate_limit_tiers, public.ai_entitlements, public.ai_request_usage
  to service_role;

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
      or completed_at < v_now - interval '2 days'
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
    ) - v_now))::integer)
    into v_retry_after
    from public.ai_request_usage
    where user_id = v_owner
      and (
        completed_at >= v_now - interval '1 minute'
        or (completed_at is null and reserved_at >= v_now - interval '2 minutes')
      );
  end if;

  if v_retry_after > 0 then
    return query select
      false, null::uuid, v_tier, v_minute_limit, v_daily_limit,
      greatest(0, v_minute_limit - v_minute_used),
      greatest(0, v_daily_limit - v_daily_used),
      v_retry_after;
    return;
  end if;

  insert into public.ai_request_usage (user_id, tier, reserved_at)
  values (v_owner, v_tier, v_now)
  returning id into v_reservation_id;

  return query select
    true, v_reservation_id, v_tier, v_minute_limit, v_daily_limit,
    greatest(0, v_minute_limit - v_minute_used - 1),
    greatest(0, v_daily_limit - v_daily_used - 1),
    0;
end;
$$;

create or replace function public.finalize_ai_request(
  p_reservation_id uuid,
  p_succeeded boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_affected integer := 0;
begin
  if v_owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_reservation_id is null or p_succeeded is null then
    raise exception 'A valid reservation result is required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('revit-ai:' || v_owner::text, 0));
  if p_succeeded then
    update public.ai_request_usage
    set completed_at = now()
    where id = p_reservation_id and user_id = v_owner and completed_at is null;
  else
    delete from public.ai_request_usage
    where id = p_reservation_id and user_id = v_owner and completed_at is null;
  end if;
  get diagnostics v_affected = row_count;
  return v_affected = 1;
end;
$$;

revoke all on function public.reserve_ai_request() from public, anon;
revoke all on function public.finalize_ai_request(uuid, boolean) from public, anon;
grant execute on function public.reserve_ai_request() to authenticated;
grant execute on function public.finalize_ai_request(uuid, boolean) to authenticated;

comment on table public.ai_rate_limit_tiers is
  'Authoritative server-side RevIT AI quota configuration.';
comment on table public.ai_request_usage is
  'Short-lived AI request reservations; only completed provider responses count as usage.';

commit;
