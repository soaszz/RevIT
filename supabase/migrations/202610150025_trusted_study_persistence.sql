-- Phase 3I-B: Dormant Trusted Study Persistence Schema
-- Establishes server-verified study sessions and restricted attempt persistence.
-- Dormant by default: client submission flow remains disconnected until approved.

-- 1. Configuration control flag (disabled by default)
create table if not exists public.trusted_study_config (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 2. Server-issued study sessions
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  mode text not null,
  target_count integer not null,
  question_pool jsonb not null,
  request_digest text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  completed_at timestamptz,
  constraint study_sessions_user_request_key unique (user_id, request_id)
);

alter table public.study_sessions enable row level security;

create policy study_sessions_select_own on public.study_sessions
  for select to authenticated
  using (user_id = auth.uid());

-- 3. Verified provenance columns on question_attempts
alter table public.question_attempts
  add column if not exists session_slot integer,
  add column if not exists content_version text,
  add column if not exists response_digest text,
  add column if not exists verified_at timestamptz,
  add column if not exists competitive_at timestamptz;

-- Slot uniqueness per session
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'question_attempts_session_slot_key'
  ) then
    alter table public.question_attempts
      add constraint question_attempts_session_slot_key unique (session_id, session_slot);
  end if;
end $$;

-- 4. Session creation RPC
create or replace function public.create_verified_study_session(
  p_owner uuid,
  p_request_id uuid,
  p_plan jsonb,
  p_request_digest text
)
returns public.study_sessions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.study_sessions;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Trusted study persistence requires server service role.' using errcode = '42501';
  end if;

  if p_owner is null or not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'Invalid owner identity.' using errcode = '22023';
  end if;

  select * into v_session
  from public.study_sessions
  where user_id = p_owner and request_id = p_request_id;
  if found then
    return v_session;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':session_request:' || p_request_id::text, 0));

  insert into public.study_sessions (
    user_id, request_id, mode, target_count, question_pool, request_digest
  ) values (
    p_owner,
    p_request_id,
    coalesce(nullif(btrim(p_plan->>'mode'), ''), 'reviewer'),
    coalesce((p_plan->>'target_count')::integer, 0),
    coalesce(p_plan->'question_pool', '[]'::jsonb),
    p_request_digest
  )
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.create_verified_study_session(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_verified_study_session(uuid, uuid, jsonb, text) to service_role;

-- 5. Atomic verified attempt persistence RPC
create or replace function public.commit_verified_study_batch(
  p_owner uuid,
  p_session_id uuid,
  p_attempts jsonb
)
returns setof public.question_attempts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_attempt public.question_attempts;
  v_now timestamptz := now();
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Trusted study persistence requires server service role.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.study_sessions
    where id = p_session_id and user_id = p_owner
  ) then
    raise exception 'Session not found or owner mismatch.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.study_sessions
    where id = p_session_id and expires_at < v_now
  ) then
    raise exception 'Study session has expired.' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':session:' || p_session_id::text, 0));

  for v_item in select * from jsonb_array_elements(p_attempts)
  loop
    insert into public.question_attempts (
      id, user_id, question_id, subject_id, subject_name, topic_id, topic_name,
      subtopic, difficulty, selected_answer, is_correct, attempt_number,
      review_mode, session_id, session_slot, content_version, response_digest,
      verified_at, competitive_at, answered_at, book
    ) values (
      (v_item->>'id')::uuid,
      p_owner,
      v_item->>'question_id',
      coalesce(nullif(btrim(v_item->>'subject_id'), ''), 'uncategorized'),
      coalesce(nullif(btrim(v_item->>'subject_name'), ''), 'Uncategorized'),
      coalesce(nullif(btrim(v_item->>'topic_id'), ''), 'uncategorized'),
      coalesce(nullif(btrim(v_item->>'topic_name'), ''), 'Uncategorized'),
      coalesce(nullif(btrim(v_item->>'subtopic'), ''), 'Uncategorized'),
      coalesce(nullif(v_item->>'difficulty', ''), 'Unspecified'),
      case when v_item->>'selected_answer' is null then null else (v_item->>'selected_answer')::smallint end,
      (v_item->>'is_correct')::boolean,
      1,
      'reviewer',
      p_session_id,
      (v_item->>'session_slot')::integer,
      v_item->>'content_version',
      v_item->>'response_digest',
      v_now,
      v_now,
      v_now,
      v_item->>'book'
    )
    on conflict (id) do update set
      verified_at = coalesce(public.question_attempts.verified_at, v_now)
    returning * into v_attempt;

    return next v_attempt;
  end loop;

  return;
end;
$$;

revoke all on function public.commit_verified_study_batch(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_verified_study_batch(uuid, uuid, jsonb) to service_role;

