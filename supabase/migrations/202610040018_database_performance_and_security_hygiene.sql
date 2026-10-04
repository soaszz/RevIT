-- Migration: Optimize Database Performance, Covering Foreign Keys, and Security Hygiene

-- 1. Add covering indexes on unindexed foreign keys
create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists user_achievements_achievement_id_idx on public.user_achievements (achievement_id);
create index if not exists ai_entitlements_tier_idx on public.ai_entitlements (tier);
create index if not exists ai_request_usage_tier_idx on public.ai_request_usage (tier);

-- 2. Lock search_path on set_question_attempt_book trigger function & revoke unnecessary public execution
create or replace function public.set_question_attempt_book()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.book is null or new.book = '' or (new.book = 'Harr' and (new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%')) then
    new.book := case
      when new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%' then 'Ciulla'
      else coalesce(nullif(new.book, ''), 'Harr')
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.set_question_attempt_book() from public, anon, authenticated;

-- 3. Optimize feedback RLS policies with cached auth.uid()
alter policy "Users can insert their own feedback" on public.feedback with check ((select auth.uid()) = user_id);
alter policy "Users can view their own feedback" on public.feedback using ((select auth.uid()) = user_id);
