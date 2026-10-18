-- Phase 3N-D: Security-preserving non-destructive rollback for Migration 26
-- Preserves all historical attempts, session records, and column schema.
-- Disables commit_verified_study_batch without data loss or returning to the unsafe implementation.

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
