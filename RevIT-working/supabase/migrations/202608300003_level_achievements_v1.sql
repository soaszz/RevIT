-- RevIT Level Up and Achievement System V1.
-- Run with the Supabase CLI or paste this complete file into the SQL editor.

create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  icon text,
  xp_reward integer not null default 0 check (xp_reward >= 0),
  condition_type text not null check (condition_type in ('questions_answered', 'ai_messages', 'streak_days', 'exam_created', 'study_sessions')),
  condition_value integer not null check (condition_value > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

insert into public.achievements (id, name, description, icon, xp_reward, condition_type, condition_value)
values
  ('10000000-0000-4000-8000-000000000001', 'First Steps', 'Answer your first question', '✦', 25, 'questions_answered', 1),
  ('10000000-0000-4000-8000-000000000002', 'AI Explorer', 'Send your first message to RevIT AI', 'AI', 25, 'ai_messages', 1),
  ('10000000-0000-4000-8000-000000000003', 'Question Starter', 'Answer 100 questions', '100', 50, 'questions_answered', 100),
  ('10000000-0000-4000-8000-000000000004', 'Question Master', 'Answer 500 questions', '500', 100, 'questions_answered', 500),
  ('10000000-0000-4000-8000-000000000005', '3 Day Streak', 'Study for 3 consecutive days', '3×', 50, 'streak_days', 3),
  ('10000000-0000-4000-8000-000000000006', '7 Day Streak', 'Study for 7 consecutive days', '7×', 100, 'streak_days', 7),
  ('10000000-0000-4000-8000-000000000007', 'First Exam', 'Add your first exam to the schedule', 'E', 25, 'exam_created', 1),
  ('10000000-0000-4000-8000-000000000008', 'Consistent Learner', 'Complete 10 study sessions', '10', 100, 'study_sessions', 10)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  xp_reward = excluded.xp_reward,
  condition_type = excluded.condition_type,
  condition_value = excluded.condition_value;

create or replace function public.handle_new_user_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_progress (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_progress_created on auth.users;
create trigger on_auth_user_progress_created
after insert on auth.users
for each row execute function public.handle_new_user_progress();

-- Backfill the required zero-XP row for accounts created before this migration.
insert into public.user_progress (user_id)
select id from auth.users
on conflict (user_id) do nothing;

drop trigger if exists user_progress_set_updated_at on public.user_progress;
create trigger user_progress_set_updated_at
before update on public.user_progress
for each row execute function public.set_updated_at();

alter table public.user_progress enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

drop policy if exists "user_progress_select_own" on public.user_progress;
create policy "user_progress_select_own" on public.user_progress
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "user_progress_insert_own" on public.user_progress;
create policy "user_progress_insert_own" on public.user_progress
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "user_progress_update_own" on public.user_progress;
create policy "user_progress_update_own" on public.user_progress
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "achievements_public_read" on public.achievements;
create policy "achievements_public_read" on public.achievements
for select to anon, authenticated using (true);

drop policy if exists "user_achievements_select_own" on public.user_achievements;
create policy "user_achievements_select_own" on public.user_achievements
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "user_achievements_insert_own" on public.user_achievements;
create policy "user_achievements_insert_own" on public.user_achievements
for insert to authenticated with check ((select auth.uid()) = user_id);

grant select on public.achievements to anon, authenticated;
revoke insert, update, delete on public.achievements from anon, authenticated;
grant select, insert, update on public.user_progress to authenticated;
grant select, insert on public.user_achievements to authenticated;
revoke all on public.user_progress, public.user_achievements from anon;

-- Extend the existing idempotent activity event writer so the same event ledger
-- also protects XP awards from retries. Calls without p_xp remain compatible.
drop function if exists public.record_study_activity(text,date,integer,integer,integer,text);
create or replace function public.record_study_activity(
  p_event_key text,
  p_activity_date date,
  p_questions integer default 0,
  p_correct integer default 0,
  p_review_count integer default 0,
  p_subject text default null,
  p_xp integer default 0
) returns boolean language plpgsql security definer set search_path = public as $$
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
    insert into public.user_progress (user_id, total_xp)
    values (owner, p_xp)
    on conflict (user_id) do update set total_xp = user_progress.total_xp + excluded.total_xp, updated_at = now();
  end if;
  return true;
end;
$$;
revoke all on function public.record_study_activity(text,date,integer,integer,integer,text,integer) from public;
grant execute on function public.record_study_activity(text,date,integer,integer,integer,text,integer) to authenticated;

create or replace function public.check_and_unlock_achievements()
returns setof public.achievements language plpgsql security definer set search_path = public as $$
declare
  owner uuid := auth.uid();
  questions_total integer := 0;
  ai_total integer := 0;
  exam_total integer := 0;
  session_total integer := 0;
  longest_streak integer := 0;
  unlocked_ids uuid[] := '{}';
  reward_total integer := 0;
begin
  if owner is null then raise exception 'Authentication required'; end if;

  insert into public.user_progress (user_id) values (owner) on conflict (user_id) do nothing;

  select coalesce(sum(questions_answered), 0)::integer, coalesce(sum(review_count), 0)::integer
  into questions_total, ai_total
  from public.daily_activity
  where user_id = owner;

  select count(*)::integer into exam_total from public.exam_schedule where user_id = owner;
  select count(*)::integer into session_total from public.activity_events where user_id = owner and event_key like 'study-session:%';

  select coalesce(max(run_length), 0)::integer into longest_streak
  from (
    select count(*)::integer as run_length
    from (
      select activity_date, activity_date - (row_number() over (order by activity_date))::integer as streak_group
      from public.daily_activity
      where user_id = owner and (questions_answered > 0 or review_count > 0)
    ) meaningful_days
    group by streak_group
  ) streak_runs;

  with eligible as (
    select achievement.id
    from public.achievements achievement
    where case achievement.condition_type
      when 'questions_answered' then questions_total >= achievement.condition_value
      when 'ai_messages' then ai_total >= achievement.condition_value
      when 'streak_days' then longest_streak >= achievement.condition_value
      when 'exam_created' then exam_total >= achievement.condition_value
      when 'study_sessions' then session_total >= achievement.condition_value
      else false
    end
  ), inserted as (
    insert into public.user_achievements (user_id, achievement_id)
    select owner, eligible.id from eligible
    on conflict (user_id, achievement_id) do nothing
    returning achievement_id
  )
  select coalesce(array_agg(inserted.achievement_id), '{}'), coalesce(sum(achievement.xp_reward), 0)::integer
  into unlocked_ids, reward_total
  from inserted
  join public.achievements achievement on achievement.id = inserted.achievement_id;

  if reward_total > 0 then
    update public.user_progress
    set total_xp = total_xp + reward_total, updated_at = now()
    where user_id = owner;
  end if;

  return query
  select achievement.*
  from public.achievements achievement
  where achievement.id = any(unlocked_ids)
  order by achievement.condition_value, achievement.created_at;
end;
$$;
revoke all on function public.check_and_unlock_achievements() from public;
grant execute on function public.check_and_unlock_achievements() to authenticated;
