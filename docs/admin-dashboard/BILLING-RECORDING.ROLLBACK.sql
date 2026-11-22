-- ROLLBACK PROPOSAL ONLY. Do not execute without owner approval.
-- Reverses docs/admin-dashboard/BILLING-RECORDING.PROPOSAL.sql in one transaction.
--
-- Safety: refuses to run when any admin-confirmed row or any fractional amount exists, because
-- reverting the column type or the check constraints would otherwise discard recorded evidence.
-- Rollback never deletes subscription_history rows and never issues a refund.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '5s';

do $guard$
begin
  if to_regprocedure('public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean,numeric)') is null then
    raise exception 'Billing writer is not installed; nothing to roll back';
  end if;
  if exists (select 1 from public.subscription_history where billing_status='admin_confirmed') then
    raise exception 'Admin-confirmed history exists; resolve recorded billing before rollback';
  end if;
  if exists (select 1 from public.subscription_history where amount_php is not null and amount_php <> trunc(amount_php)) then
    raise exception 'Fractional recorded amounts exist; resolve recorded billing before rollback';
  end if;
  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='subscription_history' and column_name='amount_php') is distinct from 'numeric' then
    raise exception 'Unexpected amount_php type; stop';
  end if;
end;
$guard$;

alter table public.subscription_history
  drop constraint subscription_history_billing_snapshot_check;
alter table public.subscription_history
  add constraint subscription_history_billing_snapshot_check check (
    billing_status is null
    or (billing_status='paid' and source='purchased' and plan_months is not null and amount_php is not null and amount_php > 0)
    or (billing_status='complimentary' and source in ('gift','prize') and amount_php is not null and amount_php = 0)
    or (billing_status='unknown' and amount_php is null)
  );

alter table public.subscription_history
  drop constraint subscription_history_billing_status_check;
alter table public.subscription_history
  add constraint subscription_history_billing_status_check
  check (billing_status in ('paid','complimentary','unknown'));

alter table public.subscription_history
  alter column amount_php type integer using amount_php::integer;

drop function public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean,numeric);
create function public.admin_apply_subscription_change(
  p_user_id uuid,
  p_action text,
  p_source text default 'purchased',
  p_duration_days integer default 30,
  p_custom_expires_at timestamptz default null,
  p_admin_id uuid default null,
  p_custom_message text default null,
  p_expected_expires_at timestamptz default null,
  p_allow_shorten boolean default false,
  p_plan_months integer default null,
  p_payment_verified boolean default false
)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public
as $function$
declare
  v_old_profile public.profiles%rowtype;
  v_now timestamptz := now();
  v_prev_plan text;
  v_prev_expires timestamptz;
  v_new_plan text;
  v_new_started timestamptz;
  v_new_expires timestamptz;
  v_event_type text;
  v_computed_days integer := p_duration_days;
  v_is_active_pro boolean;
  v_plan_months integer;
  v_amount_php integer;
  v_billing_status text := 'unknown';
