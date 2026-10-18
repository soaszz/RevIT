# RevIT Phase 3G — matching-aware cloud persistence

Date: 2026-10-15.

**NO-GO: Critical issues remain.**

The scoped matching-persistence fix is prepared locally and application regressions pass. Production release remains blocked by untrusted client-reported correctness and missing PostgreSQL execution evidence. No production change is authorized or performed.

## Application changes

| File | Change |
|---|---|
| `app/lib/matchingAttemptPersistence.ts` | New exact 16-ID list and shared `normalizeCloudSelectedAnswer(questionId, selectedAnswer)` |
| `app/lib/cloudService.ts` | Import the helper and use it only for outgoing `p_selected_answer` in `saveQuestionAttempt` |
| `tests/matching-cloud-persistence.test.ts` | Nine focused regression tests |

The helper returns NULL for verified matching IDs and preserves the supplied value for every other ID. It does not use a client-supplied type, book, or chapter to authorize matching behavior. It includes IDs only; premium questions, choices, and answer keys are not imported into the client.

Normalization occurs at the existing single RPC send boundary. The original attempt object, local/session encoding, correctness, stable ID, question ID, subject/topic metadata, review mode, session ID, adaptive-repeat flag, and timestamp are preserved. Attempt numbering remains server-assigned under the existing SQL logic.

No changes to `RevITApp.tsx`, local scoring, encoding, feedback, restoration, Skip, reinforcement, analytics, entitlement logic, or the secure Strasinger API were needed.

### Cloud-write coverage

| Path | Coverage/evidence |
|---|---|
| Direct attempt recording | Actual sender tested: ordinary indexes 0/3 unchanged; Rodak encodings 21/108 become NULL, correct/incorrect preserved |
| Offline/legacy queues | Existing encoded queue entries normalized only when sent; failures and missing acknowledgments retain entries unchanged |
| Retry | Same stable ID and NULL payload on retry; acknowledged entries removed only after a returned database row; empty acknowledged queue sends nothing again |
| Local-history migration | Calls the same sender; failed migration does not set the completed marker; restored local encodings retained |
| Session restoration | JSON round-trip preserves the local encoded value; actual existing merge tested with cloud NULL and local encoding; existing local entry wins |
| Rodak matching | Both actual matching IDs tested through the sender with the real gate |
| Future Strasinger matching | Encodings 22,875 and 823,542 tested through the actual sender with only its capability boundary mocked; no environment flag enabled and no live client used |
| Current Strasinger isolation | Actual gate remains false; direct writes blocked before RPC; existing queue/history/reinforcement gate tests pass |
| Reinforcement | Separate question-ID/level writes remain unchanged; do not send selected-answer encodings |
| Skip | Existing skip tests pass; source check confirms actual skip function contains no attempt or answer-recording call |

Database retry/concurrency/idempotency is not proven by the mocked acknowledgment model. PostgreSQL testing remains required. The existing SQL stable-ID lookup and advisory-lock logic are unchanged.

### Downstream compatibility

The nullable attempt/row types and row mapper already support NULL. Mastery/weakness and leaderboard calculations use `correct`/`is_correct` plus metadata, not the encoded selection. Tests confirm equal mastery, repeated-wrong results, and local leaderboard questions/accuracy/XP calculations before/after outgoing normalization. Existing full matching/adaptive/Skip tests pass.

The actual local merge processes cloud rows before local rows, retaining locally stored encodings by stable ID. Persisted session attempts also retain their encoded answers. NULL represents an omitted cloud response, not an unanswered local matching question, so the local scoring function is not called with the normalized cloud value to rescore historical attempts.

Accepted limitation: a cloud-only history row on a new device cannot reconstruct the original matching selections. Correctness/analytics remain available. No local history is rewritten, no cloud selection is invented, and no round-trip recovery of absent cloud encodings is claimed.

## Database changes prepared

Only `supabase/migrations/202610130023_strasinger_book_edition_support.sql` changed. Within it, only the rejecting NULL/correct validation condition changed:

```sql
if p_selected_answer is null and p_is_correct
   and p_question_id not in (/* the exact 16 verified IDs */) then
  raise exception 'An unanswered question cannot be correct.' using errcode = '22023';
end if;
```

The real SQL contains all literal IDs, not a wildcard or client type parameter. A regression removes this one new condition and compares the complete file's SHA-256 with the saved entry hash, demonstrating no other SQL change in this phase.

Signature, argument names/order/types, return type, SECURITY DEFINER, search path, EXECUTE ACL statements, authentication/input checks, attribution, historical metadata handling, timestamp clamp, numbering, stable-ID lookup, and locking remain unchanged. `CREATE OR REPLACE` preserves the existing function owner; no DROP or ALTER OWNER is introduced. See [PostgreSQL 17 CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html).

