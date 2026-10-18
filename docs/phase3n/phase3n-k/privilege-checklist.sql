-- REVIEW PREPARATION ONLY. NOT EXECUTED. Catalog-only; contains no application/user records or writes.
-- Capture database version, transaction isolation and inspection time in a later authorized review.
select version(), current_setting('transaction_isolation'), clock_timestamp();

-- Every overload; effective rights include PUBLIC and inherited privileges.
select p.oid::regprocedure::text as signature, pg_get_userbyid(p.proowner) as owner,
  p.prosecdef, p.proconfig, p.proacl,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
  pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
  'assert_trusted_study_enabled', 'create_verified_study_session', 'commit_verified_study_batch',
  'record_question_attempt', 'record_study_activity', 'record_progression_award', 'check_and_unlock_achievements',
  'leaderboard_metric_rows', 'get_leaderboard', 'get_current_user_leaderboard_position', 'get_leaderboard_snapshot'
)
order by signature;

select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity, c.relacl,
  roles.role_name,
  has_table_privilege(roles.role_name, c.oid, 'SELECT') as can_select,
  has_table_privilege(roles.role_name, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') as any_table_write,
  has_any_column_privilege(roles.role_name, c.oid, 'INSERT,UPDATE') as any_column_write
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
where n.nspname = 'public' and c.relname in (
  'trusted_study_config', 'study_sessions', 'question_attempts', 'question_reinforcement',
  'activity_events', 'daily_activity', 'user_progress', 'user_achievements', 'user_xp_transactions'
)
order by c.relname, roles.role_name;

select * from pg_catalog.pg_policies where schemaname = 'public' and tablename in (
  'trusted_study_config', 'study_sessions', 'question_attempts', 'question_reinforcement',
  'activity_events', 'daily_activity', 'user_progress', 'user_achievements', 'user_xp_transactions'
);
select grantee, table_name, column_name, privilege_type from information_schema.column_privileges
where table_schema = 'public' and table_name in ('trusted_study_config', 'study_sessions', 'question_attempts',
  'question_reinforcement', 'activity_events', 'daily_activity', 'user_progress', 'user_achievements', 'user_xp_transactions');
select pg_get_userbyid(roleid) as role_name, pg_get_userbyid(member) as member_name,
  admin_option, inherit_option, set_option from pg_catalog.pg_auth_members;
select conname, conrelid::regclass::text as table_name, pg_get_constraintdef(oid) as definition
from pg_catalog.pg_constraint where conrelid in ('public.question_attempts'::regclass, 'public.study_sessions'::regclass);

-- Inspect alternate definer writers, views and triggers; a name allowlist alone is not a complete security audit.
select p.oid::regprocedure::text as signature, p.proacl, pg_get_functiondef(p.oid)
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prokind = 'f';
select t.tgrelid::regclass::text as table_name, pg_get_triggerdef(t.oid)
from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgrelid in (
  'public.question_attempts'::regclass, 'public.study_sessions'::regclass, 'public.trusted_study_config'::regclass,
  'public.daily_activity'::regclass, 'public.activity_events'::regclass, 'public.user_progress'::regclass
);
select schemaname, viewname, viewowner, definition from pg_catalog.pg_views where schemaname = 'public';
-- The singleton's existence/enabled state and role-execution/RLS/rollback scenarios require a separate authorized synthetic test.
