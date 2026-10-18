-- RevIT Gamified Study Progression System
-- Scalable, idempotent transaction tracking for daily/weekly missions, milestones, and achievements

create table if not exists public.user_xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  amount integer not null check (amount > 0),
  source_type text not null,
  source_id text not null,
  award_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.user_xp_transactions enable row level security;

create policy "Users can view their own XP transactions"
  on public.user_xp_transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own XP transactions"
  on public.user_xp_transactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create index if not exists idx_user_xp_transactions_user_id
  on public.user_xp_transactions (user_id, created_at desc);

-- Function to record mission XP idempotently and increment user_progress
create or replace function public.record_progression_award(
  p_amount integer,
  p_source_type text,
  p_source_id text,
  p_award_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  -- Check idempotency
  if exists (select 1 from public.user_xp_transactions where award_key = p_award_key) then
    return false;
  end if;

  -- Insert transaction
  insert into public.user_xp_transactions (user_id, amount, source_type, source_id, award_key)
  values (v_user_id, p_amount, p_source_type, p_source_id, p_award_key);

  -- Upsert total XP in user_progress
  insert into public.user_progress (user_id, total_xp, updated_at)
  values (v_user_id, p_amount, now())
  on conflict (user_id) do update
  set total_xp = public.user_progress.total_xp + excluded.total_xp,
      updated_at = now();

  return true;
exception
  when unique_violation then
    return false;
end;
$$;

grant execute on function public.record_progression_award(integer, text, text, text) to authenticated;
