-- Store the private, user-controlled NU MTAP personalization choice on the
-- existing preferences row. Existing and new users default to standard RevIT
-- and receive the one-time question in the application.
begin;

alter table public.user_preferences
  add column if not exists mtap_features_enabled boolean not null default false,
  add column if not exists mtap_onboarding_completed boolean not null default false;

comment on column public.user_preferences.mtap_features_enabled is
  'Private user preference controlling access to NU MTAP-specific features.';
comment on column public.user_preferences.mtap_onboarding_completed is
  'Whether the user has answered or manually configured the one-time MTAP preference.';

-- Retain the existing own-row RLS policies and explicitly keep anonymous
-- clients from reading preferences. No MTAP field is exposed by public RPCs.
alter table public.user_preferences enable row level security;
grant select, insert, update, delete on public.user_preferences to authenticated;
revoke all on public.user_preferences from anon;

commit;
