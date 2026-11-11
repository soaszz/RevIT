-- PROPOSAL ONLY. Separate approval and fresh recovery/catalog guards required.
-- Does not execute migrations23–31, reclassify history, or publish either book.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
do $guard$
declare p pg_proc; d text;
begin
 select * into strict p from pg_proc where oid='public.record_question_attempt(uuid,text,text,text,text,text,text,text,smallint,boolean,text,uuid,boolean,timestamptz)'::regprocedure;
 if md5(p.prosrc)<>'d99c7a265dca423a1360dac05018f9ba' or pg_get_userbyid(p.proowner)<>'postgres'
   or not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog, public']
   or p.proacl::text is distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
  raise exception 'Legacy writer drift';
 end if;
 if exists(select 1 from pg_attribute where attrelid='public.question_attempts'::regclass and attname='answer_response' and not attisdropped)
   or to_regprocedure('public.record_compatible_reviewer_attempt(uuid,uuid,text,text,jsonb,jsonb,integer,integer,boolean,text,uuid,boolean,timestamptz)') is not null then
  raise exception 'Compatibility already/partially installed';
 end if;
 if (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.question_attempts'::regclass and conname='question_attempts_selected_answer_check')
   is distinct from 'CHECK (((selected_answer IS NULL) OR ((selected_answer >= 0) AND (selected_answer <= 3))))' then
  raise exception 'Answer constraint drift';
 end if;
 -- Preserve definition/owner/grants/comment/config. Only reject unsupported new books
 -- on the old signature; existing four-book execution is byte-preserved below this guard.
 d:=pg_get_functiondef(p.oid);
 if cardinality(string_to_array(d,E'\nbegin\n'))<>2 then raise exception 'Writer boundary drift'; end if;
 d:=replace(d,E'\nbegin\n',E'\nbegin\n  if p_question_id like ''boc-%'' or p_question_id like ''elsevier-%'' or p_subject_id like ''boc-%'' or p_subject_id like ''elsevier-%'' or p_topic_id like ''boc-%'' or p_topic_id like ''elsevier-%'' then\n    raise exception ''Use the compatible reviewer writer.'' using errcode = ''42501'';\n  end if;\n');
 execute d;
end;
$guard$;

alter table public.question_attempts add column answer_response jsonb;
alter table public.question_attempts drop constraint question_attempts_selected_answer_check;
alter table public.question_attempts add constraint question_attempts_selected_answer_check check (
 selected_answer is null or selected_answer between 0 and 3 or
 (selected_answer=4 and book='Elsevier' and question_id in (
 'elsevier-ch07-019','elsevier-ch07-020','elsevier-ch07-021','elsevier-ch07-022','elsevier-ch07-044',
 'elsevier-ch07-072','elsevier-ch07-076','elsevier-mock-016','elsevier-mock-084')));

create function public.protect_compatible_reviewer_attempt() returns trigger language plpgsql
set search_path=pg_catalog,pg_temp as $fn$
begin
 if new.question_id like 'boc-%' or new.question_id like 'elsevier-%' or new.book in ('BOC','Elsevier')
   or (tg_op='UPDATE' and (old.question_id like 'boc-%' or old.question_id like 'elsevier-%' or old.book in ('BOC','Elsevier'))) then
  if current_user not in ('postgres','service_role') then
   raise exception 'Server-validated reviewer write required' using errcode='42501';
  end if;
  if not ((new.book='BOC' and new.question_id ~ '^boc-7e-ch0[1-8]-[0-9]{3}$')
    or (new.book='Elsevier' and new.question_id ~ '^elsevier-(ch[0-9]{2}|mock)-[0-9]{3}$'))
    or new.answer_response is null then raise exception 'Invalid reviewer attribution/response' using errcode='22023'; end if;
 end if;
 return new;
end;
$fn$;
revoke all on function public.protect_compatible_reviewer_attempt() from public,anon,authenticated,service_role;
create trigger protect_compatible_reviewer_attempt before insert or update on public.question_attempts
for each row execute function public.protect_compatible_reviewer_attempt();

create function public.record_compatible_reviewer_attempt(
 p_owner uuid,p_id uuid,p_book text,p_question_id text,p_metadata jsonb,p_response jsonb,
 p_choice_count integer,p_matching_items integer,p_is_correct boolean,p_review_mode text,
 p_session_id uuid,p_is_adaptive_repeat boolean,p_answered_at timestamptz)
returns public.question_attempts language plpgsql security definer set search_path=pg_catalog,pg_temp as $fn$
declare r public.question_attempts; selected smallint; n integer; expected_prefix text;
begin
 if p_owner is null or p_id is null or p_book is null or p_question_id is null
   or not ((p_book='BOC' and p_question_id ~ '^boc-7e-ch0[1-8]-[0-9]{3}$')
      or (p_book='Elsevier' and p_question_id ~ '^elsevier-(ch[0-9]{2}|mock)-[0-9]{3}$')) then
  raise exception 'Invalid book' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles where id=p_owner and plan='pro' and pro_expires_at>now()) then
  raise exception 'Active Pro required' using errcode='42501'; end if;
 expected_prefix:=case p_book when 'BOC' then 'boc-' else 'elsevier-' end;
 if jsonb_typeof(p_metadata) is distinct from 'object' or
   coalesce(p_metadata->>'subject_id','') not like expected_prefix||'%' or
   coalesce(p_metadata->>'topic_id','') not like expected_prefix||'%' or
   p_choice_count is null or p_choice_count not between 2 and 5 or p_matching_items is null
   or p_is_correct is null or p_is_adaptive_repeat is null or p_answered_at is null then
  raise exception 'Invalid metadata' using errcode='22023'; end if;
 if jsonb_typeof(p_response) is distinct from 'object' then raise exception 'Invalid response' using errcode='22023'; end if;
 if p_question_id in ('elsevier-ch02-044','elsevier-ch02-048') then
  if p_matching_items<>4 or p_choice_count<>4 then raise exception 'Matching shape differs from source' using errcode='22023'; end if;
 elsif p_question_id in ('elsevier-ch10-007','elsevier-ch10-008','elsevier-ch10-009') then
  if p_matching_items<>1 or p_choice_count<>3 then raise exception 'Matching shape differs from source' using errcode='22023'; end if;
 elsif p_matching_items<>0 then raise exception 'Not a matching question' using errcode='22023'; end if;
 if p_response->>'kind'='single_choice' then
  if p_matching_items<>0 or (select count(*) from jsonb_object_keys(p_response))<>2
    or jsonb_typeof(p_response->'choiceIndex') is distinct from 'number'
    or (p_response->>'choiceIndex') !~ '^[0-9]+$' then raise exception 'Invalid choice' using errcode='22023'; end if;
  selected:=(p_response->>'choiceIndex')::smallint;
  if selected<0 or selected>=p_choice_count then raise exception 'Choice out of range' using errcode='22023'; end if;
 elsif p_response->>'kind'='matching' then
  if p_question_id not in ('elsevier-ch02-044','elsevier-ch02-048','elsevier-ch10-007','elsevier-ch10-008','elsevier-ch10-009')
    or (select count(*) from jsonb_object_keys(p_response))<>2
    or jsonb_typeof(p_response->'selections') is distinct from 'array'
    or jsonb_array_length(p_response->'selections')<>p_matching_items or p_matching_items not between 1 and 4 then
   raise exception 'Invalid matching response' using errcode='22023'; end if;
  for n in select case when jsonb_typeof(v)='number' and v::text ~ '^[0-9]+$' then v::text::integer else -1 end
    from jsonb_array_elements(p_response->'selections') v loop
   if n<0 or n>=p_choice_count then raise exception 'Invalid matching selection' using errcode='22023'; end if;
  end loop;
 elsif p_response->>'kind'='timeout' then
  if (select count(*) from jsonb_object_keys(p_response))<>1 or p_is_correct then
   raise exception 'Invalid timeout' using errcode='22023'; end if;
 else raise exception 'Invalid response kind' using errcode='22023'; end if;
 -- Exact response kept as JSON; matching is never flattened into selected_answer.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_question_id,0));
 perform 1 from public.profiles where id=p_owner and plan='pro' and pro_expires_at>clock_timestamp() for share;
 if not found then raise exception 'Active Pro required' using errcode='42501'; end if;
 select * into r from public.question_attempts where id=p_id;
 if found then
  if r.user_id<>p_owner or r.book<>p_book or r.question_id<>p_question_id or r.answer_response is distinct from p_response
    or r.is_correct is distinct from p_is_correct or r.session_id is distinct from p_session_id
    or r.review_mode is distinct from p_review_mode or r.topic_id is distinct from p_metadata->>'topic_id'
    or r.subject_id is distinct from p_metadata->>'subject_id' then raise exception 'Attempt conflict' using errcode='23505'; end if;
  return r;
 end if;
 select coalesce(max(attempt_number),0)+1 into n from public.question_attempts where user_id=p_owner and question_id=p_question_id;
 insert into public.question_attempts(id,user_id,question_id,subject_id,subject_name,topic_id,topic_name,subtopic,difficulty,
  selected_answer,is_correct,attempt_number,review_mode,session_id,is_adaptive_repeat,answered_at,book,answer_response)
 values(p_id,p_owner,p_question_id,p_metadata->>'subject_id',coalesce(nullif(p_metadata->>'subject_name',''),'Uncategorized'),
  p_metadata->>'topic_id',coalesce(nullif(p_metadata->>'topic_name',''),'Uncategorized'),coalesce(nullif(p_metadata->>'subtopic',''),'Uncategorized'),
  coalesce(nullif(p_metadata->>'difficulty',''),'Unspecified'),selected,p_is_correct,n,p_review_mode,p_session_id,
  p_is_adaptive_repeat,least(p_answered_at,now()),p_book,p_response) returning * into r;
 return r;
end;
$fn$;
revoke all on function public.record_compatible_reviewer_attempt(uuid,uuid,text,text,jsonb,jsonb,integer,integer,boolean,text,uuid,boolean,timestamptz)
from public,anon,authenticated;
grant execute on function public.record_compatible_reviewer_attempt(uuid,uuid,text,text,jsonb,jsonb,integer,integer,boolean,text,uuid,boolean,timestamptz) to service_role;
-- Deliberately no NOTIFY yet: coordinate one schema reload with separately approved installation.
commit;
