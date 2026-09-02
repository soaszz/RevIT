-- RevIT Leaderboards V1
--
-- This migration extends the existing privacy preferences, authoritative
-- question-attempt history, and idempotent activity/XP ledger. It does not
-- create parallel profile, question, subject, attempt, or progression systems.

begin;

alter table public.user_preferences
  add column if not exists leaderboard_opt_in boolean not null default false;

comment on column public.user_preferences.leaderboard_opt_in is
  'Explicit consent to show the profile display identity and aggregated metrics on RevIT leaderboards.';

alter table public.activity_events
  add column if not exists event_type text,
  add column if not exists subject_id text,
  add column if not exists subject_name text,
  add column if not exists xp_awarded integer not null default 0,
  add column if not exists leaderboard_xp integer not null default 0,
  add column if not exists occurred_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'activity_events_xp_awarded_nonnegative'
      and conrelid = 'public.activity_events'::regclass
  ) then
    alter table public.activity_events
      add constraint activity_events_xp_awarded_nonnegative check (xp_awarded >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'activity_events_leaderboard_xp_valid'
      and conrelid = 'public.activity_events'::regclass
  ) then
    alter table public.activity_events
      add constraint activity_events_leaderboard_xp_valid
      check (leaderboard_xp >= 0 and leaderboard_xp <= xp_awarded);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'activity_events_known_event_type'
      and conrelid = 'public.activity_events'::regclass
  ) then
    alter table public.activity_events
      add constraint activity_events_known_event_type check (
        event_type is null or event_type in (
          'question_answered',
          'study_session_completed',
          'ai_review',
          'daily_streak',
          'first_ai_message',
          'first_exam'
        )
      );
  end if;
end;
$$;

comment on column public.activity_events.event_type is
  'Server-validated event classification. Null is retained only for unclassified legacy rows.';
comment on column public.activity_events.subject_id is
  'Subject copied only from an authoritative question attempt when attribution is reliable.';
comment on column public.activity_events.xp_awarded is
  'Account XP selected by the database from a known event type; never accepted from a client amount.';
comment on column public.activity_events.leaderboard_xp is
  'Study XP eligible for leaderboards after anti-farming checks; one-time account bonuses remain excluded.';
comment on column public.activity_events.occurred_at is
  'Timestamp of the validated source record, used for Daily and Weekly Study XP periods.';

-- Central timezone for every leaderboard period and daily anti-farming rule.
-- Asia/Manila matches RevIT's existing preference default and primary audience.
create or replace function public.leaderboard_timezone()
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select 'Asia/Manila'::text;
$$;

create or replace function public.leaderboard_accuracy_minimum(p_period text)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_period = 'daily' then return 20; end if;
  if p_period = 'weekly' then return 75; end if;
  if p_period = 'all_time' then return 200; end if;
  raise exception 'Invalid leaderboard period.' using errcode = '22023';
end;
$$;

create or replace function public.leaderboard_period_start(p_period text)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_timezone text := public.leaderboard_timezone();
begin
  if p_period = 'daily' then
    return date_trunc('day', now() at time zone v_timezone) at time zone v_timezone;
  end if;
  if p_period = 'weekly' then
    return date_trunc('week', now() at time zone v_timezone) at time zone v_timezone;
  end if;
  if p_period = 'all_time' then return null; end if;
  raise exception 'Invalid leaderboard period.' using errcode = '22023';
end;
$$;

-- Backfill only legacy rows that can be tied to an authoritative source.
with first_daily_attempt as (
  select
    attempt.id,
    attempt.user_id,
    attempt.subject_id,
    attempt.subject_name,
    attempt.is_correct,
    attempt.answered_at,
    row_number() over (
      partition by attempt.user_id, attempt.question_id,
        (attempt.answered_at at time zone public.leaderboard_timezone())::date
      order by attempt.answered_at, attempt.id
    ) as daily_order
  from public.question_attempts attempt
)
update public.activity_events event
set
  event_type = 'question_answered',
  subject_id = attempt.subject_id,
  subject_name = attempt.subject_name,
  xp_awarded = case when attempt.is_correct then 5 else 0 end,
  leaderboard_xp = case when attempt.is_correct and attempt.daily_order = 1 then 5 else 0 end,
  occurred_at = attempt.answered_at
from first_daily_attempt attempt
where event.user_id = attempt.user_id
  and event.event_key = 'answer:' || attempt.id::text
  and event.event_type is null;

