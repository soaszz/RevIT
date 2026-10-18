# Phase 3I-A: dormant trusted grading foundation

## Additional exhaustive validation

The requested follow-up now grades every original record. **4,441 pass; zero fail**, with 451,084 real grading calls and 468,848 passing assertions. Every correct response, every incorrect ordinary option, all ordinary shuffle permutations, and all single-item matching substitutions are checked. All 16 matching exercises pass. No duplicate/missing IDs or malformed grading definitions. Separate existing non-grading metadata gaps on 34 Rodak IDs remain explicitly flagged.

New files: `scripts/validate-mcq-grading.mjs`, `docs/phase3i-a/exhaustive-grading-results.json`, and `docs/phase3i-a/EXHAUSTIVE_GRADING_VALIDATION.md`. The JSON contains per-question results and exact affected IDs. All dataset, asset, and foundation hashes remain unchanged. No application/SQL implementation change or new production capability. See the dedicated validation report for exact coverage, including the limit that matching tests do not enumerate the full Cartesian response space. Documentation entry backups are under `scratch/phase3i-a/exhaustive-backups/`.

Date: 2026-10-15. **Local implementation complete.** This is not approval to connect, deploy, migrate, or enable synchronization.

## Delivered scope

Two new server-only modules implement canonical lookup, deterministic grading, strict request validation, and an isolated authenticated handler. No HTTP route was added. No existing source file, SQL migration, reviewer dataset, asset, entitlement rule, cloud sender, XP implementation, or session execution path changed.

The handler is deliberately absent from the Next.js route tree. There is no environment switch, query parameter, browser flag, test endpoint, or public grading oracle. It has no current application caller. Moving it into an HTTP route would require a future source change and explicit authorization after persistence/security work is ready.

## Exact files

Created application/test files:

- `app/lib/server/answerVerification.ts`
- `app/lib/server/gradingHandler.ts`
- `tests/answer-verification.test.ts`

Modified existing files:

- `STATUS.md`: added Phase 3I-A status.
- `AGENT_HANDOFF.md`: added Phase 3I-A handoff; earlier history preserved.

Created review evidence in `docs/phase3i-a/`: `REPORT.md`, `ANTIGRAVITY_HANDOFF.md`, `content-integrity.json`, `preserved-files.json`, `focused.red.log`, `focused.red-results.json`, `focused.log`, `focused-results.json`, `typecheck.log`, `lint.log`, `lint.initial.log`, `build.log`, `unit.log`, `reviewer-content.log`, `regression-results.json`, `regression.initial-results.json`, and `client-bundle-results.json`.

Created local tooling in ignored `scratch/phase3i-a/`: `record-baseline.mjs`, `run-checks.mjs`, `check-client-bundles.mjs`. Entry documentation backups: `backups/STATUS.md.bak` and `backups/AGENT_HANDOFF.md.bak`. These scripts are not application dependencies and no new package was installed. Expected generated outputs are `.next/` and the existing TypeScript incremental cache; neither is a source change.

The workspace already contained extensive uncommitted work. Read-only `git status`/`git diff --stat` inspection and entry SHA-256 baselines preserved that work. No Git mutation was performed. The preservation test checks every pre-existing file under `app/`, `supabase/`, and `tests/` against its entry hash, including existing local changes. Existing documentation backups preserve the two intentionally edited files.

## Canonical registry

`getCanonicalQuestion(questionId)` initializes a single cached Promise on first use. Concurrent first lookups share initialization. It dynamically imports Harr's existing content module and the existing Ciulla/Rodak/Strasinger server-only loaders, then constructs one O(1) lookup map for all 4,441 stable IDs. No per-answer dataset parsing or database lookup occurs after initialization. This is one lazy all-bank initialization, not four per-question queries.

`createCanonicalRegistry` validates canonical definitions and detects duplicate IDs both within and across banks. Reviewer edition comes from the trusted loader, not an ID prefix or submitted book. A conflicting existing book label is rejected. Entries retain original choices, matching structure, source information, chapter fields, and other metadata in cloned, deeply frozen objects. Callers cannot mutate cached choices/keys through returned entries.

Validation rejects empty/malformed IDs, prompts and choices; invalid ordinary answer keys; malformed or unsafe matching keys; invalid choice-table dimensions; conflicting matching/table forms; invalid metadata when present; and duplicate IDs. Failures produce `CONTENT_UNAVAILABLE` with a fixed generic message. They do not print question content or official keys. Initial registry failure remains fail-closed for that process.

Existing content detail: 34 Rodak records in chapters 4–6 omit subject, topic, and source fields. Existing tests already recognize untagged records. Their IDs, choices, and answer keys are complete and unambiguous for grading. The new grading type allows absent non-grading metadata and preserves that absence. No fields, attribution, or source citations were invented. Supplied malformed metadata is rejected. Future persistence must resolve or explicitly defer missing canonical attribution before presenting it as complete; this phase does not repair content.

