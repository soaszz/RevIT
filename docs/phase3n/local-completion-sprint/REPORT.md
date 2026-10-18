# Consolidated local completion sprint

Date: 2026-10-16. **LOCAL WORK COMPLETE; READY FOR SEPARATELY AUTHORIZED STAGING VERIFICATION.** This is not release or activation approval.

Read current Phase 3N-J, K, L and consolidated reports, STATUS and AGENT_HANDOFF. Inspected the dirty working tree before editing. Entry hashes and backups preserve 426 existing source, test, SQL, asset and report files. Earlier staging results are historical evidence only; no fresh database observation occurred in this sprint.

## Demonstrated defects fixed

1. Trusted queue writes had no cross-tab coordination. Native Web Locks now serialize each owner's session creation, queue mutations, binding, network drain and pruning across updated clients. Calls queued during a flight execute in order using fresh stored state. The controller returns promises for queued mutations; existing callers retain immediate local feedback. Browsers without Web Locks keep personal history and issue no trusted writes. This is deliberately fail closed, with no dependency or localStorage lease imitation.
2. Client-side expiry skipped every queued item, including attempts already durably committed whose acknowledgments were lost. The queue now asks the server for recovery. Existing server logic re-acknowledges exact durable retries after expiry without writing and rejects fresh expired work. No replacement session or retrospective issuance is introduced.
3. Session creation/recovery could return a completed session as an available binding. The persistence service now rejects completed issuance with SESSION_UNAVAILABLE. Existing exact attempt recovery remains available.
4. Route media checking accepted `application/jsonx` and performed authentication before rejecting its payload. The handler now requires the exact JSON media type, preserving optional parameters and case-insensitivity. Tests also exercise actual body-size enforcement despite misleading Content-Length, malformed JSON and foreign origins.
5. The integration fake ignored ID/owner filters and omitted request_id on issued rows. It now models these filters, preventing false expired-session coverage. This was a test-double defect, not a demonstrated database query defect.

Regression reproductions failed on entry behavior before fixes. Later additional tests cover late acknowledgments after account switches, unsupported browser locking, complete versus fresh expired retries, and two controllers mutating one queue during a blocked request. These are local controlled tests, not browser or engine concurrency evidence.

## Migration 27 and rollback review

Reviewed both current files against the source contracts and Phase 3N-L catalog report. No additional locally demonstrated implementation defect justified changing Migration 27. Its source and every existing rollback remain byte-for-byte unchanged, as do historical Migrations 23–26.

The proposal still defaults off, requires the service JWT role and READ COMMITTED, holds configuration FOR SHARE, checks effective known legacy/table/column writers, uses the legacy owner/question advisory namespace, allocates historical MAX+1 numbers under locks, and verifies exact retries before numbering or expiry. Matching database answers remain NULL, session mode is retained, and competitive_at stays NULL. The existing rollback disables and stubs trusted RPCs without deleting rows or restoring unsafe legacy grants.

Static inspection is not PostgreSQL compilation or execution. No PostgreSQL parser was installed or added. Live signature/constraint compatibility, grants, RLS, snapshot visibility, lock waits, runtime exceptions and rollback behavior remain unexecuted in this sprint.

## SQL verification preparation repaired

The former Phase 3N-L suite could not exercise its advertised successful path:

- Target count 10 exceeded a six-question pool, and three request digests contained 60 instead of 64 hexadecimal characters.
- A comment promised to satisfy the legacy fence but no fencing statements existed; Phase 3N-L had confirmed open writers.
- Service-role fixture DML could not update configuration after Migration 27 revoked that authority.
- Cross-owner/cross-session attempt UUID collisions expected 42501; the implementation returns generic 23505. A foreign session-owner call separately returns 42501.
- Its mixed-batch test sorted the conflicting slot before the purported successful insert, so it did not demonstrate rollback after insertion.
- It claimed all 15 scenarios while engine concurrency, disable races and rollback execution were absent.

Replaced the prepared suite with strict isolated-target/empty-database/owner preconditions, valid bounded synthetic plans and digests, explicit transaction-only legacy/table/column fencing, missing/false configuration and open-writer rejection, actual role boundaries, owner SELECT/cross-account RLS assertions, service inability to change its authority, historical gaps 1/7 then 8/9, exact matching retries, fresh versus expired/completed retries, real insert-before-failure rollback assertions, and overflow rejection. Success checks use INTO STRICT and IS DISTINCT FROM so missing/null results cannot silently pass. Synthetic users have no configured login password and collisions abort instead of reusing users.

