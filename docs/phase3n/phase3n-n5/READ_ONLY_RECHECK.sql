-- PREPARATION ONLY: separate explicit authorization required. Never run from N5.
-- Connect only after private comparison to the approved staging dashboard Session Pooler.
-- No DDL/DML, fixtures, application RPCs, advisory locks or credential values.
\set ON_ERROR_STOP on
\set VERBOSITY verbose
\pset pager off
\echo N5_READ_ONLY_RECHECK_BEGIN
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
SELECT current_user='postgres' AND session_user='postgres'
 AND (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS n5_owner_ok \gset
\if :n5_owner_ok
\else
ROLLBACK;
\echo OWNER_BOUNDARY_NOT_ESTABLISHED_STOP
SELECT 1/0 AS prerequisite_failed_stop;
\endif
\echo ACTUAL_SETTINGS_AND_SOURCES
SELECT pg_backend_pid(),current_user,session_user,current_database(),version(),
 current_setting('transaction_read_only'),current_setting('transaction_isolation'),
 current_setting('session_replication_role'),pg_is_in_recovery();
-- source reveals the effective setting origin, not the client's startup packet contents.
SELECT name,setting,reset_val,source,context,pending_restart FROM pg_settings
WHERE name IN('default_transaction_read_only','transaction_read_only','application_name',
 'default_transaction_isolation','statement_timeout','lock_timeout','idle_in_transaction_session_timeout')
ORDER BY name;
SELECT pg_has_role(session_user,'service_role','SET') AS can_set_service,
 pg_has_role(current_user,'pg_read_all_stats','USAGE') AS can_read_stats,
 has_language_privilege('service_role','plpgsql','USAGE') AS service_plpgsql_usage;
SELECT rolname,rolsuper,rolinherit,rolcanlogin,rolbypassrls FROM pg_roles
WHERE rolname IN(current_user,session_user,'anon','authenticated','service_role','pg_read_all_stats')
ORDER BY rolname;
SELECT pg_get_userbyid(roleid) AS granted_role,pg_get_userbyid(member) AS member,
 pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option
FROM pg_auth_members ORDER BY roleid,member,grantor;

\echo RECURSIVE_INCOMING_FOREIGN_KEYS
-- UNION (not UNION ALL) terminates cycles; includes cross-schema/grandchild edges.
WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,
 'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
)
SELECT c.oid,c.conname,c.conrelid::regclass AS child,c.confrelid::regclass AS parent,
 c.conkey,c.confkey,c.confdeltype,c.confupdtype,c.condeferrable,c.condeferred,c.convalidated,
 (c.confrelid IN(SELECT oid FROM reach)) AS incoming_delete_path,
 pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.contype='f'
 AND (c.confrelid IN(SELECT oid FROM reach) OR c.conrelid IN(SELECT oid FROM reach))
ORDER BY c.conrelid::regclass::text,c.conname;

\echo REACHABLE_RELATIONS_AND_COUNT_READINESS
WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,
 'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
)
SELECT c.oid::regclass AS relation,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
 pg_get_userbyid(c.relowner) AS owner,has_table_privilege(current_user,c.oid,'SELECT') AS can_count,
 (c.relkind IN('r','p') AND NOT EXISTS(SELECT FROM pg_inherits i JOIN pg_class sub ON sub.oid=i.inhrelid
 WHERE i.inhparent=c.oid AND sub.relkind NOT IN('r','p'))) AS ordinary_local_table
FROM reach r JOIN pg_class c ON c.oid=r.oid ORDER BY c.oid::regclass::text;

\echo REACHABLE_COUNTS_ONLY_NO_AUTH_ROW_DUMPS
-- Generated commands are only identifier-quoted SELECT COUNT. No function/foreign-table execution.
-- Reject any unsupported relkind/descendant before counts; inspect the readiness section regardless.
WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,
 'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
), inherit_tree(oid) AS (
 SELECT oid FROM reach UNION SELECT i.inhrelid FROM pg_inherits i JOIN inherit_tree t ON t.oid=i.inhparent
)
SELECT NOT EXISTS(SELECT FROM inherit_tree t JOIN pg_class c ON c.oid=t.oid WHERE c.relkind NOT IN('r','p'))
 AS n5_local_tables_only \gset
\if :n5_local_tables_only
WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,
 'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
)
SELECT format('SELECT %L AS relation, count(*) AS row_count FROM %I.%I;',n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM reach r JOIN pg_class c ON c.oid=r.oid JOIN pg_namespace n ON n.oid=c.relnamespace
ORDER BY n.nspname,c.relname \gexec
\else
\echo UNSUPPORTED_RELATION_KIND_STOP_NO_COUNTS
ROLLBACK;
SELECT 1/0 AS prerequisite_failed_stop;
\endif

\echo REACHABLE_NONINTERNAL_TRIGGERS_AND_OWNER_SOURCE
WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,
 'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
)
SELECT t.tgrelid::regclass AS relation,t.tgname,t.tgenabled,p.oid::regprocedure AS function,
 pg_get_userbyid(p.proowner) AS function_owner,p.prosecdef,p.proconfig,
 pg_get_triggerdef(t.oid) AS trigger_definition,pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal AND t.tgrelid IN(SELECT oid FROM reach) ORDER BY t.tgrelid,t.tgname;
-- Existing DDL event triggers could affect later temporary harness creation; catalog only.
SELECT e.evtname,e.evtevent,e.evtenabled,e.evttags,pg_get_userbyid(e.evtowner) AS owner,
 pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid=e.evtfoid)) AS function_owner,
 e.evtfoid::regprocedure AS function,pg_get_functiondef(e.evtfoid) AS definition
FROM pg_event_trigger e ORDER BY e.evtname;
\echo AUTH_PROGRESS_HELPER_PRESENCE
SELECT to_regprocedure('public.handle_new_user_progress()') AS separate_helper,
 to_regclass('auth.scim_users') AS scim_table;
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT id,enabled,updated_at FROM public.trusted_study_config ORDER BY id;
SELECT * FROM pg_prepared_xacts;
ROLLBACK;
\echo N5_READ_ONLY_RECHECK_ROLLBACK_COMPLETE
-- Even exit 0 is not approval: review graph completeness, all empty counts and source first.
