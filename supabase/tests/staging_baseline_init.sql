-- RevIT Staging Baseline Schema Initialization Script
-- Derived faithfully from historical migrations 0001 through 0022.
-- Specifically prepared for empty, isolated staging project 'revit-staging' (qnepjfcbzsycmesrcbjb).
--
-- Traceability Matrix:
--   - 202608200001: profiles, grades, daily_activity, activity_events, exam_schedule, user_preferences, RLS
--   - 202608210002: question_reinforcement
--   - 202608270003: ai_chats, ai_messages
--   - 202608280004: question_attempts, indexes, initial RLS
--   - 202608300005: user_progress, achievements (1-8), user_achievements, check_and_unlock_achievements
--   - 202609030006: Leaderboards V1, leaderboard_opt_in, activity_events XP columns, leaderboard helper functions,
--                   record_question_attempt (authenticated RPC), direct attempt write revokes
--   - 202609030007: Terms & Privacy consent columns, accept_current_legal_terms RPC
--   - 202609060009: MTAP personalization columns on user_preferences
--   - 202609250011: Book edition recognition column on question_attempts, 4-arg leaderboard_metric_rows
--   - 202610020014: Additional achievements (9-12)
--   - 202610020015: Clamp attempt future timestamp validation
--   - 202610040017: Question attempt metadata reconciliation in record_question_attempt
--   - 202610040018: Strict check constraints on question_attempts.selected_answer (0-3 or NULL)
--   - 202610050019: Free / Pro entitlement columns and protection trigger on profiles
--   - 202610110022: Rodak book edition support in set_question_attempt_book and record_question_attempt
--
-- This script contains ZERO destructive statements (no DROP TABLE, no DROP TRIGGER, no DROP FUNCTION).

begin;

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
create extension if not exists pgcrypto;

-- ============================================================================
-- 2. CORE TABLES (0001, 0004, 0005, 0006, 0007, 0009, 0011, 0019)
-- ============================================================================

-- 2.1 Profiles (0001, 0007, 0019)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,24}$'),
  first_name text not null default '' check (char_length(first_name) <= 40),
  avatar_url text,
  onboarding_complete boolean not null default false,
  terms_accepted_at timestamptz,
  terms_version text,
  privacy_accepted_at timestamptz,
  privacy_version text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  pro_started_at timestamptz null,
  pro_expires_at timestamptz null,
  pro_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- 2.2 User Preferences (0001, 0006, 0009)
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Manila' check (char_length(timezone) between 1 and 80),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  leaderboard_opt_in boolean not null default false,
  mtap_features_enabled boolean not null default false,
  mtap_onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.3 Grades (0001)
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (subject in ('Hematology', 'Clinical Chemistry', 'Bacteriology', 'AUBF')),
  pre_test numeric(6,2) check (pre_test between 0 and 50),
  post_test numeric(6,2) check (post_test between 0 and 70),
  comprehensive numeric(6,2) check (comprehensive between 0 and 100),
  written_revalida numeric(6,2) check (written_revalida between 0 and 100),
  oral_revalida numeric(6,2) check (oral_revalida between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject)
);

-- 2.4 Daily Activity (0001)
create table if not exists public.daily_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  questions_answered integer not null default 0 check (questions_answered >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0 and correct_answers <= questions_answered),
  review_count integer not null default 0 check (review_count >= 0),
  subjects_studied text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_date)
);

-- 2.5 Activity Events (0001, 0006)
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 180),
  activity_date date not null default (now() at time zone 'Asia/Manila')::date,
  event_type text,
  subject_id text,
  subject_name text,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  leaderboard_xp integer not null default 0 check (leaderboard_xp >= 0 and leaderboard_xp <= xp_awarded),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

-- 2.6 Exam Schedule (0001)
create table if not exists public.exam_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (subject in ('Hematology', 'Clinical Chemistry', 'Bacteriology', 'AUBF')),
  assessment_type text not null check (assessment_type in ('Pre-Test', 'Post-Test', 'Comprehensive Exam', 'Written Revalida', 'Oral Revalida')),
  scheduled_date date not null,
  note text check (char_length(note) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject, assessment_type)
);

