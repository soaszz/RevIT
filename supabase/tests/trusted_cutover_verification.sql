-- PREPARATION ONLY. Never execute without separate disposable-staging authorization.
-- Single-connection transactional checks: scenarios 1-5, 7-11, 13, 15.
-- Scenarios 6 (engine overlap), 12 (disable race), 14 (rollback) require the separate runbook.
-- This script temporarily changes grants/configuration and creates synthetic rows; all roll back.
-- Operator must independently verify the project, then SET revit.test_target = 'qnepjfcbzsycmesrcbjb'.
-- Run with an owner connection and stop-on-error. Do not submit through a service-role RPC.
begin;
set local transaction isolation level read committed;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if current_setting('revit.test_target', true) is distinct from 'qnepjfcbzsycmesrcbjb'
    or current_user <> 'postgres' then
    raise exception 'Independently verified disposable staging owner connection required.';
  end if;
  if exists (select 1 from auth.users) then raise exception 'Empty disposable staging required.'; end if;
  if to_regprocedure('public.assert_trusted_study_enabled()') is null
    or not exists (select 1 from public.trusted_study_config where id = 1 and enabled = false) then
    raise exception 'Migration 27 must be installed and disabled before this separately authorized test.';
  end if;
end $$;

create temporary table trusted_test_results(scenario text primary key, status text not null) on commit drop;
create function pg_temp.expect_error(p_sql text, p_state text) returns void language plpgsql as $$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> p_state then raise exception 'Expected SQLSTATE %, received %', p_state, v_state; end if;
    return;
  end;
  raise exception 'Expected SQLSTATE %, but operation succeeded', p_state;
end $$;

-- JWT claims alone do not establish SQL EXECUTE privileges; actual role checks follow below.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.expect_error('select public.assert_trusted_study_enabled()', 'PT503');
delete from public.trusted_study_config where id = 1;
select pg_temp.expect_error('select public.assert_trusted_study_enabled()', 'PT503');
insert into public.trusted_study_config(id, enabled) values(1, true);

-- Prove the fence with one deliberately open legacy writer, then revoke only inside this rollback transaction.
grant execute on function public.record_study_activity(text,text) to authenticated;
select pg_temp.expect_error('select public.assert_trusted_study_enabled()', 'PT503');
do $$
declare r record; v_columns text;
begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('record_question_attempt','record_study_activity','record_progression_award','check_and_unlock_achievements') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
  end loop;
  for r in select c.oid, c.oid::regclass as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in
      ('question_attempts','activity_events','daily_activity','user_progress','user_achievements',
       'user_xp_transactions','question_reinforcement','study_sessions','trusted_study_config') loop
    execute format('revoke insert, update, delete, truncate, references, trigger on %s from public, anon, authenticated', r.name);
    select string_agg(quote_ident(attname), ',') into v_columns from pg_attribute
      where attrelid = r.oid and attnum > 0 and not attisdropped;
    execute format('revoke insert (%s), update (%s), references (%s) on %s from public, anon, authenticated',
      v_columns, v_columns, v_columns, r.name);
  end loop;
  -- Inherited privileges still present cause an explicit failure; never silently bypass the guard.
  perform public.assert_trusted_study_enabled();
end $$;
insert into trusted_test_results values('gate_missing_false_and_legacy_fence', 'PASS');

insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'local-suite-a@revit.internal', now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'local-suite-b@revit.internal', now(), now(), now());

create function pg_temp.attempt(p_id uuid, p_question text, p_slot integer, p_selected integer default 0)
returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'question_id', p_question, 'session_slot', p_slot,
    'subject_id', 'synthetic', 'subject_name', 'Synthetic', 'topic_id', 'synthetic', 'topic_name', 'Synthetic',
    'subtopic', 'Synthetic', 'difficulty', 'Unspecified', 'book', case when p_question like 'rodak-%' then 'Rodak' else 'Harr' end,
    'content_version', 'synthetic-v1', 'response_digest', repeat('a',64), 'selected_answer', p_selected, 'is_correct', true);
$$;

do $$
declare
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_other uuid := '22222222-2222-4222-8222-222222222222';
  v_request uuid := gen_random_uuid();
  v_id uuid := gen_random_uuid();
  v_second_id uuid := gen_random_uuid();
  v_matching_id uuid := gen_random_uuid();
  v_atomic_id uuid := gen_random_uuid();
  v_plan jsonb := jsonb_build_object('mode','adaptive','target_count',5,'question_pool',jsonb_build_array(
    jsonb_build_object('question_id','synthetic-q1','content_version','synthetic-v1'),
    jsonb_build_object('question_id','synthetic-q2','content_version','synthetic-v1'),
    jsonb_build_object('question_id','synthetic-gap','content_version','synthetic-v1'),
    jsonb_build_object('question_id','synthetic-overflow','content_version','synthetic-v1'),
    jsonb_build_object('question_id','rodak-ch12-06','content_version','synthetic-v1')));
  v_session public.study_sessions;
  v_second public.study_sessions;
  v_foreign public.study_sessions;
  v_result public.question_attempts;
  v_before public.question_attempts;
  v_item jsonb;