Matching definitions use their dedicated `matching.answerKey`. Their legacy `correctAnswer` placeholder is not interpreted as an ordinary-choice key. Runtime question type is exactly `single_choice` or `matching`; educational subcategories do not introduce another scoring scheme.

## Request and grading contract

The entire request must contain exactly `questionId` and `response`. The response must be exactly one variant:

```ts
{ questionId: string, response: { kind: "single_choice", choiceIndex: number } }
{ questionId: string, response: { kind: "matching", selections: number[] } }
{ questionId: string, response: { kind: "timeout" } }
```

`parseGradingRequest(unknown)` performs runtime validation. It rejects unknown fields at both object levels, mixed variants, missing fields, malformed IDs, numeric strings, booleans, fractions, nonfinite values, negative indexes, sparse matching arrays, and encoded matching integers. Array order is preserved. Authoritative range/type validation follows canonical lookup. No validation dependency was added.

`gradeAnswer(unknown)` is an internal server-only deterministic grading function. It never accepts a correctness value, answer key, XP amount, user ID, plan, reward date, subject, topic, difficulty, or reviewer override. Authentication is owned by the isolated handler; direct internal use of the pure service is not a public authorization boundary.

Ordinary responses use the original canonical index. Actual choice count determines valid range, including two-, three-, four-, five-, and other supported choice counts. Display letters/positions are not inputs. True/False and numerical multiple-choice questions use this same existing representation. Choice-table classification uses its canonical row index; matching classification uses the matching branch. No free numeric response, tolerance rule, semantic classification parser, or LLM scoring was added.

Matching responses require genuine matching metadata, exactly the original item count, and integer indexes within the actual answer bank. The function uses the existing `encodeMatchingAnswers` and `isQuestionAnswerCorrect` after validation. Exact all-or-nothing behavior matches the local scorer. All 16 IDs are tested: two Rodak and 14 Strasinger. Reordered differing sequences grade incorrect. Missing, extra, sparse, fractional, out-of-range, boolean/string, ordinary-index, and large encoded submissions are rejected. Timeouts grade false for both runtime types.

The result contains only `questionId`, canonical `book`, runtime `questionType`, `contentVersion`, derived `isCorrect`, and `timedOut`. No official key, encoded response, full selected sequence, correct choice, rationale, source text, XP, reward, or user identity is returned. Error codes/messages are fixed and do not interpolate submitted content or private backend details.

## Authentication and entitlements

`handleGradingRequest(unknown)` reuses `app/lib/supabase/server.ts` and validates the session using `auth.getUser()` before parsing/lookup. It does not accept a caller-supplied session, user ID, Supabase client, or entitlement object.

Harr permits authenticated Free access without an unnecessary entitlement query. For Ciulla, Rodak, and Strasinger, the handler calls only the existing read-only `get_my_entitlement` RPC, then applies `QUESTION_BANKS` and `canAccessQuestionBank`. Only the server result `effective_plan === "pro"` authorizes Pro grading. Missing/failed entitlement lookup fails closed. Authentication, unknown content, malformed requests, entitlement denial, and unexpected backend errors receive generic status/code/message results.

There is no attempt-table access, persistence RPC, service-role client, activity event, reinforcement update, XP call, or leaderboard call in the new modules. Mocked boundary tests reject table access and every RPC other than `get_my_entitlement`. No real Supabase session or API call was used by these tests. The handler's real session integration remains unexercised against Supabase, deliberately.

The public reviewer GET routes and their behavior remain unchanged. The new handler is not a production transport and does not enable Strasinger cloud synchronization. A Pro learner can grade Strasinger only through the isolated test invocation today; there is no exposed route for either edition.

## Content versions

Each registry bank gets `revit-grading-v1:<book>:<sha256>`. Hash input is the bank's complete canonical question records, ordered by stable ID with recursively sorted object keys. Formatting/property-order differences do not change the identifier. Choice and matching-item array order remain meaningful. Official grading-key changes change the digest; changes to other question content/metadata also intentionally invalidate that bank version. No answer key appears in the version string.

The prefix identifies the current scoring contract. A future scoring-semantic change must bump that prefix. This phase returns the current version; it does not accept an offline expected-version field, retain prior content snapshots, regrade history, or build a version service. Future transport must bind queued attempts to the version they used. A server can retain a supported prior static artifact and grade explicitly against it, or reject/defer unsupported versions while retaining the queue. Never silently reinterpret old selections using a changed key.

## Executed verification

| Check | Actual result |
|---|---|
| Focused new tests | 12 passed, 0 failed |
| TypeScript `tsc --noEmit` | PASS |
| Lint | PASS; 0 errors, 104 existing warnings |
| Production `next build` | PASS; route tree contains no `/api/study/attempts` |
| All TypeScript unit tests | 151 passed, 0 failed |
| Reviewer-content validation | 16 passed, 0 failed |
| Generated client assets | 36 inspected, 14,914 probes, 0 hits |
| PostgreSQL / browser / real Supabase tests | NOT RUN |

