# SUPABASE SETUP - EXACT STEPS

RevIT does not modify Supabase automatically. Apply this migration manually after reviewing it and taking a database backup. Existing users and existing data are preserved; their four new fields start as `NULL`, which intentionally makes the agreement screen appear on their next authenticated visit.

## 1. Migration file

- Filename: `202609030007_legal_consent_versioning.sql`
- Path: `supabase/migrations/202609030007_legal_consent_versioning.sql`
- Existing table modified: `public.profiles`
- Apply after: `202609030006_leaderboards_v1.sql`

## 2. Columns added

| Column | PostgreSQL type | Nullable | Default | Purpose |
| --- | --- | --- | --- | --- |
| `terms_accepted_at` | `timestamptz` | Yes | None | Database timestamp for the accepted Terms version. |
| `terms_version` | `text` | Yes | None | Version of the Terms of Service the user accepted. |
| `privacy_accepted_at` | `timestamptz` | Yes | None | Database timestamp for the accepted Privacy version. |
| `privacy_version` | `text` | Yes | None | Version of the Privacy Policy the user accepted. |

There is deliberately no boolean `accepted_terms` field and no fake backfill. A user is current only when both stored versions equal the centralized application versions and both timestamps are present.

## 3. Full migration SQL

Open the migration file above or copy this exact SQL:

```sql
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
```

## 4. RLS details

RLS was already enabled on `public.profiles` by `202608200001_revit_cloud_foundation.sql`. This migration does not disable RLS and does not add, remove, or weaken a table policy.

| Policy reused | Operation | USING expression | WITH CHECK expression | Security purpose |
| --- | --- | --- | --- | --- |
| `profiles_select_own` | `SELECT` | `((select auth.uid()) = id)` | Not applicable | A user can read only their own profile and consent fields. |
| `profiles_insert_own` | `INSERT` | Not applicable | `((select auth.uid()) = id)` | A user can insert only a row with their own auth UUID. |
| `profiles_update_own` | `UPDATE` | `((select auth.uid()) = id)` | `((select auth.uid()) = id)` | A user can update only their own row and cannot change it into another user’s row. The consent RPC is `SECURITY INVOKER`, so this policy still governs it. |
| `profiles_delete_own` | `DELETE` | `((select auth.uid()) = id)` | Not applicable | A user can delete only their own profile row. |

No policy is added or modified. The new `accept_current_legal_terms(text, text)` function:

- receives no user ID from the browser;
- obtains the owner from `auth.uid()`;
- runs as `SECURITY INVOKER`, so the caller’s RLS permissions apply;
- validates date-style version values;
- uses `statement_timestamp()` in PostgreSQL for both timestamps;
- returns the persisted profile only after the update succeeds;
- is executable by `authenticated`, not `anon`.

## 5. Manual Supabase steps

1. Back up the RevIT database or at least export `public.profiles`.
2. Open **Supabase Dashboard → RevIT project → SQL Editor**.
3. Select **New query**.
4. Paste the complete SQL from section 3. Do not paste the rollback SQL.
5. Check that the selected project is RevIT, then click **Run** once.
6. Confirm the query reports success. The transaction means a SQL error rolls back the migration instead of leaving a partial schema.
7. Do not rerun older migrations and do not edit `auth.users` manually.

## 6. Verify the database

1. Open **Supabase Dashboard → Table Editor → profiles**.
2. Confirm these columns exist: `terms_accepted_at`, `terms_version`, `privacy_accepted_at`, `privacy_version`.
3. Confirm each accepts `NULL` and has no default.
4. Open an account created before this update. Its four values should initially be `NULL`; this is correct and must not be manually backfilled.
5. In **Database → Functions**, confirm `accept_current_legal_terms` exists.
6. In **Authentication → Policies → profiles**, confirm RLS remains enabled and the four existing own-row policies remain present.

## 7. Verify an existing user

1. Deploy or run the updated RevIT application after applying the migration.
2. Log in to an account created before this update.
3. Confirm the loading screen remains visible while the profile and consent state load; the dashboard must not flash first.
4. Confirm the blocking **Before continuing** agreement appears.
5. Open **Read Terms of Service** and confirm `/terms` opens without ending the session or clearing the agreement.
6. Open **Read Privacy Policy** and confirm `/privacy` behaves the same way.
7. Confirm **Accept and continue** is disabled before the checkbox is checked.
8. Check the box and select **Accept and continue**.
9. Confirm the agreement remains visible until the save completes, then the RevIT workspace opens.
10. Open **Table Editor → profiles**, find that user’s row, and confirm both timestamps are populated and both versions equal `2026-09-03`.
11. Refresh RevIT and confirm the agreement does not appear again.

## 8. Verify a new user and email verification

