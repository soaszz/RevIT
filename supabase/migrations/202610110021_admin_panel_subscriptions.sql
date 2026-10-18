-- RevIT Admin Panel: Subscription history, user activation notifications, and atomic management functions.
-- Additive and backward compatible.

begin;

-- 1. Persistent Subscription History Table
create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('activated', 'extended', 'expiration_modified', 'revoked', 'renewed', 'activate', 'extend', 'modify_expiration', 'renew')),
  source text not null default 'purchased' check (source in ('purchased', 'gift', 'prize', 'unknown')),
  previous_plan text not null default 'free',
  new_plan text not null default 'pro',
  previous_expires_at timestamptz null,
  new_expires_at timestamptz null,
  admin_id uuid null references auth.users(id) on delete set null,
  custom_message text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_history_user_created
  on public.subscription_history(user_id, created_at desc);

alter table public.subscription_history enable row level security;
revoke all on public.subscription_history from public, anon, authenticated;
grant all on public.subscription_history to service_role;

-- 2. Pro Activation Notifications Table (Cross-device, one-time user modal)
create table if not exists public.pro_activation_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('purchased', 'gift', 'prize')),
  plan text not null default 'pro',
  duration_days integer null,
  pro_expires_at timestamptz null,
  custom_message text null,
  acknowledged_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pro_activation_notifs_pending
  on public.pro_activation_notifications(user_id, acknowledged_at)
  where acknowledged_at is null;

alter table public.pro_activation_notifications enable row level security;
revoke all on public.pro_activation_notifications from public, anon;

grant select, update (acknowledged_at) on public.pro_activation_notifications to authenticated;
grant all on public.pro_activation_notifications to service_role;

drop policy if exists "Users view own activation notifications" on public.pro_activation_notifications;
create policy "Users view own activation notifications"
  on public.pro_activation_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users acknowledge own activation notifications" on public.pro_activation_notifications;
create policy "Users acknowledge own activation notifications"
  on public.pro_activation_notifications
  for update
  to authenticated
  using (auth.uid() = user_id and acknowledged_at is null)
  with check (auth.uid() = user_id and acknowledged_at is not null);

