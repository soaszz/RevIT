-- Phase 3N-D: Trusted Study Persistence Idempotency and Cross-User Disclosure Hardening
-- Hardens commit_verified_study_batch to:
-- 1. Disallow cross-user attempt return/update when another user's attempt ID is submitted.
-- 2. Reject conflicting retry payloads (mismatched question, digest, slot, version, answer, correctness) with error 23505.
-- 3. Return exact, idempotent acknowledgments only when the attempt belongs to p_owner & p_session_id and payload matches.

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
  v_item_id uuid;
  v_item_slot integer;
  v_item_answer smallint;
  v_item_correct boolean;
  v_item_digest text;
  v_item_version text;
  v_item_qid text;
  v_item_book text;
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
    v_item_id := (v_item->>'id')::uuid;
    v_item_slot := (v_item->>'session_slot')::integer;
    v_item_answer := case when v_item->>'selected_answer' is null then null else (v_item->>'selected_answer')::smallint end;
    v_item_correct := (v_item->>'is_correct')::boolean;
    v_item_digest := v_item->>'response_digest';
    v_item_version := v_item->>'content_version';
    v_item_qid := v_item->>'question_id';
    v_item_book := v_item->>'book';

    -- 1. Try fresh insert with ON CONFLICT (id) DO NOTHING
    insert into public.question_attempts (
      id, user_id, question_id, subject_id, subject_name, topic_id, topic_name,
      subtopic, difficulty, selected_answer, is_correct, attempt_number,
      review_mode, session_id, session_slot, content_version, response_digest,
      verified_at, competitive_at, answered_at, book
    ) values (
      v_item_id,
      p_owner,
      v_item_qid,
      coalesce(nullif(btrim(v_item->>'subject_id'), ''), 'uncategorized'),
      coalesce(nullif(btrim(v_item->>'subject_name'), ''), 'Uncategorized'),
      coalesce(nullif(btrim(v_item->>'topic_id'), ''), 'uncategorized'),
      coalesce(nullif(btrim(v_item->>'topic_name'), ''), 'Uncategorized'),
      coalesce(nullif(btrim(v_item->>'subtopic'), ''), 'Uncategorized'),
      coalesce(nullif(v_item->>'difficulty', ''), 'Unspecified'),
      v_item_answer,
      v_item_correct,
      1,
      'reviewer',
      p_session_id,
      v_item_slot,
      v_item_version,
      v_item_digest,
      v_now,
      v_now,
      v_now,
      v_item_book
    )
    on conflict (id) do nothing
    returning * into v_attempt;

    -- 2. If successfully inserted, yield and continue
    if v_attempt.id is not null then
      return next v_attempt;
      continue;
    end if;

    -- 3. If ID conflict occurred, lock and inspect existing row to verify owner & payload equivalence
    select * into v_attempt
    from public.question_attempts
    where id = v_item_id
    for share;

    if not found then
      -- Concurrent insertion transaction rolled back
      raise exception 'Attempt conflict resolution failed.' using errcode = '40001';
    end if;

    -- Security validation: fail closed without disclosing cross-user or cross-session attempts
    if v_attempt.user_id <> p_owner or v_attempt.session_id <> p_session_id then
      raise exception 'Attempt conflict: owner or session mismatch.' using errcode = '42501';
    end if;

    -- Payload equivalence validation: reject conflicting retries
    if v_attempt.question_id is distinct from v_item_qid
       or v_attempt.response_digest is distinct from v_item_digest
       or v_attempt.session_slot is distinct from v_item_slot
       or v_attempt.content_version is distinct from v_item_version
       or v_attempt.selected_answer is distinct from v_item_answer
       or v_attempt.is_correct is distinct from v_item_correct
       or v_attempt.book is distinct from v_item_book then
      raise exception 'Attempt conflict: payload mismatch for existing attempt ID.' using errcode = '23505';
    end if;

    -- Exact retry matches on all immutable attributes: idempotent acknowledgment
    return next v_attempt;
  end loop;

  return;
end;
$$;

revoke all on function public.commit_verified_study_batch(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_verified_study_batch(uuid, uuid, jsonb) to service_role;
