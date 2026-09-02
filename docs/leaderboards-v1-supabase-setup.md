# RevIT Leaderboards V1 implementation and Supabase setup

## Architecture summary

Leaderboards are calculated in PostgreSQL from RevIT's existing `question_attempts`, `activity_events`, `profiles`, and `user_preferences` records. The browser sends only validated filter values and renders the aggregate RPC response; it never uploads a leaderboard total and never downloads another learner's attempts.

The implementation reuses:

- `profiles.first_name`, `profiles.username`, and `profiles.avatar_url` for the public display identity.
- `question_attempts` for question totals and first-attempt accuracy.
- `question_attempts.subject_id` for subject scopes.
- `activity_events` as the existing idempotency and XP-event ledger.
- `user_progress.total_xp` for account levels without changing its meaning.
- `user_preferences` for privacy consent.
- The bundled `reviewerContent` subject catalog for the filter UI, so newly added content subjects appear automatically.

No second profile, question, subject, attempt, XP, streak, or session system is introduced.

## Files

The database migration is [`supabase/migrations/202609030006_leaderboards_v1.sql`](../supabase/migrations/202609030006_leaderboards_v1.sql). That file is the complete SQL to apply—copy it from the first line through the final `commit;` statement without editing or selecting only part of it.

The matching rollback is [`supabase/rollbacks/202609030006_leaderboards_v1_rollback.sql`](../supabase/rollbacks/202609030006_leaderboards_v1_rollback.sql).

The disposable-project RLS checks remain in [`supabase/tests/rls_checks.sql`](../supabase/tests/rls_checks.sql).

## Database changes

### Existing tables used

- `profiles`: safe display name and avatar only. Email and auth metadata are never selected by a leaderboard function.
- `user_preferences`: existing own-row preference storage.
- `question_attempts`: authoritative stored answer history and subject attribution.
- `activity_events`: existing unique `(user_id, event_key)` idempotency ledger.
- `daily_activity`: existing private analytics and streak totals; not used to rank question totals or accuracy.
- `user_progress`: existing lifetime account XP.
- `user_achievements` and `achievements`: existing one-time achievement path. Achievement XP is not copied into leaderboard Study XP.
- `ai_chats`, `ai_messages`, and `exam_schedule`: used only to validate known first-message, AI-study, and first-exam events.

### Columns added

`user_preferences` gains:

- `leaderboard_opt_in boolean not null default false`: explicit consent. All existing and new accounts begin opted out unless the learner turns it on.

`activity_events` gains:

- `event_type`: database-validated event classification.
- `subject_id` and `subject_name`: copied only from a matching stored question attempt.
- `xp_awarded`: the server-selected amount added to lifetime account XP.
- `leaderboard_xp`: the subset eligible for Study XP rankings.
- `occurred_at`: timestamp of the validated source activity.

Unclassified legacy events may retain a null `event_type`; they receive no leaderboard XP. Legacy answer/session/streak rows are backfilled only when a matching authoritative record exists.

### Functions added

- `leaderboard_timezone()`: the single `Asia/Manila` period and deduplication timezone.
- `leaderboard_accuracy_minimum(period)`: the single source of truth for Daily 20, Weekly 75, and All-Time 200.
- `leaderboard_period_start(period)`: Daily midnight, Monday midnight for Weekly, or no lower bound for All-Time.
- `leaderboard_metric_rows(period, metric, subject_id)`: private internal aggregate that retains UUIDs only while calculating.
- `get_leaderboard(period, metric, subject_id, limit, offset)`: authenticated, public-safe page of opted-in ranks; page size is capped at 50.
- `get_current_user_leaderboard_position(period, metric, subject_id)`: authenticated private stat, eligibility progress, opt-in state, public rank, and percentile for `auth.uid()` only.

`record_question_attempt` is hardened from invoker rights to a constrained `SECURITY DEFINER` writer after direct table writes are revoked. `record_study_activity` is replaced with a two-argument writer that accepts an event key and known type—not an XP amount.

### Indexes added and why

- `question_attempts_leaderboard_period_idx (answered_at, user_id, question_id)`: global Daily/Weekly period scan and daily deduplication.
- `question_attempts_leaderboard_subject_period_idx (subject_id, answered_at, user_id, question_id)`: subject plus period scan.
- `activity_events_leaderboard_xp_period_idx (occurred_at, user_id) where leaderboard_xp > 0`: compact Overall Study XP period scan.
- `activity_events_leaderboard_xp_subject_period_idx (subject_id, occurred_at, user_id) where leaderboard_xp > 0 and subject_id is not null`: subject Study XP scan without indexing ineligible events.

These are not duplicates of the existing user-first private-analytics indexes; leaderboard queries begin with time or subject across participating users.