The base file prepares 14 assertion rows covering scenarios 1–5, 7–11, 13, 15 plus gate/overflow checks. It explicitly excludes multi-connection scenarios 6/12 and rollback 14. No PASS row has been produced by PostgreSQL here.

Added a generator and prepared superset for rollback scenario 14. It reads the unchanged rollback source, validates/removes only outer BEGIN/COMMIT, snapshots seven study/reward tables, injects that exact body, checks unchanged rows and fail-closed ACL/stubs, then rolls the entire test transaction back. The embedded original COMMIT must never be included directly in a surrounding fixture transaction. Expected future final output is 15 assertion rows. Source-equivalence and no-COMMIT checks run locally.

`STAGING_RUNBOOK.md` specifies actual PID/pg_locks/pg_blocking_pids evidence for scenario 6, both directions of the configuration-disable race for scenario 12, target safeguards, explicitly authorized temporary committed staging fixtures/fencing, cleanup and disabled-state confirmation. Request overlap remains insufficient evidence.

## Reward and completion components

Added disconnected, server-only `trustedStudyEffects.ts` with pure local checks:

- Answer/daily event candidates use stable existing keys and XP_REWARDS; correctness and receipt time must come from durable server rows. Reinforcement reuses the existing wrong-to-max-3/correct-to-zero function.
- Achievement candidates reuse the existing catalog and metric function and exclude prior unlocks. Only unlock rows actually inserted under database uniqueness may ever award those amounts. Candidate calculation does not pay historical missing achievements.
- Coverage inspection rejects mixed owners/sessions, duplicate attempt IDs/slots and version/provenance mismatches; repeated questions cannot cover skipped questions. Even full pool coverage returns `completionAwardEnabled: false` and ISSUED_SEQUENCE_REQUIRED. Current manifests do not prove strict versus adaptive sequence/wrong-extension evidence.

These functions have no route, client import, persistence call, timer or activation flag. They do not modify balances, issue receipts or claim transaction atomicity. No AI, exam or mission reward replacement was added. Existing 5/20/10/10/10 amounts, achievement catalog, level calculations and historical balances remain unchanged.

Remaining database work: atomically insert attempts and deterministic unique events, apply reinforcement once, update daily/progress counters only for newly inserted events, award only newly inserted unlocks, enforce authoritative completion evidence, and test total rollback/retries/unique conflicts. Requires locked server-derived inputs and approved historical baseline; a TypeScript plan cannot replace that transaction.

## Legacy and leaderboard cutover

No new activation or reader SQL is justified before the legacy-cohort policy and authoritative reward evidence exist. Migration 27 remains the minimal additive attempt proposal; no historical SQL was rewritten.

Phase 3N-L reports open legacy writers and leaderboard readers that ignore competitive_at. Setting competitive_at NULL does not exclude attempts from those readers. Keep trusted persistence disabled for real users. Future cutover must stop ingress, drain existing legacy and Migration 25/26 calls, fence all effective alternate/inherited/table/column writers, freeze accepted legacy contributions and balances, classify retained queues by stable IDs/provenance, then enable only a fully verified path. Revoking EXECUTE does not cancel in-flight transactions.

Future leaderboard readers need frozen legacy contributions plus eligible verified receipts, preserving Manila periods, first daily attempt rather than first correct retry, 20/75/200 thresholds, formulas, book/subject filters, ties, opt-in privacy and Migration 24 helper restrictions. Do not retroactively certify history, fabricate missing rewards, replay both queues, or discard pending local work. Detailed transition design from Phase 3N-K remains applicable.

## Audit outcomes

