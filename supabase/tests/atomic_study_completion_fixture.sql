-- Included only inside a disposable verification transaction / isolated localhost cluster.
create temp table o_checks(label text primary key);
create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$ begin
  if value is distinct from true then raise exception 'O assertion failed: %',label; end if;
  insert into o_checks values(label); raise notice 'O_PASS %',label;
end $$;
create function pg_temp.state() returns jsonb language sql as $$
  select jsonb_build_object(
    'attempts',(select jsonb_agg(to_jsonb(t) order by id) from public.question_attempts t),
    'sessions',(select jsonb_agg(to_jsonb(t) order by id) from public.study_sessions t),
    'events',(select jsonb_agg(to_jsonb(t) order by id) from public.activity_events t),
    'daily',(select jsonb_agg(to_jsonb(t) order by id) from public.daily_activity t),
    'progress',(select jsonb_agg(to_jsonb(t) order by id) from public.user_progress t),
    'unlocks',(select jsonb_agg(to_jsonb(t) order by id) from public.user_achievements t),
    'reinforcement',(select jsonb_agg(to_jsonb(t) order by id) from public.question_reinforcement t));
$$;
create function pg_temp.expect_error(sql text, code text, label text) returns void language plpgsql as $$
declare observed text; snapshot jsonb := pg_temp.state();
begin
  begin execute sql; exception when others then get stacked diagnostics observed = returned_sqlstate; end;
  perform pg_temp.ok(observed is not distinct from code,label || ':' || coalesce(observed,'NO_ERROR'));
  perform pg_temp.ok(snapshot = pg_temp.state(),label || ':atomic-baseline');
end $$;
create function pg_temp.new_session(mode text default 'wrong_answers', target integer default 2, owner_id uuid default gen_random_uuid())
returns public.study_sessions language plpgsql as $$
declare s public.study_sessions;
begin
  insert into auth.users(id,raw_user_meta_data) values(owner_id,jsonb_build_object('username','o_' || replace(owner_id::text,'-',''))) on conflict do nothing;
  s := public.create_rewarded_study_session(owner_id,gen_random_uuid(),jsonb_build_object('mode',mode,'target_count',target,
    'question_pool',jsonb_build_array(jsonb_build_object('question_id','o-q1','content_version','v1'),jsonb_build_object('question_id','o-q2','content_version','v2'))),repeat('a',64));
  return s;
end $$;
create function pg_temp.batch(s public.study_sessions, correct1 boolean, correct2 boolean) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid(),'session_slot',0,'question_id','o-q1','content_version','v1','response_digest',repeat('a',64),'is_correct',correct1,'selected_answer',0,
      'subject_id','o-subject','subject_name','O Subject','topic_id','o-topic','topic_name','O Topic','subtopic','O Subtopic','difficulty','Easy','book','Harr'),
    jsonb_build_object('id',gen_random_uuid(),'session_slot',1,'question_id','o-q2','content_version','v2','response_digest',repeat('b',64),'is_correct',correct2,'selected_answer',1,
      'subject_id','o-subject','subject_name','O Subject','topic_id','o-topic','topic_name','O Topic','subtopic','O Subtopic','difficulty','Hard','book','Harr'));
$$;
create function pg_temp.finish(s public.study_sessions) returns jsonb language sql as $$
  select public.complete_verified_study_session(s.user_id,s.id,(select jsonb_agg(id order by session_slot) from public.question_attempts where session_id=s.id));
$$;
-- Snapshot/fencing is rolled back by the caller. No permanent legacy cutover.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('record_question_attempt','record_study_activity','record_progression_award','check_and_unlock_achievements') loop
    execute format('revoke execute on function %s from public,anon,authenticated',r.signature);
  end loop;
  for r in select c.oid::regclass as relation from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in ('question_attempts','activity_events','daily_activity','user_progress','user_achievements','user_xp_transactions','question_reinforcement','study_sessions','trusted_study_config') loop
    execute format('revoke insert,update,delete,truncate,trigger on %s from public,anon,authenticated',r.relation);
  end loop;
end $$;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
update public.trusted_study_config set enabled=true where id=1;
