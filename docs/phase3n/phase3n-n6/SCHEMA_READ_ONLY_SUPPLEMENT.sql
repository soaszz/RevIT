-- PREPARATION ONLY. Complements the unchanged N3 and N5 diagnostic sources.
\set ON_ERROR_STOP on
\set VERBOSITY verbose
\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
\echo N6_TRUSTED_ROUTINE_ATTRIBUTES
SELECT p.oid::regprocedure AS signature,p.prokind,p.prosecdef,p.proleakproof,
 p.provolatile,p.proparallel,pg_get_userbyid(p.proowner) AS owner,
 l.lanname AS language,p.proconfig,p.proacl,
 pg_get_function_identity_arguments(p.oid) AS identity_arguments,
 pg_get_function_result(p.oid) AS result
FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
WHERE p.pronamespace='public'::regnamespace AND p.proname IN
 ('assert_trusted_study_enabled','create_verified_study_session','commit_verified_study_batch')
ORDER BY p.proname,p.oid;
\echo N6_REQUIRED_RELATION_CONSTRAINTS_INDEXES_POLICIES
-- Include inheritance/partition descendants in the trigger/dependency inventory too.
WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY[to_regclass('auth.users'),to_regclass('public.profiles'),
 to_regclass('public.user_preferences'),to_regclass('public.study_sessions'),
 to_regclass('public.question_attempts'),to_regclass('public.activity_events'),
 to_regclass('public.daily_activity'),to_regclass('public.user_progress'),
 to_regclass('public.user_achievements'),to_regclass('public.question_reinforcement'),
 to_regclass('public.trusted_study_config'),to_regclass('public.user_xp_transactions')])::oid
 UNION SELECT edge.child FROM reach r JOIN (
 SELECT conrelid AS child,confrelid AS parent FROM pg_constraint WHERE contype='f'
 UNION SELECT inhrelid,inhparent FROM pg_inherits
 ) edge ON edge.parent=r.oid
)
SELECT t.tgrelid::regclass AS relation,t.tgname,t.tgisinternal,t.tgconstraint,t.tgenabled,
 pg_get_triggerdef(t.oid) AS definition,t.tgfoid::regprocedure AS function,
 pg_get_userbyid(p.proowner) AS function_owner,p.prosecdef,p.proconfig,
 CASE WHEN NOT t.tgisinternal THEN pg_get_functiondef(p.oid) END AS user_function_source
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid IN(SELECT oid FROM reach) ORDER BY t.tgrelid,t.tgname;
WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY[to_regclass('auth.users'),to_regclass('public.profiles'),
 to_regclass('public.user_preferences'),to_regclass('public.study_sessions'),
 to_regclass('public.question_attempts'),to_regclass('public.activity_events'),
 to_regclass('public.daily_activity'),to_regclass('public.user_progress'),
 to_regclass('public.user_achievements'),to_regclass('public.question_reinforcement'),
 to_regclass('public.trusted_study_config'),to_regclass('public.user_xp_transactions')])::oid
 UNION SELECT edge.child FROM reach r JOIN (
 SELECT conrelid AS child,confrelid AS parent FROM pg_constraint WHERE contype='f'
 UNION SELECT inhrelid,inhparent FROM pg_inherits
 ) edge ON edge.parent=r.oid
)
SELECT d.refobjid::regclass AS relation,d.refobjsubid,d.classid::regclass AS object_catalog,
 d.objid,d.objsubid,d.deptype,pg_describe_object(d.classid,d.objid,d.objsubid) AS object
FROM pg_depend d WHERE d.refclassid='pg_class'::regclass AND d.refobjid IN(SELECT oid FROM reach)
ORDER BY d.refobjid,d.classid,d.objid,d.objsubid;
WITH required(oid) AS (
 SELECT unnest(ARRAY[to_regclass('auth.users'),to_regclass('public.profiles'),
 to_regclass('public.user_preferences'),to_regclass('public.study_sessions'),
 to_regclass('public.question_attempts'),to_regclass('public.activity_events'),
 to_regclass('public.daily_activity'),to_regclass('public.user_progress'),
 to_regclass('public.user_achievements'),to_regclass('public.question_reinforcement'),
 to_regclass('public.trusted_study_config'),to_regclass('public.user_xp_transactions')])
)
SELECT c.conrelid::regclass AS relation,c.conname,c.contype,c.convalidated,
 c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.conrelid IN(SELECT oid FROM required)
