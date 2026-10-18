-- Phase 3I-B: Security-preserving non-destructive rollback for trusted study persistence
-- Preserves all historical attempts, session records, and column schema.
-- Disables trusted persistence RPCs without data loss or privilege expansion.

-- 1. Ensure configuration flag is disabled
update public.trusted_study_config
set enabled = false, updated_at = now()
where id = 1;

-- 2. Replace RPCs with disabled stubs to prevent execution
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

-- 3. Strict privilege lockdown
revoke all on function public.create_verified_study_session(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.commit_verified_study_batch(uuid, uuid, jsonb) from public, anon, authenticated;
