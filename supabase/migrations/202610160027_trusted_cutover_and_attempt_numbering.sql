-- PROPOSAL ONLY. Never applied in Phase 3N-K. Requires Migrations 23-26.
-- Attempt-only foundation: no XP, activity, reinforcement or completion writes.
begin;

-- Fail closed on incompatible overloads instead of silently hardening only one.
do $$
begin
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('create_verified_study_session', 'commit_verified_study_batch')) <> 2
    or to_regprocedure('public.create_verified_study_session(uuid,uuid,jsonb,text)') is null
    or to_regprocedure('public.commit_verified_study_batch(uuid,uuid,jsonb)') is null then
    raise exception 'Trusted function signatures require review.';
  end if;
end $$;

-- No caller can enable its own authority. Only a separately authorized owner operation may enable this row.
alter table public.trusted_study_config enable row level security;
revoke all on public.trusted_study_config from public, anon, authenticated, service_role;
grant select on public.trusted_study_config to service_role;
insert into public.trusted_study_config(id, enabled) values (1, false)
on conflict (id) do update set enabled = false, updated_at = clock_timestamp();
revoke insert, update, delete, truncate, references, trigger on public.study_sessions from public, anon, authenticated;
grant select on public.study_sessions to authenticated;

create or replace function public.assert_trusted_study_enabled()
returns void language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_enabled boolean;
begin
  -- CURRENT_USER is the definer inside SECURITY DEFINER, not the requesting JWT role.
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server service role required.' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Trusted persistence requires READ COMMITTED.' using errcode = '40001';
  end if;
  select enabled into v_enabled from public.trusted_study_config where id = 1 for share;
  if v_enabled is distinct from true then
    raise exception 'Trusted study persistence is disabled.' using errcode = 'PT503';
  end if;
  -- Inspect every installed overload, including PUBLIC/inherited EXECUTE via effective privilege checks.
  -- No legacy grants are revoked by this proposal. A later authorized cutover must close them first.
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'record_question_attempt', 'record_study_activity', 'record_progression_award', 'check_and_unlock_achievements'
    ) and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) or exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) roles(role_name)
    where n.nspname = 'public' and c.relname in (
      'question_attempts', 'activity_events', 'daily_activity', 'user_progress',
      'user_achievements', 'user_xp_transactions', 'question_reinforcement', 'study_sessions', 'trusted_study_config'
    ) and (has_table_privilege(roles.role_name, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
      or has_any_column_privilege(roles.role_name, c.oid, 'INSERT,UPDATE'))
  ) then
    raise exception 'Legacy writers must be fenced before trusted persistence.' using errcode = 'PT503';
  end if;
end;
$$;
revoke all on function public.assert_trusted_study_enabled() from public, anon, authenticated, service_role;

create or replace function public.create_verified_study_session(
  p_owner uuid, p_request_id uuid, p_plan jsonb, p_request_digest text
)
returns public.study_sessions language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_session public.study_sessions;
begin
  perform public.assert_trusted_study_enabled();
  if p_owner is null or p_request_id is null or not exists (select 1 from auth.users where id = p_owner)
    or p_request_digest is null or p_request_digest !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_plan) is distinct from 'object'
    or jsonb_typeof(p_plan->'question_pool') is distinct from 'array' then
    raise exception 'Invalid session plan.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_plan->'question_pool') not between 1 and 4441
    or (p_plan->>'target_count') is null or (p_plan->>'target_count') !~ '^[0-9]{1,4}$'
    or (p_plan->>'target_count')::integer not between 1 and jsonb_array_length(p_plan->'question_pool')
    or (p_plan->>'mode') is null or (p_plan->>'mode') not in (
      'reviewer', 'adaptive', 'wrong_answers', 'weakness_focus', 'pre_test', 'post_test', 'oral_review'
    ) or exists (
      select 1 from jsonb_array_elements(p_plan->'question_pool') q
      where jsonb_typeof(q) is distinct from 'object' or coalesce(q->>'question_id', '') = ''
        or coalesce(q->>'content_version', '') = '' or char_length(q->>'question_id') > 240
    ) or (select count(distinct q->>'question_id') from jsonb_array_elements(p_plan->'question_pool') q)
      <> jsonb_array_length(p_plan->'question_pool') then
    raise exception 'Invalid session plan.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':session_request:' || p_request_id::text, 0));
  -- Recheck creation idempotency under the same lock as insertion.
  select * into v_session from public.study_sessions where user_id = p_owner and request_id = p_request_id;
  if found then
    if v_session.request_digest is distinct from p_request_digest
      or v_session.mode is distinct from p_plan->>'mode'
      or v_session.target_count is distinct from (p_plan->>'target_count')::integer
      or v_session.question_pool is distinct from p_plan->'question_pool' then
      raise exception 'Session request conflicts with existing plan.' using errcode = '23505';
    end if;
    return v_session;
  end if;
  insert into public.study_sessions(user_id, request_id, mode, target_count, question_pool, request_digest)
  values(p_owner, p_request_id, p_plan->>'mode', (p_plan->>'target_count')::integer, p_plan->'question_pool', p_request_digest)
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.commit_verified_study_batch(p_owner uuid, p_session_id uuid, p_attempts jsonb)
returns setof public.question_attempts language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_session public.study_sessions;
  v_item jsonb;
  v_attempt public.question_attempts;
  v_key text;
  v_number bigint;
  v_next_slot integer;
  v_now timestamptz;
