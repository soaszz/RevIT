-- PROPOSAL ONLY. Preserve existing helper semantics; exclude only new-book XP from Harr.
begin;
set local lock_timeout='2s';
do $guard$
declare p pg_proc; d text;
 old_text text:='when p_book = ''Harr'' then not (event.subject_id like ''ciulla-%'' or event.subject_id like ''rodak-%'')';
 new_text text:='when p_book = ''Harr'' then not (event.subject_id like ''ciulla-%'' or event.subject_id like ''rodak-%'' or event.subject_id like ''boc-%'' or event.subject_id like ''elsevier-%'')';
begin
 select * into strict p from pg_proc where oid='public.leaderboard_metric_rows(text,text,text,text)'::regprocedure;
 if md5(p.prosrc)<>'1bdcf78ee8a9e079f2c433e53fd518a1' or pg_get_userbyid(p.proowner)<>'postgres'
   or not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog, public']
   or p.proacl::text is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
  raise exception 'Leaderboard helper drift'; end if;
 d:=pg_get_functiondef(p.oid);
 if cardinality(string_to_array(d,old_text))<>2 then raise exception 'Leaderboard patch boundary drift'; end if;
 execute replace(d,old_text,new_text);
 if (select md5(replace(prosrc,new_text,old_text)) from pg_proc where oid=p.oid)<>md5(p.prosrc) then
  raise exception 'Leaderboard preservation proof failed'; end if;
end;
$guard$;
commit;
