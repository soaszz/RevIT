-- WARNING: this rollback permanently removes every stored consent version and
-- acceptance timestamp. Export or back up those values before continuing.
begin;

drop function if exists public.accept_current_legal_terms(text, text);

-- Restore the pre-consent profile creation function before dropping its columns.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if requested !~ '^[a-z0-9_]{3,24}$'
    or exists (select 1 from public.profiles where lower(username) = requested) then
    requested := 'learner_' || substring(new.id::text, 1, 8);
  end if;
  insert into public.profiles (id, username, first_name)
  values (new.id, requested, left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 40))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

alter table public.profiles
  drop column if exists terms_accepted_at,
  drop column if exists terms_version,
  drop column if exists privacy_accepted_at,
  drop column if exists privacy_version;

commit;
