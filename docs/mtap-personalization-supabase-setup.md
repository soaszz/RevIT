# NU MTAP personalization: Supabase setup

The MTAP choice is stored on each user’s existing private `user_preferences` row. No separate table, public profile field, or leaderboard field is added.

## Apply the migration

1. Open the Supabase project used by RevIT.
2. Open **SQL Editor** and create a new query.
3. Paste and run the complete contents of `supabase/migrations/202609060009_mtap_personalization.sql`.
4. In **Table Editor → user_preferences**, verify these columns exist:
   - `mtap_features_enabled` — boolean, non-null, default `false`
   - `mtap_onboarding_completed` — boolean, non-null, default `false`
5. In **Authentication → Policies → user_preferences**, verify row-level security remains enabled and the existing own-row select, insert, update, and delete policies remain present.
6. Deploy the application only after the migration succeeds.

Existing users receive `false` for both fields and see the question once after normal account initialization. New preference rows receive the same defaults. Choosing either answer saves `mtap_onboarding_completed = true`; Settings changes also set it to `true`, so the one-time question does not reopen.

## Security verification

The migration retains authenticated own-row access and explicitly revokes anonymous access. The MTAP fields are not selected by leaderboard functions and are not copied to `profiles`, avatar metadata, or other public surfaces.

To verify with two test accounts, sign in as account A and confirm account A can read and update only its own `user_preferences` row. Repeat as account B and confirm neither account can read or update the other account’s row.

## Roll back

If a rollback is necessary, first deploy the app version from before this feature, then run `supabase/rollbacks/202609060009_mtap_personalization_rollback.sql`. The rollback removes the two columns and their saved values; it does not modify grades or any other study data.
