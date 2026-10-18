\set ON_ERROR_STOP on
\set VERBOSITY verbose
begin read write;
set local statement_timeout='20s';
set local lock_timeout='3s';
set local idle_in_transaction_session_timeout='60s';
-- Disposable staging only: refuse to mix tests with existing user/study data.
do $$ begin
  if exists(select 1 from public.trusted_study_config where enabled) or
    exists(select 1 from public.study_sessions) or exists(select 1 from public.question_attempts)
    or exists(select 1 from public.activity_events) or exists(select 1 from public.daily_activity)
    or exists(select 1 from public.user_progress) or exists(select 1 from public.question_reinforcement)
    or exists(select 1 from public.user_achievements) then raise exception 'Disposable empty disabled baseline required.'; end if;
end $$;
\ir atomic_study_completion_fixture.sql

do $$
declare s public.study_sessions; b jsonb; receipt jsonb; snapshot jsonb; corrects integer; before_xp integer;
begin
  for corrects in 0..2 loop
    s := pg_temp.new_session(); b := pg_temp.batch(s,corrects>0,corrects>1);
    perform public.commit_rewarded_study_batch(s.user_id,s.id,b);
    perform pg_temp.ok((select count(*)=2 from public.question_attempts where session_id=s.id),'attempt-count-' || corrects);
    perform pg_temp.ok((select total_xp=corrects*5+10+25 from public.user_progress where user_id=s.user_id),'answer-XP-and-first-achievement-' || corrects);
    perform pg_temp.ok((select count(*)=2-corrects from public.question_reinforcement where user_id=s.user_id),'reinforcement-' || corrects);
    perform pg_temp.ok((select questions_answered=2 and correct_answers=corrects and review_count=0 from public.daily_activity where user_id=s.user_id),'daily-' || corrects);
    receipt := pg_temp.finish(s);
    perform pg_temp.ok((receipt->>'totalXp')::integer=corrects*5+55 and (receipt->>'xpAwarded')::integer=20,'completion-XP-' || corrects);
    perform pg_temp.ok((select review_count=1 from public.daily_activity where user_id=s.user_id),'completion-daily-' || corrects);
    snapshot := pg_temp.state();
    perform pg_temp.ok(pg_temp.finish(s)=receipt,'identical-completion-retry-' || corrects);
    perform public.commit_rewarded_study_batch(s.user_id,s.id,b);
    perform pg_temp.ok(snapshot=pg_temp.state(),'retry-no-mutation-' || corrects);
    perform pg_temp.ok((select count(*)=1 from public.user_achievements where user_id=s.user_id),'no-duplicate-achievement-' || corrects);
    perform pg_temp.ok((select count(*)=4 and sum(leaderboard_xp)=0 from public.activity_events where user_id=s.user_id),'unique-personal-events-' || corrects);
    perform pg_temp.expect_error(format('select public.complete_verified_study_session(%L,%L,%L)',s.user_id,s.id,'["00000000-0000-4000-8000-000000000001"]'),'23505','conflicting-completion-' || corrects);
    perform pg_temp.expect_error(format('select public.commit_rewarded_study_batch(%L,%L,%L)',s.user_id,s.id,jsonb_set(b,'{0,is_correct}',to_jsonb(not(corrects>0)))),'23505','immutable-attempt-' || corrects);
    update public.study_sessions set expires_at=clock_timestamp()-interval '1 day' where id=s.id;
    perform pg_temp.ok(pg_temp.finish(s)=receipt,'completed-retry-after-expiry-' || corrects);
  end loop;
  s := pg_temp.new_session('adaptive',2); b := pg_temp.batch(s,true,false);
  perform public.commit_rewarded_study_batch(s.user_id,s.id,b);
  perform pg_temp.expect_error(format('select pg_temp.finish((select x from public.study_sessions x where id=%L))',s.id),'22023','early-adaptive-rejected');
  b := jsonb_build_array(jsonb_set(jsonb_set(jsonb_set(b->1,'{id}',to_jsonb(gen_random_uuid()::text)),'{session_slot}','2'),'{is_correct}', 'true'));
  perform public.commit_rewarded_study_batch(s.user_id,s.id,b);
  receipt := pg_temp.finish(s);
  perform pg_temp.ok((receipt->>'attemptCount')::integer=3,'adaptive-correct-target');
  perform pg_temp.ok(not exists(select 1 from public.question_reinforcement where user_id=s.user_id),'correct-clears-mistake');
  perform pg_temp.ok((select max(attempt_number)=2 from public.question_attempts where user_id=s.user_id),'historical-numbering-preserved');
  -- Existing legitimate progress, grants and old sessions never get rewritten/backfilled.
  s := pg_temp.new_session();
  insert into public.daily_activity(user_id,activity_date,questions_answered,correct_answers) values(s.user_id,current_date-10,10,4);
  update public.user_progress set total_xp=123 where user_id=s.user_id;
  b := pg_temp.batch(s,false,false); perform public.commit_rewarded_study_batch(s.user_id,s.id,b);
  perform pg_temp.ok((select total_xp=133 from public.user_progress where user_id=s.user_id),'baseline-XP-additive-no-retro-unlock');
  perform pg_temp.ok(not exists(select 1 from public.user_achievements where user_id=s.user_id),'no-achievement-path');
  receipt:=pg_temp.finish(s);
  perform pg_temp.ok((receipt->>'totalXp')::integer=153 and (receipt->>'level')::integer=2,'derived-level-and-preserved-progress');
  perform pg_temp.expect_error(format('select public.complete_verified_study_session(%L,%L,%L)',gen_random_uuid(),s.id,'[]'),'22023','malformed-empty-completion');
  perform pg_temp.expect_error(format('select public.complete_verified_study_session(%L,%L,%L)',gen_random_uuid(),s.id,jsonb_build_array(b->0->>'id',b->1->>'id')),'42501','cross-owner');
  perform pg_temp.expect_error(format('select public.complete_verified_study_session(%L,%L,%L)',s.user_id,s.id,'{"xp":999}'),'22023','untrusted-reward-input');
  perform pg_temp.ok(not has_function_privilege('authenticated','public.complete_verified_study_session(uuid,uuid,jsonb)','execute')
    and not has_function_privilege('anon','public.commit_rewarded_study_batch(uuid,uuid,jsonb)','execute')
    and not has_function_privilege('service_role','public._apply_trusted_study_effects(uuid,uuid,uuid[],boolean)','execute'),'service-only-private-helpers');
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform pg_temp.expect_error(format('select pg_temp.finish((select x from public.study_sessions x where id=%L))',s.id),'42501','JWT-service-boundary');
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.trusted_study_config set enabled=false where id=1;
  perform pg_temp.expect_error(format('select pg_temp.finish((select x from public.study_sessions x where id=%L))',s.id),'PT503','disabled-gate');
  update public.trusted_study_config set enabled=true where id=1;
  -- Arithmetic overflow must undo the accepted attempt and every derived effect.
  s:=pg_temp.new_session(); update public.user_progress set total_xp=2147483647 where user_id=s.user_id;
  perform pg_temp.expect_error(format('select public.commit_rewarded_study_batch(%L,%L,%L)',s.user_id,s.id,pg_temp.batch(s,true,true)),'22003','XP-overflow');
  s:=pg_temp.new_session(); update public.study_sessions set completion_contract=null where id=s.id;
  perform pg_temp.expect_error(format('select public.commit_rewarded_study_batch(%L,%L,%L)',s.user_id,s.id,pg_temp.batch(s,true,true)),'55000','historical-contract-not-upgraded');
