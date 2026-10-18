-- Disable the runtime gate before rollback. Never erase earned XP, receipts or provenance.
begin;
do $$ begin
  if (select count(*) from public.trusted_study_config) <> 1
    or not exists(select 1 from public.trusted_study_config where id=1 and not enabled) then
    raise exception 'Trusted study persistence must be disabled before rollback.';
  end if;
end $$;
drop function public.complete_verified_study_session(uuid,uuid,jsonb);
drop function public.commit_rewarded_study_batch(uuid,uuid,jsonb);
drop function public.create_rewarded_study_session(uuid,uuid,jsonb,text);
drop function public._apply_trusted_study_effects(uuid,uuid,uuid[],boolean);
drop function public._trusted_study_metrics(uuid);
-- Additive nullable columns and all historical effects deliberately retained.
-- Migration 27 and legacy grants remain exactly as installed. No registry repair.
commit;
