# Phase 3N-K: cutover safety and repeated attempts

Date: 2026-10-16. **READY FOR SEPARATE STAGING INTEGRATION REVIEW.**

Local preparation is complete. This is not activation, deployment, SQL execution or permission to connect to staging. The proposed migration must pass an independently authorized PostgreSQL review and synthetic execution before use. Rewards and completion remain disabled in the trusted path.

## Findings and local fixes

1. Migrations 25/26 insert `attempt_number = 1`, conflicting with existing `(user_id, question_id, attempt_number)` uniqueness. New Migration 27 proposes locked database allocation; existing migrations and records remain untouched.
2. Configuration was checked only in Next.js. Migrations 25/26 do not read `trusted_study_config`; their `CURRENT_USER` test runs as the SECURITY DEFINER owner, so it does not independently establish caller identity. The proposal adds a transaction-held database configuration lock, request-role validation and an effective legacy-writer privilege fence.
3. Startup's `loadCloudProgression` calls `check_and_unlock_achievements`; its name did not imply a read-only operation. The selected trusted branch now uses `loadCloudProgressionReadOnly`, which reads existing balances/unlocks without any reward RPC. The default-off legacy loader remains unchanged.
4. Queue pruning erased the controller's memory of accepted UUIDs. Calling `recordAttempt` again could assign the same ID a new slot. Each session now retains an attempt-ID/slot ledger after pruning and restoration; already tracked IDs cannot acquire another slot. Older saved sessions retain their pending queue and next slot; IDs acknowledged before this ledger existed cannot be reconstructed without server evidence and must not be blindly reimported.
5. If session creation failed before reaching the server, retrying after local answers existed could create a newly issued session retrospectively. Such retries now send `resumeOnly: true`. The authenticated server can recover an existing matching owned request through an owner-scoped read but cannot invoke creation. If absent, work stays local/unissued. An issuance request that genuinely reached the server but lost its acknowledgment can still recover its binding.
6. The required secret check hit its existing 256 MiB buffered Git-history limit. It now streams the same complete history line by line through unchanged detection rules. Tests and a saved detector-definition hash confirm no pattern or assertion was weakened. Failed child-process diagnostics are retained without the error object's embedded Git patch contents.

Scope remained local. No question, image, layout, card, entitlement rule, reward constant, existing migration or rollback file was changed.

## Attempt-numbering proposal

`supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql` replaces only the two trusted RPC definitions and adds an internal guard. It adds no attempt-number column, allocation table or index. Existing constraints and indexes suffice.

- `id`: immutable global attempt UUID and retry key.
- `(session_id, session_slot)`: immutable placement inside an issued session; separate from historical numbering.
- `(user_id, question_id, attempt_number)`: existing chronological per-question numbering, including legacy history and all sessions.

The trusted commit locks one owner, the owned session row, sorted attempt UUIDs and sorted question IDs. The question lock uses exactly `hashtextextended(owner || ':' || question_id, 0)`, matching the existing legacy attempt RPC namespace. All trusted calls for one owner serialize; different owners remain independent except colliding UUIDs or advisory hashes. The later cutover must stop untrusted legacy writers; sharing a lock does not make their correctness trustworthy.

Under the question lock, a new UUID receives `coalesce(max(attempt_number)::bigint, 0) + 1`. Existing legacy gaps are respected: history 1 and 7 yields 8, then 9. No row is renumbered, reconciled, overwritten or backfilled. Integer exhaustion fails before insertion. `review_mode` comes from the owned session; repeat status derives from existing history rather than a browser number. Matching selections still persist as NULL in the unchanged smallint/check column. Canonical grading remains in Next.js.

Exact durable retries are checked before allocating another number. Owner, session, slot, question, digest, version, answer, correctness, book and attribution must match. Legacy/unverified rows cannot be promoted by reusing an ID. Slot conflicts fail; a failed batch rolls back all new inserts. Identical retries can return their durable record after expiry without adding credit. Fresh writes recheck expiry after waiting for locks, require unused contiguous slots and cannot write to a completed session.

The proposal requires READ COMMITTED; other isolation levels fail with retryable `40001` instead of allocating from a stale snapshot. Concurrent numbering follows committed lock acquisition order, not a promise that the first launched HTTP request gets the lowest number. Runtime SQL scheduling, deadlocks, visibility, privileges, rollback and throughput are NOT TESTED here.

