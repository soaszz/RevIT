-- Persistent, per-user RevIT AI conversations.
create table if not exists public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chats_user_updated_idx
on public.ai_chats (user_id, updated_at desc);

drop trigger if exists ai_chats_set_updated_at on public.ai_chats;
create trigger ai_chats_set_updated_at
before update on public.ai_chats
for each row execute function public.set_updated_at();

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.ai_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_chat_created_idx
on public.ai_messages (chat_id, created_at, id);

create or replace function public.touch_ai_chat_after_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.ai_chats
  set updated_at = now()
  where id = new.chat_id;
  return new;
end;
$$;

revoke all on function public.touch_ai_chat_after_message() from public;

drop trigger if exists ai_messages_touch_chat on public.ai_messages;
create trigger ai_messages_touch_chat
after insert on public.ai_messages
for each row execute function public.touch_ai_chat_after_message();

alter table public.ai_chats enable row level security;
alter table public.ai_messages enable row level security;

create policy "ai_chats_select_own" on public.ai_chats
for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_chats_insert_own" on public.ai_chats
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_chats_update_own" on public.ai_chats
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "ai_chats_delete_own" on public.ai_chats
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "ai_messages_select_own_chat" on public.ai_messages
for select to authenticated using (
  exists (
    select 1
    from public.ai_chats
    where ai_chats.id = ai_messages.chat_id
      and ai_chats.user_id = (select auth.uid())
  )
);
create policy "ai_messages_insert_own_chat" on public.ai_messages
for insert to authenticated with check (
  exists (
    select 1
    from public.ai_chats
    where ai_chats.id = ai_messages.chat_id
      and ai_chats.user_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.ai_chats to authenticated;
grant select, insert on public.ai_messages to authenticated;
revoke all on public.ai_chats, public.ai_messages from anon;
