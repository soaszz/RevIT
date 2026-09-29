-- RevIT Database Usage & Log Ingestion Optimization
-- 1. Tighten AI rate-limit ledger retention to 24 hours (prevents table bloat)
-- 2. Clean up existing stale rate-limit usage
-- 3. Add composite index on question_attempts to accelerate leaderboard window aggregates

begin;

-- One-time purge of stale AI rate limit records older than 24 hours
delete from public.ai_request_usage
where completed_at < now() - interval '24 hours'
   or (completed_at is null and reserved_at < now() - interval '1 hour');

-- Update reserve_ai_request to prune records older than 24 hours on each reservation
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

  -- Prune pending reservations older than 2 mins or completed reservations older than 24 hours
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

-- Composite index to accelerate leaderboard window partition and range filtering
create index if not exists question_attempts_leaderboard_perf_idx
  on public.question_attempts (answered_at desc, subject_id, book, user_id, question_id);

-- 4. Storage Objects RLS policies for avatars bucket
-- Ensures bucket exists and authenticated users can insert and update (for upsert: true) their own avatar
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "avatar_public_read" on storage.objects;
drop policy if exists "avatar_insert_own_folder" on storage.objects;
drop policy if exists "avatar_update_own_folder" on storage.objects;
drop policy if exists "avatar_delete_own" on storage.objects;

create policy "avatar_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "avatar_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or name like (select auth.uid())::text || '/%'
    )
  );

create policy "avatar_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or name like (select auth.uid())::text || '/%'
      or owner_id = (select auth.uid())::text
      or owner::text = (select auth.uid())::text
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or name like (select auth.uid())::text || '/%'
    )
  );

create policy "avatar_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or name like (select auth.uid())::text || '/%'
      or owner_id = (select auth.uid())::text
      or owner::text = (select auth.uid())::text
    )
  );

commit;

