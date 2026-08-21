-- Temporary per-user reinforcement for adaptive reviewer selection.
create table if not exists public.question_reinforcement (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 180),
  reinforcement_level smallint not null default 1 check (reinforcement_level between 1 and 3),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

drop trigger if exists reinforcement_set_updated_at on public.question_reinforcement;
create trigger reinforcement_set_updated_at
before update on public.question_reinforcement
for each row execute function public.set_updated_at();

alter table public.question_reinforcement enable row level security;

create policy "reinforcement_select_own" on public.question_reinforcement
for select to authenticated using ((select auth.uid()) = user_id);
create policy "reinforcement_insert_own" on public.question_reinforcement
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reinforcement_update_own" on public.question_reinforcement
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "reinforcement_delete_own" on public.question_reinforcement
for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.question_reinforcement to authenticated;
revoke all on public.question_reinforcement from anon;
