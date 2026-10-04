-- Rollback: revert 202610040018 optimizations

drop index if exists public.feedback_user_id_idx;
drop index if exists public.user_achievements_achievement_id_idx;
drop index if exists public.ai_entitlements_tier_idx;
drop index if exists public.ai_request_usage_tier_idx;

create or replace function public.set_question_attempt_book()
returns trigger as $$
begin
  if new.book is null or new.book = '' or (new.book = 'Harr' and (new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%')) then
    new.book := case
      when new.question_id like 'ciulla-%' or new.subject_id like 'ciulla-%' or new.topic_id like 'ciulla-%' then 'Ciulla'
      else coalesce(nullif(new.book, ''), 'Harr')
    end;
  end if;
  return new;
end;
$$ language plpgsql;

alter policy "Users can insert their own feedback" on public.feedback with check (auth.uid() = user_id);
alter policy "Users can view their own feedback" on public.feedback using (auth.uid() = user_id);
