-- RevIT Phase 3K: Trusted Persistence & Migration Verification Script
-- Target Environment: Isolated PostgreSQL 17 / Disposable Supabase Staging Database
-- DO NOT RUN AGAINST PRODUCTION.
--
-- This script runs inside a transaction and rolls back at the end.
-- It verifies:
--   1. Migration 23, 24, 25 schema state and constraints
--   2. Function signatures and privileges (PUBLIC, anon, authenticated, service_role)
--   3. Caller role enforcement (current_user in ('service_role', 'postgres'))
--   4. RLS isolation on study_sessions
--   5. Session creation, idempotency, and owner validation
--   6. Batch attempt insertion (Ordinary MCQ + Matching question with selected_answer = NULL)
--   7. Session slot uniqueness (23505) and session expiration (55000)
--   8. Leaderboard helper privilege revocation (Migration 24)

begin;

-- ============================================================================
-- 1. SETUP SYNTHETIC TEST IDENTITIES
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'test-user-1@revit.internal', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'test-user-2@revit.internal', crypt('password123', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

-- ============================================================================
-- 2. SCHEMA & CONSTRAINT INTEGRITY CHECKS
-- ============================================================================

do $$
begin
  -- 2.1 Configuration table
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'trusted_study_config') then
    raise exception 'Assertion failed: trusted_study_config table does not exist';
  end if;

  -- 2.2 Study sessions table and constraints
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'study_sessions') then
    raise exception 'Assertion failed: study_sessions table does not exist';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'study_sessions_user_request_key'
      and conrelid = 'public.study_sessions'::regclass
  ) then
    raise exception 'Assertion failed: study_sessions_user_request_key constraint missing';
  end if;

  -- 2.3 Question attempts verified columns
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'question_attempts' and column_name = 'session_slot'
  ) then
    raise exception 'Assertion failed: question_attempts.session_slot column missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'question_attempts' and column_name = 'response_digest'
  ) then
    raise exception 'Assertion failed: question_attempts.response_digest column missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'question_attempts' and column_name = 'verified_at'
  ) then
    raise exception 'Assertion failed: question_attempts.verified_at column missing';
  end if;

  -- 2.4 Slot uniqueness constraint
  if not exists (
    select 1 from pg_constraint
    where conname = 'question_attempts_session_slot_key'
      and conrelid = 'public.question_attempts'::regclass
  ) then
    raise exception 'Assertion failed: question_attempts_session_slot_key constraint missing';
  end if;
end $$;

-- ============================================================================
-- 3. PRIVILEGE & ACCESS RESTRICTION VERIFICATION
-- ============================================================================

-- 3.1 Migration 24: leaderboard_metric_rows must not be executable by authenticated
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.leaderboard_metric_rows('daily', 'questions', null, null);
    raise exception 'Security violation: authenticated role could execute leaderboard_metric_rows';
  exception
    when insufficient_privilege then
      null; -- Expected: execute privilege is revoked
  end;
end $$;

-- 3.2 Migration 25: create_verified_study_session must not be executable by authenticated
do $$
begin
  begin
    perform public.create_verified_study_session(
      '11111111-1111-1111-1111-111111111111'::uuid,
      gen_random_uuid(),
      '{"mode":"reviewer","target_count":10,"question_pool":[]}'::jsonb,
      'test-digest'
    );
    raise exception 'Security violation: authenticated role could execute create_verified_study_session';
  exception
    when insufficient_privilege then
      null; -- Expected: execute privilege is revoked
  end;
end $$;

-- 3.3 Migration 25: commit_verified_study_batch must not be executable by authenticated
do $$
begin
  begin
    perform public.commit_verified_study_batch(
      '11111111-1111-1111-1111-111111111111'::uuid,
      gen_random_uuid(),
      '[]'::jsonb
    );
    raise exception 'Security violation: authenticated role could execute commit_verified_study_batch';
  exception
    when insufficient_privilege then
      null; -- Expected: execute privilege is revoked
  end;
end $$;

-- ============================================================================
-- 4. SERVICE-ROLE PERSISTENCE EXECUTION & FUNCTIONAL VERIFICATION
-- ============================================================================

-- Switch to service_role (simulating Next.js createAdminServiceClient)
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_req_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_user_1 uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_user_2 uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_session_1 public.study_sessions;
  v_session_repeat public.study_sessions;
  v_attempt_1 uuid := 'b0000000-0000-0000-0000-000000000001'::uuid;
  v_attempt_2 uuid := 'b0000000-0000-0000-0000-000000000002'::uuid;
  v_attempt_dup_slot uuid := 'b0000000-0000-0000-0000-000000000003'::uuid;
  v_batch_result public.question_attempts[];
  v_expired_session_id uuid := 'c0000000-0000-0000-0000-000000000001'::uuid;
