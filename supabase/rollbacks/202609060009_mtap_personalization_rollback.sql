-- Roll back 202609060009_mtap_personalization.sql.
-- This removes saved MTAP choices; deploy the matching pre-feature app version
-- at the same time so clients stop selecting these columns.
begin;

alter table public.user_preferences
  drop column if exists mtap_onboarding_completed,
  drop column if exists mtap_features_enabled;

commit;
