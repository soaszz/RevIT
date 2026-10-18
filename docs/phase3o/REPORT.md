# Phase 3O — resume update — 2026-10-18

Resumed from the pause checkpoint below; no restart, no staging execution. Offline first-action test passed **12/12** (`tests/atomic-staging-operator.test.ts`).

One genuine defect found and fixed in `public.complete_verified_study_session`. Its aggregate `select ...` returns six expressions but the `into` list had only five targets, so `md5(jsonb_agg(to_jsonb(a) ...))` was silently dropped and the declared `fingerprint` variable — read at the idempotent-retry check and stored in the persisted receipt — stayed NULL. For a multi-scalar `INTO` list PL/pgSQL assigns only the first `row->nfields` columns and ignores extras (Verified against REL_17_STABLE `exec_move_row_from_fields`; no error unless the opt-in `strict_multi_assignment` check is enabled), so the function compiled but stored `fingerprint = null`, which the staging operator's `checkFixture` rejects (`/^[a-f0-9]{32}$/`). Fixed by binding the `md5(...)` result to `fingerprint`. No other target/expression misalignment exists in the migration.

Consequent reviewed-hash updates only: Migration 28 source SHA-256 is now `51bfb27815b9cba2f91f9b8e1af1ae0ce9cfd29d4cfa6acd01e52e1f04292b08`; `docs/phase3o/SOURCE_HASHES.json` migration pin updated. Migration 27 remains byte-identical. No SQL/database execution, migration application, activation, production access, deployment, commit or push. STOP before the first staging write.

