-- RevIT versioned Terms of Service and Privacy Policy consent.
-- This migration preserves all existing users and leaves their new consent
-- fields NULL until they explicitly accept the current legal documents.
begin;

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists privacy_version text;

comment on column public.profiles.terms_accepted_at is
  'Database timestamp when the user accepted the version stored in terms_version.';
comment on column public.profiles.terms_version is
  'Central RevIT Terms of Service version explicitly accepted by this user.';
comment on column public.profiles.privacy_accepted_at is
  'Database timestamp when the user accepted the version stored in privacy_version.';
comment on column public.profiles.privacy_version is
  'Central RevIT Privacy Policy version explicitly accepted by this user.';

-- The existing auth trigger still creates exactly one profiles row. For new
-- signups it records the versions submitted by the required signup checkbox.
-- Both version values must be valid date versions or neither is accepted.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  accepted_terms_version text := nullif(btrim(new.raw_user_meta_data ->> 'terms_version'), '');
  accepted_privacy_version text := nullif(btrim(new.raw_user_meta_data ->> 'privacy_version'), '');
  accepted_at timestamptz;
begin
  if requested !~ '^[a-z0-9_]{3,24}$'
    or exists (select 1 from public.profiles where lower(username) = requested) then
    requested := 'learner_' || substring(new.id::text, 1, 8);
  end if;

  if accepted_terms_version is null
    or accepted_privacy_version is null
    or accepted_terms_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or accepted_privacy_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    accepted_terms_version := null;
    accepted_privacy_version := null;
  else
    accepted_at := statement_timestamp();
  end if;

  insert into public.profiles (
    id,
    username,
    first_name,
    terms_accepted_at,
    terms_version,
    privacy_accepted_at,
    privacy_version
  ) values (
    new.id,
    requested,
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 40),
    accepted_at,
    accepted_terms_version,
    accepted_at,
    accepted_privacy_version
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Uses the caller's permissions, so profiles_update_own remains the security
-- boundary. auth.uid() supplies ownership and the database supplies timestamps.
create or replace function public.accept_current_legal_terms(
  p_terms_version text,
  p_privacy_version text
)
returns public.profiles
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  owner uuid := auth.uid();
  accepted_profile public.profiles;
  accepted_at timestamptz := statement_timestamp();
begin
  if owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_terms_version is null
    or p_privacy_version is null
    or p_terms_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_privacy_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid legal document version.' using errcode = '22023';
  end if;

  update public.profiles as profile
  set terms_accepted_at = accepted_at,
      terms_version = p_terms_version,
      privacy_accepted_at = accepted_at,
      privacy_version = p_privacy_version
  where profile.id = owner
  returning profile.* into accepted_profile;

  if accepted_profile.id is null then
    raise exception 'The authenticated profile was not found.' using errcode = 'P0002';
  end if;
  return accepted_profile;
end;
$$;

revoke all on function public.accept_current_legal_terms(text, text) from public, anon;
grant execute on function public.accept_current_legal_terms(text, text) to authenticated;

-- profiles already has RLS enabled. Existing own-row SELECT/INSERT/UPDATE/DELETE
-- policies remain unchanged; no policy is weakened or replaced by this migration.
commit;
