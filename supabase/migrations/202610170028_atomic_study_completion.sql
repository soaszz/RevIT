-- Phase 3O. Dormant wrappers around Migration 27; no activation or legacy revocation.
begin;

do $$ begin
  if current_user <> 'postgres' or (select count(*) from public.trusted_study_config) <> 1
    or not exists (select 1 from public.trusted_study_config where id = 1 and not enabled)
    or to_regprocedure('public.commit_verified_study_batch(uuid,uuid,jsonb)') is null then
    raise exception 'Disabled Migration 27 foundation required.';
  end if;
end $$;

-- NULL means historical/unissued reward contract. Never retro-certify an older session.
alter table public.study_sessions
  add column completion_contract smallint check (completion_contract = 1),
  add column completion_receipt jsonb;
alter table public.activity_events
  add column trusted_effect_version smallint check (trusted_effect_version = 1),
  add column trusted_session_id uuid,
  add column trusted_attempt_id uuid;

create function public._trusted_study_metrics(p_owner uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, pg_temp as $$
  with days as (
    select activity_date, activity_date - row_number() over(order by activity_date)::integer as grp
    from public.daily_activity where user_id = p_owner and (questions_answered > 0 or review_count > 0)
  ), streaks as (select count(*) as n from days group by grp)
  select jsonb_build_object(
    'questions_answered', coalesce((select sum(questions_answered) from public.daily_activity where user_id = p_owner), 0),
    'streak_days', coalesce((select max(n) from streaks), 0),
    'study_sessions', (select count(*) from public.activity_events where user_id = p_owner
      and event_key like 'study-session:%' and event_type = 'study_session_completed'));
$$;

create function public.create_rewarded_study_session(p_owner uuid, p_request_id uuid, p_plan jsonb, p_request_digest text)
returns public.study_sessions language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare s public.study_sessions;
begin
  perform public.assert_trusted_study_enabled();
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':session_request:' || p_request_id::text, 0));
  select * into s from public.study_sessions where user_id = p_owner and request_id = p_request_id;
  if found and s.completion_contract is distinct from 1 then
    raise exception 'Historical session has no reward contract.' using errcode = '55000';
  end if;
  s := public.create_verified_study_session(p_owner, p_request_id, p_plan, p_request_digest);
  update public.study_sessions set completion_contract = 1 where id = s.id returning * into s;
  return s;
end $$;

-- Called only under the Migration 27 owner lock. Event uniqueness is the effects ledger.
-- Existing historical values remain additive; only newly crossed study thresholds unlock.
create function public._apply_trusted_study_effects(p_owner uuid, p_session uuid, p_ids uuid[], p_complete boolean)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare
  a public.question_attempts; e public.activity_events; ach public.achievements;
  before_metrics jsonb := public._trusted_study_metrics(p_owner); after_metrics jsonb;
  day date; delta integer := 0; amount integer; total integer; lvl integer := 1;
  inserted uuid; unlocked jsonb := '[]'::jsonb; now_at timestamptz;
