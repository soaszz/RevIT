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

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.grades where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'RLS failure: user two can see user one grade';
  end if;
end $$;

rollback;
