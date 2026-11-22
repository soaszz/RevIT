-- READ-ONLY PRE-INSTALL FINGERPRINT CHECK. Executes no DDL. Safe to run repeatedly.
-- Confirms the exact guards embedded in READ-ONLY-RPCS.PROPOSAL.sql before approval.
select jsonb_build_object(
  'reportingFunctionAbsent',
    to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)') is null,
  'writer11Present',
    to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)') is not null,
  'writer9Absent',
    to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean)') is null,
  'protectFieldsPresent',
    to_regprocedure('public.protect_profile_subscription_fields()') is not null,
  'writerMd5',
    (select md5(prosrc) from pg_catalog.pg_proc
      where oid = to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)')),
  'writerFingerprintMatches',
    (select md5(prosrc) from pg_catalog.pg_proc
      where oid = to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)'))
      = 'bcf56ed8de8564405649685f592fc70f',
  'billingColumns',
    (select count(*) from pg_catalog.pg_attribute where attrelid = 'public.subscription_history'::regclass
      and attname in ('plan_months','amount_php','billing_status') and not attisdropped),
  'historyRlsOn',
    (select relrowsecurity from pg_catalog.pg_class where oid = 'public.subscription_history'::regclass),
  'getMyEntitlementMd5',
    (select md5(prosrc) from pg_catalog.pg_proc where oid = to_regprocedure('public.get_my_entitlement()')),
  'userCreatedIndexAbsent',
    to_regclass('public.subscription_history_user_created_idx') is null,
  'createdIndexAbsent',
    to_regclass('public.subscription_history_created_idx') is null
) as preflight;