begin
  for a in select * from public.question_attempts where user_id = p_owner and session_id = p_session
    and id = any(p_ids) order by session_slot loop
    if a.verified_at is null or a.competitive_at is not null then
      raise exception 'Verified personal attempt required.' using errcode = '23505';
    end if;
    day := (a.verified_at at time zone 'Asia/Manila')::date;
    amount := case when a.is_correct then 5 else 0 end;
    inserted := null;
    insert into public.activity_events(user_id,event_key,activity_date,event_type,subject_id,subject_name,
      xp_awarded,leaderboard_xp,occurred_at,trusted_effect_version,trusted_session_id,trusted_attempt_id)
    values(p_owner,'answer:' || a.id,day,'question_answered',a.subject_id,a.subject_name,amount,0,a.verified_at,1,p_session,a.id)
    on conflict(user_id,event_key) do nothing returning id into inserted;
    select * into strict e from public.activity_events where user_id = p_owner and event_key = 'answer:' || a.id;
    if e.trusted_effect_version is distinct from 1 or e.trusted_session_id is distinct from p_session
      or e.trusted_attempt_id is distinct from a.id or e.xp_awarded <> amount or e.leaderboard_xp <> 0
      or e.activity_date <> day or e.occurred_at <> a.verified_at or e.event_type is distinct from 'question_answered'
      or e.subject_id is distinct from a.subject_id or e.subject_name is distinct from a.subject_name then
      raise exception 'Answer effect identity conflict.' using errcode = '23505';
    end if;
    if inserted is not null then
      delta := delta + amount;
      insert into public.daily_activity(user_id,activity_date,questions_answered,correct_answers,review_count,subjects_studied)
      values(p_owner,day,1,a.is_correct::integer,0,array[a.subject_name])
      on conflict(user_id,activity_date) do update set
        questions_answered = daily_activity.questions_answered + 1,
        correct_answers = daily_activity.correct_answers + excluded.correct_answers,
        review_count = daily_activity.review_count + 1,
        subjects_studied = array(select distinct unnest(daily_activity.subjects_studied || excluded.subjects_studied) order by 1);
      if a.is_correct then
        delete from public.question_reinforcement where user_id = p_owner and question_id = a.question_id;
      else
        insert into public.question_reinforcement(user_id,question_id,reinforcement_level) values(p_owner,a.question_id,1)
        on conflict(user_id,question_id) do update set reinforcement_level = least(3, question_reinforcement.reinforcement_level + 1);
      end if;
      inserted := null;
      insert into public.activity_events(user_id,event_key,activity_date,event_type,xp_awarded,leaderboard_xp,occurred_at,trusted_effect_version)
      values(p_owner,'xp:daily-streak:' || day,day,'daily_streak',10,0,a.verified_at,1)
      on conflict(user_id,event_key) do nothing returning id into inserted;
      if inserted is not null then delta := delta + 10; else
        -- A legitimate historical daily award is reused, never rewritten or paid twice.
        select * into strict e from public.activity_events where user_id = p_owner and event_key = 'xp:daily-streak:' || day;
        if e.activity_date <> day or e.xp_awarded <> 10 or e.event_type is distinct from 'daily_streak' then
          raise exception 'Daily effect conflict.' using errcode = '23505';
        end if;
      end if;
    end if;
  end loop;
  if p_complete then
    now_at := clock_timestamp();
    insert into public.activity_events(user_id,event_key,activity_date,event_type,xp_awarded,leaderboard_xp,occurred_at,
      trusted_effect_version,trusted_session_id)
    values(p_owner,'study-session:' || p_session,(now_at at time zone 'Asia/Manila')::date,
      'study_session_completed',20,0,now_at,1,p_session)
    on conflict(user_id,event_key) do nothing returning id into inserted;
    if inserted is null then raise exception 'Completion effect without receipt.' using errcode = '23505'; end if;
    insert into public.daily_activity(user_id,activity_date,review_count)
    values(p_owner,(now_at at time zone 'Asia/Manila')::date,1)
    on conflict(user_id,activity_date) do update set review_count = daily_activity.review_count + 1;
    delta := delta + 20;
  end if;
  after_metrics := public._trusted_study_metrics(p_owner);
  for ach in select * from public.achievements where condition_type in ('questions_answered','streak_days','study_sessions')
    and (before_metrics->>condition_type)::bigint < condition_value
    and (after_metrics->>condition_type)::bigint >= condition_value order by id loop
    inserted := null;
    insert into public.user_achievements(user_id,achievement_id) values(p_owner,ach.id)
    on conflict(user_id,achievement_id) do nothing returning id into inserted;
    if inserted is not null then
      delta := delta + ach.xp_reward;
      unlocked := unlocked || jsonb_build_array(ach.id);
    end if;
  end loop;
  if delta > 0 then
    insert into public.user_progress(user_id,total_xp) values(p_owner,delta)
    on conflict(user_id) do update set total_xp = user_progress.total_xp + excluded.total_xp;
  end if;
  select coalesce((select total_xp from public.user_progress where user_id = p_owner),0) into total;
  while 25::bigint * lvl * (lvl + 3) <= total loop lvl := lvl + 1; end loop;
  return jsonb_build_object('totalXp',total,'level',lvl,'xpAwarded',delta,'unlocked',unlocked);
end $$;