No table/column type, selected-answer CHECK constraint, historical record, new table, or existing schema object beyond this proposed function validation was changed.

### Exact allowlist

Verified by structural matching metadata in all four current datasets and exact equality with the recovered historical Phase 3E table. No ordinary MCQ, numerical question, or non-matching converted sequencing record is included.

```text
rodak-ch12-06
rodak-ch12-10
strasinger7-ch01-q032
strasinger7-ch04-q018
strasinger7-ch06-q010
strasinger7-ch06-q031
strasinger7-ch07-q047
strasinger7-ch07-q048
strasinger7-ch07-q049
strasinger7-ch07-q050
strasinger7-ch09-q016
strasinger7-ch09-q027
strasinger7-ch10-q007
strasinger7-ch12-q005
strasinger7-ch13-q007
strasinger7-ch15-q008
```

Counts: Rodak 2, Strasinger 14. The datasets, TypeScript list, SQL list, and saved verification manifest must agree in automated tests. Adding a future matching question requires an explicit matching contract update, not broader book/chapter permission.

### Expected SQL behavior — static review only

| Input | Expected result |
|---|---|
| Ordinary ID, 0–3, correct true/false | Existing allowed behavior |
| Ordinary ID, NULL, correct false | Existing allowed behavior |
| Ordinary ID, NULL, correct true | Rejected `22023` |
| Exact matching ID, NULL, correct true/false | Accepted by the changed validation; other constraints/auth checks still apply |
| Exact matching ID, 0–3 | Existing numeric behavior preserved for legacy clients; SQL does not reinterpret or convert it |
| Matching encoded value above 3 sent by an old client | Still rejected by existing CHECK/type contract; new application sender must be used |
| Unknown ID, NULL, correct true | Rejected `22023` |

Unknown nonempty IDs with other otherwise valid inputs retain the existing attribution/fallback behavior. This phase does not add a complete canonical-question registry or change that legacy contract. Both `strasinger7-` and `strasinger-` attribution support remain.

### Migration 24 and rollback

`supabase/migrations/202610150024_leaderboard_helper_privileges.sql` is unchanged. It independently restricts both raw leaderboard helper overloads from PUBLIC/anon/authenticated. Both dedicated Strasinger rollback files are unchanged and still restore the exact local Migration 22 function definitions while retaining helper hardening. Full regression rechecks those definitions/ACL source statements.

Rollback restores the old NULL/correct rejection. It therefore removes matching compatibility for both Rodak and Strasinger. It deletes no historical attempts; previously stored matching NULL/correct rows remain readable, but sending those same records again can fail validation before the existing stable-ID lookup. Keep queues/local history intact. Roll back or otherwise coordinate the compatible client rollout too; do not describe SQL rollback as transparent to the new client. Independent leaderboard hardening must remain.

The compatible RPC must be in place before deploying a client that sends correct matching NULLs. This is an operational dependency for a future approved release, not approval or an execution instruction.

## Security review

### Release blocker: client-reported correctness

`record_question_attempt` stores `p_is_correct` directly. Authentication binds the attempt to `auth.uid()`, but neither a non-NULL answer nor membership in the matching-ID list proves correctness. A malicious authenticated user can already submit a valid single-choice index with `p_is_correct = true` without server grading. The new exception permits the same self-report model for matching NULLs; it does not make that model trustworthy.

Relevant existing repository paths:

- `record_question_attempt` inserts caller-supplied correctness without consulting canonical answer keys.
- `record_study_activity` looks up an owned stored attempt, then derives questions/correct counts and XP from its `is_correct`; first-daily handling limits repeats, not forged correctness.
- Raw metrics and privacy-filtered leaderboard wrappers aggregate those attempts/events. Fabricated correctness can distort accuracy and XP rankings; accepted noncanonical IDs can also distort counts under the existing contract.
- Personal mastery, weakness analytics, and study history use the same correctness data.
- Reinforcement levels are a separate client-reported own-user write; they are not independent answer verification.
- Local migrations grant authenticated own-row INSERT/UPDATE under RLS. These are potential bypasses even if grading were added to only one application route; fresh effective live table grants were not inspected here.

This is a material integrity/fairness risk for public XP and leaderboards and is classified as a production release blocker. It is not evidence of cross-user write access: own-user authorization remains a separate preserved property.

Smallest credible mitigation scope: enforce trusted server grading for competitive results and close bypasses through both direct attempt-table writes and the RPC. Preserve existing UI/history interfaces where possible. Merely adding an HTTP endpoint while leaving client-writable correctness routes available is insufficient. The matching NULL payload contains no answer evidence, so a correctness-proof design needs separately reviewed server-side handling before persistence. Until then, keep this release undeployed; optionally scope a separate containment change that excludes unverified results from competitive XP/rankings. No scoring redesign, grant change, or formula change was made here.

