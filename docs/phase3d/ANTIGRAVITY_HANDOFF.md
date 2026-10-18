# Antigravity: remaining read-only live-schema checks

Date: 2026-10-15. Phase 3D decision: NO-GO pending database evidence and answer-storage compatibility.

Use the existing authorized Supabase SQL editor/catalog inspection only. Do not request or copy credentials. Do not run migrations, writes, resets, role changes, subscription changes, or application RPCs that may write. Return schema metadata only, without real user records, attempt rows, or participant identifiers.

Do not repeat the 146 passing application tests, build, lint, typecheck, content hashes, or secret scan. Codex did not perform a fresh live inspection and did not find a local PostgreSQL runtime. Isolated PostgreSQL 17 migration/rollback tests remain a separate prerequisite; read-only production metadata cannot replace them.

## 1. Recover the Phase 3C baseline and enumerate exact function contracts

Objects: all overloads of `set_question_attempt_book`, `record_question_attempt`, `leaderboard_metric_rows`, `get_leaderboard_snapshot`, `get_leaderboard`, `get_current_user_leaderboard_position`, and their period/timezone/minimum helpers.

Needed: exact argument names/order/types/defaults, return types, owner, SECURITY DEFINER flag, volatility, search path, source, and ACL. Save the read-only output as the pre-migration schema baseline. Compare all three replaced definitions against local Migration 22, not merely the migration filename.

```sql
select p.oid::regprocedure::text as signature,
       pg_get_function_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.provolatile, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'set_question_attempt_book', 'record_question_attempt',
    'leaderboard_metric_rows', 'get_leaderboard_snapshot',
    'get_leaderboard', 'get_current_user_leaderboard_position',
    'leaderboard_timezone', 'leaderboard_period_start',
    'leaderboard_accuracy_minimum'
  )
order by p.proname, p.oid::regprocedure::text;
```

Expected: Migration 23's three signatures/returns match the live objects it replaces. Confirm both raw helper overloads exist before reviewing standalone Migration 24. Any live body drift requires a refreshed dedicated rollback; do not overwrite live changes with the local Migration 22 definition.

Reason: replacement compatibility, exact rollback, and wrapper-owner execution rights are not established by local files alone.

## 2. Effective privileges, role inheritance, and schema trust

```sql
select p.oid::regprocedure::text as signature,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('leaderboard_metric_rows', 'get_leaderboard_snapshot',
                    'get_leaderboard', 'get_current_user_leaderboard_position',
                    'record_question_attempt', 'set_question_attempt_book')
order by signature;

select parent.rolname as granted_role, member.rolname as member_role,
       m.admin_option, m.inherit_option, m.set_option
from pg_auth_members m
join pg_roles parent on parent.oid = m.roleid
join pg_roles member on member.oid = m.member
where member.rolname in ('anon', 'authenticated');

select rolname, rolsuper, rolbypassrls, rolcreaterole
from pg_roles
where rolname in ('anon', 'authenticated')
   or oid in (
     select proowner from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('leaderboard_metric_rows', 'get_leaderboard_snapshot',
                       'get_leaderboard', 'get_current_user_leaderboard_position')
   );

select nspacl,
       has_schema_privilege('anon', 'public', 'CREATE') as anon_create,
       has_schema_privilege('authenticated', 'public', 'CREATE') as authenticated_create
from pg_namespace where nspname = 'public';
```

Expected target after any separately approved hardening: no effective anonymous/authenticated raw-helper EXECUTE on either overload, no untrusted CREATE in the trusted public schema, and authorized wrappers callable only through their intended authenticated contracts. Wrapper owners must own or have EXECUTE on the helper. Do not add direct authenticated helper grants to work around owner issues.

Before remediation, report actual grants honestly; Phase 3C reportedly observed anonymous four-argument access. Reason: PUBLIC revocation alone does not remove explicit/inherited grants, and ACL statements do not prove owners can still invoke helpers.

## 3. Blocking matching-answer contract and table constraints

```sql
select a.attname, format_type(a.atttypid, a.atttypmod) as type,
       a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as default_value
from pg_attribute a
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = 'public.question_attempts'::regclass
  and a.attnum > 0 and not a.attisdropped
order by a.attnum;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.question_attempts'::regclass
order by conname;
```

Expected: document whether the live `selected_answer` column/check and the attempt RPC can represent all supported matching selections. Local source has a 0–3 check and a `smallint` RPC; Strasinger has possible encodings up to 823,542. Check all RPC overloads from query 1 as well: a widened column alone does not fix a narrow argument or overloaded PostgREST resolution.

Reason: local matching tests do not exercise database persistence. If live uses the local contract, a separate compatible answer-storage/RPC fix with isolated tests is required before migration review can proceed. Do not apply an inferred type change from this handoff.

## 4. Triggers, RLS, and alternate exposure routes

```sql
select t.tgname, t.tgenabled, t.tgfoid::regprocedure::text as function,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where t.tgrelid = 'public.question_attempts'::regclass and not t.tgisinternal;

select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in ('public.question_attempts'::regclass,
              'public.activity_events'::regclass,
              'public.profiles'::regclass,
              'public.user_preferences'::regclass);

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('question_attempts', 'activity_events', 'profiles', 'user_preferences');

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('question_attempts', 'activity_events', 'profiles', 'user_preferences')
order by table_name, grantee, privilege_type;

select schemaname, viewname, definition
from pg_views
where schemaname = 'public'
  and definition ~* '(question_attempts|leaderboard_metric_rows|activity_events)';

select schemaname, matviewname, definition
from pg_matviews
where schemaname = 'public'
  and definition ~* '(question_attempts|leaderboard_metric_rows|activity_events)';

select p.oid::regprocedure::text as signature, p.prosecdef, p.proacl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prokind = 'f'
  and p.prosrc ~* '(leaderboard_metric_rows|question_attempts|activity_events)'
order by signature;
```

Expected: enabled BEFORE INSERT/UPDATE attribution trigger; own-user RLS on private attempt/event tables; opt-in filtering and authentication in exposed leaderboard wrappers; no alternate raw participant-data exposure in accessible functions/views. Inspect any additional table/view/function grants returned by the authorized dashboard if needed. Do not retrieve real rows to demonstrate exposure.

Reason: restricting one helper does not eliminate alternate routes, and SECURITY DEFINER functions can bypass normal caller RLS.

## 5. Deployment setting inspection

Use the authorized hosting dashboard's read-only environment view to confirm Strasinger cloud synchronization is not enabled in the deployed build. Report only “disabled/not configured” or “unexpectedly enabled”; do not copy other variable values. Do not edit or redeploy.

Also confirm through the existing Supabase dashboard migration history whether feature Migration 23 or hardening Migration 24 has already been recorded. Report version/name metadata only. Expected from the user's historical brief: Migration 23 not applied. Reason: local source and the public build-time flag cannot prove deployed state.

No execution approval is granted by any of these results. Return metadata findings, unresolved drift, and the answer-storage decision to the user; stop.
