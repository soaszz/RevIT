# Phase 3H handoff: architecture approval and remaining schema evidence

Date: 2026-10-15. **RECOMMENDED ARCHITECTURE READY FOR APPROVAL.**

Read `docs/phase3h/REPORT.md`. This phase changed documentation only. No application/SQL implementation, tests, scanners, Git commands, production access, permission changes, subscriptions, synchronization, or deployment. Phase 3G tests remain historical results. Strasinger synchronization stays disabled.

## Proposed Phase 3I scope, pending user approval

Server-only Next.js grading against existing static content; one restricted atomic attempt/reward transaction; owned server-issued session plans; stable attempt and session-slot replay protection; trusted timestamps and provenance. Keep local scoring, feedback, matching encodings, Mistake Bank, and offline queues. Matching selections reach the server before NULL persistence. Preserve existing formulas, amounts, datasets, and entitlement system.

Close every writer, including arbitrary `record_progression_award` amounts, old attempt/activity RPCs, and effective direct grants. Keep local missions provisional; do not use client reinforcement estimates as competitive evidence. Proposed transition preserves legacy history/XP, uses receipt-date future competition, and gives unissued offline/imported sessions no retrospective competitive credit. These trade-offs require architecture approval. Architecture approval is not production authorization.

Important correction to Phase 3G: Migration 6 revokes authenticated direct writes on attempts/activity/progress/achievements. Remaining own-row policies do not prove writes are executable. Confirm effective live permissions; do not report an early grant as current production exploitability.

Additional confirmed source findings: arbitrary positive XP RPC; one-attempt session reward; unrestricted backdating; separate queue false-acknowledgment loss; local mission evidence is editable. `user_progress.total_xp` is displayed in ranking snapshots, but study-XP rank sums activity events. Do not conflate those two stores.

## Targeted live evidence only

These catalog queries are for a separately authorized read-only inspection. They were **not executed** in Phase 3H. Do not fetch attempts, user identities, subscription rows, messages, counts/distributions, credentials, or answer data. Do not call writing RPCs or demonstrate exploits. Reuse Phase 3E's historical column/CHECK and matching findings unless catalog drift is detected. Record query time and database version in the resulting evidence.

### 1. Function signatures, owners, effective EXECUTE, source drift

Need current definitions of all overloads of scoring/award functions, raw helpers, wrappers, and entitlement lookup. Compare them with the source versions named in the report; capture exact rollback definitions and owners. Inspect helper functions called by any changed definition, only as necessary.

```sql
select p.oid::regprocedure::text as signature,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.proconfig, p.proacl,
       pg_get_function_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and p.proname in (
    'record_question_attempt', 'record_study_activity',
    'record_progression_award', 'check_and_unlock_achievements',
    'leaderboard_metric_rows', 'get_leaderboard_snapshot',
    'get_leaderboard', 'get_current_user_leaderboard_position',
    'leaderboard_timezone', 'leaderboard_accuracy_minimum',
    'leaderboard_period_start', 'set_question_attempt_book',
    'get_my_entitlement'
  )
order by signature;
```

Confirm absence of older amount/count/date-taking activity overloads, not just presence of the current two-argument version. Check whether Migration 13's false acknowledgment and Migration 20's XP award RPC exist live. Historical Phase 3E did not settle that complete writer inventory. Do not assume prepared migrations 23/24 were applied.

### 2. Effective table and column privileges; RLS and ownership

This distinguishes Migration 6's intended revocations from surviving column/PUBLIC/inherited grants. `has_any_column_privilege` detects column permissions that table-only checks miss.

```sql
with targets as (
  select c.oid, n.nspname, c.relname, c.relowner,
         c.relrowsecurity, c.relforcerowsecurity, c.relacl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v')
    and c.relname in (
      'question_attempts','question_reinforcement','daily_activity',
      'activity_events','user_progress','user_achievements',
      'user_xp_transactions','achievements','ai_messages','ai_chats','exam_schedule'
    )
)
select t.nspname, t.relname, r.rolname,
       pg_get_userbyid(t.relowner) as owner,
       t.relrowsecurity, t.relforcerowsecurity, t.relacl,
       has_table_privilege(r.oid,t.oid,'INSERT') as table_insert,
       has_table_privilege(r.oid,t.oid,'UPDATE') as table_update,
       has_table_privilege(r.oid,t.oid,'DELETE') as table_delete,
       has_any_column_privilege(r.oid,t.oid,'INSERT') as any_column_insert,
       has_any_column_privilege(r.oid,t.oid,'UPDATE') as any_column_update
from targets t cross join pg_roles r
where r.rolname in ('anon','authenticated','service_role')
order by t.relname,r.rolname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in (
  'question_attempts','question_reinforcement','daily_activity',
  'activity_events','user_progress','user_achievements',
  'user_xp_transactions','achievements','ai_messages','ai_chats','exam_schedule'
)
order by tablename,policyname;
```

