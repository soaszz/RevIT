# Phase 3I-B: Trusted Study Persistence & Rodak Metadata Adapter Report

**Date**: 2026-10-15  
**Status**: Local Implementation Complete; Fully Dormant  
**Decision**: CONDITIONAL GO (Local implementation, static migration verification, and test regression passed; isolated PostgreSQL runtime not available locally; production execution strictly prohibited)

---

## 1. Executive Summary & Recovery from Codex

During Phase 3I-B, Codex created `tests/trusted-study.test.ts`, `docs/phase3i-b/baseline.json`, and `scratch/phase3i-b/run-checks.mjs`, then was interrupted when reaching its usage limit.

Gemini recovered and preserved:
- Existing test suite `tests/trusted-study.test.ts` (180 lines, 9 comprehensive tests).
- Pre-existing files recorded in `docs/phase3i-b/baseline.json` (all 459 files matched SHA-256 hashes exactly; zero uncommitted files damaged).
- Completed the missing implementation files, migration, and rollback files.
- Verified that all 9 focused tests pass, all 160 unit tests pass, and all 16 content tests pass.

---

## 2. Implemented Components

### 1. Rodak Server-Side Metadata Adapter (`app/lib/server/studyQuestionMetadata.ts`)
- Resolves all 34 historically untagged Rodak records (chapters 4–6) to canonical `subject_id: "rodak-hematology"` and `topic_id: "rodak-ch{chapter.padStart(2, '0')}"`.
- Preserves absence of `source` without inventing citations or descriptions.
- Strictly does not mutate in-memory question objects.
- Standardizes metadata lookup across Harr, Ciulla, Rodak, and Strasinger.

### 2. Trusted Study Persistence Service (`app/lib/server/trustedStudyPersistence.ts`)
- **Strict Input Validation**: Rejects client-supplied `userId`, `xp`, `isCorrect`, `book`, `answeredAt`, and `completed`.
- **Session Planning (`createStudySession`)**:
  - Requires authenticated session from `supabase.auth.getUser()`.
  - Verifies Pro entitlement via `get_my_entitlement` for Pro question banks.
  - Enforces fail-closed Strasinger block (`STRASINGER_DISABLED`) even for Pro users.
  - Generates deterministic session plan, question pool with version bindings, and SHA-256 request digest.
- **Batch Attempt Verification (`commitStudyBatch`)**:
  - Enforces slot uniqueness and attempt ID uniqueness.
  - Rejects `skip` responses, empty matching selections, and out-of-range choice indices.
  - Grades responses server-side via `gradeAnswer()` from Phase 3I-A.
  - Computes canonical `response_digest` (SHA-256) per response.
  - Enforces `selected_answer = null` for matching questions to guarantee database constraint compatibility.
  - Validates session expiration and user ownership.
  - **Idempotency & Replay Protection**: Identical retries return verified acknowledgments; conflicting responses or unverified attempts trigger `ATTEMPT_CONFLICT`.

### 3. PostgreSQL Migration (`supabase/migrations/202610150025_trusted_study_persistence.sql`)
- Creates `public.trusted_study_config` with `enabled boolean not null default false`.
- Creates `public.study_sessions` with `unique (user_id, request_id)` and RLS enabled.
- Adds provenance columns to `public.question_attempts`: `session_slot`, `content_version`, `response_digest`, `verified_at`, `competitive_at`.
- Adds constraint `unique (session_id, session_slot)`.
- Defines `create_verified_study_session` and `commit_verified_study_batch` RPCs with transaction advisory locks (`pg_advisory_xact_lock`) and privilege checks (`has_any_column_privilege`).
- Revokes execute from `public, anon, authenticated` to maintain zero unauthenticated or unauthorized write surface.

### 4. Non-Destructive Rollback (`supabase/rollbacks/202610150025_trusted_study_persistence_rollback.sql`)
- Preserves all historical attempts, user progress, subscriptions, and column schema.
- Sets `trusted_study_config.enabled = false`.
- Replaces persistence RPCs with disabled stubs that raise exception `55000`.
- Zero `DROP TABLE`, zero `DROP COLUMN`, zero `DELETE FROM`, zero `GRANT EXECUTE`.

---

## 3. Verification & Test Evidence

All automated verification commands executed and recorded in `docs/phase3i-b/`:

| Check | Command | Exit Code | Result | Duration |
|---|---|---|---|---|
| Focused Persistence Tests | `node scratch/phase3i-b/run-checks.mjs --focused` | 0 | **PASS (9/9 passed)** | 4.9s |
| TypeScript Compiler | `tsc --noEmit` | 0 | **PASS (0 errors)** | 4.2s |
| ESLint | `npm run lint` | 0 | **PASS (0 errors, 104 warnings)** | 29.3s |
| Next.js Production Build | `npm run build` | 0 | **PASS (0 route leaks)** | 24.2s |
| Full TypeScript Unit Suite | `tsx --test tests/*.test.ts` | 0 | **PASS (160/160 passed)** | 7.7s |
| Reviewer Content Validation | `node --test tests/reviewer-content.test.mjs` | 0 | **PASS (16/16 passed)** | 0.4s |
| Secret Leak Scan | `npm run security:secrets` | 0 | **PASS (0 leaks, 4229 files)** | 38.5s |
| PostgreSQL Runtime Execution | N/A | N/A | **NOT TESTED** | N/A |

---

## 4. Content Integrity
- Exactly 4,441 MCQs preserved:
  - Harr: 1,593
  - Ciulla: 1,890
  - Rodak: 491
  - Strasinger: 467
- All 47 positional-shuffle fixes intact.
- All 42 Strasinger shuffle protections intact.
- All reviewer assets intact.

---

## 5. Scope Boundaries & Next Phase (Phase 3I-C)
- The implementation remains **completely dormant**:
  - No public Next.js API route exposes `trustedStudyPersistence.ts`.
  - RevIT's active MCQ session flow (`RevITApp.tsx`) remains disconnected from the new writer.
  - Cloud synchronization flag `NEXT_PUBLIC_STRASINGER_CLOUD_SYNC_ENABLED` remains `false`.
  - Migration 25 remains unapplied on production database.
- Requirements for Phase 3I-C:
  - Prepare client session adapter and queue transition.
  - Implement migration coordination between legacy and verified attempts.
  - Await explicit user authorization before enabling live traffic.
