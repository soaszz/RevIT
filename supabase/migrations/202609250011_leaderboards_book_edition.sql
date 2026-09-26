-- RevIT Leaderboard Book Edition Filtering
-- Adds book filtering support to leaderboards so learners can rank across All Books, Harr, Ciulla, or future editions.

-- 1. Add book column to question_attempts if not present
alter table public.question_attempts add column if not exists book text;

-- 2. Backfill all existing records (ensuring Ciulla questions are labeled properly)
update public.question_attempts
set book = case
  when question_id like 'ciulla-%' or subject_id like 'ciulla-%' or topic_id like 'ciulla-%' then 'Ciulla'
  else 'Harr'
end;

-- 3. Automatic book trigger for question_attempts
create or replace function public.set_question_attempt_book()
returns trigger as $$
begin
  if new.book is null or new.book = '' or (new.book = 'Harr' and (new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%')) then
    new.book := case
      when new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%' then 'Ciulla'
      else coalesce(nullif(new.book, ''), 'Harr')
    end;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_question_attempt_book on public.question_attempts;
create trigger trg_set_question_attempt_book
before insert or update on public.question_attempts
for each row
execute function public.set_question_attempt_book();

-- 4. Update record_question_attempt to write book column
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
  v_book text := case
    when p_question_id like 'ciulla-%' or p_subject_id like 'ciulla-%' or p_topic_id like 'ciulla-%' then 'Ciulla'
    else 'Harr'
  end;
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
    review_mode, session_id, is_adaptive_repeat, answered_at, book
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
    coalesce(p_is_adaptive_repeat, false), v_answered_at, v_book
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

-- 5. Replace leaderboard_metric_rows with p_book support
create or replace function public.leaderboard_metric_rows(
  p_period text,
  p_metric text,
  p_subject_id text default null,
  p_book text default null
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
        and (
          p_book is null
          or p_book = 'all'
          or (
            case
              when attempt.question_id like 'ciulla-%' or attempt.subject_id like 'ciulla-%' or attempt.topic_id like 'ciulla-%' then 'Ciulla'
              when attempt.book is not null and attempt.book <> '' then attempt.book
              else 'Harr'
            end
          ) = p_book
        )
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
      and (
        p_book is null
        or p_book = 'all'
        or case
          when p_book = 'Ciulla' then event.subject_id like 'ciulla-%'
          when p_book = 'Harr' then not (event.subject_id like 'ciulla-%')
          else event.subject_id like lower(p_book) || '-%'
        end
      )
    group by event.user_id;
  end if;
end;
$$;

-- 6. Replace get_leaderboard with p_book support
create or replace function public.get_leaderboard(
  p_period text,
  p_metric text,
  p_subject_id text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_book text default null
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
    from public.leaderboard_metric_rows(p_period, p_metric, p_subject_id, p_book) stats
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

revoke all on function public.get_leaderboard(text,text,text,integer,integer,text) from public, anon;
grant execute on function public.get_leaderboard(text,text,text,integer,integer,text) to authenticated;

-- 7. Replace get_current_user_leaderboard_position with p_book support
create or replace function public.get_current_user_leaderboard_position(
  p_period text,
  p_metric text,
  p_subject_id text default null,
  p_book text default null
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
    select * from public.leaderboard_metric_rows(p_period, p_metric, p_subject_id, p_book)
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
      profile.id,
      coalesce(nullif(btrim(profile.first_name), ''), profile.username, 'RevIT learner') as display_name,
      profile.avatar_url,
      coalesce(preference.leaderboard_opt_in, false) as opted_in
    from public.profiles profile
    left join public.user_preferences preference on preference.user_id = profile.id
    where profile.id = v_owner
  )
  select
    case
      when not my_profile.opted_in then null
      when p_metric = 'accuracy' and mine.answered_count < v_minimum then null
      when p_metric <> 'accuracy' and mine.metric_value <= 0 then null
      else ranked.position
    end as rank,
    my_profile.display_name,
    my_profile.avatar_url,
    mine.metric_value,
    mine.answered_count,
    v_minimum,
    case
      when p_metric = 'accuracy' then greatest(0, v_minimum - mine.answered_count)::integer
      else 0
    end as questions_needed,
    case
      when p_metric = 'accuracy' then mine.answered_count >= v_minimum
      else mine.metric_value > 0
    end as eligible,
    my_profile.opted_in,
    case
      when ranked.position is null or coalesce(participant_total.total, 0) = 0 then null
      else greatest(1, ceil((ranked.position::numeric / participant_total.total::numeric) * 100))::integer
    end as percentile,
    coalesce(participant_total.total, 0)::bigint as participant_count,
    public.leaderboard_timezone() as period_timezone
  from my_profile
  cross join mine
  cross join participant_total
  left join ranked on ranked.participant_id = v_owner;
end;
$$;

revoke all on function public.get_current_user_leaderboard_position(text,text,text,text) from public, anon;
grant execute on function public.get_current_user_leaderboard_position(text,text,text,text) to authenticated;
