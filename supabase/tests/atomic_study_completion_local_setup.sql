-- LOCAL CLUSTER ONLY. Never an input to the staging operator.
\set ON_ERROR_STOP on
begin;
\ir atomic_study_completion_fixture.sql
do $$ declare s public.study_sessions; owner_id uuid; begin
  foreach owner_id in array array['3e0a0000-0000-4000-8000-000000000001'::uuid,'3e0a0000-0000-4000-8000-000000000002'::uuid] loop
    s := pg_temp.new_session('wrong_answers',2,owner_id);
    perform public.commit_rewarded_study_batch(s.user_id,s.id,pg_temp.batch(s,true,true));
  end loop;
end $$;
commit;
