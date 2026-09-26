-- Rollback: 202609250011_leaderboards_book_edition_rollback.sql
-- Restores leaderboard functions and question_attempts triggers to pre-book-edition state.
-- Data Safety Guarantee: Does not drop user attempts or delete learner accounts.

-- 1. Drop book auto-tagging trigger and function
drop trigger if exists trg_set_question_attempt_book on public.question_attempts;
drop function if exists public.set_question_attempt_book();

-- 2. Restore record_question_attempt to 202609030006 version
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

-- 3. Restore get_community_leaderboard_v1 and leaderboard_metric_rows without p_book
-- (Keeps basic leaderboard aggregation functional without book filtering)