begin
  if p_plan_months is not null and p_plan_months not in (1, 3, 6) then
    raise exception 'Invalid selected plan duration.' using errcode = '22023';
  end if;
  if p_plan_months is not null and (p_action not in ('activate', 'extend', 'renew') or p_source is null or p_source not in ('purchased', 'gift', 'prize')) then
    raise exception 'Selected plan requires a grant action and explicit source.' using errcode = '22023';
  end if;
  if coalesce(p_payment_verified, false) and (p_source is distinct from 'purchased' or p_plan_months is null or p_action not in ('activate', 'extend', 'renew')) then
    raise exception 'Verified payment requires a purchased preset grant.' using errcode = '22023';
  end if;
  if p_action in ('activate', 'extend', 'renew') then
    v_plan_months := p_plan_months;
    if p_source in ('gift', 'prize') then
      v_billing_status := 'complimentary';
      v_amount_php := 0;
    elsif p_source = 'purchased' and coalesce(p_payment_verified, false) then
      v_billing_status := 'paid';
      v_amount_php := case p_plan_months
        when 1 then 79
        when 3 then 219
        when 6 then 399
      end;
    end if;
  end if;

  select * into v_old_profile
  from public.profiles
  where id = p_user_id
  for update;

  if v_old_profile.id is null then
    raise exception 'Target user profile not found.' using errcode = 'P0002';
  end if;

  v_prev_plan := coalesce(v_old_profile.plan, 'free');
  v_prev_expires := v_old_profile.pro_expires_at;
  v_is_active_pro := (v_prev_plan = 'pro' and v_prev_expires is not null and v_prev_expires > v_now);

  if p_expected_expires_at is not null and v_prev_expires is distinct from p_expected_expires_at then
    raise exception 'CONFLICT_STALE_STATE: Subscription was modified by another administrator session. Please refresh and review latest status.' using errcode = '40001';
  end if;

  if p_action = 'activate' and v_is_active_pro then
    raise exception 'CONFLICT_ACTIVE_PRO: User already has active RevIT Pro. Choose Extend or Replace Expiration.' using errcode = '22000';
  end if;

  if p_action = 'revoke' then
    if v_prev_plan = 'free' and (v_prev_expires is null or v_prev_expires <= v_now) then
      raise exception 'NO_CHANGE: User is already on the Free plan.' using errcode = '22000';
    end if;

    v_new_plan := 'free';
    v_new_started := v_old_profile.pro_started_at;
    v_new_expires := v_now;
    v_event_type := 'revoked';

    update public.pro_activation_notifications
    set acknowledged_at = v_now
    where user_id = p_user_id and acknowledged_at is null;

  elsif p_action in ('activate', 'extend', 'modify_expiration', 'renew') then
    v_new_plan := 'pro';

    if p_action = 'activate' then
      if v_prev_plan = 'pro' and v_prev_expires is not null and v_prev_expires <= v_now then
        v_event_type := 'renewed';
      else
        v_event_type := 'activated';
      end if;
    elsif p_action = 'extend' then
      v_event_type := 'extended';
    elsif p_action = 'modify_expiration' then
      v_event_type := 'expiration_modified';
    elsif p_action = 'renew' then
      v_event_type := 'renewed';
    else
      v_event_type := 'activated';
    end if;

    if p_custom_expires_at is not null then
      v_new_expires := p_custom_expires_at;
      v_new_started := coalesce(v_old_profile.pro_started_at, v_now);
      v_computed_days := greatest(1, ceil(extract(epoch from (v_new_expires - v_now)) / 86400)::integer);
    elsif p_action = 'extend' and v_is_active_pro then
      v_new_expires := v_prev_expires + (coalesce(p_duration_days, 30) || ' days')::interval;
      v_new_started := coalesce(v_old_profile.pro_started_at, v_now);
    else
      v_new_started := v_now;
      v_new_expires := v_now + (coalesce(p_duration_days, 30) || ' days')::interval;
    end if;

    if v_new_expires <= v_now then
      raise exception 'INVALID_EXPIRATION: Target expiration date must be in the future.' using errcode = '22000';
    end if;

    if v_is_active_pro and v_new_expires < v_prev_expires and not p_allow_shorten then
      raise exception 'WARNING_SHORTEN_ACCESS: Target expiration is earlier than current expiration. User will lose remaining access.' using errcode = '22000';
    end if;

    if v_prev_plan = 'pro' and v_prev_expires is not null and abs(extract(epoch from (v_new_expires - v_prev_expires))) < 60 then
      raise exception 'NO_CHANGE: Target expiration date matches current expiration. No changes applied.' using errcode = '22000';
    end if;

  else
    raise exception 'Invalid subscription action: %', p_action using errcode = '22023';
  end if;

  update public.profiles
  set
    plan = v_new_plan,
    pro_started_at = v_new_started,
    pro_expires_at = v_new_expires,
    updated_at = v_now
  where id = p_user_id;

  insert into public.subscription_history (
    user_id,
    event_type,
    source,
    previous_plan,
    new_plan,
    previous_expires_at,
    new_expires_at,
    admin_id,
    custom_message,
    created_at,
    plan_months,
    amount_php,
    billing_status
  ) values (
    p_user_id,
    v_event_type,
    coalesce(p_source, 'purchased'),
    v_prev_plan,
    v_new_plan,
    v_prev_expires,
    v_new_expires,
    p_admin_id,
    nullif(trim(p_custom_message), ''),
    v_now,
    v_plan_months,
    v_amount_php,
    v_billing_status
  );

  if v_new_plan = 'pro' and p_action <> 'revoke' then
    update public.pro_activation_notifications
    set acknowledged_at = v_now
    where user_id = p_user_id and acknowledged_at is null;

    insert into public.pro_activation_notifications (
      user_id,
      source,
      plan,
      duration_days,
      pro_expires_at,
      custom_message,
      created_at
    ) values (
      p_user_id,
      coalesce(p_source, 'purchased'),
      'pro',
      v_computed_days,
      v_new_expires,
      nullif(trim(p_custom_message), ''),
      v_now
    );
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'action', p_action,
    'event_type', v_event_type,
    'plan', v_new_plan,
    'pro_started_at', v_new_started,
    'pro_expires_at', v_new_expires,
    'source', p_source,
    'previous_expires_at', v_prev_expires
  );