with valid_session as (
  select user_id, session_id, max(answered_at) as completed_at
  from public.question_attempts
  where session_id is not null
  group by user_id, session_id
)
update public.activity_events event
set
  event_type = 'study_session_completed',
  xp_awarded = 20,
  leaderboard_xp = 20,
  occurred_at = valid_session.completed_at
from valid_session
where event.user_id = valid_session.user_id
  and event.event_key = 'study-session:' || valid_session.session_id::text
  and event.event_type is null;

update public.activity_events event
set
  event_type = 'daily_streak',
  xp_awarded = 10,
  leaderboard_xp = 10,
  occurred_at = (event.activity_date::timestamp + interval '12 hours') at time zone public.leaderboard_timezone()
where event.event_type is null
  and event.event_key = 'xp:daily-streak:' || event.activity_date::text
  and exists (
    select 1 from public.daily_activity activity
    where activity.user_id = event.user_id
      and activity.activity_date = event.activity_date
      and (activity.questions_answered > 0 or activity.review_count > 0)
  );

update public.activity_events
set event_type = 'ai_review', occurred_at = created_at
where event_type is null and event_key like 'ai-review:%';

update public.activity_events
set event_type = 'first_ai_message', xp_awarded = 10, leaderboard_xp = 0, occurred_at = created_at
where event_type is null and event_key = 'xp:first-ai-message';

update public.activity_events
set event_type = 'first_exam', xp_awarded = 10, leaderboard_xp = 0, occurred_at = created_at
where event_type is null and event_key = 'xp:first-exam';

-- Existing user-first indexes serve private analytics. These two pairs serve
-- global period scans and subject-scoped period scans without downloading rows.
create index if not exists question_attempts_leaderboard_period_idx
  on public.question_attempts (answered_at, user_id, question_id);
create index if not exists question_attempts_leaderboard_subject_period_idx
  on public.question_attempts (subject_id, answered_at, user_id, question_id);
create index if not exists activity_events_leaderboard_xp_period_idx
  on public.activity_events (occurred_at, user_id)
  where leaderboard_xp > 0;
create index if not exists activity_events_leaderboard_xp_subject_period_idx
  on public.activity_events (subject_id, occurred_at, user_id)
  where leaderboard_xp > 0 and subject_id is not null;

-- Prevent direct writes to authoritative study/XP records. The existing
-- authenticated SELECT grants and own-row RLS policies stay intact.
revoke insert, update, delete on public.question_attempts from authenticated;
revoke insert, update, delete on public.daily_activity from authenticated;
revoke insert, update, delete on public.activity_events from authenticated;
revoke insert, update on public.user_progress from authenticated;
revoke insert on public.user_achievements from authenticated;

-- The browser supplies answer details, never a user ID or attempt number.
-- SECURITY DEFINER is required after direct writes are revoked; auth.uid(),
-- validation, advisory locking, and a fixed search_path constrain the write.
create or replace function public.record_question_attempt(
  p_id uuid,
  p_question_id text,
  p_subject_id text,
  p_subject_name text,
  p_topic_id text,
  p_topic_name text,
  p_subtopic text,
  p_difficulty text,
  p_selected_answer smallint,
  p_is_correct boolean,
  p_review_mode text,
  p_session_id uuid,
  p_is_adaptive_repeat boolean,
  p_answered_at timestamptz
)
returns public.question_attempts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt_number integer;
  v_attempt public.question_attempts;
  v_answered_at timestamptz := coalesce(p_answered_at, now());
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'A stable attempt ID is required.' using errcode = '22023';
  end if;
  if p_question_id is null or btrim(p_question_id) = '' or char_length(p_question_id) > 240 then
    raise exception 'A valid question ID is required.' using errcode = '22023';
  end if;
  if p_selected_answer is null and p_is_correct then
    raise exception 'An unanswered question cannot be correct.' using errcode = '22023';
  end if;
  if v_answered_at > now() + interval '5 minutes' then
    raise exception 'The answer timestamp is in the future.' using errcode = '22023';
  end if;

  select * into v_attempt
  from public.question_attempts
  where id = p_id and user_id = v_user_id;
  if found then
    return v_attempt;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_question_id, 0));

  if exists (
    select 1 from public.question_attempts existing
    where existing.user_id = v_user_id
      and existing.question_id = p_question_id
      and (existing.subject_id <> coalesce(nullif(btrim(p_subject_id), ''), 'uncategorized')
        or existing.topic_id <> coalesce(nullif(btrim(p_topic_id), ''), 'uncategorized'))
  ) then
    raise exception 'Question metadata does not match prior attempts.' using errcode = '22023';
  end if;

  select coalesce(max(attempt_number), 0) + 1
  into v_attempt_number
  from public.question_attempts
  where user_id = v_user_id and question_id = p_question_id;

  insert into public.question_attempts (
    id, user_id, question_id, subject_id, subject_name, topic_id, topic_name,
    subtopic, difficulty, selected_answer, is_correct, attempt_number,
    review_mode, session_id, is_adaptive_repeat, answered_at
  ) values (
    p_id, v_user_id, p_question_id,
    coalesce(nullif(btrim(p_subject_id), ''), 'uncategorized'),
    coalesce(nullif(btrim(p_subject_name), ''), 'Uncategorized'),
    coalesce(nullif(btrim(p_topic_id), ''), 'uncategorized'),
    coalesce(nullif(btrim(p_topic_name), ''), 'Uncategorized'),
    coalesce(nullif(btrim(p_subtopic), ''), 'Uncategorized'),
    coalesce(nullif(p_difficulty, ''), 'Unspecified'),
    p_selected_answer, p_is_correct, v_attempt_number,
    coalesce(nullif(p_review_mode, ''), 'reviewer'), p_session_id,
    coalesce(p_is_adaptive_repeat, false), v_answered_at
  )
  returning * into v_attempt;

  return v_attempt;