## Ranking calculations

- Questions: count the first stored attempt for each `(user, question, Asia/Manila calendar day)` within the selected period.
- Accuracy: use those same first daily attempts; a wrong first answer stays wrong even when later retries are correct. Learners below 20/75/200 eligible questions are excluded from public Daily/Weekly/All-Time accuracy ranks.
- Study XP: sum `activity_events.leaderboard_xp`. Values are selected in PostgreSQL from known event types. Correct-question XP is leaderboard-eligible only on the first daily attempt. Valid recorded session completions and validated daily streaks count Overall. One-time first-message, first-exam, and achievement bonuses do not.
- Subject scope: filter stored attempts by `question_attempts.subject_id`. Study XP enters a subject scope only when the database copied a reliable subject from a matching question attempt; unattributed session/streak XP remains Overall-only.
- Rank: `row_number` over metric descending, eligible-answer count descending, then an internal UUID tie-breaker. UUIDs are never returned.
- Current user: computed separately so an eligible opted-in learner outside the current Top 50 still sees their rank. An opted-out learner receives private progress but no public rank.

## Anti-farming and request-retry behavior

- Exact attempt retries reuse the existing stable attempt UUID and return the prior row.
- Direct authenticated writes to `question_attempts`, `daily_activity`, `activity_events`, `user_progress`, and `user_achievements` are revoked; constrained RPCs perform writes instead.
- A question contributes at most once per learner per Manila day to Questions and Accuracy, using the earliest `(answered_at, id)` deterministically.
- Repeating a wrong question until correct does not change leaderboard Accuracy and does not create correct-question leaderboard XP that day.
- `activity_events` still has its unique `(user_id, event_key)` key, so replaying an answer/session/streak request cannot add XP twice.
- Session XP requires at least one stored attempt bearing that session UUID. The existing UI decides when its configured session is complete; the database refuses an event with no matching activity.
- The database validates AI and exam bonuses against existing saved messages/exams and fixes all XP values itself.
- Adaptive review attempts continue to be stored and used by private learning analytics; only leaderboard credit is deduplicated.

## RLS and security

No RLS policy is removed, weakened, or made public. No new cross-user table policy is added.

Existing own-row SELECT policies continue protecting `question_attempts`, `activity_events`, `daily_activity`, `user_progress`, `user_achievements`, `profiles`, and `user_preferences`. Table write grants are narrowed for authoritative activity/XP tables. The leaderboard RPCs require an authenticated `auth.uid()`, use `SECURITY DEFINER` because normal RLS correctly blocks cross-user aggregation, set `search_path = pg_catalog, public`, validate every filter, cap pages at 50, and return only rank, display name, avatar, metric, and current-user summary fields.

## SUPABASE SETUP - EXACT STEPS

1. Open **Supabase Dashboard → RevIT project**.
2. Open **SQL Editor → New query**. Manual execution is necessary unless your deployment already runs `supabase/migrations` through the Supabase CLI.
3. Open [`supabase/migrations/202609030006_leaderboards_v1.sql`](../supabase/migrations/202609030006_leaderboards_v1.sql) locally.
4. Copy the full file. It begins with `-- RevIT Leaderboards V1` and ends with `commit;`.
5. Paste it into the SQL Editor and click **Run** once. Do not paste the rollback file.
6. Confirm the editor reports success. The migration is idempotent for columns, constraints, indexes, and replaced functions, but it should still be treated as a versioned one-time migration.

### Verify the schema

Under **Table Editor → user_preferences**, confirm `leaderboard_opt_in` exists, is Boolean, is not nullable, and defaults to `false`.

Under **Table Editor → activity_events**, confirm `event_type`, `subject_id`, `subject_name`, `xp_awarded`, `leaderboard_xp`, and `occurred_at` exist. Do not make this table publicly writable.

Under **Database → Functions**, confirm these API functions exist:

- `get_leaderboard`
- `get_current_user_leaderboard_position`
- `record_study_activity` with exactly `(text, text)` arguments
- `record_question_attempt`

The three `leaderboard_*` helper functions also exist, but API roles intentionally have no direct execute grant on the internal helpers.

### Verify opt-in

1. Sign in to RevIT with a test account.
2. Open the profile card → **Privacy**.
3. Confirm **Appear on Leaderboards** starts unchecked for an existing account.
4. Turn it on and save.
5. In **Table Editor → user_preferences**, filter `user_id` to that account and confirm `leaderboard_opt_in = true`.
6. Turn it off in RevIT and confirm it returns to `false`. Private attempts, XP, achievements, and progress should remain unchanged.

### Verify one account cannot read another account's attempts