end;
$function$;
revoke all on function public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean) from public, anon, authenticated, service_role;
grant execute on function public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean) to service_role;

-- Restore the installed billing-agnostic reporting definition exactly.
create or replace function public.admin_read_subscriptions(p_mode text, p_filters jsonb default '{}'::jsonb, p_limit integer default 25)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, pg_temp
set statement_timeout = '5s'
set lock_timeout = '1s'
as $function$
declare
  v_now timestamptz := now();
  v_page integer := coalesce((p_filters->>'page')::integer, 1);
  v_days integer := coalesce((p_filters->>'days')::integer, 7);
  v_limit integer := coalesce(p_limit,25);
  v_q text := coalesce(p_filters->>'q','');
  v_status text := coalesce(p_filters->>'status','all');
  v_months text := coalesce(p_filters->>'months','all');
  v_source text := coalesce(p_filters->>'source','all');
  v_event text := coalesce(p_filters->>'event','all');
  v_user uuid := nullif(p_filters->>'userId','')::uuid;
  v_from date := nullif(p_filters->>'from','')::date;
  v_to date := nullif(p_filters->>'to','')::date;
  v_exp_from date := nullif(p_filters->>'expiresFrom','')::date;
  v_exp_to date := nullif(p_filters->>'expiresTo','')::date;
  v_start timestamptz;
  v_end timestamptz;
  v_rows jsonb;
  v_result jsonb;