Follow-up fix 2026-10-18 (approved installation authored `NO-GO — COVERAGE_METADATA`). Root cause was an operator parser defect, not staging drift: install mode feeds the pinned Phase 3N reference log through the same `coverage()` parser as the live `-A -t` output, but that historical log is psql *aligned* format whose JSON row carries a leading space (` {"indexes"...`), so `startsWith('{')` matched zero rows. The live capture was clean (one JSON row, exact `ROLLBACK` + completion markers) and its parsed object is **deep-equal** to the reference; the live `before` snapshot's registry and disabled config are also deep-equal to the accepted Phase 3N baseline. Fixed only the parser: `coverage()` now trims before the `{` check (`trimStart().startsWith('{')`, `JSON.parse(rows[0].trim())`); markers/must-be-exactly-one rules unchanged. Exported `coverage` and added a focused regression that parses the real pinned reference log. No expected evidence was changed. Migration 28 remains ABSENT (re-verified read-only).

Follow-up fix 2026-10-18 (approved installation authored `NO-GO — CLI_FAILED`). Exact failing command was `supabase migration fetch` (operator label `history-fetch`), exit 1, stderr `if any flags in the group [db-url linked local] are set none of the others can be; [db-url linked] were all set`. `cliArgv()` injected `--linked=false` together with `--db-url`, but the CLI groups `--linked/--local/--db-url` as mutually exclusive, so it refused before list/dry-run/`db push`. Fixed only the invocation: dropped `--linked=false` (the explicit `--db-url` is the single selector; guards against `link`/`--linked`/`--include-roles`/`--include-seed` in args retained). Operator `scripts/phase3o/staging-validation.mjs` SHA-256 now `7c71121da3018a0deb6d602893f3874ac943a0acbfef5e31315209c697a7c916`; `SOURCE_HASHES.json` SHA-256 now `e67d49a9120636e2a5ca36c99671e663e2acabf3ab26cd527852fdeb52d25204`; launcher manifest anchor synced. Migration 28 ABSENT; no partial installation (failure preceded any write).

Follow-up fix 2026-10-18 (approved installation authored `NO-GO — MIGRATION_REGISTRY`, masking a real `SQLSTATE 42601`). Precise root cause: the `complete_verified_study_session` IF condition used an **unparenthesised `CASE ... END`** expression. PL/pgSQL's expression reader terminates an unparenthesised `CASE` at its first top-level `THEN`, truncating the IF condition; the remainder is misparsed and the migration aborts with `syntax error at end of input (SQLSTATE 42601)`, position at the `then` (`At statement: 8`). Reproduced exactly with the PostgreSQL 17.11 pl/pgsql parser (in-memory WASM build, no server): the original body fails `syntax error at end of input` at the `then` offset; the parenthesised form compiles clean. Fixed minimally by parenthesising the CASE expression — `if (case when s.mode in ('adaptive','weakness_focus') then ... end) then` — semantics unchanged. New Migration 28 source SHA-256 `0e3ab7f493080f252ca95dfb4a983e0566ba1d67f29ba107d662ee207796f049`; `SOURCE_HASHES.json` migration pin updated.

Operator error-reporting fix (registry postcheck **not** weakened): `cliRun` now classifies a failed `db push` by SQLSTATE into `MIGRATION_SQL_FAILED: SQLSTATE 42601` (else `CLI_FAILED`), and post-install inspection through the new `settleInstallation(...)` helper records a secondary `MIGRATION_REGISTRY` code but rethrows the first CLI/SQL failure as the primary result; the outer catch renders `NO-GO — MIGRATION_SQL_FAILED: SQLSTATE 42601`. Operator `scripts/phase3o/staging-validation.mjs` SHA-256 now `48ac7d47e865a56a4ed41b5a5cb2466a3a3d545b0a392a86b8423a75c613de8a`; `SOURCE_HASHES.json` SHA-256 now `cfbf15673b616aa283f20eba7ab7750724b737b6eb2422317f0e445fcdd1ea97`; launcher manifest anchor synced; all 15 source pins match. This value **supersedes** the earlier `51bfb278…` migration pin, `7c71121d…` operator pin and `e67d49a9…` manifest anchor recorded above. Migration 28 remains ABSENT, read-only re-verified: registry holds 202610160027 only (no 202610170028), zero of the five Migration 28 routines or typed columns exist, `public.trusted_study_config` is the single disabled row (`id=1, enabled=false`), `pg_prepared_xacts = 0`, server `17.11`; no partial installation.

Offline installation-path validation 2026-10-18: **25/25** focused tests pass across `tests/atomic-staging-operator.test.ts` and `tests/atomic-study-completion.test.ts`, covering the corrected Migration 28 static contract, the real captured aligned coverage-format regression, the `--db-url` (no `--linked`) invocation regression, the fetched Phase 3N history fixture normalization, exactly-one-pending / no- and multiple-pending rejection, dry-run and migration-list step ordering, SQL/db-push failure classification (`MIGRATION_SQL_FAILED`), registry-failure non-masking via `settleInstallation`, a successful install snapshot path, five-routine / five-column / signature / `SECURITY DEFINER`+`search_path`+grants verification, configuration-disabled postcondition, missing routine/column rejection, and exclusive+fsync+hash-verified durable evidence. The corrected `complete_verified_study_session` also compiles clean against the PostgreSQL 17.11 parser. `npx tsc --noEmit` clean, ESLint clean, `node --check` clean, launcher PowerShell AST 0 errors, all 15 source pins and the launcher manifest anchor match.

---

# Continuation checkpoint — Phase 3O paused by user — 2026-10-17

**Preparation incomplete; no staging execution authorized or performed here.** Resume this checkpoint, not a new phase. Historical report below remains unchanged; this entry supersedes its local-server-repair/default-launcher instructions.

## Current working-tree inventory

Implementation inventory carried forward from this checkpoint; no Git commands used. Existing files edited for Phase 3O:

- `app/RevITApp.tsx`
- `app/lib/server/trustedStudyPersistence.ts`
- `app/lib/server/trustedStudyRoutes.ts`
- `app/lib/trustedStudyClient.ts`
- `tests/trusted-study.test.ts`
- `tests/trusted-integration.test.ts`
- `scripts/phase3n/assert-preserved.mjs`
- `docs/phase3n/REPORT.md`, `STATUS.md`, `AGENT_HANDOFF.md`

New Phase 3O files, including subsequent edits:

- `app/api/study/completion/route.ts`
- `supabase/migrations/202610170028_atomic_study_completion.sql`
- `supabase/rollbacks/202610170028_atomic_study_completion_rollback.sql`
- `supabase/tests/atomic_study_completion_fixture.sql`
- `supabase/tests/atomic_study_completion_local_setup.sql`
- `supabase/tests/atomic_study_completion_snapshot.sql`
- `supabase/tests/atomic_study_completion_verification.sql`
- `scripts/phase3o/local-postgres.mjs`
- `scripts/phase3o/staging-validation.mjs`
- `tests/atomic-study-completion.test.ts`
- `tests/atomic-staging-operator.test.ts`
- `docs/phase3o/REPORT.md`, `STAGING_RUNBOOK.md`, `authorized-changes.json`, `SOURCE_HASHES.json`, `run-staging-validation.ps1`

Interrupted staging work touched only the existing staging validator/launcher, snapshot SQL (UTC/ISO serialization), source manifest, and new operator tests. This pause updates only this report and handoff. Ignored `scratch/phase3o/` contains local mock artifacts/logs, not live PostgreSQL evidence.

## What the interrupted work completed

Extended the existing one-command staging operator, rather than creating another executor. Explicit mutually exclusive modes: `-InstallMigration28`, `-ValidateRuntime`, `-RecoverEvidence <original-dir>`; bare invocation fails closed. Prepared isolated CLI history reconciliation/list/dry-run/install, fresh staging/preservation gates, installed-definition verification and installation receipt. Installation mode does not start runtime tests.

Prepared automated independent-service-role completion contention, rollback-only assertions, actual deferred COMMIT-failure probe, original durable baseline/seed/restore exports, pooler-aware drain, guarded manifest-only cleanup/restoration and retained-artifact recovery. Reuses Phase 3N controller/baseline helpers; does not execute its scenarios. Runtime mode requires separately scoped approval for committed synthetic setup and temporary configuration/ACL changes. All orchestration remains unexecuted against PostgreSQL/CLI.

## Validation and interruption limits

Earlier local operator/static run: **16 PASS, 0 FAIL**, `scratch/phase3o/operator-tests.log`; later baseline-decoder/recovery-test and guard edits were not rerun. Earlier TypeScript and focused lint passed before the final edits. Initial Phase 3O suite remains **47/48**, sole failure the historical CLI-cache preservation mismatch; do not suppress its guard or change expected content.

At this pause: `node --check scripts/phase3o/staging-validation.mjs` passed; launcher PowerShell AST has zero parse errors; all **15 source pins match**, including launcher manifest anchor. Manifest SHA-256 (updated 2026-10-18): `e67d49a9120636e2a5ca36c99671e663e2acabf3ab26cd527852fdeb52d25204`.

No obvious syntax-truncated validator/launcher found. Final control-flow/generated-SQL consistency, latest recovery mock, full runtime-equivalence assessment and installation readiness remain unvalidated. Do not equate syntax/pins or mocked tests with engine evidence. `STAGING_RUNBOOK.md`, `STATUS.md`, aggregate report and older entries still describe the previous local-infrastructure/default rollback-only path; update them only after focused validation. No local PostgreSQL repair: missing `share/postgres.bki` remains an infrastructure limitation.

## Exact first action next session

Run only the current focused offline operator test file, then resolve concrete failures in its installation/cleanup/recovery branches before any staging authorization request:

```powershell
node --import tsx --test --test-isolation=none tests/atomic-staging-operator.test.ts
```

Do not run the staging launcher as that first action. After offline validation, finish the existing runbook/equivalence summary and request separate Migration 28 installation approval; runtime synthetic writes require their own scope. Do not reopen Phase 3N or repeat completed architecture mapping.

## Safety boundary

Migration 28 remains uninstalled by this work; no fresh remote registry inspection performed. Exact reviewed identity: `202610170028 / atomic_study_completion`; source SHA-256 `51bfb27815b9cba2f91f9b8e1af1ae0ce9cfd29d4cfa6acd01e52e1f04292b08`. Migration 27 remains pinned unchanged. No database connection, SQL, migration application, real-user activation, production access, deployment, environment-file changes, commit or push occurred. No fresh live configuration/preservation claim. Phase 3N completion remains accepted; Phase 3O engine assertions/concurrency remain NOT TESTED. No Phase 3P.

---

# Phase 3O — atomic rewards and session completion

2026-10-17. **NO-GO — atomic transaction runtime validation unavailable.** Implementation, rollback, focused application tests and staging operator are prepared. The installed PostgreSQL 17.11 binaries cannot initialize a disposable server: `share/postgres.bki` is absent. No SQL test, local server, staging connection, migration application or production operation occurred. Do not treat the prepared PostgreSQL tests as passing.

Phase 3N is COMPLETE by the user's explicit accepted result: `PHASE 3N COMPLETE — SCENARIOS 6 AND 12 PASS; STAGING RESTORED`. Earlier repository entries describing an unfinished retry are historical. This checkpoint neither reopened N nor independently re-executed its evidence. Migration 27 remains byte-identical: `aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589`.

## Writer map

| State | Existing writer / caller | Existing boundary and retry behavior | Phase 3O path |
|---|---|---|---|
| Attempts, provenance, numbering | Browser legacy queue → `record_question_attempt`; dormant API → `commit_verified_study_batch` | One attempt/batch RPC; UUID/slot conflicts rejected; effects were separate | New `commit_rewarded_study_batch` calls unchanged Migration 27 under its owner lock, then applies effects in the same transaction |
| Session completion | `RevITApp.nextQuestion` / early exit → browser `study-session:<id>` event → `record_study_activity` | Separate from attempts; legacy completion accepts any prior answer; local display provisional | Normal finish queues `/api/study/completion`; database validates the immutable session and accepted ordered IDs, writes completion/event/reward/receipt together |
| Activity, daily counts, total XP | `xpService` cloud queue → `record_study_activity`; browser calculates provisional amounts | Event uniqueness helps retries; attempts and achievements can already have committed separately | Existing `activity_events` unique owner/key is the effects ledger; no parallel XP store |
| Reinforcement / Mistake Bank | `completeQuestion` local state plus browser reinforcement upsert/delete | Separate request; could disagree with durable attempt | Newly accepted answer event applies correct→delete or wrong→increment capped at 3 atomically; retry does not repeat it |
| Achievement unlock / XP | Browser/local catalog; separate `check_and_unlock_achievements` RPC | Unique owner/achievement; independent RPC failure could leave XP incomplete | Actual inserted study unlocks and XP share the effect transaction; no reward for a duplicate unlock |
| Levels / streaks | `xpConfig.levelForXp`; daily activity → longest meaningful streak | Derived values, no independent level/streak row | Same level formula and Manila dates; derive level from authoritative total XP |
| Mastery / performance | Attempt history → browser analytical/adaptive calculations | No separate authoritative mastery write identified | Preserved; no new counters or rewritten attempt history |
| Leaderboards | Existing SQL reads attempts and `activity_events.leaderboard_xp` | Legacy readers do not consistently enforce `competitive_at`; cutover pending | New effects set leaderboard XP to 0; trusted attempts retain NULL competitive time; no reader/eligibility cutover |
| AI / exams / missions / milestones | Legacy activity RPCs; optional `record_progression_award` and browser progression engine | Separate writers; optional award RPC accepts client amount; local achievements remain provisional | Remain legacy/pending Phase 3P; not silently adopted as trusted study effects |

The browser's local XP/achievement display remains provisional. Trusted mode already suppresses legacy attempt/reinforcement/activity cloud queues and uses read-only cloud progression refresh. Disabled mode and component JSX remain unchanged. No UI/style work occurred.

## Atomic contract

Newly issued sessions receive `completion_contract=1` through `create_rewarded_study_session`. Older sessions retain NULL and cannot be upgraded/rewarded through this contract. Request creation retains Migration 27's request lock and immutable plan checks.

Accepted batch = unchanged trusted attempt persistence + answer events + daily counts + reinforcement + personal XP + newly crossed study-achievement unlocks. A failure anywhere rolls back the whole batch. Completion = any missing accepted answer effects + one completion event/20 XP + daily review count + newly crossed study achievements + completed timestamp + stored receipt. Previously committed answer rewards legitimately survive abandonment/failed completion; completion does not undo earned answers.

The owner `:trusted-study` advisory lock serializes batches/completions across that owner's sessions. Existing UUID/question locks, historical attempt numbering, response digests, canonical grading and book attribution remain in Migration 27. Event identities: `answer:<attempt UUID>`, `xp:daily-streak:<Manila date>`, `study-session:<server session UUID>`. Owner/achievement uniqueness is retained. Conflicting existing answer/completion effects abort; historical daily awards are reused only with matching date/type/10-XP amount. No legacy row is reclassified as trusted.

Version 1 follows current normal finish rules: strict modes require exactly one accepted attempt for every issued pool question; adaptive/weakness modes require the correct-answer target, plus complete unique coverage when target equals pool size. The database also requires contiguous slots, owner, verified provenance and issued versions. Empty/partial strict work or adaptive work below target cannot complete. Early exit does not submit trusted completion. This is a personal study goal contract, not proof of human effort or a server-selected random question order; farming limits/competitive assessment policy are outside this phase.

Rewards retain correct=5, completion=20, daily=10 and the existing achievement catalog. Only newly crossed questions/streak/session thresholds unlock in this flow; no retrospective achievement payout or historical XP rewrite. AI/exam achievements stay outside study transactions. Levels use `25*(level-1)*(level+2)`. Completion retries return the identical persisted receipt, including after expiry; changed IDs/fingerprint fail. UTC inside completion keeps timestamp serialization stable for the immutable-attempt fingerprint. No client reward totals, correctness, dates, owner or attempt numbers are accepted.

All five new routines are fixed-search-path SECURITY DEFINER, installed only as postgres. Three entry RPCs grant service-role execution; metrics/effects helpers deny browser and service direct execution. They reuse Migration 27's service-role/READ COMMITTED/configuration/fenced-writer guard. No original legacy grants are permanently changed. Both runtime and database activation remain off; Phase 3P must still close/drain competing legacy writers before real-user use.

## Files and database change

- Migration: `supabase/migrations/202610170028_atomic_study_completion.sql`; expected registry `202610170028 / atomic_study_completion`; SHA-256 `51bfb27815b9cba2f91f9b8e1af1ae0ce9cfd29d4cfa6acd01e52e1f04292b08`.
- Adds two nullable session fields and three nullable event provenance fields, five routines; no backfill, new table, FK/dependency edge, leaderboard change or configuration update.
- `supabase/rollbacks/202610170028_atomic_study_completion_rollback.sql`: disabled-only interface rollback. Drops only new routines; retains earned effects, history, receipts and nullable columns. Does not repair registry or restore browser authority.
- Backend: `app/lib/server/trustedStudyPersistence.ts`, `trustedStudyRoutes.ts`, new `app/api/study/completion/route.ts`.
- Client: `app/lib/trustedStudyClient.ts`, three normal-finish integration points in `app/RevITApp.tsx`. Durable pending completion waits for every queued attempt acknowledgement; lost responses retry identical IDs; rejected/conflicting work is retained and cannot skip ahead. No automatic completion on early exit.
- Tests: `tests/atomic-study-completion.test.ts`, updated `trusted-study.test.ts`, `trusted-integration.test.ts`; four `supabase/tests/atomic_study_completion_*.sql` files; `scripts/phase3o/local-postgres.mjs`.
- Staging preparation: `scripts/phase3o/staging-validation.mjs`, `docs/phase3o/run-staging-validation.ps1`, `SOURCE_HASHES.json`, `STAGING_RUNBOOK.md`.
- Preservation: `scripts/phase3n/assert-preserved.mjs` extends the existing exact hash chain through `docs/phase3o/authorized-changes.json`. An initial proposal to exempt integrated files was rejected by automatic approval review. No exemption was applied; previous snapshots and all non-integrated file checks remain intact.

## Actual validation

| Check | Observed result |
|---|---|
| Focused test run: atomic static/operator, trusted persistence, routes/client, pure effects | **47 PASS / 1 FAIL**, 48 total, exit 1; `scratch/phase3o/final-tests.log` |
| Failure | Historical preservation test detects empty `supabase/.temp/cli-latest`: actual SHA `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, expected `103e9d7a97f9a66c28586ffae6f8d81a90630d5cb2c537b23ed886a5e0e5ff01`; cache and expected hash left untouched |
| Complete existing preservation inventory | 294 checked, only the same CLI-cache mismatch; authorized integration edits follow exact before/after pins |
| TypeScript `tsc --noEmit` | PASS, exit 0 |
| Changed application/test lint | Exit 0; 0 errors, 36 warnings in existing `RevITApp.tsx` areas; `scratch/phase3o/lint.log` |
| New operator/local harness + preservation helper lint (`--no-ignore`) | PASS after correcting a local harness unsafe-finally throw; exit 0 |
| JavaScript syntax, PowerShell AST, reviewed-source pins | PASS; launcher not executed |
| Local PostgreSQL initialization attempt | Failed before server startup: `initdb: error: file "C:/Program Files/PostgreSQL/17/share/postgres.bki" does not exist`; initial sandbox child spawn also required approved local-test escalation |
| SQL normal/all/partial/zero-correct, daily/reinforcement/XP/achievements, retries/conflicts/auth, overflow and injected failures | **NOT TESTED in PostgreSQL**; prepared rollback-only assertion suite is not runtime evidence |
| Concurrent identical completion / deferred pre-COMMIT failure / rollback probe | **NOT TESTED**; localhost harness prepared with separate actual service-role sessions, PID/blocking evidence and independent baseline comparison |
| Staging / Migration 28 application | **NOT RUN / NOT APPLIED by this checkpoint** |

Application tests exercise cookie/account/Pro gates, malformed/untrusted fields, receipt validation, queue ordering and durable retries; SQL static checks exercise source boundaries/security/preservation/operator rejection behavior. They do not prove PostgreSQL atomicity, lock scheduling, grants at runtime or SQL compilation. No assertion count or SQLSTATE from an unexecuted SQL suite is claimed.

## Next actions / stop boundary

1. Repair/install the local PostgreSQL server support component, then run `node scripts/phase3o/local-postgres.mjs`. This uses only a disposable loopback cluster, strips staging connection variables, stops owned clients/server and retains evidence. It does not execute Phase 3N scenarios. Resolve any actual engine failures before staging execution approval.
2. Treat the historical CLI-cache mismatch separately; do not suppress the guard or recreate its expected content to force a pass.
3. Follow [staging runbook](STAGING_RUNBOOK.md): separately approve exact Migration 28 installation via the established isolated CLI history workflow; require only 28 pending. Then use the prepared one-command private-shell rollback validation operator. It refuses missing/wrong versions, source drift, nonempty dependency state, unsafe roles/configuration or non-quiescent clients.

No database connection, feature activation, environment edit, installation, production access, permanent legacy revocation, deployment, Git command, commit or push occurred. Phase 3P, real users, rewards activation, leaderboard cutover, Strasinger synchronization and client runtime activation remain pending. This is one Phase 3O checkpoint; no O1/O2 microphases were created.