Get two test auth UUIDs from **Authentication → Users** and replace `USER_B_UUID` and `USER_A_UUID` below. Run this in SQL Editor. A safe result is zero rows, even when Account A has attempts:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"USER_B_UUID","role":"authenticated"}',
  true
);
select *
from public.question_attempts
where user_id = 'USER_A_UUID'::uuid;
rollback;
```

For a disposable Supabase project, running [`supabase/tests/rls_checks.sql`](../supabase/tests/rls_checks.sql) performs the same two-identity proof and checks default opt-out plus accuracy eligibility. Do not run that synthetic-user script in production.

### Test Daily, Weekly, and All-Time RPCs

Sign in as a test account in RevIT first. To exercise the RPC in SQL Editor, replace `TEST_USER_UUID`, keep the transaction wrapper, and run each query:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"TEST_USER_UUID","role":"authenticated"}',
  true
);

select * from public.get_leaderboard('daily', 'questions', null, 50, 0);
select * from public.get_leaderboard('weekly', 'questions', null, 50, 0);
select * from public.get_leaderboard('all_time', 'questions', null, 50, 0);

select * from public.get_leaderboard('daily', 'accuracy', null, 50, 0);
select * from public.get_leaderboard('weekly', 'accuracy', null, 50, 0);
select * from public.get_leaderboard('all_time', 'accuracy', null, 50, 0);

select * from public.get_leaderboard('daily', 'study_xp', null, 50, 0);
select * from public.get_leaderboard('weekly', 'study_xp', null, 50, 0);
select * from public.get_leaderboard('all_time', 'study_xp', null, 50, 0);

select * from public.get_current_user_leaderboard_position('daily', 'accuracy', null);
rollback;
```

Expected: only opted-in profiles appear; no output contains email, auth UUID, or raw attempt fields. The current-position accuracy row reports `minimum_required` as 20/75/200 and `questions_needed` until qualified.

### Test subject scopes

Use the exact subject ID shown by the existing content catalog, not its display name. Current examples are `bacteriology` and `hematology`:

```sql
select * from public.get_leaderboard('weekly', 'questions', 'bacteriology', 50, 0);
select * from public.get_leaderboard('weekly', 'accuracy', 'hematology', 50, 0);
select * from public.get_leaderboard('weekly', 'study_xp', 'bacteriology', 50, 0);
```

Repeat the nine period/metric combinations for at least two subjects in the RevIT UI. A subject without eligible activity should show **No ranked activity for this subject yet.**

### Test anti-farming and existing behavior

1. With one opted-in test account, answer the same question ten times on one Manila date. Questions must increase by one, not ten.
2. Make the first attempt wrong and the next nine correct. Accuracy must show one eligible answered question and zero eligible correct answers for that question.
3. Replay the same event request or refresh while a queued event syncs. Its unique event key must add XP only once.
4. Complete a normal configured study session. Session XP should appear Overall only after stored attempts exist.
5. Confirm repeated wrong-answer practice still appears in Review Library/Weakness/Progress even though leaderboard credit is deduplicated.
6. Regression-check Review Library, adaptive repetition, Progress, XP/levels/achievements, AI and saved chats, calendar/planner, exams, grades/simulator, streaks, authentication, and both themes.

## Rollback

Rollback removes the opt-in value and leaderboard event metadata, so export/backup any data you need first.

1. Re-deploy or prepare to re-deploy the application commit immediately before Leaderboards V1; the old client expects the old activity RPC signature.
2. Open **Supabase Dashboard → RevIT project → SQL Editor → New query**.
3. Copy all of [`supabase/rollbacks/202609030006_leaderboards_v1_rollback.sql`](../supabase/rollbacks/202609030006_leaderboards_v1_rollback.sql), paste it, and click **Run**.
4. Confirm the two leaderboard API functions and four new indexes are absent, `leaderboard_opt_in` is absent, the six event-ledger columns are absent, and `record_study_activity` again has the legacy seven-argument signature.
5. Re-run the pre-leaderboard application build and core regression tests.

The rollback is transactional, but dropping the added columns discards leaderboard-specific consent and XP-event metadata and cannot recover those values without a database backup.

## Assumptions

- All competitive period boundaries use Asia/Manila, matching RevIT's existing default. A leaderboard must use one common zone rather than giving each participant a different window.
- The bundled question catalog remains the source of subject filters; Supabase stores the existing subject snapshot on attempts.
- Stored `question_attempts` are RevIT's authoritative attempt records. The database can validate ownership, idempotency, ordering, and consistent metadata, but the full 1,244-question answer bank is intentionally not duplicated into Supabase.
- The existing UI's configured review completion remains the session definition; the database adds the minimum server check that the session UUID has stored question activity.
