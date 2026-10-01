CREATE OR REPLACE FUNCTION public.record_study_activity(p_event_key text, p_event_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    return false;
  end if;
  if p_event_type is null or p_event_type not in (
    'question_answered', 'study_session_completed', 'ai_review',
    'daily_streak', 'first_ai_message', 'first_exam'
  ) then
    return false;
  end if;

  if p_event_type = 'question_answered' then
    if p_event_key !~ '^answer:[0-9a-fA-F-]{36}$' then
      return false;
    end if;
    v_reference_id := substring(p_event_key from 8)::uuid;
    select * into v_attempt
    from public.question_attempts attempt
    where attempt.id = v_reference_id and attempt.user_id = v_owner;
    if not found then
      -- Referenced question attempt not found (e.g. offline attempt not synced or orphaned event).
      -- Gracefully return false so the client queue moves on without throwing 400 or getting stuck.
      return false;
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
      return false;
    end if;
    v_reference_id := substring(p_event_key from 15)::uuid;
    select max(attempt.answered_at) into v_occurred_at
    from public.question_attempts attempt
    where attempt.user_id = v_owner and attempt.session_id = v_reference_id;
    if v_occurred_at is null then
      return false;
    end if;
    v_xp := 20;
    v_leaderboard_xp := 20;

  elsif p_event_type = 'ai_review' then
    if p_event_key !~ '^ai-review:[0-9a-fA-F-]{36}$' then
      return false;
    end if;
    v_reference_id := substring(p_event_key from 11)::uuid;
    select message.created_at into v_occurred_at
    from public.ai_messages message
    join public.ai_chats chat on chat.id = message.chat_id
    where message.id = v_reference_id
      and message.role = 'user'
      and chat.user_id = v_owner;
    if v_occurred_at is null then
      return false;
    end if;
    v_reviews := 1;

  elsif p_event_type = 'daily_streak' then
    if p_event_key !~ '^xp:daily-streak:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return false;
    end if;
    v_activity_date := substring(p_event_key from 17)::date;
    if not exists (
      select 1 from public.daily_activity activity
      where activity.user_id = v_owner
        and activity.activity_date = v_activity_date
        and (activity.questions_answered > 0 or activity.review_count > 0)
    ) then
      return false;
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
      return false;
    end if;
    v_xp := 10;

  elsif p_event_type = 'first_exam' then
    if p_event_key <> 'xp:first-exam' or not exists (
      select 1 from public.exam_schedule exam where exam.user_id = v_owner
    ) then
      return false;
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
$function$;