end $$;

-- Actual SQL role switch, not a JWT marker alone. Definers keep their owner-internal helpers private.
select user_id as role_owner,id as role_session from pg_temp.new_session() \gset
select * from public.commit_rewarded_study_batch(:'role_owner',:'role_session',pg_temp.batch((select s from public.study_sessions s where id=:'role_session'),true,true));
select jsonb_agg(id order by session_slot)::text as role_ids from public.question_attempts where session_id=:'role_session' \gset
set local role service_role;
select current_user,session_user,current_setting('transaction_isolation');
select public.complete_verified_study_session(:'role_owner',:'role_session',:'role_ids');
reset role;

-- Fault injection is test-only. No production failure switches or altered entry points.
create function pg_temp.fail_reward() returns trigger language plpgsql as $$ begin raise exception 'O_INJECTED_FAILURE' using errcode='P0001'; end $$;
create trigger o_before_reward before insert on public.activity_events for each row execute function pg_temp.fail_reward();
do $$ declare s public.study_sessions; b jsonb; begin
  s:=pg_temp.new_session(); b:=pg_temp.batch(s,true,true);
  perform pg_temp.expect_error(format('select public.commit_rewarded_study_batch(%L,%L,%L)',s.user_id,s.id,b),'P0001','before-rewards-rolls-back-attempts');
end $$;
drop trigger o_before_reward on public.activity_events;
create trigger o_during_reward before update on public.user_progress for each row execute function pg_temp.fail_reward();
do $$ declare s public.study_sessions; b jsonb; begin
  s:=pg_temp.new_session(); b:=pg_temp.batch(s,true,true);
  perform pg_temp.expect_error(format('select public.commit_rewarded_study_batch(%L,%L,%L)',s.user_id,s.id,b),'P0001','during-XP-rolls-back-all-effects');
end $$;
drop trigger o_during_reward on public.user_progress;
do $$ declare s public.study_sessions; begin
  s:=pg_temp.new_session(); perform public.commit_rewarded_study_batch(s.user_id,s.id,pg_temp.batch(s,true,true));
  create trigger o_before_completion before update on public.study_sessions for each row execute function pg_temp.fail_reward();
  perform pg_temp.expect_error(format('select pg_temp.finish((select x from public.study_sessions x where id=%L))',s.id),'P0001','receipt-write-rolls-back-completion-reward');
end $$;
select count(*) as passed_assertions from o_checks;
rollback;
\echo O_ATOMIC_VERIFICATION_ROLLBACK_COMPLETE