begin
  perform public.assert_trusted_study_enabled();
  if p_owner is null or p_session_id is null or not exists (select 1 from auth.users where id = p_owner)
    or jsonb_typeof(p_attempts) is distinct from 'array' then
    raise exception 'Invalid study batch.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_attempts) not between 1 and 50 then
    raise exception 'Invalid study batch size.' using errcode = '22023';
  end if;
  -- One owner lock serializes trusted batches across sessions. Legacy numbering uses the question lock below.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':trusted-study', 0));
  select * into v_session from public.study_sessions where id = p_session_id and user_id = p_owner for update;
  if not found then raise exception 'Session ownership mismatch.' using errcode = '42501'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_attempts) a
    where jsonb_typeof(a) is distinct from 'object' or a->>'id' is null
      or coalesce(a->>'session_slot', '') !~ '^[0-9]{1,4}$'
      or coalesce(a->>'response_digest', '') !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(a->'is_correct') is distinct from 'boolean'
      or a->>'book' is null or a->>'book' not in ('Harr', 'Ciulla', 'Rodak')
      or not exists (select 1 from jsonb_array_elements(v_session.question_pool) q
        where q->>'question_id' = a->>'question_id' and q->>'content_version' = a->>'content_version')
  ) or (select count(distinct a->>'id') from jsonb_array_elements(p_attempts) a) <> jsonb_array_length(p_attempts)
    or (select count(distinct a->>'session_slot') from jsonb_array_elements(p_attempts) a) <> jsonb_array_length(p_attempts) then
    raise exception 'Invalid study batch items.' using errcode = '22023';
  end if;
  -- Cross-owner UUID collisions and multi-question batches acquire locks in deterministic order.
  for v_key in select a->>'id' from jsonb_array_elements(p_attempts) a order by a->>'id' loop
    perform pg_advisory_xact_lock(hashtextextended('trusted-attempt:' || v_key, 0));
  end loop;
  for v_key in select distinct a->>'question_id' from jsonb_array_elements(p_attempts) a order by a->>'question_id' loop
    -- Exact lock namespace used by record_question_attempt; no client number is authoritative.
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || v_key, 0));
  end loop;
  select coalesce(max(session_slot), -1) + 1 into v_next_slot from public.question_attempts
  where user_id = p_owner and session_id = p_session_id;
  for v_item in select a from jsonb_array_elements(p_attempts) a order by (a->>'session_slot')::integer loop
    select * into v_attempt from public.question_attempts where id = (v_item->>'id')::uuid for share;
    if found then
      if v_attempt.user_id is distinct from p_owner or v_attempt.session_id is distinct from p_session_id
        or v_attempt.verified_at is null or v_attempt.session_slot is distinct from (v_item->>'session_slot')::integer
        or v_attempt.question_id is distinct from v_item->>'question_id'
        or v_attempt.content_version is distinct from v_item->>'content_version'
        or v_attempt.response_digest is distinct from v_item->>'response_digest'
        or v_attempt.selected_answer is distinct from (v_item->>'selected_answer')::smallint
        or v_attempt.is_correct is distinct from (v_item->>'is_correct')::boolean
        or v_attempt.book is distinct from v_item->>'book'
        or v_attempt.subject_id is distinct from v_item->>'subject_id'
        or v_attempt.topic_id is distinct from v_item->>'topic_id'
        or v_attempt.subject_name is distinct from v_item->>'subject_name'
        or v_attempt.topic_name is distinct from v_item->>'topic_name'
        or v_attempt.subtopic is distinct from v_item->>'subtopic'
        or v_attempt.difficulty is distinct from v_item->>'difficulty' then
        raise exception 'Attempt conflicts with durable record.' using errcode = '23505';
      end if;
      return next v_attempt;
      continue;
    end if;
    v_now := clock_timestamp();
    if v_session.expires_at <= v_now or v_session.completed_at is not null then
      raise exception 'Session is expired or complete.' using errcode = '55000';
    end if;
    if (v_item->>'session_slot')::integer <> v_next_slot then
      raise exception 'Session slot conflict.' using errcode = '23505';
    end if;
    select coalesce(max(attempt_number)::bigint, 0) + 1 into v_number
    from public.question_attempts where user_id = p_owner and question_id = v_item->>'question_id';
    if v_number > 2147483647 then raise exception 'Attempt number exhausted.' using errcode = '22003'; end if;
    insert into public.question_attempts(
      id, user_id, question_id, subject_id, subject_name, topic_id, topic_name, subtopic, difficulty,
      selected_answer, is_correct, attempt_number, review_mode, session_id, is_adaptive_repeat,
      answered_at, book, session_slot, content_version, response_digest, verified_at, competitive_at
    ) values (
      (v_item->>'id')::uuid, p_owner, v_item->>'question_id', v_item->>'subject_id', v_item->>'subject_name',
      v_item->>'topic_id', v_item->>'topic_name', v_item->>'subtopic', v_item->>'difficulty',
      (v_item->>'selected_answer')::smallint, (v_item->>'is_correct')::boolean, v_number::integer,
      v_session.mode, p_session_id, v_number > 1, v_now, v_item->>'book', (v_item->>'session_slot')::integer,
      v_item->>'content_version', v_item->>'response_digest', v_now, null
    ) returning * into v_attempt;
    -- No historical row update, no response encoding, no award or completion write.
    v_next_slot := v_next_slot + 1;
    return next v_attempt;
  end loop;
end;
$$;

revoke all on function public.create_verified_study_session(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.commit_verified_study_batch(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_verified_study_session(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.commit_verified_study_batch(uuid, uuid, jsonb) to service_role;
commit;
