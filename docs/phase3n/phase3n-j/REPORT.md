# Phase 3N-J: local trusted persistence integration

Date: 2026-10-16. **GO FOR MOCKED LOCAL INTEGRATION.**

The active study handlers now connect to the existing session adapter through a separate trusted transport. The transport remains off by default. This decision authorizes no live activation or database operation.

## Client and server path

`app/page.tsx` passes a transport selector derived exclusively from the server environment variable `REVIT_TRUSTED_STUDY_ENABLED`. Only the exact value `true` selects the new client. An unset variable, ordinary localhost setup, offline capture page, and default component props select the existing behavior. No environment file was edited or new public environment variable added.

When selected, `beginAdaptiveSession` and `beginStrictSession` retain their existing local UUID and register a separate server session. `completeQuestion` retains local scoring, matching encoding, feedback, reinforcement and attempt history, then uses `clientSessionAdapter` to enqueue the original response. Skip never calls the persistence transport. No component JSX, CSS, card or layout changed; an AST-based hash covers every JSX node in RevITApp.

The new server routes are `POST /api/study/sessions` and `POST /api/study/attempts`. Both use the shared handler and fail before any authentication, configuration or persistence request when the server environment gate is off. With the selector on, routes require same-origin JSON, bounded request bodies, authenticated `auth.getUser()`, an account precondition matching the cookie-derived owner, and an enabled `trusted_study_config` row. Missing configuration/table/credentials, read failures, and disabled configuration fail closed. The account header supplies no authority to choose an owner. The established server-only service client is constructed only on the enabled path; writing RPCs are invoked only after canonical validation and authorization.

Creation validates exact request fields, canonical pool membership, mode, target, current Pro entitlement, response ownership and returned plan equivalence. JSONB object property order is immaterial. Session responses contain IDs, versions, expiry and a bounded sequential slot range; no question text, answers or rationales. Local and server IDs remain separate. The client consumes sequential slots from that range; the server checks contiguous fresh slots against persisted session attempts, and the existing database uniqueness constraint arbitrates conflicts. No new per-answer slot-allocation RPC is introduced.

Commits accept at most 50 responses and 64 KiB; session plans accept at most 4,441 unique IDs and 256 KiB. Every commit rechecks current entitlement, blocks Strasinger regardless of tier, requires an owned issued session and pool/version match, and grades through the unchanged canonical grader. Server-derived metadata and response digests reach the restricted RPC. Matching selections remain complete ordered arrays locally and in grading; the existing database selected-answer column receives NULL. Ordinary responses use canonical choice indexes; timeout is incorrect/NULL. Client correctness, XP, identity, book, timestamp, extra fields and synthetic database selections are rejected.

Exact retry checks bind owner, verification, session, slot, question, version and normalized response digest. Identical durable retries can return their original acknowledgment after expiry without new writes; changed or legacy records conflict. Fresh writes require an unexpired, incomplete session. SQL conflicts become HTTP 409 rather than transient retry errors. Returned rows must cover the entire batch with matching identities and provenance before acknowledgment.

## Queue and restoration

New storage is `revit-trusted-study-v1:<owner>`, separate from existing local sessions, attempt history and legacy queues. It preserves server binding, versions, next slot, stable attempt IDs, original encoded selection, matching selections and pending status. Restoring a local review uses the saved binding; it never substitutes its local UUID for a server session or silently issues a replacement for an expired session.

Only a complete, correctly bound acknowledgment containing explicit `accepted` or `already_accepted` status and verification timestamp removes queued items. HTTP 200 alone, empty/partial acknowledgments, network failures and database failures retain work. Conflicts/rejections remain stored and are excluded from automatic retries. Transient retries reuse the same ID/slot and retain the adapter's existing retry ceiling; exhausted items remain stored for explicit recovery. A batch response is validated as a whole before pruning. Account changes/sign-out invalidate the transport; responses arriving after a switch cannot mutate or replay another owner's queue. The server independently checks the account precondition.

Sessions started entirely offline or restored without issuance evidence remain local study. Unissued history is not promoted to trusted competition. Local queue/storage failure does not erase existing history or overwrite unreadable stored queues; history remains the recovery source.

The selected trusted branch suppresses competing legacy attempt/reinforcement/event flushing and local-history migration. It preserves those queues for controlled cutover. Local XP remains provisional in that branch. Existing SQL creates attempts only: it does not implement atomic reward, reinforcement or completion transactions. Consequently this phase adds no trusted completion endpoint and sends no completion/XP claims. Existing local completion behavior and reward amounts remain intact. With the selector off, the original cloud and local paths remain unchanged, including existing exam/AI behavior.

## Verification and evidence