### Preserved controls and limits

Authentication, stable-user binding, Pro content authorization, and existing RLS/ACL source are preserved. No service-role credentials are exposed or used. The allowlist is exact and server-controlled in SQL; a client type flag cannot extend it. Independent helper hardening remains prepared, but historical Phase 3E reported live public helper access: local source is not deployed remediation.

A NEXT_PUBLIC flag is only a rollout control, not server authorization. Strasinger cloud synchronization remains default-off. No production environment setting was edited or freshly inspected.

## Testing

| Check | Result |
|---|---|
| Focused Phase 3G tests | 9 passed, 0 failed after correcting one test harness transpilation target |
| TypeScript `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS; 0 errors, 104 existing warnings |
| `npm run build` | PASS |
| `npx tsx --test tests/*.test.ts` | 139 passed, 0 failed |
| `node --test tests/reviewer-content.test.mjs` | 16 passed, 0 failed |
| `npm run security:secrets` | PASS; 0 detected leaks in 4,192 workspace files and full Git patch history at scan time |
| PostgreSQL migration/rollback/role/RLS tests | NOT TESTED |

The full unit pass includes entitlement, matching, Skip, leaderboard, adaptive repetition, existing security tests, and unchanged content/API checks. One comprehensive pass was run after focused checks; no successful full suite was unnecessarily repeated. No assertions, lint severities, or production flags were weakened.

Initial focused run: 25 of 26 checks passed; the extracted-merge test used TypeScript's legacy default transpilation target, which mishandled Map iteration in the test harness. Setting that isolated harness to ES2022 fixed the harness without changing production merge logic or the assertion. The nine-test file then passed and the subsequent full pass also passed. Initial evidence is retained in `focused.initial.log`/`focused.log`; final focused evidence is in `matching-focused.log`.

Command runner: `scratch/phase3g/run-regression.mjs`, copied from the prior credential-stripping runner with output paths changed. It runs typecheck/lint/build/unit/content/secrets separately to avoid duplicate builds. No credentials are supplied to child commands, and the Strasinger rollout flag is kept false. No environment file is edited. Google font fetching during build is not a Supabase connection. Runtime SQL is not simulated as a claimed PostgreSQL test.

Machine-readable final exits: `regression-results.json`; individual logs are beside this report. Existing Node 26 `module.register()` build deprecation warnings are separate from test errors. Dependency advisory audit was not rerun; security checks were the repository secret scan, existing security tests, and this scoped source review.

### Database environment and unverified behavior

No `docker`, `psql`, `pg_ctl`, `initdb`, or Supabase CLI was found on PATH; checked standard/user installation locations and service inventory did not identify a suitable runtime. No software installed and no existing local database changed.

Actual SQL NULL acceptance/rejection, numeric legacy matching behavior, role execution, RLS isolation, trigger firing, reviewer attribution, stable-ID concurrency, PostgreSQL calculations, rollback execution, and historical synthetic-row preservation are NOT TESTED. The changed condition and preserved SQL are reviewed/tested as source only. No actual SQL output exists for this phase.

Phase 3E's recorded production constraints/signature/body/owners/grants are historical evidence, not a fresh Codex inspection. Live drift, effective inherited grants, wrapper-owner execution permissions, and deployment state remain unverified. See `ANTIGRAVITY_HANDOFF.md`.

## Integrity and files

Fresh entry checks and post-change full tests confirm all 4,441 question records remain byte-identical to the verified hashes: Harr 1,593; Ciulla 1,890; Rodak 491; Strasinger 467. Exact 47 prior shuffle repairs and 42 Strasinger protections are intact. All 38 reviewer asset files are unchanged. No question JSON, source figure, topic/chapter mapping, matching structure, numerical answer, or shuffle metadata was rewritten.

`preserved-files.json` also records unchanged source hashes for RevITApp, the gate, matching encoding/scoring, domain types, analytics/leaderboard services, entitlement logic, Strasinger API, XP service, Migration 24, and both rollback files. New tests assert those entry hashes; test baselines are committed-file candidates under docs, not ignored scratch dependencies.

Besides the four source/test/SQL files listed above, Phase 3G adds this report, `ANTIGRAVITY_HANDOFF.md`, `content-integrity.json`, `preserved-files.json`, `matching-question-ids.json`, `rpc-baseline.sha256`, command logs, and `regression-results.json` under `docs/phase3g/`. `STATUS.md` and `AGENT_HANDOFF.md` receive appended updates. Entry backups for edited existing files are under `scratch/phase3g/backups/` with `.bak` extensions; previous work/backups/reports are preserved.

No production database access/write, historical-data or subscription change, environment-file edit, Strasinger sync activation, deployment, commit, or push occurred. No browser automation or visual capture was performed. Stop pending resolution of the correctness release blocker, isolated database evidence, and explicit user approval.
