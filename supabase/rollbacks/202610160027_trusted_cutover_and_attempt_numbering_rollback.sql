-- PROPOSAL ONLY. Disable trusted writes; retain every attempt, session, provenance field and existing ACL hardening.
begin;
update public.trusted_study_config set enabled = false, updated_at = clock_timestamp() where id = 1;
create or replace function public.create_verified_study_session(p_owner uuid, p_request_id uuid, p_plan jsonb, p_request_digest text)
returns public.study_sessions language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin raise exception 'Trusted study persistence is disabled.' using errcode = 'PT503'; end;
$$;
create or replace function public.commit_verified_study_batch(p_owner uuid, p_session_id uuid, p_attempts jsonb)
returns setof public.question_attempts language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin raise exception 'Trusted study persistence is disabled.' using errcode = 'PT503'; end;
$$;
create or replace function public.assert_trusted_study_enabled()
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin raise exception 'Trusted study persistence is disabled.' using errcode = 'PT503'; end;
$$;
revoke all on function public.create_verified_study_session(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.commit_verified_study_batch(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.assert_trusted_study_enabled() from public, anon, authenticated, service_role;
commit;