The proposal sets `competitive_at = NULL` for fresh attempt-only rows. It does not certify new competitive reward eligibility before the reward/leaderboard cutover exists. Existing readers currently aggregate answered-at rows without this future eligibility filter; therefore enabling attempts for real users still requires the eligibility transition described below. All historical provenance remains unchanged.

## Database authorization and privilege checklist

The proposal is transactional and leaves the singleton disabled. It enables RLS on the configuration table, removes browser configuration privileges, permits service-role SELECT only, and preserves owner-scoped session SELECT. The RPC guard checks `auth.role() = 'service_role'` in addition to restricted EXECUTE grants. The helper itself is not exposed for browser or service-role RPC execution; the trusted SECURITY DEFINER functions invoke it internally.

Each transaction reads the singleton `FOR SHARE`, holding the lock through commit. Missing rows, false/null flags, missing/unreadable configuration, wrong JWT role or unexpected isolation fail before writes. Disabling configuration through an owner UPDATE waits for in-flight guarded commits and prevents subsequent guarded writes. A rollback disables configuration and replaces all three new functions with fail-closed stubs; it retains rows, numbering, provenance and ACL hardening, never restores the unsafe Migration 26 implementation or legacy grants.

The enabled guard inspects all installed overloads named `record_question_attempt`, `record_study_activity`, `record_progression_award` and `check_and_unlock_achievements`. Effective anon/authenticated EXECUTE, including PUBLIC/inherited grants, blocks trusted persistence. Effective table or column write permissions on attempt/activity/progress/achievement/mission/reinforcement/session/configuration stores also block it. The proposal does **not** revoke legacy function privileges. With the current legacy grants, turning on the configuration row is insufficient: trusted writes still fail closed until a separately approved cutover fences those writers.

| Object / surface | Source finding | Required authorized runtime evidence |
|---|---|---|
| Configuration table | Migration 25 lacks explicit RLS/ACL lockdown and ignores the flag inside RPCs | Owner, effective table/column ACLs, inherited roles, all policies, SELECT-only service access, missing/false-row failure |
| Sessions | Migration 25 enables owner SELECT policy but explicit SELECT grant was absent there | Correct owner, RLS enabled, no cross-owner reads/writes, no browser DML; immutable plan/request identity |
| Attempts | Historical number uniqueness and session-slot uniqueness coexist | Both exact constraints, selected-answer smallint/check, numbering lock compatibility, no direct browser table/column writes |
| Trusted creation / commit | One known overload each; service EXECUTE and public/anon/authenticated revokes in source | All signatures, owners, effective EXECUTE, definer flag/search_path, actual `auth.role()` behavior, no unexpected overloads |
| Legacy attempt/activity writers | Current named RPCs remain browser-callable in source | Inspect every overload, including older count/date/amount-taking forms; stop all before trusted enablement |
| Progression award | Caller supplies arbitrary amount/key; mission transaction insertion policy also exists | Close RPC and effective direct writes during future cutover; no caller XP accepted by replacement |
| Achievement evaluator | Mutates unlocks/progress from mixed legacy inputs | Restrict invocation at cutover; new evaluation only inside evidence-backed transaction |
| Reinforcement | Authenticated own-row upsert/delete granted in Migration 2 | Close authoritative client writes at cutover; retain owner reads/local provisional behavior |
| Leaderboards | Migration 24 independently restricts both raw helper overloads | Preserve helper hardening and privacy-filtered wrappers; verify owners can call helpers, opt-in and book filters |
| Alternate surfaces | Views, triggers and other definers may provide writers beyond a name list | Review all SECURITY DEFINER functions, view ownership/options, triggers/dependencies, column grants, schema CREATE, role membership and default privileges |

`privilege-checklist.sql` contains catalog-only queries for a later authorized review; it was not executed. Source grants are not fresh effective database verification. Neither RLS nor a Next.js environment flag substitutes for database authorization. The name-based fence is defense in depth and does not certify absence of every unknown writer. Permission DDL, cutover and the disable fence require one coordinated operational authority; arbitrary concurrent privilege changes must be excluded.