-- 2.7 Question Reinforcement (0002)
create table if not exists public.question_reinforcement (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 240),
  reinforcement_level integer not null default 1 check (reinforcement_level between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

-- 2.8 AI Chats & Messages (0003, 0008)
create table if not exists public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.ai_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 16000),
  created_at timestamptz not null default now()
);

-- 2.9 User Progress (0005)
create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- 2.10 Achievements (0005, 0014)
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

-- 2.11 Question Attempts (0004, 0006, 0011, 0015, 0018)
create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 240),
  subject_id text not null default 'uncategorized',
  subject_name text not null default 'Uncategorized',
  topic_id text not null default 'uncategorized',
  topic_name text not null default 'Uncategorized',
  subtopic text not null default 'Uncategorized',
  difficulty text not null default 'Unspecified' check (difficulty in ('Easy', 'Medium', 'Hard', 'Unspecified')),
  selected_answer smallint check (selected_answer is null or selected_answer between 0 and 3),
  is_correct boolean not null,
  attempt_number integer not null check (attempt_number > 0),
  review_mode text not null default 'reviewer' check (review_mode in ('reviewer', 'adaptive', 'wrong_answers', 'weakness_focus', 'pre_test', 'post_test', 'oral_review')),
  session_id uuid,
  is_adaptive_repeat boolean not null default false,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  book text not null default 'Harr',
  constraint question_attempts_user_question_number_key unique (user_id, question_id, attempt_number)
);

-- ============================================================================
-- 3. INDEXES (0001, 0004, 0006, 0016)
-- ============================================================================
create index if not exists question_attempts_user_answered_idx on public.question_attempts (user_id, answered_at desc);
create index if not exists question_attempts_user_topic_answered_idx on public.question_attempts (user_id, topic_id, answered_at desc);
create index if not exists question_attempts_user_correct_answered_idx on public.question_attempts (user_id, is_correct, answered_at desc);
create index if not exists question_attempts_leaderboard_period_idx on public.question_attempts (answered_at, user_id, question_id);
create index if not exists question_attempts_leaderboard_subject_period_idx on public.question_attempts (subject_id, answered_at, user_id, question_id);
create index if not exists activity_events_leaderboard_xp_period_idx on public.activity_events (occurred_at, user_id) where leaderboard_xp > 0;
create index if not exists activity_events_leaderboard_xp_subject_period_idx on public.activity_events (subject_id, occurred_at, user_id) where leaderboard_xp > 0 and subject_id is not null;

-- ============================================================================
-- 4. SEED ACHIEVEMENTS (0005, 0014)
-- ============================================================================
insert into public.achievements (id, name, description, icon, xp_reward, condition_type, condition_value)
values
  ('10000000-0000-4000-8000-000000000001', 'First Steps', 'Answer your first question', '✦', 25, 'questions_answered', 1),
  ('10000000-0000-4000-8000-000000000002', 'AI Explorer', 'Send your first message to RevIT AI', 'AI', 25, 'ai_messages', 1),
  ('10000000-0000-4000-8000-000000000003', 'Question Starter', 'Answer 100 questions', '100', 50, 'questions_answered', 100),
  ('10000000-0000-4000-8000-000000000004', 'Question Master', 'Answer 500 questions', '500', 100, 'questions_answered', 500),
  ('10000000-0000-4000-8000-000000000005', '3 Day Streak', 'Study for 3 consecutive days', '3×', 50, 'streak_days', 3),
  ('10000000-0000-4000-8000-000000000006', '7 Day Streak', 'Study for 7 consecutive days', '7×', 100, 'streak_days', 7),
  ('10000000-0000-4000-8000-000000000007', 'First Exam', 'Add your first exam to the schedule', 'E', 25, 'exam_created', 1),
  ('10000000-0000-4000-8000-000000000008', 'Consistent Learner', 'Complete 10 study sessions', '10', 100, 'study_sessions', 10),
  ('10000000-0000-4000-8000-000000000009', 'AI Study Partner', 'Talk to RevIT AI 5 times', 'AI5', 50, 'ai_messages', 5),
  ('10000000-0000-4000-8000-000000000010', 'Question Builder', 'Answer 250 questions', '250', 75, 'questions_answered', 250),
  ('10000000-0000-4000-8000-000000000011', 'Dedicated Learner', 'Complete 25 study sessions', '25', 150, 'study_sessions', 25),
  ('10000000-0000-4000-8000-000000000012', '14 Day Streak', 'Study for 14 consecutive days', '14×', 150, 'streak_days', 14)
