-- Rollback: Revert Rodak book edition support to 202610040018 / 202610040017 state

-- 1. Restore set_question_attempt_book
create or replace function public.set_question_attempt_book()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.book is null or new.book = '' or (new.book = 'Harr' and (new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%')) then
    new.book := case
      when new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%' then 'Ciulla'
      else coalesce(nullif(new.book, ''), 'Harr')
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.set_question_attempt_book() from public, anon, authenticated;

-- 2. Restore record_question_attempt to 202610040017 state
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
  v_answered_at timestamptz := least(coalesce(p_answered_at, now()), now());
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

  select * into v_attempt
  from public.question_attempts
  where id = p_id and user_id = v_user_id;
  if found then
    return v_attempt;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_question_id, 0));

  update public.question_attempts
  set
    subject_id = coalesce(nullif(btrim(p_subject_id), ''), 'uncategorized'),
    subject_name = coalesce(nullif(btrim(p_subject_name), ''), 'Uncategorized'),
    topic_id = coalesce(nullif(btrim(p_topic_id), ''), 'uncategorized'),
    topic_name = coalesce(nullif(btrim(p_topic_name), ''), 'Uncategorized'),
    subtopic = coalesce(nullif(btrim(p_subtopic), ''), 'Uncategorized'),
    difficulty = coalesce(nullif(p_difficulty, ''), 'Unspecified'),
    book = v_book
  where user_id = v_user_id
    and question_id = p_question_id
    and (subject_id <> coalesce(nullif(btrim(p_subject_id), ''), 'uncategorized')
      or topic_id <> coalesce(nullif(btrim(p_topic_id), ''), 'uncategorized'));

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

-- 3. Restore leaderboard_metric_rows to 202609250011 state
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
