-- PREPARATION ONLY. Fail before fixed-table scans on missing/unsupported relations.
\set ON_ERROR_STOP on
\set VERBOSITY verbose
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
WITH RECURSIVE required(name) AS (VALUES
 ('auth.users'),('public.profiles'),('public.user_preferences'),('public.study_sessions'),
 ('public.question_attempts'),('public.activity_events'),('public.daily_activity'),
 ('public.user_progress'),('public.user_achievements'),('public.question_reinforcement'),
 ('public.trusted_study_config')),
 tree(oid) AS (
 SELECT to_regclass(name)::oid FROM required
 UNION SELECT to_regclass('public.user_xp_transactions')::oid
 UNION SELECT i.inhrelid FROM pg_inherits i JOIN tree t ON i.inhparent=t.oid
 )
SELECT current_user='postgres' AND session_user='postgres'
 AND current_database()='postgres' AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999
 AND current_setting('transaction_read_only')='on'
 AND current_setting('transaction_isolation')='read committed'
 AND current_setting('session_replication_role')='origin' AND NOT pg_is_in_recovery()
 AND (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)
 AND NOT EXISTS(SELECT FROM required WHERE to_regclass(name) IS NULL)
 AND NOT EXISTS(SELECT FROM tree t JOIN pg_class c ON c.oid=t.oid WHERE c.relkind NOT IN('r','p'))
 AS n6_scan_ok \gset
\if :n6_scan_ok
SELECT pg_backend_pid(),current_user,session_user,current_database(),version(),
 current_setting('transaction_read_only'),current_setting('transaction_isolation');
ROLLBACK;
\echo N6_RELATION_GUARD_ROLLBACK_COMPLETE
\else
ROLLBACK;
\echo OWNER_SESSION_OR_RELATION_KIND_FAILED_STOP
SELECT 1/0 AS prerequisite_failed_stop;
\endif
