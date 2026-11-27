-- PROPOSAL ONLY. Do not execute during local development or without fresh owner approval.
--
-- Rollback for ACTIVE-PLAN-RECENT-PURCHASES.PROPOSAL.sql. Recreates the approved installed reporting
-- body exactly (md5 7c48e4669969147e110ca4381025b129), removing only the two additive monthly fields
-- ('activePlanBreakdown', 'recentPurchases'). No table, writer, RLS policy, index or historical row
-- is touched.
--
-- Guard: refuses unless the currently installed reporting body is the reviewed add-on build
-- (md5 7000c395c79b1c3b5c9f74c1f5e30f35). If the add-on was never installed, nothing to roll back.

begin;
set local lock_timeout = '1s';
set local statement_timeout = '5s';

do $guard$
begin
  if (select md5(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)'))
       is distinct from '7000c395c79b1c3b5c9f74c1f5e30f35' then
    raise exception 'Installed reporting function is not the approved add-on build; stop';
  end if;
end;
$guard$;

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
        count(*) filter(where event_type in ('renewed','renew') and billing_status in ('paid','admin_confirmed')
          and source='purchased' and amount_php is not null) as renewal_sales,
        count(*) filter(where billing_status in ('paid','admin_confirmed') and source='purchased' and amount_php is not null
          and event_type in ('activated','extended','renewed','activate','extend','renew')) as recorded_purchases,
        sum(amount_php) filter(where billing_status in ('paid','admin_confirmed') and source='purchased' and amount_php is not null
          and event_type in ('activated','extended','renewed','activate','extend','renew')) as recorded_billing,
        count(*) filter(where source in ('gift','prize') and event_type in ('activated','extended','renewed','activate','extend','renew')) as manual
      from public.subscription_history
    ) select jsonb_build_object('asOf',v_now,'summary',jsonb_build_object('asOf',v_now,
      'revenue',null,'paidOrders',null,'recordedBilling',e.recorded_billing,
      'recordedPurchases',e.recorded_purchases,'renewalSales',e.renewal_sales,
      'totalSubscribers',t.total,
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
      select h.*, p.username from public.subscription_history h
      left join public.profiles p on p.id=h.user_id
      where (v_user is null or h.user_id=v_user)
        and (v_event='all' or h.event_type=v_event)
        and (v_from is null or h.created_at>=v_start) and (v_to is null or h.created_at<v_end)
      order by h.created_at desc,h.id desc limit v_limit+1 offset (v_page-1)*v_limit
    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id,'username',username,'eventType',event_type,'source',source,
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
      sum(amount_php) filter(where billing_status in ('paid','admin_confirmed') and source='purchased' and amount_php is not null) as amount,
      count(*) filter(where billing_status in ('paid','admin_confirmed') and source='purchased' and amount_php is not null) as events,
      count(*) filter(where amount_php is null) as unknowns from filtered group by 1
  ), plans as (
    select plan_months,sum(amount_php) as amount,count(*) as events from filtered
      where billing_status in ('paid','admin_confirmed') and source='purchased' and amount_php is not null group by plan_months
  ) select jsonb_build_object('asOf',v_now,
    'months',(select coalesce(jsonb_agg(jsonb_build_object('month',month,'recordedAmount',amount,'recordedEvents',events,'unknownAmounts',unknowns) order by month desc),'[]'::jsonb) from monthly),
    'plans',(select coalesce(jsonb_agg(jsonb_build_object('months',plan_months,'recordedAmount',amount,'recordedEvents',events) order by plan_months nulls last),'[]'::jsonb) from plans),
    'renewals',(select count(*) from filtered where event_type in ('renewed','renew')),
    'renewalSales',(select count(*) from filtered where event_type in ('renewed','renew')
      and billing_status in ('paid','admin_confirmed') and source='purchased' and amount_php is not null),
    'sources',(select coalesce(jsonb_agg(jsonb_build_object('source',src,'recordedAmount',amount,'events',events) order by events desc,src),'[]'::jsonb)
      from (select coalesce(source,'unknown') as src,count(*) as events,
          sum(amount_php) filter(where billing_status in ('paid','admin_confirmed') and source='purchased' and amount_php is not null) as amount
        from filtered group by 1) s)) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_read_subscriptions(text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.admin_read_subscriptions(text,jsonb,integer) to service_role;

notify pgrst, 'reload schema';

commit;