-- 3. Atomic Administrative Subscription Mutation Function
create or replace function public.admin_apply_subscription_change(
  p_user_id uuid,
  p_action text,
  p_source text default 'purchased',
  p_duration_days integer default 30,
  p_custom_expires_at timestamptz default null,
  p_admin_id uuid default null,
  p_custom_message text default null,
  p_expected_expires_at timestamptz default null,
  p_allow_shorten boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_old_profile public.profiles%rowtype;
  v_now timestamptz := now();
  v_prev_plan text;
  v_prev_expires timestamptz;
  v_new_plan text;
  v_new_started timestamptz;
  v_new_expires timestamptz;
  v_event_type text;
  v_computed_days integer := p_duration_days;
  v_is_active_pro boolean;
begin
  select * into v_old_profile
  from public.profiles
  where id = p_user_id
  for update;

  if v_old_profile.id is null then
    raise exception 'Target user profile not found.' using errcode = 'P0002';
  end if;

  v_prev_plan := coalesce(v_old_profile.plan, 'free');
  v_prev_expires := v_old_profile.pro_expires_at;
  v_is_active_pro := (v_prev_plan = 'pro' and v_prev_expires is not null and v_prev_expires > v_now);

  -- 1. Stale-state / optimistic concurrency check
  if p_expected_expires_at is not null and v_prev_expires is distinct from p_expected_expires_at then
    raise exception 'CONFLICT_STALE_STATE: Subscription was modified by another administrator session. Please refresh and review latest status.' using errcode = '40001';
  end if;

  -- 2. Prevent accidental duplicate activation if user already has active Pro
  if p_action = 'activate' and v_is_active_pro then
    raise exception 'CONFLICT_ACTIVE_PRO: User already has active RevIT Pro. Choose Extend or Replace Expiration.' using errcode = '22000';
  end if;

  if p_action = 'revoke' then
    if v_prev_plan = 'free' and (v_prev_expires is null or v_prev_expires <= v_now) then
      raise exception 'NO_CHANGE: User is already on the Free plan.' using errcode = '22000';
    end if;

    v_new_plan := 'free';
    v_new_started := v_old_profile.pro_started_at;
    v_new_expires := v_now;
    v_event_type := 'revoked';

    -- Dismiss pending notifications on revoke
    update public.pro_activation_notifications
    set acknowledged_at = v_now
    where user_id = p_user_id and acknowledged_at is null;

  elsif p_action in ('activate', 'extend', 'modify_expiration', 'renew') then
    v_new_plan := 'pro';

    -- Normalize event_type to past tense for audit consistency
    if p_action = 'activate' then
      if v_prev_plan = 'pro' and v_prev_expires is not null and v_prev_expires <= v_now then
        v_event_type := 'renewed';
      else
        v_event_type := 'activated';
      end if;
    elsif p_action = 'extend' then
      v_event_type := 'extended';
    elsif p_action = 'modify_expiration' then
      v_event_type := 'expiration_modified';
    elsif p_action = 'renew' then
      v_event_type := 'renewed';
    else
      v_event_type := 'activated';
    end if;

    if p_custom_expires_at is not null then
      v_new_expires := p_custom_expires_at;
      v_new_started := coalesce(v_old_profile.pro_started_at, v_now);
      v_computed_days := greatest(1, ceil(extract(epoch from (v_new_expires - v_now)) / 86400)::integer);
    elsif p_action = 'extend' and v_is_active_pro then
      -- Safe extension: build on existing future expiration date
      v_new_expires := v_prev_expires + (coalesce(p_duration_days, 30) || ' days')::interval;
      v_new_started := coalesce(v_old_profile.pro_started_at, v_now);
    else
      -- Fresh activation or renewed from expired state
      v_new_started := v_now;
      v_new_expires := v_now + (coalesce(p_duration_days, 30) || ' days')::interval;
    end if;

    -- Block invalid past expiration date
    if v_new_expires <= v_now then
      raise exception 'INVALID_EXPIRATION: Target expiration date must be in the future.' using errcode = '22000';
    end if;

    -- Check if shortening active pro without confirmation
    if v_is_active_pro and v_new_expires < v_prev_expires and not p_allow_shorten then
      raise exception 'WARNING_SHORTEN_ACCESS: Target expiration is earlier than current expiration. User will lose remaining access.' using errcode = '22000';
    end if;

    -- No change detection
    if v_prev_plan = 'pro' and v_prev_expires is not null and abs(extract(epoch from (v_new_expires - v_prev_expires))) < 60 then
      raise exception 'NO_CHANGE: Target expiration date matches current expiration. No changes applied.' using errcode = '22000';
    end if;

  else
    raise exception 'Invalid subscription action: %', p_action using errcode = '22023';
  end if;

  -- 1. Update Profile
  update public.profiles
  set
    plan = v_new_plan,
    pro_started_at = v_new_started,
    pro_expires_at = v_new_expires,
    updated_at = v_now
  where id = p_user_id;

  -- 2. Append to History
  insert into public.subscription_history (
    user_id,
    event_type,
    source,
    previous_plan,
    new_plan,
    previous_expires_at,
    new_expires_at,
    admin_id,
    custom_message,
    created_at
  ) values (
    p_user_id,
    v_event_type,
    coalesce(p_source, 'purchased'),
    v_prev_plan,
    v_new_plan,
    v_prev_expires,
    v_new_expires,
    p_admin_id,
    nullif(trim(p_custom_message), ''),
    v_now
  );

  -- 3. Insert notification for user modal if upgrading/extending/renewing
  if v_new_plan = 'pro' and p_action <> 'revoke' then
    insert into public.pro_activation_notifications (
      user_id,
      source,
      plan,
      duration_days,
      pro_expires_at,
      custom_message,
      created_at
    ) values (
      p_user_id,
      coalesce(p_source, 'purchased'),
      'pro',
      v_computed_days,
      v_new_expires,
      nullif(trim(p_custom_message), ''),
      v_now
    );
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'action', p_action,
    'event_type', v_event_type,
    'plan', v_new_plan,
    'pro_started_at', v_new_started,
    'pro_expires_at', v_new_expires,
    'source', p_source
  );
end;
$$;

-- 4. Server-Side Administrative User Search Function
create or replace function public.admin_search_users(
  p_query text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  username text,
  first_name text,
  plan text,
  pro_started_at timestamptz,
  pro_expires_at timestamptz,
  pro_note text,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    u.id,
    u.email::text,
    p.username,
    p.first_name,
    coalesce(p.plan, 'free'),
    p.pro_started_at,
    p.pro_expires_at,
    p.pro_note,
    u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where (
    p_query is null
    or trim(p_query) = ''
    or u.email ilike ('%' || trim(p_query) || '%')
    or p.username ilike ('%' || trim(p_query) || '%')
    or p.first_name ilike ('%' || trim(p_query) || '%')
    or u.id::text = trim(p_query)
  )
  order by u.created_at desc
  limit greatest(1, least(50, coalesce(p_limit, 10)))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.admin_search_users(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_search_users(text, integer, integer) to service_role;

commit;
