\set ON_ERROR_STOP on
\set VERBOSITY verbose
\pset pager off
begin read only;
set local statement_timeout='20s';
set local lock_timeout='3s';
set local search_path=pg_catalog,public;
set local TimeZone='UTC';
set local DateStyle='ISO,YMD';
select jsonb_build_object(
 'database',current_database(),'server_version',current_setting('server_version'),
 'current_user',current_user,'session_user',session_user,'read_only',current_setting('transaction_read_only'),
 'isolation',current_setting('transaction_isolation'),
 'registry',(select jsonb_agg(to_jsonb(m) order by version) from supabase_migrations.schema_migrations m),
 'config',(select jsonb_agg(to_jsonb(c) order by id) from public.trusted_study_config c),
 'prepared',(select count(*) from pg_prepared_xacts),
 'routines',(select jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,
   'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,'source',p.prosrc,
   'leakproof',p.proleakproof,'kind',p.prokind,'volatility',p.provolatile,'parallel',p.proparallel,
   'acl_null',p.proacl is null,'acl',array(select a::text from unnest(p.proacl) a order by a::text),
   'anon',has_function_privilege('anon',p.oid,'execute'),
   'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
   'service',has_function_privilege('service_role',p.oid,'execute')) order by p.oid)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
   'assert_trusted_study_enabled','create_verified_study_session','commit_verified_study_batch',
   '_trusted_study_metrics','_apply_trusted_study_effects','create_rewarded_study_session','commit_rewarded_study_batch','complete_verified_study_session',
   'record_question_attempt','record_study_activity','check_and_unlock_achievements','record_progression_award')),
 'memberships',(select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m)
) as o_snapshot;
rollback;
\echo O_SNAPSHOT_ROLLBACK_COMPLETE