create function public.commit_rewarded_study_batch(p_owner uuid, p_session_id uuid, p_attempts jsonb)
returns setof public.question_attempts language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare ids uuid[];
begin
  perform public.assert_trusted_study_enabled();
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':trusted-study', 0));
  if not exists(select 1 from public.study_sessions where id = p_session_id and user_id = p_owner and completion_contract = 1) then
    raise exception 'Reward session required.' using errcode = '55000';
  end if;
  select array_agg(id order by session_slot) into ids from public.commit_verified_study_batch(p_owner,p_session_id,p_attempts);
  perform public._apply_trusted_study_effects(p_owner,p_session_id,ids,false);
  return query select * from public.question_attempts where id = any(ids) order by session_slot;
end $$;

create function public.complete_verified_study_session(p_owner uuid, p_session_id uuid, p_attempt_ids jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
set timezone = 'UTC' as $$
declare
  s public.study_sessions; ids uuid[]; actual_ids jsonb; n integer; correct integer; distinct_questions integer;
  receipt jsonb; fingerprint text;
begin
  perform public.assert_trusted_study_enabled();
  if p_owner is null or p_session_id is null or jsonb_typeof(p_attempt_ids) is distinct from 'array' then
    raise exception 'Invalid completion.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_attempt_ids) not between 1 and 10000 or exists (
    select 1 from jsonb_array_elements(p_attempt_ids) x where jsonb_typeof(x) <> 'string'
    or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Invalid completion IDs.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':trusted-study', 0));
  select * into s from public.study_sessions where id = p_session_id and user_id = p_owner for update;
  if not found then raise exception 'Session ownership mismatch.' using errcode = '42501'; end if;
  if s.completion_contract is distinct from 1 then raise exception 'Reward contract missing.' using errcode = '55000'; end if;
  select array_agg(a.id order by session_slot),jsonb_agg(a.id order by session_slot),count(*),
    count(*) filter(where is_correct),count(distinct question_id),md5(jsonb_agg(to_jsonb(a) order by session_slot)::text)
    into ids,actual_ids,n,correct,distinct_questions,fingerprint from public.question_attempts a where session_id = s.id and user_id = p_owner;
  if actual_ids is distinct from p_attempt_ids or exists (
    select 1 from public.question_attempts a where session_id = s.id and (a.user_id <> p_owner or a.verified_at is null
      or a.competitive_at is not null or a.session_slot is null or not exists (
        select 1 from jsonb_array_elements(s.question_pool) q where q->>'question_id' = a.question_id and q->>'content_version' = a.content_version)))
    or (select min(session_slot) <> 0 or max(session_slot) <> n - 1 from public.question_attempts where session_id = s.id) then
    raise exception 'Completion attempts conflict.' using errcode = '23505';
  end if;
  if s.completed_at is not null then
    if s.completion_receipt is null or s.completion_receipt->>'fingerprint' is distinct from fingerprint then
      raise exception 'Completed session receipt conflict.' using errcode = '23505';
    end if;
    return s.completion_receipt;
  end if;
  if s.expires_at <= clock_timestamp() then raise exception 'Session expired.' using errcode = '55000'; end if;
  -- Version 1: strict pool coverage, or adaptive correct target (+ full coverage for all-pool reviews).
  if (case when s.mode in ('adaptive','weakness_focus') then
      correct < s.target_count or (s.target_count = jsonb_array_length(s.question_pool) and distinct_questions <> s.target_count)
    else n <> jsonb_array_length(s.question_pool) or distinct_questions <> n end) then
    raise exception 'Session completion requirements unmet.' using errcode = '22023';
  end if;
  receipt := public._apply_trusted_study_effects(p_owner,s.id,ids,true);
  receipt := receipt || jsonb_build_object('sessionId',s.id,'completedAt',clock_timestamp(),'attemptIds',actual_ids,
    'attemptCount',n,'correctCount',correct,'contract',1,'fingerprint',fingerprint);
  update public.study_sessions set completed_at = (receipt->>'completedAt')::timestamptz,completion_receipt = receipt where id = s.id;
  return receipt;
end $$;

revoke all on function public._trusted_study_metrics(uuid) from public,anon,authenticated,service_role;
revoke all on function public._apply_trusted_study_effects(uuid,uuid,uuid[],boolean) from public,anon,authenticated,service_role;
revoke all on function public.create_rewarded_study_session(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.commit_rewarded_study_batch(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.complete_verified_study_session(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_rewarded_study_session(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.commit_rewarded_study_batch(uuid,uuid,jsonb) to service_role;
grant execute on function public.complete_verified_study_session(uuid,uuid,jsonb) to service_role;
commit;