If a column privilege is unexpected, inspect `pg_attribute.attacl` only for the affected table. Confirm the service role and intended owner can execute the new restricted design without granting browser roles broader access. Existing message/exam writes serve normal app features; report their influence on reward evidence rather than revoking unrelated features during inspection.

### 3. Targeted structural metadata and alternate writers

Confirm uniqueness, timestamp defaults, constraints, and triggers needed for replay and cutover planning. No row data needed.

```sql
select c.relname, a.attname, format_type(a.atttypid,a.atttypmod) as type,
       a.attnotnull, a.attacl,
       pg_get_expr(d.adbin,d.adrelid) as default_expression
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relname in (
  'question_attempts','activity_events','user_xp_transactions'
)
order by c.relname,a.attnum;

select c.relname, con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'question_attempts','activity_events','daily_activity',
  'user_progress','user_achievements','user_xp_transactions'
)
order by c.relname,con.conname;

select schemaname,tablename,indexname,indexdef
from pg_indexes
where schemaname='public' and tablename in (
  'question_attempts','activity_events','daily_activity',
  'user_progress','user_achievements','user_xp_transactions'
)
order by tablename,indexname;

select c.relname, t.tgname, pg_get_triggerdef(t.oid) as definition,
       t.tgfoid::regprocedure::text as trigger_function
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname='public'
  and c.relname in (
    'question_attempts','question_reinforcement','activity_events',
    'daily_activity','user_progress','user_achievements','user_xp_transactions'
  )
order by c.relname,t.tgname;
```

List candidate alternative functions without running them. This text filter is a discovery aid, **not proof of complete absence**: dynamic SQL, views, and helper indirection require inspection of the relevant dependency chain.

```sql
select n.nspname, p.oid::regprocedure::text as signature, p.prosecdef,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname not in ('pg_catalog','information_schema')
  and n.nspname not like 'pg_toast%'
  and p.prokind in ('f','p')
  and p.prosrc ~* '(question_attempts|activity_events|daily_activity|user_progress|user_achievements|user_xp_transactions|record_question_attempt|record_study_activity|record_progression_award)'
order by n.nspname,signature;

select schemaname,viewname,definition
from pg_views
where schemaname not in ('pg_catalog','information_schema')
  and definition ~* '(question_attempts|activity_events|user_progress|user_xp_transactions)';
```

For relevant candidate writers, collect definitions and effective grants as in query 1. Inspect dependent view ownership/security mode and permissions if writable paths exist. Verify configured exposed API schemas from existing non-secret configuration. Include callable definer functions in those schemas even when the source filter misses them. Do not run or reveal unrelated business data.

### 4. Role inheritance and creation defaults

Only if not already recorded in fresh evidence:

```sql
select caller.rolname as caller, inherited.rolname as inherited_role,
       inherited.rolsuper, inherited.rolbypassrls,
       pg_has_role(caller.oid,inherited.oid,'USAGE') as privileges_inherited,
       pg_has_role(caller.oid,inherited.oid,'MEMBER') as member
from pg_roles caller cross join pg_roles inherited
where caller.rolname in ('anon','authenticated','service_role')
  and pg_has_role(caller.oid,inherited.oid,'MEMBER')
order by caller.rolname,inherited.rolname;

select pg_get_userbyid(d.defaclrole) as creator,
       coalesce(n.nspname,'(global)') as schema,
       d.defaclobjtype, d.defaclacl
from pg_default_acl d
left join pg_namespace n on n.oid=d.defaclnamespace
where d.defaclnamespace=0 or n.nspname='public';
```

These confirm effective privilege assumptions and prevent new functions accidentally inheriting PUBLIC/API EXECUTE. Do not request database credentials. Record only necessary metadata; redact unexpected embedded secrets in function definitions before sharing.

## Implementation proof still required later

After explicit Phase 3I authorization: synthetic PostgreSQL role/RLS, concurrent retry/slot replay, atomic rewards, session completion, ordering/clock, legacy cutoff, matching, and security-preserving rollback tests. Test all affected application queues and entitlement paths, then the authorized regression suite. No suitable local PostgreSQL runtime was found in earlier phases; this phase did not rerun environment discovery or install software.

Stop after returning the metadata evidence. Do not apply the architecture, migrations 23/24, any grants, a rollback, or production test writes. Wait for user approval before implementation and separate approval before production execution.
