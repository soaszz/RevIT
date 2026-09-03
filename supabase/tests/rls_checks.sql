-- Run in a disposable Supabase project after the migration.
-- This script proves the central ownership policy shape for two identities.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'rls-one@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'rls-two@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.accept_current_legal_terms('2026-09-03', '2026-09-03');
do $$ begin
  if not exists (
    select 1 from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'
      and terms_version = '2026-09-03'
      and terms_accepted_at is not null
      and privacy_version = '2026-09-03'
      and privacy_accepted_at is not null
  ) then
    raise exception 'Consent persistence failure: current versions or timestamps were not stored';
  end if;
end $$;
insert into public.grades (user_id, subject, pre_test) values ('11111111-1111-1111-1111-111111111111', 'Hematology', 45);
insert into public.question_reinforcement (user_id, question_id, reinforcement_level)
values ('11111111-1111-1111-1111-111111111111', 'clinical-chemistry-instrumentation-001', 1);
insert into public.ai_chats (id, user_id, title)
values ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Gram staining explanation');
insert into public.ai_messages (chat_id, role, content)
values ('aaaaaaaa-1111-1111-1111-111111111111', 'user', 'Explain Gram staining');
select public.record_question_attempt(
  'bbbbbbbb-1111-1111-1111-111111111111',
  'bacteriology-gram-stain-001', 'bacteriology', 'Bacteriology',
  'gram-staining', 'Gram staining', 'Staining principle', 'Medium',
  1, false, 'reviewer', 'cccccccc-1111-1111-1111-111111111111', false, now() - interval '1 minute'
);
select public.record_study_activity('answer:bbbbbbbb-1111-1111-1111-111111111111', 'question_answered');

-- Nine same-day correct retries remain available to learning analytics but the
-- first wrong attempt is the only Questions/Accuracy/answer-XP leaderboard row.
do $$
declare
  retry_id uuid;
begin
  for attempt_index in 1..9 loop
    retry_id := gen_random_uuid();
    perform public.record_question_attempt(
      retry_id,
      'bacteriology-gram-stain-001', 'bacteriology', 'Bacteriology',
      'gram-staining', 'Gram staining', 'Staining principle', 'Medium',
      1, true, 'adaptive', 'cccccccc-1111-1111-1111-111111111111', true,
      now() + (attempt_index || ' milliseconds')::interval
    );
    perform public.record_study_activity('answer:' || retry_id::text, 'question_answered');
  end loop;
end;
$$;

select public.record_study_activity(
  'xp:daily-streak:' || (now() at time zone 'Asia/Manila')::date::text,
  'daily_streak'
);

do $$
declare
  question_position record;
  accuracy_position record;
  xp_position record;
  duplicate_result boolean;
begin
  select * into question_position
  from public.get_current_user_leaderboard_position('daily', 'questions', 'bacteriology');
  if question_position.answered_count <> 1 or question_position.metric_value <> 1 then
    raise exception 'Leaderboard anti-farming failure: ten same-question attempts must count once';
  end if;

  select * into accuracy_position
  from public.get_current_user_leaderboard_position('daily', 'accuracy', 'bacteriology');
  if accuracy_position.answered_count <> 1
    or accuracy_position.metric_value <> 0
    or accuracy_position.minimum_required <> 20
    or accuracy_position.questions_needed <> 19 then
    raise exception 'Leaderboard accuracy failure: the first wrong answer must remain authoritative';
  end if;

  select * into xp_position
  from public.get_current_user_leaderboard_position('daily', 'study_xp', null);
  if xp_position.metric_value <> 10 then
    raise exception 'Leaderboard XP failure: repeated correct retries must not add answer XP';
  end if;

  select public.record_study_activity(
    'xp:daily-streak:' || (now() at time zone 'Asia/Manila')::date::text,
    'daily_streak'
  ) into duplicate_result;
  if duplicate_result then
    raise exception 'XP idempotency failure: a duplicate event was inserted twice';
  end if;
end;
$$;

select * from public.check_and_unlock_achievements();
update public.user_preferences set leaderboard_opt_in = true
where user_id = '11111111-1111-1111-1111-111111111111';

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.grades where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one grade';
  end if;
  if exists (select 1 from public.question_reinforcement where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one reinforcement state';
  end if;
  if exists (select 1 from public.ai_chats where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one AI chat';
  end if;
  if exists (select 1 from public.ai_messages where chat_id = 'aaaaaaaa-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see messages from user one AI chat';
  end if;
  if exists (select 1 from public.question_attempts where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one question attempts';
  end if;
  if exists (select 1 from public.user_progress where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one XP';
  end if;
  if exists (select 1 from public.user_achievements where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one achievements';
  end if;
  if exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one profile or consent';
  end if;
  if (select count(*) from public.achievements) <> 8 then
    raise exception 'RLS failure: public achievement definitions are not readable';
  end if;
  if (select count(*) from public.get_leaderboard('daily', 'questions', null, 50, 0)) <> 1 then
    raise exception 'Leaderboard failure: exactly one opted-in learner should be visible';
  end if;
  if (select count(*) from public.get_leaderboard('daily', 'accuracy', null, 50, 0)) <> 0 then
    raise exception 'Leaderboard failure: 1/1 accuracy must not qualify for the Daily ranking';
  end if;
  if (select opted_in from public.get_current_user_leaderboard_position('daily', 'questions', null)) then
    raise exception 'Leaderboard failure: user two should remain opted out by default';
  end if;
end $$;

do $$ begin
  update public.profiles
  set terms_version = '2099-01-01'
  where id = '11111111-1111-1111-1111-111111111111';
  if found then
    raise exception 'RLS failure: user two updated user one consent';
  end if;
end $$;

do $$ begin
  begin
    insert into public.question_attempts (
      user_id, question_id, subject_id, subject_name, topic_id, topic_name,
      subtopic, difficulty, selected_answer, is_correct, attempt_number
    ) values (
      '11111111-1111-1111-1111-111111111111', 'forged-question', 'bacteriology',
      'Bacteriology', 'gram-staining', 'Gram staining', 'Uncategorized',
      'Unspecified', 0, true, 1
    );
    raise exception 'RLS failure: user two inserted a question attempt for user one';
  exception
    when insufficient_privilege then null;
  end;
end $$;

do $$ begin
  begin
    insert into public.ai_messages (chat_id, role, content)
    values ('aaaaaaaa-1111-1111-1111-111111111111', 'user', 'Unauthorized message');
    raise exception 'RLS failure: user two inserted into user one AI chat';
  exception
    when insufficient_privilege then null;
  end;
end $$;

rollback;
