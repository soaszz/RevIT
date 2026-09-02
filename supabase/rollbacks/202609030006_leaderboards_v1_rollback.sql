-- Roll back 202609030006_leaderboards_v1.sql.
-- Re-deploy the application commit from before Leaderboards V1 immediately
-- after running this file because the new client calls the new RPC signature.
begin;

drop function if exists public.get_current_user_leaderboard_position(text,text,text);
drop function if exists public.get_leaderboard(text,text,text,integer,integer);
drop function if exists public.leaderboard_metric_rows(text,text,text);
drop function if exists public.record_study_activity(text,text);
drop function if exists public.leaderboard_period_start(text);
drop function if exists public.leaderboard_accuracy_minimum(text);
drop function if exists public.leaderboard_timezone();

drop index if exists public.activity_events_leaderboard_xp_subject_period_idx;
drop index if exists public.activity_events_leaderboard_xp_period_idx;
drop index if exists public.question_attempts_leaderboard_subject_period_idx;
drop index if exists public.question_attempts_leaderboard_period_idx;

alter table public.activity_events
  drop constraint if exists activity_events_known_event_type,
  drop constraint if exists activity_events_leaderboard_xp_valid,
  drop constraint if exists activity_events_xp_awarded_nonnegative,
  drop column if exists occurred_at,
  drop column if exists leaderboard_xp,
  drop column if exists xp_awarded,
  drop column if exists subject_name,
  drop column if exists subject_id,
  drop column if exists event_type;

alter table public.user_preferences
  drop column if exists leaderboard_opt_in;

-- Restore the pre-leaderboard invoker-rights attempt writer and table grants.
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
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt_number integer;
  v_attempt public.question_attempts;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_question_id is null or btrim(p_question_id) = '' then
    raise exception 'A question ID is required.' using errcode = '22023';
  end if;

  select * into v_attempt
  from public.question_attempts
  where id = p_id and user_id = v_user_id;
  if found then return v_attempt; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_question_id, 0));
  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
  from public.question_attempts
  where user_id = v_user_id and question_id = p_question_id;

  insert into public.question_attempts (
    id, user_id, question_id, subject_id, subject_name, topic_id, topic_name,
    subtopic, difficulty, selected_answer, is_correct, attempt_number,
    review_mode, session_id, is_adaptive_repeat, answered_at
  ) values (
    coalesce(p_id, gen_random_uuid()), v_user_id, p_question_id,
    coalesce(nullif(btrim(p_subject_id), ''), 'uncategorized'),
    coalesce(nullif(btrim(p_subject_name), ''), 'Uncategorized'),
    coalesce(nullif(btrim(p_topic_id), ''), 'uncategorized'),
    coalesce(nullif(btrim(p_topic_name), ''), 'Uncategorized'),
    coalesce(nullif(btrim(p_subtopic), ''), 'Uncategorized'),
    coalesce(nullif(p_difficulty, ''), 'Unspecified'),
    p_selected_answer, p_is_correct, v_attempt_number,
    coalesce(nullif(p_review_mode, ''), 'reviewer'), p_session_id,
    coalesce(p_is_adaptive_repeat, false), coalesce(p_answered_at, now())
  ) returning * into v_attempt;
  return v_attempt;
end;
$$;

-- Restore the pre-leaderboard activity writer. This legacy signature accepts
-- configured XP amounts and is present only to return to the exact V1 baseline.
create or replace function public.record_study_activity(
  p_event_key text,
  p_activity_date date,
  p_questions integer default 0,
  p_correct integer default 0,
  p_review_count integer default 0,
  p_subject text default null,
  p_xp integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid := auth.uid();
  inserted_event uuid;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if char_length(p_event_key) not between 1 and 180 then raise exception 'Invalid event key'; end if;
  if p_questions < 0 or p_correct < 0 or p_correct > p_questions or p_review_count < 0 then raise exception 'Invalid activity counts'; end if;
  if p_xp not in (0, 5, 10, 20) then raise exception 'Invalid XP award'; end if;

  insert into public.activity_events (user_id, event_key, activity_date)
  values (owner, p_event_key, p_activity_date)
  on conflict (user_id, event_key) do nothing
  returning id into inserted_event;
  if inserted_event is null then return false; end if;

  if p_questions > 0 or p_review_count > 0 then
    insert into public.daily_activity (user_id, activity_date, questions_answered, correct_answers, review_count, subjects_studied)
    values (owner, p_activity_date, p_questions, p_correct, p_review_count, case when p_subject is null then '{}' else array[p_subject] end)
    on conflict (user_id, activity_date) do update set
      questions_answered = daily_activity.questions_answered + excluded.questions_answered,
      correct_answers = daily_activity.correct_answers + excluded.correct_answers,
      review_count = daily_activity.review_count + excluded.review_count,
      subjects_studied = array(select distinct value from unnest(daily_activity.subjects_studied || excluded.subjects_studied) as value),
      updated_at = now();
  end if;

  if p_xp > 0 then
    insert into public.user_progress (user_id, total_xp) values (owner, p_xp)
    on conflict (user_id) do update set total_xp = user_progress.total_xp + excluded.total_xp, updated_at = now();
  end if;
  return true;
end;
$$;

grant select, insert, update, delete on public.question_attempts to authenticated;
grant select, insert, update, delete on public.daily_activity to authenticated;
grant select, insert, update, delete on public.activity_events to authenticated;
grant select, insert, update on public.user_progress to authenticated;
grant select, insert on public.user_achievements to authenticated;

revoke all on function public.record_study_activity(text,date,integer,integer,integer,text,integer) from public, anon;
grant execute on function public.record_study_activity(text,date,integer,integer,integer,text,integer) to authenticated;
revoke all on function public.record_question_attempt(
  uuid, text, text, text, text, text, text, text, smallint, boolean,
  text, uuid, boolean, timestamptz
) from public, anon;
grant execute on function public.record_question_attempt(
  uuid, text, text, text, text, text, text, text, smallint, boolean,
  text, uuid, boolean, timestamptz
) to authenticated;

commit;