begin
  v_session := public.create_verified_study_session(v_owner,v_request,v_plan,repeat('b',64));
  v_second := public.create_verified_study_session(v_owner,v_request,v_plan,repeat('b',64));
  if v_session.id is null or v_session.id is distinct from v_second.id then raise exception '11: issuance idempotency'; end if;
  perform pg_temp.expect_error(format('select public.create_verified_study_session(%L::uuid,%L::uuid,%L::jsonb,%L)',
    v_owner,v_request,v_plan,repeat('c',64)), '23505');
  insert into trusted_test_results values('11_issuance_idempotency_conflict','PASS');

  v_item := pg_temp.attempt(v_id,'synthetic-q1',0);
  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_session.id,jsonb_build_array(v_item));
  if v_result.attempt_number is distinct from 1 or v_result.is_adaptive_repeat is distinct from false
    or v_result.review_mode is distinct from 'adaptive' then raise exception '1: initial numbering/mode'; end if;
  v_before := v_result;
  insert into trusted_test_results values('1_initial_number_and_mode','PASS');

  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_session.id,jsonb_build_array(v_item));
  if v_result is distinct from v_before or (select count(*) from public.question_attempts where id = v_id) <> 1 then
    raise exception '4: exact retry changed record'; end if;
  insert into trusted_test_results values('4_exact_retry','PASS');

  v_second := public.create_verified_study_session(v_owner,gen_random_uuid(),v_plan,repeat('d',64));
  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_second.id,
    jsonb_build_array(pg_temp.attempt(v_second_id,'synthetic-q1',0)));
  if v_result.attempt_number is distinct from 2 or v_result.is_adaptive_repeat is distinct from true then raise exception '2: repeat'; end if;
  insert into trusted_test_results values('2_cross_session_repeat','PASS');

  insert into public.question_attempts(id,user_id,question_id,subject_id,subject_name,topic_id,topic_name,subtopic,
    difficulty,selected_answer,is_correct,attempt_number,review_mode,answered_at,book)
  select gen_random_uuid(),v_owner,'synthetic-gap','synthetic','Synthetic','synthetic','Synthetic','Synthetic',
    'Unspecified',0,true,n,'reviewer',clock_timestamp(),'Harr' from unnest(array[1,7]) n;
  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_second.id,
    jsonb_build_array(pg_temp.attempt(gen_random_uuid(),'synthetic-gap',1)));
  if v_result.attempt_number is distinct from 8 then raise exception '3: legacy gap'; end if;
  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_second.id,
    jsonb_build_array(pg_temp.attempt(gen_random_uuid(),'synthetic-gap',2)));
  if v_result.attempt_number is distinct from 9 then raise exception '3: repeated gap'; end if;
  insert into trusted_test_results values('3_gap_then_repeat','PASS');

  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_owner,v_session.id,jsonb_build_array(v_item || jsonb_build_object('response_digest',repeat('f',64)))), '23505');
  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_owner,v_session.id,jsonb_build_array(pg_temp.attempt(gen_random_uuid(),'synthetic-q2',0))), '23505');
  insert into trusted_test_results values('5_conflicting_retry_and_slot','PASS');

  -- Slot 1 inserts first; slot 3 fails later. This actually exercises rollback after an insert.
  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_owner,v_session.id,jsonb_build_array(pg_temp.attempt(v_atomic_id,'synthetic-q2',1),
      pg_temp.attempt(gen_random_uuid(),'synthetic-q1',3))), '23505');
  if exists(select 1 from public.question_attempts where id = v_atomic_id) then raise exception '7: leaked atomic row'; end if;
  insert into trusted_test_results values('7_failure_after_insert_rolls_back','PASS');

  v_foreign := public.create_verified_study_session(v_other,gen_random_uuid(),v_plan,repeat('e',64));
  -- Both immutable UUID collisions deliberately use generic 23505, not the 42501 session-owner error.
  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_other,v_foreign.id,jsonb_build_array(v_item)), '23505');
  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_owner,v_second.id,jsonb_build_array(v_item)), '23505');
  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_other,v_session.id,jsonb_build_array(v_item)), '42501');
  -- Persist a foreign-owner fixture so the later attempt SELECT/RLS assertion is not vacuous.
  select * into strict v_result from public.commit_verified_study_batch(v_other,v_foreign.id,
    jsonb_build_array(pg_temp.attempt(gen_random_uuid(),'synthetic-q1',0)));
  if v_result.user_id is distinct from v_other then raise exception '8: foreign fixture owner'; end if;
  insert into trusted_test_results values('8_foreign_uuid_and_session_owner','PASS');

  update public.study_sessions set expires_at = clock_timestamp() - interval '1 second' where id = v_session.id;
  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_owner,v_session.id,jsonb_build_array(pg_temp.attempt(gen_random_uuid(),'synthetic-q2',1))), '55000');
  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_session.id,jsonb_build_array(v_item));
  if v_result is distinct from v_before then raise exception '9: expired retry changed'; end if;
  update public.study_sessions set expires_at = clock_timestamp() + interval '1 hour', completed_at = clock_timestamp() where id = v_session.id;
  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_owner,v_session.id,jsonb_build_array(pg_temp.attempt(gen_random_uuid(),'synthetic-q2',1))), '55000');
  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_session.id,jsonb_build_array(v_item));
  if v_result is distinct from v_before then raise exception '9: completed retry changed'; end if;
  insert into trusted_test_results values('9_expired_completed_new_vs_retry','PASS');

  v_item := pg_temp.attempt(v_matching_id,'rodak-ch12-06',3,null);
  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_second.id,jsonb_build_array(v_item));
  if v_result.selected_answer is not null or v_result.verified_at is null or v_result.competitive_at is not null then
    raise exception '10/15: matching NULL or competitive provenance'; end if;
  v_before := v_result;
  select * into strict v_result from public.commit_verified_study_batch(v_owner,v_second.id,jsonb_build_array(v_item));
  if v_result is distinct from v_before then raise exception '10: matching retry'; end if;
  insert into trusted_test_results values('10_matching_null_and_retry','PASS'),('15_noncompetitive_provenance','PASS');

  insert into public.question_attempts(id,user_id,question_id,subject_id,subject_name,topic_id,topic_name,subtopic,
    difficulty,selected_answer,is_correct,attempt_number,review_mode,answered_at,book)
  values(gen_random_uuid(),v_owner,'synthetic-overflow','synthetic','Synthetic','synthetic','Synthetic','Synthetic',
    'Unspecified',0,true,2147483647,'reviewer',clock_timestamp(),'Harr');
  perform pg_temp.expect_error(format('select public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb)',
    v_owner,v_second.id,jsonb_build_array(pg_temp.attempt(gen_random_uuid(),'synthetic-overflow',4))), '22003');
  insert into trusted_test_results values('overflow','PASS');
