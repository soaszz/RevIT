-- READ-ONLY POST-INSTALL VERIFICATION. Executes no DDL. Run after the RPC is created.
-- Confirms catalog, ACL and index state; asserts service-role-only execution.
select jsonb_build_object(
  'functionExists',
    to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)') is not null,
  'securityInvoker',
    (select not prosecdef from pg_catalog.pg_proc where oid = to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'volatile',
    (select provolatile from pg_catalog.pg_proc where oid = to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'searchPathConfig',
    (select proconfig from pg_catalog.pg_proc where oid = to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'acl',
    (select proacl::text from pg_catalog.pg_proc where oid = to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'serviceRoleExecute',
    has_function_privilege('service_role','public.admin_read_subscriptions(text,jsonb,integer)','execute'),
  'anonExecute',
    has_function_privilege('anon','public.admin_read_subscriptions(text,jsonb,integer)','execute'),
  'authenticatedExecute',
    has_function_privilege('authenticated','public.admin_read_subscriptions(text,jsonb,integer)','execute'),
  'publicHasExecute',
    exists (select 1 from aclexplode((select proacl from pg_catalog.pg_proc where oid = to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)'))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'userCreatedIndexValid',
    (select bool_and(indisvalid and indisready) from pg_catalog.pg_index
      where indexrelid = to_regclass('public.subscription_history_user_created_idx')),
  'writerMd5Unchanged',
    (select md5(prosrc) from pg_catalog.pg_proc
      where oid = to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)')),
  'historyRlsUnchanged',
    (select relrowsecurity from pg_catalog.pg_class where oid = 'public.subscription_history'::regclass)
) as verification;