1. Sign out and open `/auth`.
2. Select **Sign up**. Confirm the agreement checkbox is unchecked.
3. Confirm the create-account button remains disabled until the checkbox is checked.
4. Open both legal links and confirm the entered email, username, and passwords remain in the original tab.
5. Check the checkbox and complete signup.
6. Confirm the existing Supabase email-verification message and flow still work.
7. Follow the verification email, then sign in as required by the project’s existing configuration.
8. In **Table Editor → profiles**, confirm the signup trigger stored both timestamps and both `2026-09-03` versions.
9. Confirm no unnecessary second agreement appears when those values are current.

If signup occurs before this migration is applied, the old trigger cannot store the metadata. After the migration, that user correctly receives the existing-user agreement once.

## 9. Verify decline and sign-out

1. Set the four consent fields for a test user to `NULL`, or use a pre-update test account.
2. Sign in and wait for the agreement screen.
3. Do not check the checkbox. Select **Sign out**.
4. Confirm the session ends and `/auth` appears.
5. Inspect the test user’s `profiles` row and confirm all four consent values remain unchanged.
6. Confirm the account and its existing study data still exist.

## 10. Verify a future policy update

1. Open `app/lib/legal.ts`.
2. Temporarily change only `CURRENT_TERMS_VERSION` from `"2026-09-03"` to a later date-style version such as `"2027-01-15"`.
3. Start RevIT and log in as a user who previously accepted `2026-09-03`.
4. Confirm the agreement appears because the stored Terms version no longer matches.
5. Accept and confirm the Terms timestamp and version update while the Privacy version remains written as the current configured Privacy version.
6. Restore the intended version before committing or deploying the test change. Never lower or reuse a published version to hide a material policy update.

Repeat the same process with `CURRENT_PRIVACY_VERSION` to test a Privacy-only update.

## 11. Security test

Use a disposable Supabase project, not production, for the automated SQL test in `supabase/tests/rls_checks.sql`. It creates two temporary auth identities inside a transaction and rolls everything back.

For a manual two-user test:

1. Create User A and User B.
2. Sign in as User A, accept, and record User A’s auth UUID.
3. In a Supabase client authenticated as User B, attempt `select` from `profiles` filtered to User A’s UUID. Expect zero rows.
4. Still as User B, attempt to update User A’s `terms_version`. Expect zero updated rows or an RLS error.
5. Call `accept_current_legal_terms` as User B. Confirm only User B’s row changes because the function uses `auth.uid()` and accepts no user-ID argument.
6. Never test by exposing the service-role key in a browser; the service role bypasses RLS and is not representative of a user session.

The repository RLS test now also verifies that User B cannot read or update User A’s profile/consent row.

## 12. Rollback

Rollback file: `supabase/rollbacks/202609030007_legal_consent_versioning_rollback.sql`.

Before rollback, export all four consent columns. Rolling back permanently loses every acceptance timestamp and version; after redeploying code that expects the fields, authenticated startup will also fail closed until the migration is reapplied.

```sql
-- WARNING: this rollback permanently removes every stored consent version and
-- acceptance timestamp. Export or back up those values before continuing.
begin;

drop function if exists public.accept_current_legal_terms(text, text);

-- Restore the pre-consent profile creation function before dropping its columns.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if requested !~ '^[a-z0-9_]{3,24}$'
    or exists (select 1 from public.profiles where lower(username) = requested) then
    requested := 'learner_' || substring(new.id::text, 1, 8);
  end if;
  insert into public.profiles (id, username, first_name)
  values (new.id, requested, left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 40))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

alter table public.profiles
  drop column if exists terms_accepted_at,
  drop column if exists terms_version,
  drop column if exists privacy_accepted_at,
  drop column if exists privacy_version;

commit;
```

To run it manually, open **Supabase Dashboard → RevIT project → SQL Editor → New query**, paste the rollback SQL, verify you have a backup and selected the correct project, then click **Run** once.

## 13. Favicon verification and cache notes

The favicon is generated at `/icon` by `app/icon.tsx` from the existing `public/revit-frog.png` asset. It is a 32×32 PNG and is scaled by browsers for 16×16 tabs.

Test the browser tab in current Chrome, Edge, Firefox, and Safari where available. If a browser still shows the old icon:

1. Confirm the page source contains a `rel="icon"` link to `/icon`.
2. Open `/icon` directly and confirm the frog PNG appears.
3. Hard-refresh the page.
4. Close every RevIT tab and reopen the site.
5. Test in a private/incognito window or a fresh browser profile.
6. If necessary, clear cached images/files or site data for the RevIT origin, then restart the browser.

Do not repeatedly rename the frog asset. Browser favicon caches can outlive normal page caches.