- Focused checks: real server grader behind mocked authentication/database boundaries; new integration suite 13 passed. Existing trusted-study and client-session-adapter suites also pass in the complete unit run. Initial focused red evidence has seven failures because implementation modules did not yet exist.
- Full unit regression: **195 passed, 0 failed**. Includes trusted persistence, client adapter, matching, Skip, entitlement, leaderboard, existing security and mock concurrency suites. No live harness command was run.
- Reviewer-content suite: **16 passed, 0 failed**.
- TypeScript: PASS. Initial check exposed 12 pre-existing inferred-type errors in `concurrent-harness.test.ts`; explicit test-side types and stronger error null assertions repaired these without changing the staging harness or removing assertions.
- Lint: PASS, **0 errors, 105 warnings**. No rule/severity disabled.
- Production build: PASS with test-only local Google Fonts CSS fixtures. First mock lacked explicit URL-map entries; the second retained a remote mock font URL unsupported by Turbopack's file mock. Final fixtures contain no remote font source. Only the failed build was repeated; application/layout source remained unchanged. These generated build artifacts are verification fixtures, unsuitable for deployment with mocked fonts.
- Secret scan: PASS, zero detected leaks; initial complete scan checked 4,283 files and Git patch history. Final scan: 4,294 workspace files and full Git patch history, zero detected leaks.
- Client bundle inspection: 36 generated client assets, 14,914 protected-content/key/registry probes, zero hits. This pattern scan does not prove absence under every possible encoding. No service credentials were supplied to the build.
- Content: **4,441 original questions, 47 prior positional fixes, 42 Strasinger protections, 38 assets unchanged**, checked against original saved hashes and exact protected-ID lists. No exhaustive grading re-audit was needed: the canonical grader and question content are unchanged.
- Entry preservation: 311 application/SQL/test/asset files recorded. Eight intentional edits have exact before/after hashes; all other entry files remain unchanged. Historical phase snapshots remain unchanged. Old snapshot tests now require an explicit matching old/new hash for authorized integration edits instead of permanently forbidding the requested integration; they still fail on any unlisted or subsequent change.

The credential-stripped runner disables trusted persistence and Strasinger sync, clears environment credential values, prevents dotenv loading, intercepts unmocked JavaScript network calls, and mocks fonts. Existing tests use their own isolated fakes. No Supabase read, query, write, migration, rollback, user/session/attempt/event creation, privilege change, credential configuration, environment-file edit, deployment, commit or push occurred. No browser automation, screenshot or visual artifact was produced. Historical staging evidence was read from reports only; no fresh database compatibility or transaction-concurrency claim is made.

Machine-readable results and logs live beside this report: `regression-results.json`, `content-integrity.json`, `client-bundle-results.json`, `preservation-results.json`, `authorized-changes.json`, `baseline.json`, `disabled-study-baseline.json`, focused/integration logs, and initial/final build/typecheck logs. Reusable network-blocked runner: `node scripts/phase3n/local-integration-checks.mjs`; focused selection: `--focused`.

## Exact implementation files

Created:

- `app/lib/trustedStudyClient.ts`
- `app/lib/server/trustedStudyGate.ts`
- `app/lib/server/trustedStudyRoutes.ts`
- `app/api/study/sessions/route.ts`
- `app/api/study/attempts/route.ts`
- `tests/trusted-integration.test.ts`
- `scripts/phase3n/assert-preserved.mjs`
- `scripts/phase3n/local-integration-checks.mjs`
- `scripts/phase3n/local-integration-no-network.cjs`
- `scripts/phase3n/local-integration-fonts.cjs`

Modified:

- `app/RevITApp.tsx`: session/answer/flush integration; default-off legacy behavior retained.
- `app/page.tsx`: server-derived transport selector.
- `app/lib/clientSessionAdapter.ts`: authoritative batch acknowledgment filtering; invalid/elapsed expiry fails closed.
- `app/lib/server/trustedStudyPersistence.ts`: strict input, current authorization, session/pool/version/slot/retry binding and durable acknowledgment checks.
- `tests/trusted-study.test.ts`: gated fallback mock, explicit retry statuses/conflict classification, exact preservation hashes.
- `tests/answer-verification.test.ts`: route now asserted gated; server-only grader and exact preservation remain asserted.
- `tests/matching-cloud-persistence.test.ts`: exact authorized replacement hashes for integration changes.
- `tests/concurrent-harness.test.ts`: test-only types and stronger null assertions; all scenario assertions retained.
- `docs/phase3n/REPORT.md`, `STATUS.md`, `AGENT_HANDOFF.md`: phase result and stop condition.

All saved evidence files are enumerated in `files.json`. Entry backups and runner troubleshooting copies remain under `scratch/phase3n-j/`; earlier work is preserved.

## Prerequisites before separately authorized live testing

1. Authorize a staging-only phase and establish target/credential controls separately. Do not turn on this selector in ordinary localhost or production. No database credentials are requested here.
2. Verify actual configuration-table privileges, session owner SELECT privileges/RLS, all RPC overloads, service grants and effective inherited grants. Migration 25 source alone does not secure the configuration table or close legacy writers. The application gate supplements, and does not replace, database authorization.
3. Fix/review the existing SQL attempt numbering: Migrations 25/26 insert `attempt_number = 1`, so a repeated question or existing legacy history can hit the existing per-owner/question/number unique constraint. This source limitation is unchanged; mocks do not prove real repetition persistence. Fresh issued slot bounds and pool/version checks must remain consistent across service callers.
4. Review session creation idempotency under concurrent issuance and config/expiry changes during a commit. Database functions do not themselves consult `trusted_study_config`; the new server checks it per operation. Consider transaction-level database gating for a strict cutover fence. Do not claim an HTTP overlap test establishes transaction-level overlap.
5. Prepare/review atomic reward, reinforcement, completion evidence and historical leaderboard cutover before reward activation. Existing functions do not generate those rewards. Keep their constants/formulas and historical balances. Close legacy write paths in a separately authorized migration/cutover; avoid overlapping writers or blind replay of retained legacy queues.
6. Test live batch rollback, slot contention, numbering/repetition, mixed existing/new retries, lost acknowledgments, Pro renewal/expiry, version rollover, restoration across devices, queue recovery after retry exhaustion, service-role isolation and controlled old/new-client cutover. Verify real fonts and deployed behavior separately; no live/browser claims are made here.

**Stop: local integration is complete and remains default-off. Await explicit authorization for any live integration test.**
