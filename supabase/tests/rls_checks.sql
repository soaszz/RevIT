-- Run in a disposable Supabase project after the migration.
-- This script proves the central ownership policy shape for two identities.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'rls-one@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'rls-two@example.test', crypt('test-password', gen_salt('bf')), now(), now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.grades (user_id, subject, pre_test) values ('11111111-1111-1111-1111-111111111111', 'Hematology', 45);
insert into public.question_reinforcement (user_id, question_id, reinforcement_level)
values ('11111111-1111-1111-1111-111111111111', 'clinical-chemistry-instrumentation-001', 1);
insert into public.ai_chats (id, user_id, title)
values ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Gram staining explanation');
insert into public.ai_messages (chat_id, role, content)
values ('aaaaaaaa-1111-1111-1111-111111111111', 'user', 'Explain Gram staining');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.grades where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one grade';
  end if;
  if exists (select 1 from public.question_reinforcement where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one reinforcement state';
  end if;
  if exists (select 1 from public.ai_chats where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one AI chat';
  end if;
  if exists (select 1 from public.ai_messages where chat_id = 'aaaaaaaa-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see messages from user one AI chat';
  end if;
end $$;

do $$ begin
  begin
    insert into public.ai_messages (chat_id, role, content)
    values ('aaaaaaaa-1111-1111-1111-111111111111', 'user', 'Unauthorized message');
    raise exception 'RLS failure: user two inserted into user one AI chat';
  exception
    when insufficient_privilege then null;
  end;
end $$;

rollback;
