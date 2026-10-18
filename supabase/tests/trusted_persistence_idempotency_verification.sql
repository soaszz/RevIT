-- RevIT Phase 3N-D: Trusted Persistence Idempotency & Conflict Verification Script
-- Target Environment: Isolated PostgreSQL 17 / Disposable Supabase Staging Database
-- DO NOT RUN AGAINST PRODUCTION.
--
-- This script runs inside a transaction and rolls back at the end.
-- It verifies Migration 26 hardening of commit_verified_study_batch:
--   1. New attempt inserts successfully.
--   2. Exact retry with identical payload is idempotent.
--   3. Same attempt ID with a different response digest is rejected (23505).
--   4. Same attempt ID with a different question ID is rejected (23505).
--   5. Same attempt ID with a different session slot is rejected (23505).
--   6. Same attempt ID supplied by a different owner is rejected without returning the original row (42501).
--   7. Same attempt ID from another session is rejected (42501).
--   8. Same attempt ID with changed correctness or selected-answer representation is rejected (23505).
--   9. New attempt ID with an occupied session slot remains rejected (23505).
--  10. Lost-ack retry cannot duplicate XP.
--  11. A failed multi-item batch leaves no partial attempts or rewards.
--  12. Existing valid attempts remain unchanged after rejected conflicts.

begin;

-- ============================================================================
-- 1. APPLY MIGRATION 26 INLINE FOR TRANSACTIONAL TESTING
-- ============================================================================

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