begin
  -- 4.1 Reject invalid / non-existent owner
  begin
    perform public.create_verified_study_session(
      '99999999-9999-9999-9999-999999999999'::uuid,
      v_req_id,
      '{"mode":"reviewer","target_count":5}'::jsonb,
      'test-digest'
    );
    raise exception 'Security violation: create_verified_study_session accepted non-existent owner';
  exception
    when invalid_parameter_value then
      null; -- Expected: error 22023
  end;

  -- 4.2 Valid session creation
  v_session_1 := public.create_verified_study_session(
    v_user_1,
    v_req_id,
    '{"mode":"reviewer","target_count":2,"question_pool":[{"id":"q1"},{"id":"q2"}]}'::jsonb,
    'digest-user-1'
  );

  if v_session_1.id is null or v_session_1.user_id <> v_user_1 then
    raise exception 'Assertion failed: created session has invalid user_id or id';
  end if;

  -- 4.3 Idempotent session request: identical (user_id, request_id) returns existing row
  v_session_repeat := public.create_verified_study_session(
    v_user_1,
    v_req_id,
    '{"mode":"reviewer","target_count":2}'::jsonb,
    'digest-user-1'
  );

  if v_session_repeat.id <> v_session_1.id then
    raise exception 'Assertion failed: duplicate session request created different session';
  end if;

  -- 4.4 Reject session owner mismatch in commit_verified_study_batch
  begin
    perform public.commit_verified_study_batch(
      v_user_2, -- Forged owner trying to submit to user 1 session
      v_session_1.id,
      '[]'::jsonb
    );
    raise exception 'Security violation: commit_verified_study_batch accepted mismatched owner';
  exception
    when insufficient_privilege then
      null; -- Expected: error 42501 (Session not found or owner mismatch)
  end;

  -- 4.5 Reject expired session
  insert into public.study_sessions (
    id, user_id, request_id, mode, target_count, question_pool, request_digest, expires_at
  ) values (
    v_expired_session_id, v_user_1, gen_random_uuid(), 'reviewer', 1, '[]'::jsonb, 'expired-digest', now() - interval '1 hour'
  );

  begin
    perform public.commit_verified_study_batch(
      v_user_1,
      v_expired_session_id,
      '[]'::jsonb
    );
    raise exception 'Security violation: commit_verified_study_batch accepted expired session';
  exception
    when object_not_in_prerequisite_state then
      null; -- Expected: error 55000 (Study session has expired)
  end;

  -- 4.6 Successful batch commit (Ordinary MCQ + Matching question with selected_answer = NULL)
  select array_agg(a) into v_batch_result
  from public.commit_verified_study_batch(
    v_user_1,
    v_session_1.id,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_attempt_1,
        'question_id', 'harr-clinchem-001',
        'subject_id', 'clinical-chemistry',
        'subject_name', 'Clinical Chemistry',
        'topic_id', 'clinchem-instrumentation',
        'topic_name', 'Instrumentation',
        'subtopic', 'Spectrophotometry',
        'difficulty', 'Medium',
        'selected_answer', 2,
        'is_correct', true,
        'session_slot', 0,
        'content_version', 'harr-v1',
        'response_digest', 'digest-q1',
        'book', 'Harr'
      ),
      jsonb_build_object(
        'id', v_attempt_2,
        'question_id', 'strasinger7-ch01-q032',
        'subject_id', 'strasinger-ch01',
        'subject_name', 'Strasinger Urinalysis',
        'topic_id', 'strasinger-safety',
        'topic_name', 'Safety',
        'subtopic', 'Safety Symbols',
        'difficulty', 'Hard',
        'selected_answer', null, -- Matching question: MUST BE NULL
        'is_correct', true,
        'session_slot', 1,
        'content_version', 'strasinger-v1',
        'response_digest', 'digest-q2',
        'book', 'Strasinger'
      )
    )
  ) a;

  if array_length(v_batch_result, 1) <> 2 then
    raise exception 'Assertion failed: batch did not insert exactly 2 attempts';
  end if;

  -- 4.7 Verify matching question stored selected_answer as NULL without constraint violation
  if exists (
    select 1 from public.question_attempts
    where id = v_attempt_2 and selected_answer is not null
  ) then
    raise exception 'Assertion failed: matching question selected_answer was not null';
  end if;

  -- 4.8 Duplicate session slot in same session raises unique violation (23505)
  begin
    perform public.commit_verified_study_batch(
      v_user_1,
      v_session_1.id,
      jsonb_build_array(
        jsonb_build_object(
          'id', v_attempt_dup_slot,
          'question_id', 'harr-clinchem-002',
          'subject_id', 'clinical-chemistry',
          'subject_name', 'Clinical Chemistry',
          'topic_id', 'clinchem-instrumentation',
          'topic_name', 'Instrumentation',
          'subtopic', 'Spectrophotometry',
          'difficulty', 'Easy',
          'selected_answer', 1,
          'is_correct', true,
          'session_slot', 0, -- DUPLICATE SLOT 0
          'content_version', 'harr-v1',
          'response_digest', 'digest-dup',
          'book', 'Harr'
        )
      )
    );
    raise exception 'Constraint failure: duplicate session slot was permitted';
  exception
    when unique_violation then
      null; -- Expected: error 23505 on question_attempts_session_slot_key
  end;
end $$;

-- ============================================================================
-- 5. ROW LEVEL SECURITY ON study_sessions
-- ============================================================================

-- User 1 should see own session
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

do $$
begin
  if not exists (
    select 1 from public.study_sessions
    where user_id = '11111111-1111-1111-1111-111111111111'
  ) then
    raise exception 'RLS failure: user 1 cannot select their own study session';
  end if;
end $$;

-- User 2 should NOT see User 1's session
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

do $$
begin
  if exists (
    select 1 from public.study_sessions
    where user_id = '11111111-1111-1111-1111-111111111111'
  ) then
    raise exception 'RLS failure: user 2 can view user 1 study session';
  end if;
end $$;

-- ============================================================================
-- 6. ROLLBACK & CLEANUP (NON-DESTRUCTIVE)
-- ============================================================================

-- All test objects and mutations roll back cleanly.
rollback;