PostgreSQL references used for the proposal: [transaction/advisory locking](https://www.postgresql.org/docs/17/explicit-locking.html), [SECURITY DEFINER and EXECUTE permissions](https://www.postgresql.org/docs/17/sql-createfunction.html), [effective privilege inspection](https://www.postgresql.org/docs/17/functions-info.html). Read the installed Next.js data-security guide before local server changes. No live Supabase documentation or database connection supplied implementation evidence.

## Atomic reward and completion design — not implemented or enabled

Existing authority is spread across `record_question_attempt`, direct reinforcement writes, `record_study_activity`, `check_and_unlock_achievements`, `record_progression_award`, browser local progression and privacy-filtered leaderboard readers. The future trusted commit must own attempts plus their consequences in one transaction; it must not call the old auth.uid-based activity RPC using a service token and assume the owner is preserved.

Preserve constants: correct answer 5 XP, completed session 20, daily streak 10, first AI message 10 and first exam 10. Preserve the existing achievement catalog rewards, level formula, metric formulas, thresholds, book filters, tie rules, opt-in privacy and Asia/Manila periods. Correct repetitions currently earn 5 personal XP; only a correct first daily attempt earns competitive answer XP. A wrong first attempt followed by a correct repetition must not become first-daily correct credit.

Future transaction design:

1. Authenticate and authorize in Next.js, derive canonical responses/metadata, then lock the database configuration, owner and issued session. Maintain one owner-level serialization boundary for attempts, daily eligibility and awards. Use DB receipt time, with deterministic per-owner ordering for first-daily competition; never reward a submitted past/future timestamp.
2. Validate all immutable retry/slot/version constraints, insert only new verified attempts, allocate their numbers as proposed here. A duplicate acknowledged UUID performs no reinforcement or reward transition.
3. Apply the existing reinforcement transition exactly once per newly accepted attempt: wrong increments to max 3, correct clears to 0. Never infer reward evidence from client-edited reinforcement.
4. Insert deterministic `answer:<attempt-id>` events under `(user_id,event_key)` uniqueness. Only inserted events increment daily question/correct totals and personal XP. Preserve canonical subject/book attribution and the existing first-daily competitive rule. Aggregate row updates per batch where equivalent.
5. Derive daily streak eligibility from trusted meaningful events and use `xp:daily-streak:<Manila-date>` under the same unique ledger. Existing historical balances/events remain; a retry cannot mint their missing historical rewards.
6. Completion must validate the immutable plan and accepted coverage, then lock/mark `completed_at` and insert `study-session:<server-session-id>` once in the same transaction. Strict review requires all planned unique questions, excluding mere skipped/deferred positions. One attempt never proves completion. Adaptive completion additionally needs authoritative issued-sequence/wrong-extension/full-coverage evidence equivalent to current session rules; a pool plus target alone does not prove the browser's queued sequence. Keep adaptive completion credit disabled until this evidence contract is implemented and tested. Existing local completion feedback continues.
7. Evaluate achievements after durable counters are updated. `(user_id,achievement_id)` uniqueness returns only newly inserted unlocks; sum exactly those catalog rewards into progress. Preserve prior unlocks. Establish and explicitly approve any frozen legacy-counter baseline/grandfather policy rather than automatically fabricating missing historical rewards.
8. Return minimal durable acknowledgments and reward totals only after the complete transaction commits. Lost acknowledgment retries read the same attempt/session/event/unlock records and award nothing again. Any failure rolls back attempts, numbering, reinforcement, events, counters, completion and rewards together.

Exam-created and AI sources need their own existing ownership/evidence semantics and unchanged quotas/entitlements. A client-saved message is not proof of a completed Groq request; unsupported evidence paths stay disabled/noncompetitive. Browser mission XP and inferred study minutes/flashcard counts stay provisional until a trusted evaluator exists. No new reward or formula is introduced here.

Weakness/mastery continues to use canonical correctness, stable IDs and preserved attribution. Future authoritative cloud merging must prefer verified server correctness/numbering/provenance while retaining original local matching selections. The current local feedback path remains unchanged; no historical result is recertified.

## Legacy writer transition matrix

| Record / operation | Before / default-off now | Paused cutover and queue handling | After future approved reward cutover |
|---|---|---|---|
| Question attempts | Existing RPC and legacy queue; local history retained | Stop legacy ingress; classify stable IDs; no blind replay into both paths | Restricted canonical server commit; unissued imports never earn retroactive competition |
| Answer/daily activity and XP | xpService/cloudService invoke activity RPC separately | Freeze accepted legacy balances/events; preserve pending keys and provenance | Atomic accepted-attempt event/counter transaction |
| Session completion | Browser session ID/activity event; local result feedback | No new trusted completion writer; retain local completion and pending legacy evidence | Server plan/coverage validation plus one completion event |
| Reinforcement | Local transition plus own-row cloud upsert/delete | Retain local state; stop direct authoritative cloud writes | Same transition inside accepted-attempt transaction |
| Achievements | Existing evaluator may run during legacy progression load | Trusted startup now reads only; freeze prior unlocks, no automatic missing awards | Transactional evaluation from approved baseline and trusted events |
| Mission/user XP ledger | Local missions; arbitrary-amount legacy RPC exists | Disable untrusted award entry points only in separately approved cutover | Trusted catalog evaluator when evidence exists; otherwise provisional |
| Exam and AI rewards | Existing source-specific activity paths | Preserve existing records/constants; no substitute evidence or silent replay | Independently verified evidence or disabled new reward source |
| Leaderboard attribution | Existing legacy attempts/events and wrappers | Freeze legacy contribution cohort, keep privacy/helper hardening, capture DB cutoff under stopped writers | Frozen legacy contribution plus eligible verified events/receipt dates; unchanged formulas |
| Local queues/restoration | Existing owner-scoped legacy keys | Preserve all queues; intersect by stable ID/event key and authoritative acknowledgment; quarantine ambiguous legacy NULL matching evidence | Only eligible issued work reaches trusted queue; rejected/conflicted/expired work stays local |

Cutover is a separately authorized pause/drain/fence/snapshot/verify/enable sequence. Stop ingress and drain every in-flight legacy and Migration 25/26 call before changing definitions or freezing the cohort; revoking EXECUTE does not cancel an already-running transaction. Close effective table/column/inherited grants and every known/alternate untrusted writer atomically before enabling trusted commits. Drain or explicitly defer pre-cutover work under its original authority, then freeze the legacy cohort and balances. Do not create a race window where both pipelines can award one item. Old clients must fail closed and retain work. A historical ID/cohort snapshot is preferable if creation timestamps cannot define an immutable boundary; never use client answered_at to admit late imports.

Rollback disables trusted writes, preserves all historical/new rows and independent Migration 24 restrictions, and leaves local queues available. Do not run old feature rollbacks that restore insecure attempt/reward grants as a security rollback convenience. A later reward migration needs its own combined rollback. No rollback was executed here.

## Queue invariant audit

| Invariant | Local evidence |
|---|---|
| Local/server session IDs distinct | Existing adapter and integration tests; restore-only lookup never treats local UUID as issued ID |
| Stable attempt ID vs slot vs number | Persistent slot ledger; DB-only number proposal; model tests cover old gaps, repeats and retry conflicts |
| Durable acknowledgment only | Exact accepted/already_accepted status, session, slot, question, version and verification timestamp required; partial/HTTP-only success retains queue |
| Retry safety | Same ID/slot/response, no overwrite, no new slot after pruning; SQL conflicts stop automatic retry; transient failures retain pending work |
| Account switch/sign-out | Client identity precondition and server cookie owner; late responses cannot write another owner's store |
| Expiry | No fresh expired-session commits or automatic replacement; exact durable retry is read-only and still authorization-gated |
| Skip | Actual Skip handler creates no attempt/persistence call; existing skipped accounting and JSX preserved |
| Matching | Full ordered selections and local encoding retained; canonical grader unchanged; DB selection NULL |
| Entitlement / Strasinger | Current Pro rechecked; Free Harr remains; Strasinger blocked for every tier |
| Disabled path | Zero trusted requests, actual completeQuestion parity, legacy progression behavior unchanged |

Retry exhaustion, terminal rejections, old pre-ledger acknowledged IDs and unsupported historical versions require explicit recovery; nothing is silently promoted or discarded. Cross-tab shared localStorage is not a database transaction: a later browser integration phase must test concurrent tab mutation/restoration and provide coordination or retain single-tab test scope. The scheduling model does not prove that browser concurrency or PostgreSQL locking is correct.

## Tests, genuine production build and integrity

- New regression reproduction: four new integration tests fail on the entry code and pass after the local fixes.
- Focused suites: 42 passed (trusted adapter, client adapter, integration and cutover model/static checks). Two additional streaming-history tests pass and verify unchanged detector definitions.
- Full unit run: **205 passed, 0 failed**. Existing progress/reward, matching, Skip, entitlement, leaderboard and security suites included. Reviewer-content: **16 passed, 0 failed**.
- TypeScript: PASS. Initial new restore-only shape expression caused a narrowing error; explicit exact-key selection repaired it. Only affected checks were repeated.
- Lint: PASS, **0 errors, 105 existing warnings**; no rule disabled.
- `npm run build`: PASS using genuine existing `next/font/google` DM Sans and Geist Mono. Removed only the resolved, non-linked workspace `.next` directory to eliminate Phase 3N-J mock artifacts. No font mock variable or new font dependency; source layout unchanged. Both font families appear in generated CSS and two emitted assets have valid WOFF2 signatures, substantive sizes and saved hashes. The final build followed the narrowing fix; earlier failure compiled genuine font assets but failed typecheck. No mock-font fallback was accepted.
- All tests deny unmocked network. Build alone permits the application's two existing Google Fonts hosts; Supabase credentials/URLs are stripped, dotenv processing suppressed, trusted transport and Strasinger flags false. No Supabase request or database operation occurred. Child-process verification settings do not modify environment files or production configuration.
- `npm run security:secrets`: PASS after streaming repair; workspace plus full Git history scanned. Initial failure was ENOBUFS, not a reported secret leak. Detector-definition hash and regression tests preserve the same rules; no history range was excluded.
- Content hashes: **4,441 MCQs, all rationales, 47 prior positional fixes, 42 Strasinger protections and 38 assets unchanged**. All historical migration/rollback hashes unchanged. No exhaustive grading re-audit needed because the canonical grader/content is unchanged.
- SQL migration/rollback execution, live RLS/role/privilege checks, actual PostgreSQL transaction concurrency and reward atomicity: **NOT TESTED / NOT EXECUTED** by explicit phase restriction. Models/static inspection are not substitutes.

Machine-readable evidence: `regression-results.json`, `content-integrity.json`, `genuine-font-build.json`, `preservation-results.json`, `baseline.json`, `authorized-changes.json`, `secret-detector-baseline.sha256`; focused/unit/build/typecheck/lint/content/secrets logs and initial failure diagnostics retained. Reproducible runner: `node scripts/phase3n/cutover-checks.mjs` or `--focused`.

## Exact changed files

Created source/proposals/tests/tooling:

- `supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql`
- `supabase/rollbacks/202610160027_trusted_cutover_and_attempt_numbering_rollback.sql`
- `tests/trusted-cutover.test.ts`
- `tests/secret-history-stream.test.ts`
- `scripts/phase3n/cutover-checks.mjs`
- `scripts/phase3n/cutover-no-network.cjs`

Modified source/tests/tooling:

- `app/lib/trustedStudyClient.ts`: durable ID/slot ledger and restore-only retry selection.
- `app/lib/server/trustedStudyPersistence.ts`: strict restore-only owner lookup and disabled-gate error classification.
- `app/lib/xpService.ts`: explicit read-only progression loader; legacy loader unchanged.
- `app/RevITApp.tsx`: selected trusted startup uses read-only loader; no JSX/layout change.
- `tests/trusted-integration.test.ts`: four regression tests for those defects.
- `scripts/phase3n/assert-preserved.mjs`: exact J-to-K before/after hash chain; historical snapshots retained.
- `scripts/check-secrets.mjs`: full-history streaming with unchanged detection rules and sanitized failure diagnostics.

Reports: this `REPORT.md`, `privilege-checklist.sql`, evidence files listed in `files.json`, `STATUS.md`, `AGENT_HANDOFF.md`. Prior reports/backups remain. Entry copies and temporary checks are under `scratch/phase3n-k/`.

## Conditions for separate staging review

Review the proposed migration and privileged role/overload checklist first. Authorize the staging target and credentials separately; no credentials requested here. Plan synthetic legacy history plus repeated questions across sessions, identical/conflicting retries, owner/slot collisions, mixed-batch rollback, configuration disabling while a transaction waits, expired sessions, integer exhaustion, all modes, matching NULL, service-role ACL/RLS and non-destructive rollback. Establish real transaction overlap through engine evidence rather than an HTTP timing claim. Include concurrent tab/queue recovery scope explicitly.

Do not activate rewards, real-user persistence, Strasinger sync or new leaderboard eligibility. Atomic reward/completion implementation and the coordinated legacy-writer/eligibility cutover still require a separately approved phase. Migration 27 intentionally cannot enable trusted writes while legacy browser writers remain open. Its preparation alone changes no active database behavior.

**No Supabase requests, database writes, migration/rollback execution, environment-file changes, production configuration changes, activation, deployment, commit or push. Stop pending explicit user authorization.**