on conflict (id) do nothing;

-- ============================================================================
-- 5. TRIGGER FUNCTIONS (0001, 0005, 0011, 0019, 0022)
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  requested text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  accepted_terms_version text := nullif(btrim(new.raw_user_meta_data ->> 'terms_version'), '');
  accepted_privacy_version text := nullif(btrim(new.raw_user_meta_data ->> 'privacy_version'), '');
  accepted_at timestamptz;
begin
  if requested !~ '^[a-z0-9_]{3,24}$' or exists (select 1 from public.profiles where lower(username) = requested) then
    requested := 'learner_' || substring(new.id::text, 1, 8);
  end if;

  if accepted_terms_version is null or accepted_privacy_version is null
    or accepted_terms_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or accepted_privacy_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    accepted_terms_version := null;
    accepted_privacy_version := null;
  else
    accepted_at := statement_timestamp();
  end if;

  insert into public.profiles (id, username, first_name, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version)
  values (new.id, requested, left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 40), accepted_at, accepted_terms_version, accepted_at, accepted_privacy_version)
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_progress (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_subscription_fields()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan <> 'free' or new.pro_started_at is not null or new.pro_expires_at is not null or new.pro_note is not null then
      raise exception 'Subscription fields are administrator-managed.' using errcode = '42501';
    end if;
  elsif new.plan is distinct from old.plan
    or new.pro_started_at is distinct from old.pro_started_at
    or new.pro_expires_at is distinct from old.pro_expires_at
    or new.pro_note is distinct from old.pro_note then
    raise exception 'Subscription fields are administrator-managed.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 5.4 set_question_attempt_book (Migration 0022 Rodak version)
create or replace function public.set_question_attempt_book()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.book is null or new.book = '' or (new.book = 'Harr' and (new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%' or new.question_id like 'rodak-%' or new.subject_id like 'rodak-%' or new.topic_id like 'rodak-%')) then
    new.book := case
      when new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%' then 'Ciulla'
      when new.question_id like 'rodak-%' or new.subject_id like 'rodak-%' or new.topic_id like 'rodak-%' then 'Rodak'
      else coalesce(nullif(new.book, ''), 'Harr')
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.set_question_attempt_book() from public, anon, authenticated;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================
create trigger profiles_protect_subscription_fields before insert or update on public.profiles for each row execute function public.protect_profile_subscription_fields();
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger trg_set_question_attempt_book before insert on public.question_attempts for each row execute function public.set_question_attempt_book();

-- ============================================================================
-- 7. APPLICATION & LEADERBOARD FUNCTIONS (0001, 0005, 0006, 0007, 0011, 0015, 0017, 0022)
-- ============================================================================

-- 7.1 Leaderboard helpers (0006)
create or replace function public.leaderboard_timezone()
returns text language sql immutable set search_path = pg_catalog as $$
  select 'Asia/Manila'::text;
$$;

create or replace function public.leaderboard_accuracy_minimum(p_period text)
returns integer language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_period = 'daily' then return 20; end if;
  if p_period = 'weekly' then return 75; end if;
  if p_period = 'all_time' then return 200; end if;
  raise exception 'Invalid leaderboard period.' using errcode = '22023';
end;
$$;

create or replace function public.leaderboard_period_start(p_period text)
returns timestamptz language plpgsql stable set search_path = pg_catalog, public as $$
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

-- 7.2 leaderboard_metric_rows 3-arg overload (0006)
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
begin
  return query select * from public.leaderboard_metric_rows(p_period, p_metric, p_subject_id, null);
end;
$$;

-- 7.3 leaderboard_metric_rows 4-arg overload (0022 Rodak version)
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
              when attempt.question_id like 'rodak-%' or attempt.subject_id like 'rodak-%' or attempt.topic_id like 'rodak-%' then 'Rodak'
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
          when p_book = 'Rodak' then event.subject_id like 'rodak-%'
          when p_book = 'Harr' then not (event.subject_id like 'ciulla-%' or event.subject_id like 'rodak-%')
          else event.subject_id like lower(p_book) || '-%'
        end
      )
    group by event.user_id;
  end if;
end;
$$;

-- 7.4 get_leaderboard (0006)
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
  if p_offset < 0 then
    raise exception 'Leaderboard offset cannot be negative.' using errcode = '22023';
  end if;
  v_minimum := public.leaderboard_accuracy_minimum(p_period);

  return query
  with metric_rows as (
    select * from public.leaderboard_metric_rows(p_period, p_metric, p_subject_id)
  ), eligible as (
    select
      stats.participant_id,
      stats.metric_value,
      stats.answered_count,
      coalesce(nullif(btrim(profile.first_name), ''), profile.username, 'RevIT learner') as display_name,
      profile.avatar_url
    from metric_rows stats
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
      row_number() over (order by eligible.metric_value desc, eligible.answered_count desc, eligible.participant_id) as rank,
      eligible.display_name,
      eligible.avatar_url,
      eligible.metric_value,
      eligible.answered_count,
      eligible.participant_id = v_owner as is_current_user,
      public.leaderboard_timezone() as period_timezone
    from eligible
  )
  select * from ranked order by ranked.rank limit p_limit offset p_offset;
end;
$$;

-- 7.5 get_current_user_leaderboard_position (0006)
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
  is_eligible boolean,
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
      when evaluated.opted_in and evaluated.is_eligible and coalesce(participant_total.total, 0) > 0 then
        greatest(1, round(((participant_total.total - ranked.position + 1)::numeric / participant_total.total::numeric) * 100)::integer)
      else null
    end as percentile,
    coalesce(participant_total.total, 0) as participant_count,
    public.leaderboard_timezone() as period_timezone
  from evaluated
  left join ranked on ranked.participant_id = v_owner
  cross join participant_total;
end;
$$;

-- 7.6 record_question_attempt (Migration 0022 Rodak version)
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
    when p_question_id like 'rodak-%' or p_subject_id like 'rodak-%' or p_topic_id like 'rodak-%' then 'Rodak'
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

-- 7.7 record_study_activity (0006)
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
    raise exception 'Invalid event type.' using errcode = '22023';
  end if;

  if p_event_type = 'question_answered' then
    if p_event_key not like 'answer:%' then
      raise exception 'Malformed answer event key.' using errcode = '22023';
    end if;
    v_reference_id := substring(p_event_key from 8)::uuid;
    select * into v_attempt
    from public.question_attempts
    where id = v_reference_id and user_id = v_owner;
    if not found then
      raise exception 'Referenced question attempt not found.' using errcode = '22023';
    end if;
    v_activity_date := (v_attempt.answered_at at time zone public.leaderboard_timezone())::date;
    v_occurred_at := v_attempt.answered_at;
    v_questions := 1;
    v_correct := case when v_attempt.is_correct then 1 else 0 end;
    v_subject_id := v_attempt.subject_id;
    v_subject_name := v_attempt.subject_name;
    v_xp := case when v_attempt.is_correct then 5 else 0 end;
    if v_attempt.is_correct and not exists (
      select 1 from public.question_attempts prior
      where prior.user_id = v_owner
        and prior.question_id = v_attempt.question_id
        and (prior.answered_at at time zone public.leaderboard_timezone())::date = v_activity_date
        and (prior.answered_at < v_attempt.answered_at or (prior.answered_at = v_attempt.answered_at and prior.id < v_attempt.id))
    ) then
      v_leaderboard_xp := 5;
    else
      v_leaderboard_xp := 0;
    end if;
  elsif p_event_type = 'daily_streak' then
    v_activity_date := (now() at time zone public.leaderboard_timezone())::date;
    v_xp := 10;
    v_leaderboard_xp := 10;
  elsif p_event_type = 'study_session_completed' then
    v_activity_date := (now() at time zone public.leaderboard_timezone())::date;
    v_reviews := 1;
    v_xp := 20;
    v_leaderboard_xp := 20;
  else
    v_activity_date := (now() at time zone public.leaderboard_timezone())::date;
    v_xp := 10;
    v_leaderboard_xp := 0;
  end if;

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
      user_id, activity_date, questions_answered, correct_answers, review_count, subjects_studied
    ) values (
      v_owner, v_activity_date, v_questions, v_correct, v_reviews,
      case when v_subject_name is null then '{}' else array[v_subject_name] end
    )
    on conflict (user_id, activity_date) do update set
      questions_answered = daily_activity.questions_answered + excluded.questions_answered,
      correct_answers = daily_activity.correct_answers + excluded.correct_answers,
      review_count = daily_activity.review_count + excluded.review_count,
      subjects_studied = array(select distinct value from unnest(daily_activity.subjects_studied || excluded.subjects_studied) as value),
      updated_at = now();
  end if;

  if v_xp > 0 then
    insert into public.user_progress (user_id, total_xp) values (v_owner, v_xp)
    on conflict (user_id) do update set total_xp = user_progress.total_xp + excluded.total_xp, updated_at = now();
  end if;

  return true;
end;
$$;

-- 7.8 accept_current_legal_terms (0007)
create or replace function public.accept_current_legal_terms(
  p_terms_version text,
  p_privacy_version text
)
returns public.profiles
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  owner uuid := auth.uid();
  accepted_profile public.profiles;
  accepted_at timestamptz := statement_timestamp();
begin
  if owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_terms_version is null or p_privacy_version is null
    or p_terms_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_privacy_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid legal document version.' using errcode = '22023';
  end if;

  update public.profiles as profile
  set terms_accepted_at = accepted_at,
      terms_version = p_terms_version,
      privacy_accepted_at = accepted_at,
      privacy_version = p_privacy_version
  where profile.id = owner
  returning profile.* into accepted_profile;

  if accepted_profile.id is null then
    raise exception 'The authenticated profile was not found.' using errcode = 'P0002';
  end if;
  return accepted_profile;
end;
$$;

-- 7.9 check_and_unlock_achievements (0005)
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
  into questions_total, ai_total from public.daily_activity where user_id = owner;
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
    select achievement.id from public.achievements achievement
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
  from inserted join public.achievements achievement on achievement.id = inserted.achievement_id;

  if reward_total > 0 then
    update public.user_progress set total_xp = total_xp + reward_total, updated_at = now() where user_id = owner;
  end if;

  return query select achievement.* from public.achievements achievement where achievement.id = any(unlocked_ids) order by achievement.condition_value, achievement.created_at;
end;
$$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY (0001, 0002, 0003, 0004, 0005, 0006)
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.grades enable row level security;
alter table public.daily_activity enable row level security;
alter table public.activity_events enable row level security;
alter table public.exam_schedule enable row level security;
alter table public.user_preferences enable row level security;
alter table public.question_reinforcement enable row level security;
alter table public.ai_chats enable row level security;
alter table public.ai_messages enable row level security;
alter table public.question_attempts enable row level security;
alter table public.user_progress enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

-- Profiles policies
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Grades policies
create policy "grades_select_own" on public.grades for select to authenticated using ((select auth.uid()) = user_id);
create policy "grades_insert_own" on public.grades for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "grades_update_own" on public.grades for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Daily activity policies
create policy "activity_select_own" on public.daily_activity for select to authenticated using ((select auth.uid()) = user_id);

-- Activity events policies
create policy "events_select_own" on public.activity_events for select to authenticated using ((select auth.uid()) = user_id);

-- Exam schedule policies
create policy "exams_select_own" on public.exam_schedule for select to authenticated using ((select auth.uid()) = user_id);
create policy "exams_insert_own" on public.exam_schedule for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "exams_update_own" on public.exam_schedule for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- User preferences policies
create policy "preferences_select_own" on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "preferences_insert_own" on public.user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "preferences_update_own" on public.user_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Question reinforcement policies
create policy "reinforcement_select_own" on public.question_reinforcement for select to authenticated using ((select auth.uid()) = user_id);
create policy "reinforcement_insert_own" on public.question_reinforcement for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reinforcement_update_own" on public.question_reinforcement for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- AI chats & messages policies
create policy "ai_chats_select_own" on public.ai_chats for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_chats_insert_own" on public.ai_chats for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_chats_update_own" on public.ai_chats for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "ai_messages_select_own" on public.ai_messages for select to authenticated using (
  exists (select 1 from public.ai_chats where ai_chats.id = ai_messages.chat_id and ai_chats.user_id = (select auth.uid()))
);
create policy "ai_messages_insert_own" on public.ai_messages for insert to authenticated with check (
  exists (select 1 from public.ai_chats where ai_chats.id = ai_messages.chat_id and ai_chats.user_id = (select auth.uid()))
);

-- Question attempts policies (0004 own select)
create policy "question_attempts_select_own" on public.question_attempts for select to authenticated using ((select auth.uid()) = user_id);

-- User progress policies (0005 own select)
create policy "user_progress_select_own" on public.user_progress for select to authenticated using ((select auth.uid()) = user_id);

-- Achievements policies (0005 public read)
create policy "achievements_public_read" on public.achievements for select to authenticated using (true);
create policy "user_achievements_select_own" on public.user_achievements for select to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- 9. PRIVILEGES & FUNCTION ACCESS (0001, 0005, 0006, 0007, 0019, 0022)
-- ============================================================================

-- Restrict direct mutations to authoritative tables (0006)
revoke all on public.question_attempts from public, anon, authenticated;
grant select on public.question_attempts to authenticated;

revoke all on public.daily_activity from public, anon, authenticated;
grant select on public.daily_activity to authenticated;

revoke all on public.activity_events from public, anon, authenticated;
grant select on public.activity_events to authenticated;

revoke all on public.user_progress from public, anon, authenticated;
grant select on public.user_progress to authenticated;

revoke all on public.user_achievements from public, anon, authenticated;
grant select on public.user_achievements to authenticated;

grant select on public.achievements to authenticated;

-- Table grants for user-managed data
grant select, insert, update on public.grades, public.exam_schedule, public.user_preferences, public.question_reinforcement, public.ai_chats, public.ai_messages to authenticated;

-- Named column grants on profiles (0019)
revoke all on public.profiles from public, anon, authenticated;
grant select (id, username, first_name, avatar_url, onboarding_complete, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, plan, pro_started_at, pro_expires_at, created_at, updated_at) on public.profiles to authenticated;
grant insert (id, username, first_name, avatar_url, onboarding_complete, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version) on public.profiles to authenticated;
grant update (username, first_name, avatar_url, onboarding_complete, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version) on public.profiles to authenticated;

-- Function execution grants
revoke all on function public.record_question_attempt(uuid, text, text, text, text, text, text, text, smallint, boolean, text, uuid, boolean, timestamptz) from public, anon;
grant execute on function public.record_question_attempt(uuid, text, text, text, text, text, text, text, smallint, boolean, text, uuid, boolean, timestamptz) to authenticated;

revoke all on function public.record_study_activity(text, text) from public, anon;
grant execute on function public.record_study_activity(text, text) to authenticated;

revoke all on function public.accept_current_legal_terms(text, text) from public, anon;
grant execute on function public.accept_current_legal_terms(text, text) to authenticated;

revoke all on function public.check_and_unlock_achievements() from public, anon;
grant execute on function public.check_and_unlock_achievements() to authenticated;

revoke all on function public.get_leaderboard(text, text, text, integer, integer) from public, anon;
grant execute on function public.get_leaderboard(text, text, text, integer, integer) to authenticated;

revoke all on function public.get_current_user_leaderboard_position(text, text, text) from public, anon;
grant execute on function public.get_current_user_leaderboard_position(text, text, text) to authenticated;

-- Leaderboard internal calculation functions (revoked from authenticated API access)
revoke all on function public.leaderboard_metric_rows(text, text, text) from public, anon, authenticated;
-- Note: Migration 22 left 4-arg leaderboard_metric_rows granted to authenticated in production, which Migration 24 will revoke.
grant execute on function public.leaderboard_metric_rows(text, text, text, text) to authenticated;

revoke all on function public.leaderboard_timezone() from public, anon, authenticated;
revoke all on function public.leaderboard_accuracy_minimum(text) from public, anon, authenticated;
revoke all on function public.leaderboard_period_start(text) from public, anon, authenticated;

commit;