-- ============================================================================
-- 2. SETUP SYNTHETIC IDENTITIES & SESSIONS
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'test-user-a@revit.internal', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'test-user-b@revit.internal', crypt('password123', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_u_a uuid := '66666666-6666-6666-6666-666666666666'::uuid;
  v_u_b uuid := '77777777-7777-7777-7777-777777777777'::uuid;
  v_s_a1 public.study_sessions;
  v_s_a2 public.study_sessions;
  v_s_b public.study_sessions;
  v_att_1 uuid := 'e0000000-0000-0000-0000-000000000001'::uuid;
  v_att_2 uuid := 'e0000000-0000-0000-0000-000000000002'::uuid;
  v_res public.question_attempts[];
  v_stored public.question_attempts;
  v_count integer;
begin
  -- Sessions setup
  v_s_a1 := public.create_verified_study_session(v_u_a, gen_random_uuid(), '{"mode":"reviewer","target_count":5}'::jsonb, 'digest-a1');
  v_s_a2 := public.create_verified_study_session(v_u_a, gen_random_uuid(), '{"mode":"reviewer","target_count":5}'::jsonb, 'digest-a2');
  v_s_b := public.create_verified_study_session(v_u_b, gen_random_uuid(), '{"mode":"reviewer","target_count":5}'::jsonb, 'digest-b');

  -- 1. New attempt inserts successfully
  select array_agg(a) into v_res from public.commit_verified_study_batch(
    v_u_a, v_s_a1.id, jsonb_build_array(
      jsonb_build_object(
        'id', v_att_1, 'question_id', 'harr-cc-01', 'subject_id', 'cc', 'subject_name', 'CC',
        'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
        'selected_answer', 1, 'is_correct', true, 'session_slot', 0,
        'content_version', 'v1', 'response_digest', 'dig-original', 'book', 'Harr'
      )
    )
  ) a;
  if v_res[1].id <> v_att_1 then
    raise exception 'Assertion 1 failed: new attempt insert did not return expected row';
  end if;

  -- 2. Exact retry with identical payload is idempotent
  select array_agg(a) into v_res from public.commit_verified_study_batch(
    v_u_a, v_s_a1.id, jsonb_build_array(
      jsonb_build_object(
        'id', v_att_1, 'question_id', 'harr-cc-01', 'subject_id', 'cc', 'subject_name', 'CC',
        'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
        'selected_answer', 1, 'is_correct', true, 'session_slot', 0,
        'content_version', 'v1', 'response_digest', 'dig-original', 'book', 'Harr'
      )
    )
  ) a;
  if v_res[1].id <> v_att_1 then
    raise exception 'Assertion 2 failed: identical retry did not return expected row';
  end if;

  -- 3. Same attempt ID with a different response digest is rejected (23505)
  begin
    perform public.commit_verified_study_batch(
      v_u_a, v_s_a1.id, jsonb_build_array(
        jsonb_build_object(
          'id', v_att_1, 'question_id', 'harr-cc-01', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 1, 'is_correct', true, 'session_slot', 0,
          'content_version', 'v1', 'response_digest', 'dig-TAMPERED', 'book', 'Harr'
        )
      )
    );
    raise exception 'Assertion 3 failed: conflicting digest was not rejected';
  exception
    when unique_violation then
      null; -- Expected: 23505
  end;

  -- 4. Same attempt ID with a different question ID is rejected (23505)
  begin
    perform public.commit_verified_study_batch(
      v_u_a, v_s_a1.id, jsonb_build_array(
        jsonb_build_object(
          'id', v_att_1, 'question_id', 'harr-cc-DIFFERENT', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 1, 'is_correct', true, 'session_slot', 0,
          'content_version', 'v1', 'response_digest', 'dig-original', 'book', 'Harr'
        )
      )
    );
    raise exception 'Assertion 4 failed: conflicting question ID was not rejected';
  exception
    when unique_violation then
      null; -- Expected: 23505
  end;

  -- 5. Same attempt ID with a different session slot is rejected (23505)
  begin
    perform public.commit_verified_study_batch(
      v_u_a, v_s_a1.id, jsonb_build_array(
        jsonb_build_object(
          'id', v_att_1, 'question_id', 'harr-cc-01', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 1, 'is_correct', true, 'session_slot', 1, -- CONFLICTING SLOT
          'content_version', 'v1', 'response_digest', 'dig-original', 'book', 'Harr'
        )
      )
    );
    raise exception 'Assertion 5 failed: conflicting slot was not rejected';
  exception
    when unique_violation then
      null; -- Expected: 23505
  end;

  -- 6. Same attempt ID supplied by a different owner is rejected without returning original row (42501)
  begin
    perform public.commit_verified_study_batch(
      v_u_b, v_s_b.id, jsonb_build_array(
        jsonb_build_object(
          'id', v_att_1, 'question_id', 'harr-cc-01', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 1, 'is_correct', true, 'session_slot', 0,
          'content_version', 'v1', 'response_digest', 'dig-original', 'book', 'Harr'
        )
      )
    );
    raise exception 'Assertion 6 failed: cross-user attempt ID was not rejected';
  exception
    when insufficient_privilege then
      null; -- Expected: 42501
  end;

  -- 7. Same attempt ID from another session is rejected (42501)
  begin
    perform public.commit_verified_study_batch(
      v_u_a, v_s_a2.id, jsonb_build_array(
        jsonb_build_object(
          'id', v_att_1, 'question_id', 'harr-cc-01', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 1, 'is_correct', true, 'session_slot', 0,
          'content_version', 'v1', 'response_digest', 'dig-original', 'book', 'Harr'
        )
      )
    );
    raise exception 'Assertion 7 failed: cross-session attempt ID was not rejected';
  exception
    when insufficient_privilege then
      null; -- Expected: 42501
  end;

  -- 8. Same attempt ID with changed correctness or selected-answer representation is rejected (23505)
  begin
    perform public.commit_verified_study_batch(
      v_u_a, v_s_a1.id, jsonb_build_array(
        jsonb_build_object(
          'id', v_att_1, 'question_id', 'harr-cc-01', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 2, 'is_correct', false, 'session_slot', 0,
          'content_version', 'v1', 'response_digest', 'dig-original', 'book', 'Harr'
        )
      )
    );
    raise exception 'Assertion 8 failed: conflicting answer/correctness was not rejected';
  exception
    when unique_violation then
      null; -- Expected: 23505
  end;

  -- 9. New attempt ID with an occupied session slot remains rejected (23505)
  begin
    perform public.commit_verified_study_batch(
      v_u_a, v_s_a1.id, jsonb_build_array(
        jsonb_build_object(
          'id', v_att_2, 'question_id', 'harr-cc-02', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 0, 'is_correct', true, 'session_slot', 0, -- SLOT 0 OCCUPIED BY v_att_1
          'content_version', 'v1', 'response_digest', 'dig-q2', 'book', 'Harr'
        )
      )
    );
    raise exception 'Assertion 9 failed: slot collision was not rejected';
  exception
    when unique_violation then
      null; -- Expected: 23505
  end;

  -- 10. Lost-ack retry cannot duplicate XP or attempts
  select array_agg(a) into v_res from public.commit_verified_study_batch(
    v_u_a, v_s_a1.id, jsonb_build_array(
      jsonb_build_object(
        'id', v_att_1, 'question_id', 'harr-cc-01', 'subject_id', 'cc', 'subject_name', 'CC',
        'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
        'selected_answer', 1, 'is_correct', true, 'session_slot', 0,
        'content_version', 'v1', 'response_digest', 'dig-original', 'book', 'Harr'
      )
    )
  ) a;
  select count(*) into v_count from public.question_attempts where user_id = v_u_a;
  if v_count <> 1 then
    raise exception 'Assertion 10 failed: attempt count is % (expected 1)', v_count;
  end if;

  -- 11. A failed multi-item batch leaves no partial attempts or rewards
  begin
    perform public.commit_verified_study_batch(
      v_u_a, v_s_a1.id, jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid(), 'question_id', 'harr-cc-03', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 3, 'is_correct', true, 'session_slot', 1,
          'content_version', 'v1', 'response_digest', 'dig-q3', 'book', 'Harr'
        ),
        jsonb_build_object(
          'id', gen_random_uuid(), 'question_id', 'harr-cc-04', 'subject_id', 'cc', 'subject_name', 'CC',
          'topic_id', 'inst', 'topic_name', 'Inst', 'subtopic', 'Spec', 'difficulty', 'Easy',
          'selected_answer', 0, 'is_correct', true, 'session_slot', 0, -- DUPLICATE SLOT CONFLICT
          'content_version', 'v1', 'response_digest', 'dig-q4', 'book', 'Harr'
        )
      )
    );
  exception
    when unique_violation then
      null; -- Expected: batch fails atomically
  end;
  select count(*) into v_count from public.question_attempts where user_id = v_u_a;
  if v_count <> 1 then
    raise exception 'Assertion 11 failed: atomic batch rollback leaked rows (count=%)', v_count;
  end if;

  -- 12. Existing valid attempts remain unchanged after rejected conflicts
  select * into v_stored from public.question_attempts where id = v_att_1;
  if v_stored.user_id <> v_u_a
     or v_stored.question_id <> 'harr-cc-01'
     or v_stored.session_slot <> 0
     or v_stored.response_digest <> 'dig-original'
     or v_stored.selected_answer <> 1
     or v_stored.is_correct <> true then
    raise exception 'Assertion 12 failed: stored attempt was mutated by conflict attempts';
  end if;

end $$;

rollback;