ORDER BY c.conrelid,c.conname;
SELECT i.indrelid::regclass AS relation,i.indexrelid::regclass AS index,
 i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i WHERE i.indrelid IN('auth.users'::regclass,'public.profiles'::regclass,
 'public.user_preferences'::regclass,'public.study_sessions'::regclass,
 'public.question_attempts'::regclass,'public.activity_events'::regclass,
 'public.daily_activity'::regclass,'public.user_progress'::regclass,
 'public.user_achievements'::regclass,'public.question_reinforcement'::regclass,
 'public.trusted_study_config'::regclass,to_regclass('public.user_xp_transactions'))
ORDER BY i.indrelid,i.indexrelid;
SELECT p.polrelid::regclass AS relation,p.polname,p.polpermissive,p.polroles,p.polcmd,
 pg_get_expr(p.polqual,p.polrelid) AS using_expression,
 pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
FROM pg_policy p WHERE p.polrelid IN('auth.users'::regclass,'public.profiles'::regclass,
 'public.user_preferences'::regclass,'public.study_sessions'::regclass,
 'public.question_attempts'::regclass,'public.activity_events'::regclass,
 'public.daily_activity'::regclass,'public.user_progress'::regclass,
 'public.user_achievements'::regclass,'public.question_reinforcement'::regclass,
 'public.trusted_study_config'::regclass,to_regclass('public.user_xp_transactions'))
ORDER BY p.polrelid,p.polname;
-- N3 already captures column ACLs and the other relevant effective table rights.
SELECT c.oid::regclass AS relation,r.role,
 has_schema_privilege(r.role,c.relnamespace,'USAGE') AS schema_usage,
 has_table_privilege(r.role,c.oid,'SELECT') AS can_select,
 has_table_privilege(r.role,c.oid,'INSERT') AS can_insert,
 has_table_privilege(r.role,c.oid,'UPDATE') AS can_update,
 has_table_privilege(r.role,c.oid,'DELETE') AS can_delete,
 has_any_column_privilege(r.role,c.oid,'INSERT') AS any_column_insert,
 has_any_column_privilege(r.role,c.oid,'UPDATE') AS any_column_update
FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(role)
WHERE c.oid IN('auth.users'::regclass,'public.profiles'::regclass,'public.user_preferences'::regclass)
ORDER BY c.oid,r.role;
\echo N6_EFFECTIVE_COLUMN_PRIVILEGES
SELECT c.oid::regclass AS relation,a.attnum,a.attname,r.role,
 has_column_privilege(r.role,c.oid,a.attnum,'SELECT') AS can_select,
 has_column_privilege(r.role,c.oid,a.attnum,'INSERT') AS can_insert,
 has_column_privilege(r.role,c.oid,a.attnum,'UPDATE') AS can_update,
 has_column_privilege(r.role,c.oid,a.attnum,'REFERENCES') AS can_reference
FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(role)
WHERE a.attnum>0 AND NOT a.attisdropped AND c.oid IN
 ('auth.users'::regclass,'public.profiles'::regclass,'public.user_preferences'::regclass,
 'public.study_sessions'::regclass,'public.question_attempts'::regclass,
 'public.activity_events'::regclass,'public.daily_activity'::regclass,'public.user_progress'::regclass,
 'public.user_achievements'::regclass,'public.question_reinforcement'::regclass,
 'public.trusted_study_config'::regclass,to_regclass('public.user_xp_transactions'))
ORDER BY c.oid,a.attnum,r.role;
\echo N6_OPTIONAL_XP_COUNT
-- Reject foreign tables and foreign/incompatible inheritance descendants before \gexec.
WITH RECURSIVE tree(oid) AS (
 SELECT to_regclass('public.user_xp_transactions')::oid
 UNION SELECT i.inhrelid FROM pg_inherits i JOIN tree t ON i.inhparent=t.oid
)
SELECT NOT EXISTS(SELECT FROM tree t JOIN pg_class c ON c.oid=t.oid
 WHERE c.relkind NOT IN('r','p')) AS n6_xp_local \gset
\if :n6_xp_local
SELECT format('SELECT %L AS relation,count(*) AS row_count FROM %I.%I;',
 n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.oid=to_regclass('public.user_xp_transactions') \gexec
\else
ROLLBACK;
\echo UNSUPPORTED_XP_RELATION_STOP
SELECT 1/0 AS prerequisite_failed_stop;
\endif
ROLLBACK;
\echo N6_SCHEMA_SUPPLEMENT_ROLLBACK_COMPLETE
