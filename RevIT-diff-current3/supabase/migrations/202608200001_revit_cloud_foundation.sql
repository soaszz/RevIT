-- RevIT cloud foundation. Run with the Supabase CLI or paste into the SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,24}$'),
  first_name text not null default '' check (char_length(first_name) <= 40),
  avatar_url text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

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

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 180),
  activity_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

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

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Manila' check (char_length(timezone) between 1 and 80),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists grades_set_updated_at on public.grades;
create trigger grades_set_updated_at before update on public.grades for each row execute function public.set_updated_at();
drop trigger if exists daily_activity_set_updated_at on public.daily_activity;
create trigger daily_activity_set_updated_at before update on public.daily_activity for each row execute function public.set_updated_at();
drop trigger if exists exam_schedule_set_updated_at on public.exam_schedule;
create trigger exam_schedule_set_updated_at before update on public.exam_schedule for each row execute function public.set_updated_at();
drop trigger if exists preferences_set_updated_at on public.user_preferences;
create trigger preferences_set_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if requested !~ '^[a-z0-9_]{3,24}$' or exists (select 1 from public.profiles where lower(username) = requested) then
    requested := 'learner_' || substring(new.id::text, 1, 8);
  end if;
  insert into public.profiles (id, username, first_name)
  values (new.id, requested, left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 40))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_username_available(candidate text)
returns boolean language sql stable security definer set search_path = public as $$
  select candidate ~ '^[a-z0-9_]{3,24}$'
    and not exists (select 1 from public.profiles where lower(username) = lower(candidate));
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.record_study_activity(
  p_event_key text,
  p_activity_date date,
  p_questions integer default 0,
  p_correct integer default 0,
  p_review_count integer default 0,
  p_subject text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  owner uuid := auth.uid();
  inserted_event uuid;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if char_length(p_event_key) not between 1 and 180 then raise exception 'Invalid event key'; end if;
  if p_questions < 0 or p_correct < 0 or p_correct > p_questions or p_review_count < 0 then raise exception 'Invalid activity counts'; end if;

  insert into public.activity_events (user_id, event_key, activity_date)
  values (owner, p_event_key, p_activity_date)
  on conflict (user_id, event_key) do nothing
  returning id into inserted_event;
  if inserted_event is null then return false; end if;

  insert into public.daily_activity (user_id, activity_date, questions_answered, correct_answers, review_count, subjects_studied)
  values (owner, p_activity_date, p_questions, p_correct, p_review_count, case when p_subject is null then '{}' else array[p_subject] end)
  on conflict (user_id, activity_date) do update set
    questions_answered = daily_activity.questions_answered + excluded.questions_answered,
    correct_answers = daily_activity.correct_answers + excluded.correct_answers,
    review_count = daily_activity.review_count + excluded.review_count,
    subjects_studied = array(select distinct value from unnest(daily_activity.subjects_studied || excluded.subjects_studied) as value),
    updated_at = now();
  return true;
end;
$$;
revoke all on function public.record_study_activity(text,date,integer,integer,integer,text) from public;
grant execute on function public.record_study_activity(text,date,integer,integer,integer,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.grades enable row level security;
alter table public.daily_activity enable row level security;
alter table public.activity_events enable row level security;
alter table public.exam_schedule enable row level security;
alter table public.user_preferences enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "grades_select_own" on public.grades for select to authenticated using ((select auth.uid()) = user_id);
create policy "grades_insert_own" on public.grades for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "grades_update_own" on public.grades for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "grades_delete_own" on public.grades for delete to authenticated using ((select auth.uid()) = user_id);

create policy "activity_select_own" on public.daily_activity for select to authenticated using ((select auth.uid()) = user_id);
create policy "activity_insert_own" on public.daily_activity for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "activity_update_own" on public.daily_activity for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "activity_delete_own" on public.daily_activity for delete to authenticated using ((select auth.uid()) = user_id);

create policy "events_select_own" on public.activity_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "events_insert_own" on public.activity_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "events_update_own" on public.activity_events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "events_delete_own" on public.activity_events for delete to authenticated using ((select auth.uid()) = user_id);

create policy "exams_select_own" on public.exam_schedule for select to authenticated using ((select auth.uid()) = user_id);
create policy "exams_insert_own" on public.exam_schedule for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "exams_update_own" on public.exam_schedule for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "exams_delete_own" on public.exam_schedule for delete to authenticated using ((select auth.uid()) = user_id);

create policy "preferences_select_own" on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "preferences_insert_own" on public.user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "preferences_update_own" on public.user_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "preferences_delete_own" on public.user_preferences for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles, public.grades, public.daily_activity, public.activity_events, public.exam_schedule, public.user_preferences to authenticated;
revoke all on public.profiles, public.grades, public.daily_activity, public.activity_events, public.exam_schedule, public.user_preferences from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar_public_read" on storage.objects for select to public using (bucket_id = 'avatars');
create policy "avatar_insert_own_folder" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar_update_own_folder" on storage.objects for update to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
