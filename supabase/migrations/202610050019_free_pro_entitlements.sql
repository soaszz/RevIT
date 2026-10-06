-- RevIT Free / Pro entitlements. Additive and safe for the currently deployed client.
begin;

alter table public.profiles
  add column if not exists plan text not null default 'free' check (plan in ('free', 'pro')),
  add column if not exists pro_started_at timestamptz null,
  add column if not exists pro_expires_at timestamptz null,
  add column if not exists pro_note text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_plan_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('free', 'pro'));
  end if;
end;
$$;

create or replace function public.protect_profile_subscription_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan <> 'free'
      or new.pro_started_at is not null
      or new.pro_expires_at is not null
      or new.pro_note is not null then
      raise exception 'Subscription fields are administrator-managed.' using errcode = '42501';
    end if;
  elsif new.plan is distinct from old.plan
    or new.pro_started_at is distinct from old.pro_started_at
    or new.pro_expires_at is distinct from old.pro_expires_at
    or new.pro_note is distinct from old.pro_note then
    raise exception 'Subscription fields are administrator-managed.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_subscription_fields on public.profiles;
create trigger profiles_protect_subscription_fields
before insert or update on public.profiles
for each row execute function public.protect_profile_subscription_fields();

-- Existing deployed clients read and write named columns. Replace broad grants
-- so browser roles cannot read pro_note or write subscription fields.
revoke all on public.profiles from public, anon, authenticated;
grant select (
  id, username, first_name, avatar_url, onboarding_complete,
  terms_accepted_at, terms_version, privacy_accepted_at, privacy_version,
  created_at, updated_at, plan, pro_started_at, pro_expires_at
) on public.profiles to authenticated;
grant insert (
  id, username, first_name, avatar_url, onboarding_complete
) on public.profiles to authenticated;
grant update (
  username, first_name, avatar_url, onboarding_complete,
  terms_accepted_at, terms_version, privacy_accepted_at, privacy_version,
  updated_at
) on public.profiles to authenticated;
grant delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

create or replace function public.get_my_entitlement()
returns table (
  stored_plan text,
  effective_plan text,
  pro_started_at timestamptz,
  pro_expires_at timestamptz,
  server_now timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p.plan,
    case
      when p.plan = 'pro' and p.pro_expires_at is not null and p.pro_expires_at > now() then 'pro'
      else 'free'
    end,
    p.pro_started_at,
    p.pro_expires_at,
    now()
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_entitlement() from public, anon;
grant execute on function public.get_my_entitlement() to authenticated;

create or replace function public.grant_pro_month(target_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result public.profiles;
begin
  update public.profiles
  set
    plan = 'pro',
    pro_started_at = case
      when plan = 'pro' and pro_expires_at is not null and pro_expires_at > now() then pro_started_at
      else now()
    end,
    pro_expires_at = case
      when plan = 'pro' and pro_expires_at is not null and pro_expires_at > now() then pro_expires_at + interval '1 month'
      else now() + interval '1 month'
    end
  where id = target_user_id
  returning * into result;

  if result.id is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create or replace function public.revoke_pro(target_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result public.profiles;
begin
  update public.profiles set plan = 'free'
  where id = target_user_id
  returning * into result;
  if result.id is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.grant_pro_month(uuid) from public, anon, authenticated;
revoke all on function public.revoke_pro(uuid) from public, anon, authenticated;
grant execute on function public.grant_pro_month(uuid) to service_role;
grant execute on function public.revoke_pro(uuid) to service_role;

insert into public.ai_rate_limit_tiers (tier, minute_limit, daily_limit)
values ('free', 2, 3), ('subscription', 5, 15)
on conflict (tier) do update set
  minute_limit = excluded.minute_limit,
  daily_limit = excluded.daily_limit,
  updated_at = now();

create table if not exists public.ai_global_rate_limit (
  singleton boolean primary key default true check (singleton),
  minute_limit integer not null check (minute_limit > 0),
  daily_limit integer not null check (daily_limit >= minute_limit),
  updated_at timestamptz not null default now()
);

insert into public.ai_global_rate_limit (singleton, minute_limit, daily_limit)
values (true, 60, 3000)
on conflict (singleton) do nothing;

alter table public.ai_global_rate_limit enable row level security;
revoke all on public.ai_global_rate_limit from public, anon, authenticated;
grant select, insert, update, delete on public.ai_global_rate_limit to service_role;

-- Derive AI tier from profile entitlement at database time. The client cannot
-- select or submit a tier.
create or replace function public.current_ai_tier(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p.plan = 'pro' and p.pro_expires_at is not null and p.pro_expires_at > now() then 'subscription'
    else 'free'
  end
  from public.profiles p
  where p.id = target_user_id;
$$;

revoke all on function public.current_ai_tier(uuid) from public, anon, authenticated;
grant execute on function public.current_ai_tier(uuid) to service_role;

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
  v_global_minute_limit integer;
  v_global_daily_limit integer;
  v_global_minute_used integer;
  v_global_daily_used integer;
  v_retry_after integer := 0;
  v_reservation_id uuid;
begin
  if v_owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('revit-ai:' || v_owner::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('revit-ai:global', 0));

  delete from public.ai_request_usage
  where user_id = v_owner
    and (
      (completed_at is null and reserved_at < v_now - interval '2 minutes')
      or completed_at < v_now - interval '24 hours'
    );

  v_tier := coalesce(public.current_ai_tier(v_owner), 'free');

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

  select minute_limit, daily_limit
  into v_global_minute_limit, v_global_daily_limit
  from public.ai_global_rate_limit
  where singleton = true;

  select
    count(*) filter (where coalesce(completed_at, reserved_at) >= v_now - interval '1 minute')::integer,
    count(*) filter (where coalesce(completed_at, reserved_at) >= v_day_start)::integer
  into v_global_minute_used, v_global_daily_used
  from public.ai_request_usage
  where completed_at is not null or reserved_at >= v_now - interval '2 minutes';

  if v_global_minute_limit is null or v_global_daily_limit is null then
    raise exception 'Global AI rate-limit configuration is unavailable.' using errcode = '55000';
  end if;

  if v_global_daily_used >= v_global_daily_limit then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_day_start + interval '1 day' - v_now)))::integer);
  elsif v_global_minute_used >= v_global_minute_limit then
    v_retry_after := 60;
  end if;

  if v_retry_after = 0 and v_daily_used >= v_daily_limit then
    if v_daily_successes >= v_daily_limit then
      v_retry_after := greatest(1, ceil(extract(epoch from (v_day_start + interval '1 day' - v_now)))::integer);
    else
      select greatest(1, ceil(extract(epoch from (min(reserved_at) + interval '2 minutes' - v_now)))::integer)
      into v_retry_after
      from public.ai_request_usage
      where user_id = v_owner and completed_at is null and reserved_at >= v_now - interval '2 minutes';
    end if;
  elsif v_retry_after = 0 and v_minute_used >= v_minute_limit then
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

comment on column public.profiles.plan is 'Stored subscription plan. Effective Pro also requires a future pro_expires_at.';
comment on column public.profiles.pro_note is 'Private administrator note; unavailable to browser roles.';

commit;
