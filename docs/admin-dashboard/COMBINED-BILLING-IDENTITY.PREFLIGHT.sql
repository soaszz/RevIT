-- READ-ONLY PREFLIGHT for docs/admin-dashboard/COMBINED-BILLING-IDENTITY.PROPOSAL.sql
-- Run with a read-only role. Contains no DDL/DML. Prints aggregates only, never subscriber data.
select jsonb_pretty(jsonb_build_object(
  'writer_11arg_present', to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)') is not null,
  'writer_12arg_absent', to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean,numeric)') is null,
  'writer_md5', (select md5(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)')),
  'writer_expected_md5', 'bcf56ed8de8564405649685f592fc70f',
  'writer_overload_count', (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_apply_subscription_change'),
  'reporting_overload_count', (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_read_subscriptions'),
  'reporting_present', to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)') is not null,
  'reporting_md5', (select md5(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'reporting_expected_md5', 'db9d92384058ecd509b46214b80f403f',
  'reporting_security_definer', (select prosecdef from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'reporting_volatility', (select provolatile from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'reporting_config', (select proconfig from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'reporting_acl', (select proacl::text from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)')),
  'writer_config', (select proconfig from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)')),
  'writer_acl', (select proacl::text from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)')),
  'amount_php_type', (select data_type from information_schema.columns where table_schema='public' and table_name='subscription_history' and column_name='amount_php'),
  'amount_php_precision', (select numeric_precision from information_schema.columns where table_schema='public' and table_name='subscription_history' and column_name='amount_php'),
  'amount_php_scale', (select numeric_scale from information_schema.columns where table_schema='public' and table_name='subscription_history' and column_name='amount_php'),
  'billing_constraints', (
    select jsonb_agg(jsonb_build_object('name',conname,'def',pg_get_constraintdef(c.oid)) order by conname)
    from pg_catalog.pg_constraint c
    where c.conrelid='public.subscription_history'::regclass
      and c.conname in ('subscription_history_billing_status_check','subscription_history_billing_snapshot_check','subscription_history_amount_php_check','subscription_history_plan_months_check')
  ),
  'history_rls', (select relrowsecurity from pg_catalog.pg_class where oid='public.subscription_history'::regclass),
  'profiles_username_present', exists (select 1 from pg_catalog.pg_attribute where attrelid='public.profiles'::regclass and attname='username' and not attisdropped),
  'history_indexes', (select jsonb_agg(indexname order by indexname) from pg_indexes where schemaname='public' and tablename='subscription_history'),
  'history_rows', (select count(*) from public.subscription_history),
  'profile_rows', (select count(*) from public.profiles),
  'non_null_amounts', (select count(*) from public.subscription_history where amount_php is not null),
  'admin_confirmed_rows', (select count(*) from public.subscription_history where billing_status='admin_confirmed'),
  'fractional_amounts', (select count(*) from public.subscription_history where amount_php is not null and amount_php <> trunc(amount_php)),
  'routines_referencing_writer', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text),'[]'::jsonb)
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema')
      and p.proname <> 'admin_apply_subscription_change'
      and p.prosrc ilike '%admin_apply_subscription_change%'
  ),
  'views_referencing_writer', (
    select coalesce(jsonb_agg(viewname),'[]'::jsonb) from pg_views where definition ilike '%admin_apply_subscription_change%'
  )
)) as preflight;