- Repeated-question numbering: database-only authority in the unchanged proposal; JS scheduling/static checks cover gaps, retries and overflow. Actual engine allocation is not yet proven.
- Retry identity/restoration: durable ID/slot ledger retained; exact bound full acknowledgments required; corrupt/unavailable storage is not overwritten. Terminal or exhausted items remain retained for explicit recovery.
- Account isolation: owner storage key, cookie-derived owner, account precondition and late-response rejection remain enforced. Native lock names are owner-scoped.
- Expiry: exact durable recovery is permitted; fresh expired/completed writes fail. Mixed batches containing fresh expired work still fail as a whole and remain local for explicit recovery.
- Matching: original selections/encoding preserved; canonical grading unchanged; outgoing database selected_answer remains NULL.
- Skip: actual existing handler test confirms no attempt/persistence action.
- Pro/Strasinger: current Pro checks remain on creation and submission; Strasinger stays blocked regardless of plan.
- Default off: disabled routes make zero authentication/configuration/writer requests; disabled client writes no queue. No new environment flag exists.
- Appearance/feedback: RevITApp, all component JSX/CSS, page and layout remain identical to sprint entry. Existing disabled completeQuestion parity and Skip tests pass. No UI redesign, screenshot or browser automation occurred.

## Verified local results

- Focused run: 53 passed before the final added rollback preparation assertion; all focused files, including that assertion, subsequently passed in the full unit run.
- Full unit suite: **217 passed, 0 failed, 0 skipped**. Reviewer-content: **16 passed, 0 failed**.
- TypeScript: PASS. Initial LockManager generic typing reported nested Promise inference; an awaited callback fixed typing while preserving runtime behavior.
- Lint: PASS, **0 errors, 105 pre-existing warnings**. Initial new test variable named `module` violated a Next lint rule; renamed it. No rule was disabled.
- Genuine-font production build: PASS, using existing DM Sans and Geist Mono configuration, no font mocks. Two emitted WOFF2 headers, substantive sizes, hashes and family names verified. Existing genuine-font incremental cache was retained; source fonts/layout unchanged.
- Secret scan: PASS, zero detected leaks, workspace plus full Git history. Final scan includes the new preparation/report files. Original detection rules and streaming scanner are unchanged.
- Content integrity: **4,441 unique original questions, 47 prior protections, 42 Strasinger protections and 38 assets unchanged** against original hashes and protected-ID lists. Canonical grader unchanged; the successful exhaustive grading audit was not repeated.
- Preservation: entry-source hashes and exact authorized changes recorded. Historical reports J/K/L, all migrations and all existing rollbacks preserved. No unrelated user changes were reverted.

Credential-stripped runner `scripts/phase3n/completion-checks.mjs` reuses the existing network blocker. Tests allow no unmocked network; the build alone permits the two existing Google Fonts hosts. Dotenv loading is suppressed and both trusted/Strasinger selectors are false in child processes. No environment file or production configuration changed. Initial failures are retained; only affected checks were repeated after repairs. Final results and logs are in this directory.

## Exact files changed

Modified:

- `app/lib/trustedStudyClient.ts`
- `app/lib/server/trustedStudyPersistence.ts`
- `app/lib/server/trustedStudyRoutes.ts`
- `tests/trusted-integration.test.ts`
- `supabase/tests/trusted_cutover_verification.sql`
- `scripts/phase3n/assert-preserved.mjs` — adds this sprint's exact before/after chain without altering old manifests.
- `docs/phase3n/REPORT.md`, `STATUS.md`, `AGENT_HANDOFF.md` — prepended current result, preserving earlier bytes.

Created implementation/preparation files:

- `app/lib/server/trustedStudyEffects.ts`
- `tests/trusted-effects.test.ts`
- `tests/trusted-sql-preparation.test.ts`
- `scripts/phase3n/completion-checks.mjs`
- `scripts/phase3n/prepare-cutover-rollback.mjs`
- `supabase/tests/trusted_cutover_rollback_verification.sql`

Created reports/evidence: this report, `STAGING_RUNBOOK.md`, and files enumerated in `files.json`. Exact hashes are in `baseline.json`, `authorized-changes.json`, and `preservation-results.json`; content/font evidence and check logs are separate. Entry backups reside under `scratch/local-completion-sprint/backups/`. Generated `.next/**` and `tsconfig.tsbuildinfo` are build artifacts, not application source edits.

## Stop condition and next operation

Local work is complete. **Single next Antigravity operation:** separately authorized isolated-staging execution of Migration 27 and the prepared verification pack, followed by captured engine evidence, fixture cleanup and configuration-disabled confirmation. Read the runbook first. Actual PostgreSQL execution and real-browser behavior remain unverified; reward/completion transactions and leaderboard/cohort cutover still block real activation.

No Supabase MCP call or request, database read/write, SQL application, migration/rollback execution, credential setup, environment-file edit, trusted or Strasinger activation, deployment, commit or push occurred. No next phase starts automatically.