end;
$$;

revoke all on function public.record_question_attempt(
  uuid, text, text, text, text, text, text, text, smallint, boolean,
  text, uuid, boolean, timestamptz
) from public, anon;
grant execute on function public.record_question_attempt(
  uuid, text, text, text, text, text, text, text, smallint, boolean,
  text, uuid, boolean, timestamptz
) to authenticated;

-- Replace the old client-amount RPC. Every XP value below is selected by the
-- database after validating the referenced attempt/session/message/exam.
drop function if exists public.record_study_activity(text,date,integer,integer,integer,text,integer);
drop function if exists public.record_study_activity(text,date,integer,integer,integer,text);

create or replace function public.record_study_activity(
  p_event_key text,
  p_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_reference_id uuid;
  v_attempt public.question_attempts;
  v_inserted_event uuid;
  v_activity_date date;
  v_occurred_at timestamptz := now();
  v_questions integer := 0;
  v_correct integer := 0;
  v_reviews integer := 0;
  v_subject_id text;
  v_subject_name text;
  v_xp integer := 0;
  v_leaderboard_xp integer := 0;
begin
  if v_owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_event_key is null or char_length(p_event_key) not between 1 and 180 then
    raise exception 'Invalid event key.' using errcode = '22023';
  end if;
  if p_event_type is null or p_event_type not in (
    'question_answered', 'study_session_completed', 'ai_review',
    'daily_streak', 'first_ai_message', 'first_exam'
  ) then
    raise exception 'Invalid progression event type.' using errcode = '22023';
  end if;

  if p_event_type = 'question_answered' then
    if p_event_key !~ '^answer:[0-9a-fA-F-]{36}$' then
      raise exception 'Invalid question event key.' using errcode = '22023';
    end if;
    v_reference_id := substring(p_event_key from 8)::uuid;
    select * into v_attempt
    from public.question_attempts attempt
    where attempt.id = v_reference_id and attempt.user_id = v_owner;
    if not found then
      raise exception 'The referenced question attempt does not exist.' using errcode = '22023';
    end if;
    v_occurred_at := v_attempt.answered_at;
    v_questions := 1;
    v_correct := case when v_attempt.is_correct then 1 else 0 end;
    v_subject_id := v_attempt.subject_id;
    v_subject_name := v_attempt.subject_name;
    v_xp := case when v_attempt.is_correct then 5 else 0 end;
    if v_attempt.is_correct and not exists (
      select 1 from public.question_attempts earlier
      where earlier.user_id = v_owner
        and earlier.question_id = v_attempt.question_id
        and (earlier.answered_at at time zone public.leaderboard_timezone())::date
          = (v_attempt.answered_at at time zone public.leaderboard_timezone())::date
        and (earlier.answered_at, earlier.id) < (v_attempt.answered_at, v_attempt.id)
    ) then
      v_leaderboard_xp := 5;
    end if;

  elsif p_event_type = 'study_session_completed' then
    if p_event_key !~ '^study-session:[0-9a-fA-F-]{36}$' then
      raise exception 'Invalid study-session event key.' using errcode = '22023';
    end if;
    v_reference_id := substring(p_event_key from 15)::uuid;
    select max(attempt.answered_at) into v_occurred_at
    from public.question_attempts attempt
    where attempt.user_id = v_owner and attempt.session_id = v_reference_id;
    if v_occurred_at is null then
      raise exception 'A completed session must contain recorded question activity.' using errcode = '22023';
    end if;
    v_xp := 20;
    v_leaderboard_xp := 20;

  elsif p_event_type = 'ai_review' then
    if p_event_key !~ '^ai-review:[0-9a-fA-F-]{36}$' then
      raise exception 'Invalid AI review event key.' using errcode = '22023';
    end if;
    v_reference_id := substring(p_event_key from 11)::uuid;
    select message.created_at into v_occurred_at
    from public.ai_messages message
    join public.ai_chats chat on chat.id = message.chat_id
    where message.id = v_reference_id
      and message.role = 'user'
      and chat.user_id = v_owner;
    if v_occurred_at is null then
      raise exception 'The referenced AI study message does not exist.' using errcode = '22023';
    end if;
    v_reviews := 1;

  elsif p_event_type = 'daily_streak' then
    if p_event_key !~ '^xp:daily-streak:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid daily-streak event key.' using errcode = '22023';
    end if;
    v_activity_date := substring(p_event_key from 17)::date;
    if not exists (
      select 1 from public.daily_activity activity
      where activity.user_id = v_owner
        and activity.activity_date = v_activity_date
        and (activity.questions_answered > 0 or activity.review_count > 0)
    ) then
      raise exception 'Daily streak XP requires recorded study activity.' using errcode = '22023';
    end if;
    v_occurred_at := (v_activity_date::timestamp + interval '12 hours') at time zone public.leaderboard_timezone();
    v_xp := 10;
    v_leaderboard_xp := 10;

  elsif p_event_type = 'first_ai_message' then
    if p_event_key <> 'xp:first-ai-message' or not exists (
      select 1 from public.ai_messages message
      join public.ai_chats chat on chat.id = message.chat_id
      where chat.user_id = v_owner and message.role = 'user'
    ) then
      raise exception 'First-message XP requires a saved AI message.' using errcode = '22023';
    end if;
    v_xp := 10;

  elsif p_event_type = 'first_exam' then
    if p_event_key <> 'xp:first-exam' or not exists (
      select 1 from public.exam_schedule exam where exam.user_id = v_owner
    ) then
      raise exception 'First-exam XP requires a saved exam.' using errcode = '22023';
    end if;
    v_xp := 10;
  end if;

  v_activity_date := coalesce(
    v_activity_date,
    (v_occurred_at at time zone public.leaderboard_timezone())::date
  );

  insert into public.activity_events (
    user_id, event_key, activity_date, event_type, subject_id, subject_name,
    xp_awarded, leaderboard_xp, occurred_at
  ) values (
    v_owner, p_event_key, v_activity_date, p_event_type, v_subject_id, v_subject_name,
    v_xp, v_leaderboard_xp, v_occurred_at
  )
  on conflict (user_id, event_key) do nothing
  returning id into v_inserted_event;

  if v_inserted_event is null then
    return false;
  end if;

  if v_questions > 0 or v_reviews > 0 then
    insert into public.daily_activity (
      user_id, activity_date, questions_answered, correct_answers,
      review_count, subjects_studied
    ) values (
      v_owner, v_activity_date, v_questions, v_correct, v_reviews,
      case when v_subject_name is null then '{}' else array[v_subject_name] end
    )
    on conflict (user_id, activity_date) do update set
      questions_answered = daily_activity.questions_answered + excluded.questions_answered,
      correct_answers = daily_activity.correct_answers + excluded.correct_answers,
      review_count = daily_activity.review_count + excluded.review_count,
      subjects_studied = array(
        select distinct value
        from unnest(daily_activity.subjects_studied || excluded.subjects_studied) as value
      ),
      updated_at = now();
  end if;

  if v_xp > 0 then
    insert into public.user_progress (user_id, total_xp)
    values (v_owner, v_xp)
    on conflict (user_id) do update set
      total_xp = user_progress.total_xp + excluded.total_xp,
      updated_at = now();
  end if;

  return true;
end;
$$;

revoke all on function public.record_study_activity(text,text) from public, anon;
grant execute on function public.record_study_activity(text,text) to authenticated;

-- Internal aggregation shared by the public-safe Top 50 and private current-user
-- RPCs. Execute permission is intentionally not granted to API roles because it
-- contains auth UUIDs internally.
create or replace function public.leaderboard_metric_rows(
  p_period text,
  p_metric text,
  p_subject_id text default null
)
returns table (
  participant_id uuid,
  metric_value numeric,
  answered_count bigint,
  correct_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period_start timestamptz;
begin
  if p_period not in ('daily', 'weekly', 'all_time') then
    raise exception 'Invalid leaderboard period.' using errcode = '22023';
  end if;
  if p_metric not in ('questions', 'accuracy', 'study_xp') then
    raise exception 'Invalid leaderboard metric.' using errcode = '22023';
  end if;
  if p_subject_id is not null and (btrim(p_subject_id) = '' or char_length(p_subject_id) > 240) then
    raise exception 'Invalid subject scope.' using errcode = '22023';
  end if;
  v_period_start := public.leaderboard_period_start(p_period);

  if p_metric in ('questions', 'accuracy') then
    return query
    with first_daily_attempt as (
      select
        attempt.user_id,
        attempt.question_id,
        attempt.is_correct,
        row_number() over (
          partition by attempt.user_id, attempt.question_id,
            (attempt.answered_at at time zone public.leaderboard_timezone())::date
          order by attempt.answered_at, attempt.id
        ) as daily_order
      from public.question_attempts attempt
      where (v_period_start is null or attempt.answered_at >= v_period_start)
        and attempt.answered_at <= now()
        and (p_subject_id is null or attempt.subject_id = p_subject_id)
    ), aggregated as (
      select
        eligible.user_id,
        count(*)::bigint as attempts,
        count(*) filter (where eligible.is_correct)::bigint as correct
      from first_daily_attempt eligible
      where eligible.daily_order = 1
      group by eligible.user_id
    )
    select
      aggregated.user_id,
      case p_metric
        when 'questions' then aggregated.attempts::numeric
        else round((aggregated.correct::numeric * 100) / nullif(aggregated.attempts, 0), 1)
      end,
      aggregated.attempts,
      aggregated.correct
    from aggregated;
  else
    return query
    select
      event.user_id,
      sum(event.leaderboard_xp)::numeric,
      count(*)::bigint,
      0::bigint
    from public.activity_events event
    where event.leaderboard_xp > 0
      and (v_period_start is null or event.occurred_at >= v_period_start)
      and event.occurred_at <= now()
      and (p_subject_id is null or event.subject_id = p_subject_id)
    group by event.user_id;
  end if;
end;
$$;

revoke all on function public.leaderboard_metric_rows(text,text,text) from public, anon, authenticated;
revoke all on function public.leaderboard_timezone() from public, anon, authenticated;
revoke all on function public.leaderboard_accuracy_minimum(text) from public, anon, authenticated;
revoke all on function public.leaderboard_period_start(text) from public, anon, authenticated;

create or replace function public.get_leaderboard(
  p_period text,
  p_metric text,
  p_subject_id text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  rank bigint,
  display_name text,
  avatar_url text,
  metric_value numeric,
  answered_count bigint,
  is_current_user boolean,
  period_timezone text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_minimum integer;
begin
  if v_owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 50 then
    raise exception 'Leaderboard page size must be between 1 and 50.' using errcode = '22023';
  end if;
  if p_offset < 0 or p_offset > 5000 then
    raise exception 'Invalid leaderboard offset.' using errcode = '22023';
  end if;
  v_minimum := public.leaderboard_accuracy_minimum(p_period);

  return query
  with eligible as (
    select stats.*
    from public.leaderboard_metric_rows(p_period, p_metric, p_subject_id) stats
    join public.user_preferences preference
      on preference.user_id = stats.participant_id
      and preference.leaderboard_opt_in
    join public.profiles profile on profile.id = stats.participant_id
    where case
      when p_metric = 'accuracy' then stats.answered_count >= v_minimum
      else stats.metric_value > 0
    end
  ), ranked as (
    select
      eligible.*,
      row_number() over (
        order by eligible.metric_value desc, eligible.answered_count desc, eligible.participant_id
      ) as position
    from eligible
  )
  select
    ranked.position,
    coalesce(nullif(btrim(profile.first_name), ''), profile.username, 'RevIT learner'),
    profile.avatar_url,
    ranked.metric_value,
    ranked.answered_count,
    ranked.participant_id = v_owner,
    public.leaderboard_timezone()
  from ranked
  join public.profiles profile on profile.id = ranked.participant_id
  where ranked.position > p_offset
    and ranked.position <= p_offset + p_limit
  order by ranked.position;
end;
$$;

revoke all on function public.get_leaderboard(text,text,text,integer,integer) from public, anon;
grant execute on function public.get_leaderboard(text,text,text,integer,integer) to authenticated;

create or replace function public.get_current_user_leaderboard_position(
  p_period text,
  p_metric text,
  p_subject_id text default null
)
returns table (
  rank bigint,
  display_name text,
  avatar_url text,
  metric_value numeric,
  answered_count bigint,
  minimum_required integer,
  questions_needed integer,
  eligible boolean,
  opted_in boolean,
  percentile integer,
  participant_count bigint,
  period_timezone text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_minimum integer;
begin
  if v_owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  v_minimum := public.leaderboard_accuracy_minimum(p_period);

  return query
  with all_stats as (
    select * from public.leaderboard_metric_rows(p_period, p_metric, p_subject_id)
  ), eligible_public as (
    select stats.*
    from all_stats stats
    join public.user_preferences preference
      on preference.user_id = stats.participant_id
      and preference.leaderboard_opt_in
    join public.profiles profile on profile.id = stats.participant_id
    where case
      when p_metric = 'accuracy' then stats.answered_count >= v_minimum
      else stats.metric_value > 0
    end
  ), ranked as (
    select
      public_stats.*,
      row_number() over (
        order by public_stats.metric_value desc, public_stats.answered_count desc, public_stats.participant_id
      ) as position
    from eligible_public public_stats
  ), participant_total as (
    select count(*)::bigint as total from ranked
  ), mine as (
    select
      v_owner as participant_id,
      coalesce(stats.metric_value, 0)::numeric as metric_value,
      coalesce(stats.answered_count, 0)::bigint as answered_count
    from (select 1) seed
    left join all_stats stats on stats.participant_id = v_owner
  ), my_profile as (
    select
      coalesce(nullif(btrim(profile.first_name), ''), profile.username, 'RevIT learner') as display_name,
      profile.avatar_url,
      coalesce(preference.leaderboard_opt_in, false) as opted_in
    from public.profiles profile
    left join public.user_preferences preference on preference.user_id = profile.id
    where profile.id = v_owner
  ), evaluated as (
    select
      mine.*,
      profile.display_name,
      profile.avatar_url,
      profile.opted_in,
      case
        when p_metric = 'accuracy' then mine.answered_count >= v_minimum
        else mine.metric_value > 0
      end as is_eligible
    from mine cross join my_profile profile
  )
  select
    case when evaluated.opted_in and evaluated.is_eligible then ranked.position else null end,
    evaluated.display_name,
    evaluated.avatar_url,
    evaluated.metric_value,
    evaluated.answered_count,
    case when p_metric = 'accuracy' then v_minimum else 0 end,
    case when p_metric = 'accuracy'
      then greatest(v_minimum - evaluated.answered_count::integer, 0)
      else 0
    end,
    evaluated.is_eligible,
    evaluated.opted_in,
    case
      when evaluated.opted_in and evaluated.is_eligible and ranked.position is not null and participant_total.total > 0
      then greatest(1, ceil((ranked.position::numeric * 100) / participant_total.total)::integer)
      else null
    end,
    participant_total.total,
    public.leaderboard_timezone()
  from evaluated
  cross join participant_total
  left join ranked on ranked.participant_id = v_owner;
end;
$$;

revoke all on function public.get_current_user_leaderboard_position(text,text,text) from public, anon;
grant execute on function public.get_current_user_leaderboard_position(text,text,text) to authenticated;

comment on function public.get_leaderboard(text,text,text,integer,integer) is
  'Returns only opted-in profile display identity and aggregated leaderboard metrics, never auth IDs or raw attempts.';
comment on function public.get_current_user_leaderboard_position(text,text,text) is
  'Returns the caller private metric, opt-in state, eligibility progress, and public rank when eligible.';

commit;