end $$;

-- Actual SQL-role tests; owner-executed JWT tests above do not establish EXECUTE ACLs.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.create_verified_study_session('11111111-1111-4111-8111-111111111111',gen_random_uuid(),
  '{"mode":"reviewer","target_count":1,"question_pool":[{"question_id":"synthetic-q1","content_version":"synthetic-v1"}]}',repeat('9',64));
do $$
begin
  begin update public.trusted_study_config set enabled = false where id = 1;
    raise exception '13: service role could change its own authority'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Both browser roles must fail at the actual database boundary, not only inside Next.js.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}', true);
do $$
begin
  if not exists(select 1 from public.study_sessions where user_id = '11111111-1111-4111-8111-111111111111')
    or exists(select 1 from public.study_sessions where user_id = '22222222-2222-4222-8222-222222222222')
    or exists(select 1 from public.question_attempts where user_id = '22222222-2222-4222-8222-222222222222') then
    raise exception '13: owner SELECT or cross-account RLS failed';
  end if;
  begin perform public.create_verified_study_session(gen_random_uuid(),gen_random_uuid(),'{}','invalid');
    raise exception '13: authenticated create allowed'; exception when insufficient_privilege then null; end;
  begin perform public.commit_verified_study_batch(gen_random_uuid(),gen_random_uuid(),'[]');
    raise exception '13: authenticated commit allowed'; exception when insufficient_privilege then null; end;
  begin update public.trusted_study_config set enabled = false where id = 1;
    raise exception '13: authenticated config write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin perform public.create_verified_study_session(gen_random_uuid(),gen_random_uuid(),'{}','invalid');
    raise exception '13: anon create allowed'; exception when insufficient_privilege then null; end;
  begin perform public.commit_verified_study_batch(gen_random_uuid(),gen_random_uuid(),'[]');
    raise exception '13: anon commit allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into trusted_test_results values('13_actual_role_boundaries','PASS');
select * from trusted_test_results order by scenario;
-- Expected: 14 PASS rows. These are future execution assertions, not local runtime evidence.
rollback;