begin
  if p_mode not in ('summary','subscribers','detail','monthly','transactions') or p_mode is null
     or v_limit not in (25,50,250) or v_page not between 1 and 400 or v_days not between 1 and 30
     or length(v_q)>80 or (length(v_q)>0 and length(v_q)<2)
     or v_status not in ('all','active','expiring','expired','former','free','review')
     or v_months not in ('all','1','3','6','unknown')
     or v_event not in ('all','activated','extended','renewed','revoked','expired','expiration_modified')
     or v_source not in ('all','purchased','manual','unknown') then
    raise exception 'Invalid reporting filters' using errcode='22023';
  end if;
  if (v_from is null) <> (v_to is null) or (v_from is not null and (v_to<v_from or v_to-v_from>731))
     or (v_exp_from is not null and v_exp_to is not null and (v_exp_to<v_exp_from or v_exp_to-v_exp_from>731)) then
    raise exception 'Invalid date range' using errcode='22023';
  end if;
  v_start := coalesce(v_from::timestamp, date_trunc('month',v_now at time zone 'Asia/Manila') - interval '11 months') at time zone 'Asia/Manila';
  v_end := coalesce((v_to+1)::timestamp, date_trunc('month',v_now at time zone 'Asia/Manila')+interval '1 month') at time zone 'Asia/Manila';

  if p_mode='summary' then
    -- Counts derive from ONE CASE that also drives the subscribers directory, so summary and
    -- directory definitions agree and no total is double-counted. No extra scan, no per-user call.
    with last_event as (
      select distinct on (user_id) user_id,event_type,new_expires_at from public.subscription_history order by user_id,created_at desc,id desc
    ), base as (
      select p.plan,p.pro_expires_at,
        (p.plan='pro' and p.pro_expires_at>v_now) as effective_pro,
        coalesce(h.new_expires_at>v_now,false) as recorded_active,
        case when p.plan='pro' and p.pro_expires_at>v_now then 'active'
          when p.pro_expires_at<=v_now and (p.plan='pro' or h.event_type='expired') then 'expired'
          when h.user_id is not null or p.pro_started_at is not null or p.pro_expires_at is not null then 'former'
          else 'free' end as status
      from public.profiles p left join last_event h on h.user_id=p.id
    ), totals as (
      select count(*) as total,
        count(*) filter(where status='active') as active,
        count(*) filter(where status='active' and pro_expires_at<=v_now+make_interval(days=>v_days)) as expiring,
        count(*) filter(where status='expired') as expired,
        count(*) filter(where status='former') as former,
        count(*) filter(where effective_pro and recorded_active) as active_consistent,
        count(*) filter(where not effective_pro and not recorded_active and plan<>'pro') as free_consistent,
        count(*) filter(where not effective_pro and recorded_active) as access_issue,
        count(*) filter(where effective_pro and not recorded_active) as active_no_record,
        count(*) filter(where plan='pro' and pro_expires_at is null) as missing_expiry,
        count(*) filter(where plan='pro' and pro_expires_at is not null and pro_expires_at<=v_now) as stale_label
      from base
    ), events as (
      select count(*) filter(where event_type in ('renewed','renew')) as renewals,
        sum(amount_php) filter(where billing_status='paid' and source='purchased' and amount_php>0
          and event_type in ('activated','extended','renewed','activate','extend','renew')) as recorded_billing,
        count(*) filter(where source in ('gift','prize') and event_type in ('activated','extended','renewed','activate','extend','renew')) as manual
      from public.subscription_history
    ) select jsonb_build_object('asOf',v_now,'summary',jsonb_build_object('asOf',v_now,
      'revenue',null,'paidOrders',null,'recordedBilling',e.recorded_billing,'totalSubscribers',t.total,
      'activePro',t.active,'expiringSoon',t.expiring,'expired',t.expired,'formerPro',t.former,
      'renewals',e.renewals,'manualGrants',e.manual,
      'consistency',jsonb_build_object(
        'activeConsistent',t.active_consistent,'freeConsistent',t.free_consistent,
        'staleProLabel',t.stale_label,'missingExpiryPro',t.missing_expiry,
        'potentialAccessIssue',t.access_issue,'activeNoRecord',t.active_no_record,
        'reviewNeeded',t.stale_label+t.missing_expiry+t.access_issue+t.active_no_record,
        'confirmedMismatch',0,'verified',false)))
      into v_result from totals t cross join events e;
    return v_result;
  end if;

  if p_mode='subscribers' then
    with eligible as (
      select p.id,p.username,p.plan,p.pro_started_at,p.pro_expires_at,p.created_at,
        g.plan_months,g.amount_php,g.billing_status,g.source,l.new_expires_at as recorded_expires_at,
        (l.id is not null or p.pro_started_at is not null or p.pro_expires_at is not null) as had_pro,
        (p.plan='pro' and p.pro_expires_at>v_now) as effective_pro,
        case when p.plan='pro' and p.pro_expires_at>v_now then 'active'
          when p.pro_expires_at<=v_now and (p.plan='pro' or l.event_type='expired') then 'expired'
          when l.id is not null or p.pro_started_at is not null or p.pro_expires_at is not null then 'former' else 'free' end as status,
        case when (p.plan='pro' and p.pro_expires_at>v_now) and coalesce(l.new_expires_at>v_now,false) then 'active_consistent'
          when not (p.plan='pro' and p.pro_expires_at>v_now) and coalesce(l.new_expires_at>v_now,false) then 'access_issue'
          when (p.plan='pro' and p.pro_expires_at>v_now) and not coalesce(l.new_expires_at>v_now,false) then 'active_no_record'
          when p.plan='pro' and p.pro_expires_at is null then 'missing_expiry'
          when p.plan='pro' and p.pro_expires_at is not null and p.pro_expires_at<=v_now then 'stale_label'
          else 'free_consistent' end as review
      from public.profiles p
      left join lateral (select h.id,h.event_type,h.new_expires_at from public.subscription_history h where h.user_id=p.id order by h.created_at desc,h.id desc limit 1) l on true
      left join lateral (select h.plan_months,h.amount_php,h.billing_status,h.source from public.subscription_history h
        where h.user_id=p.id and h.event_type in ('activated','extended','renewed','activate','extend','renew')
        order by h.created_at desc,h.id desc limit 1) g on true
      where (v_q='' or strpos(lower(coalesce(p.username,'')),lower(v_q))>0)
        and (v_exp_from is null or p.pro_expires_at>=v_exp_from::timestamp at time zone 'Asia/Manila')
        and (v_exp_to is null or p.pro_expires_at<(v_exp_to+1)::timestamp at time zone 'Asia/Manila')
    ), selected as (
      select * from eligible e where
        (v_status='all' or e.status=v_status or (v_status='former' and e.plan<>'pro' and e.had_pro)
          or (v_status='expiring' and e.status='active' and e.pro_expires_at<=v_now+make_interval(days=>v_days))
          or (v_status='review' and e.review not in ('active_consistent','free_consistent')))
        and (v_months='all' or (v_months='unknown' and e.plan_months is null) or e.plan_months::text=v_months)
        and (v_source='all' or e.source=v_source or (v_source='manual' and e.source in ('gift','prize')) or (v_source='unknown' and (e.source is null or e.source='unknown')))
      order by e.created_at desc,e.id desc limit v_limit+1 offset (v_page-1)*v_limit
    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'plan',plan,'proStartedAt',pro_started_at,
      'proExpiresAt',pro_expires_at,'recordedExpiresAt',recorded_expires_at,'status',status,'planMonths',plan_months,
      'amountPhp',amount_php,'billingStatus',billing_status,'source',source,
      'consistency',case when review in ('active_consistent','free_consistent') then null else review end)
      order by created_at desc,id desc),'[]'::jsonb) into v_rows from selected;
    return jsonb_build_object('asOf',v_now,'hasMore',jsonb_array_length(v_rows)>v_limit,
      'subscribers',(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality where ordinality<=v_limit));
  end if;

  if p_mode in ('detail','transactions') then
    if p_mode='detail' and v_user is null then raise exception 'Subscriber required' using errcode='22023'; end if;
    with selected as (
      select h.* from public.subscription_history h
      where (v_user is null or h.user_id=v_user)
        and (v_event='all' or h.event_type=v_event)
        and (v_from is null or h.created_at>=v_start) and (v_to is null or h.created_at<v_end)
      order by h.created_at desc,h.id desc limit v_limit+1 offset (v_page-1)*v_limit
    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id,'eventType',event_type,'source',source,
      'createdAt',created_at,'previousExpiresAt',previous_expires_at,'newExpiresAt',new_expires_at,'planMonths',plan_months,
      'amountPhp',amount_php,'billingStatus',billing_status) order by created_at desc,id desc),'[]'::jsonb) into v_rows from selected;
    return jsonb_build_object('asOf',v_now,'hasMore',jsonb_array_length(v_rows)>v_limit,
      'history',(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from jsonb_array_elements(v_rows) with ordinality where ordinality<=v_limit));
  end if;

  -- Only requested by the monthly view/export. Financial totals stay Unknown.
  with filtered as (
    select created_at,plan_months,amount_php,billing_status,source,event_type from public.subscription_history
      where created_at>=v_start and created_at<v_end
        and event_type in ('activated','extended','renewed','activate','extend','renew')
  ), monthly as (
    select to_char(created_at at time zone 'Asia/Manila','YYYY-MM') as month,
      sum(amount_php) filter(where billing_status='paid' and source='purchased' and amount_php>0) as amount,
      count(*) filter(where billing_status='paid' and source='purchased' and amount_php>0) as events,
      count(*) filter(where amount_php is null) as unknowns from filtered group by 1
  ), plans as (
    select plan_months,sum(amount_php) as amount,count(*) as events from filtered
      where billing_status='paid' and source='purchased' and amount_php>0 group by plan_months
  ) select jsonb_build_object('asOf',v_now,
    'months',(select coalesce(jsonb_agg(jsonb_build_object('month',month,'recordedAmount',amount,'recordedEvents',events,'unknownAmounts',unknowns) order by month desc),'[]'::jsonb) from monthly),
    'plans',(select coalesce(jsonb_agg(jsonb_build_object('months',plan_months,'recordedAmount',amount,'recordedEvents',events) order by plan_months nulls last),'[]'::jsonb) from plans),
    'renewals',(select count(*) from filtered where event_type in ('renewed','renew')),
    'sources',(select coalesce(jsonb_agg(jsonb_build_object('source',src,'recordedAmount',amount,'events',events) order by events desc,src),'[]'::jsonb)
      from (select coalesce(source,'unknown') as src,count(*) as events,
          sum(amount_php) filter(where billing_status='paid' and source='purchased' and amount_php>0) as amount
        from filtered group by 1) s)) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_read_subscriptions(text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.admin_read_subscriptions(text,jsonb,integer) to service_role;

commit;
