-- RevIT Weakness Dashboard
-- Stores authenticated users' question-level attempts. The official question
-- bank remains bundled in the app, so metadata is snapshotted on each attempt.

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 240),
  subject_id text not null default 'uncategorized',
  subject_name text not null default 'Uncategorized',
  topic_id text not null default 'uncategorized',
  topic_name text not null default 'Uncategorized',
  subtopic text not null default 'Uncategorized',
  difficulty text not null default 'Unspecified'
    check (difficulty in ('Easy', 'Medium', 'Hard', 'Unspecified')),
  selected_answer smallint check (selected_answer is null or selected_answer between 0 and 3),
  is_correct boolean not null,
  attempt_number integer not null check (attempt_number > 0),
  review_mode text not null default 'reviewer'
    check (review_mode in ('reviewer', 'adaptive', 'wrong_answers', 'weakness_focus', 'pre_test', 'post_test', 'oral_review')),
  session_id uuid,
  is_adaptive_repeat boolean not null default false,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint question_attempts_user_question_number_key
    unique (user_id, question_id, attempt_number)
);

comment on table public.question_attempts is
  'RLS-protected answer history used for deterministic RevIT weakness analytics.';
comment on column public.question_attempts.is_adaptive_repeat is
  'True when a question was repeated by adaptive, wrong-answer, or focused review behavior.';
comment on column public.question_attempts.attempt_number is
  'Monotonic per-user, per-question number assigned by record_question_attempt.';

create index if not exists question_attempts_user_answered_idx
  on public.question_attempts (user_id, answered_at desc);
create index if not exists question_attempts_user_topic_answered_idx
  on public.question_attempts (user_id, topic_id, answered_at desc);
create index if not exists question_attempts_user_correct_answered_idx
  on public.question_attempts (user_id, is_correct, answered_at desc);

alter table public.question_attempts enable row level security;

drop policy if exists "question_attempts_select_own" on public.question_attempts;
create policy "question_attempts_select_own"
  on public.question_attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "question_attempts_insert_own" on public.question_attempts;
create policy "question_attempts_insert_own"
  on public.question_attempts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "question_attempts_update_own" on public.question_attempts;
create policy "question_attempts_update_own"
  on public.question_attempts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "question_attempts_delete_own" on public.question_attempts;
create policy "question_attempts_delete_own"
  on public.question_attempts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.question_attempts from anon;
grant select, insert, update, delete on public.question_attempts to authenticated;

-- The browser never supplies a user_id. This invoker-rights RPC obtains it from
-- auth.uid(), is still governed by RLS, serializes numbering for one question,
-- and makes retries with the same UUID idempotent.
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
  if found then
    return v_attempt;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_question_id, 0));

  select coalesce(max(attempt_number), 0) + 1
  into v_attempt_number
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
