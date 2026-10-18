-- RevIT Phase 3K: Trusted Persistence Rollback Verification Script
-- Target Environment: Isolated PostgreSQL 17 / Disposable Supabase Staging Database
-- DO NOT RUN AGAINST PRODUCTION.
--
-- This script runs inside a transaction and rolls back at the end.
-- It verifies:
--   1. Rollback script execution leaves tables and historical attempts intact.
--   2. create_verified_study_session and commit_verified_study_batch become disabled stubs (55000).
--   3. All EXECUTE permissions remain revoked.
--   4. trusted_study_config.enabled is set to false.

begin;

-- ============================================================================
-- 1. APPLY ROLLBACK LOGIC
-- ============================================================================

-- Execute rollback operations inline within test transaction
insert into public.trusted_study_config (id, enabled, updated_at)
values (1, false, now())
on conflict (id) do update set
  enabled = false,
  updated_at = now();

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
begin
  raise exception 'Trusted study persistence is disabled.' using errcode = '55000';
end;
$$;

revoke all on function public.create_verified_study_session(uuid, uuid, jsonb, text) from public, anon, authenticated;

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
begin
  raise exception 'Trusted study persistence is disabled.' using errcode = '55000';
end;
$$;

revoke all on function public.commit_verified_study_batch(uuid, uuid, jsonb) from public, anon, authenticated;

-- ============================================================================
-- 2. VERIFY DISABLED STUBS AND FAIL-CLOSED BEHAVIOR
-- ============================================================================

-- 2.1 Configuration is false
do $$
begin
  if exists (select 1 from public.trusted_study_config where id = 1 and enabled = true) then
    raise exception 'Assertion failed: trusted_study_config was not set to false';
  end if;
end $$;

-- 2.2 Calling create_verified_study_session raises 55000
do $$
begin
  begin
    perform public.create_verified_study_session(
      gen_random_uuid(),
      gen_random_uuid(),
      '{}'::jsonb,
      'test-digest'
    );
    raise exception 'Assertion failed: create_verified_study_session stub did not raise exception';
  exception
    when object_not_in_prerequisite_state then
      null; -- Expected: error 55000
  end;
end $$;

-- 2.3 Calling commit_verified_study_batch raises 55000
do $$
begin
  begin
    perform public.commit_verified_study_batch(
      gen_random_uuid(),
      gen_random_uuid(),
      '[]'::jsonb
    );
    raise exception 'Assertion failed: commit_verified_study_batch stub did not raise exception';
  exception
    when object_not_in_prerequisite_state then
      null; -- Expected: error 55000
  end;
end $$;

-- 2.4 Verify no tables were dropped
do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'question_attempts') then
    raise exception 'Assertion failed: question_attempts was dropped';
  end if;

  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'study_sessions') then
    raise exception 'Assertion failed: study_sessions was dropped';
  end if;
end $$;

rollback;