Total comprehensive regression: **167 passing tests**. Existing matching, adaptive repetition, Skip, entitlement, API/security, content and persistence tests passed. No assertion, lint rule, permission, formula, or production flag was weakened.

Test-first evidence: the initial worker launch hit the known sandbox `spawn EPERM`. Authorized tests then ran through a credential-stripping child-process runner outside that process restriction. The recorded red run had 12 expected failures because the new modules did not yet exist. Initial implementation checks exposed the optional Rodak metadata shape and an overbroad no-write source check that matched `Array.from`/hash `update`; the validator was aligned with the actual optional metadata, and the source check now targets database client operations. Behavioral tests still reject database table access and unexpected RPCs.

Focused tests passed before the comprehensive pass. The comprehensive run passed build, typecheck, 151 unit tests and 16 content tests, but lint found the test harness variable named `module`, prohibited by the Next lint rule. Renamed it to `loaded`; no production logic changed. Added focused registry-size/metadata/table-choice assertions, then reran the focused file and only the affected typecheck/lint gates. All passed. The full build/content/unit sequence was not unnecessarily repeated. Initial lint and regression result files remain alongside final results.

The runner passes only OS/runtime variables and clears values for local environment variable names before spawning checks. It explicitly keeps the Strasinger flag false. No environment file was edited or production credentials supplied to test doubles. Next reports `.env.local` discovery during the normal build; that message is not evidence of a production database connection. No production connection or write was performed. Dependency audit and secret scanner were not added to this phase's requested checks.

### Client-bundle inspection and limits

The scan examines generated `.next/static` JavaScript, JSON and source maps. Probes cover distinctive protected prompts/rationales/long choices/items from all 2,848 Pro questions, protected choice arrays, matching answer-key sequences, and registry identifiers/error markers. It checks raw and JSON-escaped forms, excluding short/common strings shared with Harr that cannot identify a premium leak. The evidence file records counts and metadata-only hits, never answer text. Result: zero hits.

Both new modules carry `import "server-only"`. Existing premium loaders already do too; the shared scorer and entitlement module import content types only. Source call-site inspection finds no application consumer of the new handler and no registry import from client code. Actual route output confirms no new route. These boundaries plus the scan support absence of the new registry and protected keys from this generated client build. A pattern scan alone does not prove absence under every encoding or transformation; future integration must retain the server-only boundary and repeat this inspection. No browser testing or negative fixture build was claimed.

## Preservation

Entry and final test hashes agree for every pre-existing application, SQL, and test file and every one of the 38 reviewer assets. Dataset totals remain:

- Harr: 1,593; 32 protected IDs.
- Ciulla: 1,890; 13 protected IDs.
- Rodak: 491; two protected IDs.
- Strasinger: 467; 42 protected IDs.

All **4,441 MCQs** remain byte-identical. The first three protection sets preserve the exact 47 earlier positional fixes; the Strasinger set preserves all 42. Phase 3G's existing tests independently recheck its earlier integrity baseline. No wording, answer, rationale, ID, topic, chapter, matching metadata, numerical item, figure, or shuffle setting changed.

Existing `RevITApp.tsx`, local scorer, cloud sender/queues/history migration, matching NULL helper, gate, reviewer APIs, entitlements, SQL and rollbacks are unchanged. Immediate feedback, matching UI, Skip, repetition, sessions, local history and existing cloud behavior therefore retain their existing execution paths. Strasinger cloud synchronization remains disabled. No UI change or visual artifact was introduced.

## Remaining Phase 3I-B requirements

Do not connect this handler to the live sender yet. The new code does not fix the existing production correctness/XP vulnerabilities by itself.

Before approved persistence integration: confirm the targeted live schema/grants from Phase 3H; approve the session/provenance/offline/legacy policies; implement a restricted atomic writer and replay/session/time checks; close arbitrary-XP and old untrusted RPC/direct-write bypasses; preserve privacy wrapper ACLs; handle real idempotent acknowledgments and authoritative merge fields; support versioned queues and missing canonical attribution; and validate with synthetic PostgreSQL role/concurrency/rollback tests.

A future exposed write endpoint needs bounded HTTP parsing, request authentication, same-origin/CSRF protection, shared abuse controls, and minimal acknowledgments tied to durable persistence. Do not expose the isolated handler as a grading-only oracle. Keep matching arrays until server verification, then preserve the existing NULL storage contract only through a compatible approved writer. No SQL is proposed or changed in Phase 3I-A.

Stop here. Phase 3I-B/C, production SQL, permission changes, cloud activation, deployment, commit and push require explicit future authorization.
