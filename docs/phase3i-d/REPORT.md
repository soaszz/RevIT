# RevIT Phase 3I-D: Isolated PostgreSQL 17 Testing and Trusted Persistence Security Audit

**Date**: 2026-10-15  
**Status**: Audit Complete; Runtime Execution NOT TESTED (No Local PostgreSQL/Docker Available)  
**Decision**: CONDITIONAL GO (Static schema verification, security privilege audit, and application-level tests pass; live PostgreSQL execution and legacy RPC deprecation required prior to production deployment)  
**Author**: Antigravity Gemini 3.8 Flash Medium

---

## 1. Environment & Database Tool Availability

An audit of local host tools was conducted via system PATH and Program Files inspection:
- **Docker**: Not installed / not available.
- **PostgreSQL 17 binaries (`psql`, `pg_ctl`, `initdb`, `postgres`)**: Not installed / not available in PATH or standard installation paths.
- **Supabase CLI**: Not installed.
- **Existing disposable PostgreSQL instance**: None available.

**Execution Status**:
- No software was installed, and no host configuration was altered.
- In strict adherence to safety rules, production Supabase was not used as a test target.
- **PostgreSQL runtime testing is marked strictly as NOT TESTED.**

---

## 2. Migration Order & Prerequisites Analysis

The repository's migration files under `supabase/migrations/` were audited:
- `202610110022_rodak_book_edition_support.sql` (Migration 22)
- `202610130023_strasinger_book_edition_support.sql` (Migration 23 — Pending/Unapplied)
- `202610150024_leaderboard_helper_privileges.sql` (Migration 24 — Pending/Unapplied)
- `202610150025_trusted_study_persistence.sql` (Migration 25 — Pending/Unapplied)

### Dependencies & Ordering Findings:
1. **Timestamp / Filename Ordering**: Lexicographical order strictly matches chronological order (`0022` < `0023` < `0024` < `0025`). Standard migration tools will apply them in correct sequence.
2. **Migration 23 as Prerequisite**:
   - Migration 25 writes to `question_attempts.book` via `v_item->>'book'` from server metadata.
   - The `book` column itself was added in Migration 11 (`202609250011_leaderboards_book_edition.sql`), so Migration 25 does not fail if Migration 23 is omitted.
   - However, Migration 23 updates the trigger `set_question_attempt_book()` to recognize `strasinger-%` and `strasinger7-%`. Migration 23 should be deployed prior to or together with Migration 25.
3. **Migration 24 Independence**:
   - Migration 24 strictly revokes execution on `leaderboard_metric_rows` from `public, anon, authenticated`. It is completely independent of Migration 25.
4. **Predecessor State & Function Replacement**:
   - Migration 25 introduces `study_sessions`, `trusted_study_config`, and new provenance columns on `question_attempts`. It does not replace or modify existing overloads of `record_question_attempt`.

---

## 3. Trusted Session & Attempt Schema Review

### Schema Components:
1. **`public.trusted_study_config`**:
   - Single-row table (`id = 1 check (id = 1)`) with `enabled boolean not null default false`.
   - Ensures feature remains dormant at the database layer until explicit activation.
2. **`public.study_sessions`**:
   - Ownership: `user_id uuid not null references auth.users(id) on delete cascade`.
   - Idempotency constraint: `unique (user_id, request_id)` prevents duplicate sessions for identical client requests.
   - Expiration: `expires_at timestamptz not null default (now() + interval '24 hours')`.
   - Immutable Question Plans: `question_pool jsonb not null` and `request_digest text not null` bind the verified question order and SHA-256 request digest.
   - RLS: Enabled; `study_sessions_select_own` permits `SELECT` to authenticated session owners. Direct `INSERT`, `UPDATE`, and `DELETE` are disallowed.
3. **`public.question_attempts` Provenance Extensions**:
   - Added columns: `session_slot integer`, `content_version text`, `response_digest text`, `verified_at timestamptz`, `competitive_at timestamptz`.
   - Constraint: `question_attempts_session_slot_key unique (session_id, session_slot)`.
   - Enforces slot uniqueness per session; prevents an adversary from submitting multiple attempts for the same question slot.
   - No sensitive answer keys, rationales, or full question texts are persisted.

---

## 4. Privileged Persistence Functions Security Audit

Audited functions:
- `create_verified_study_session(p_owner uuid, p_request_id uuid, p_plan jsonb, p_request_digest text)`
- `commit_verified_study_batch(p_owner uuid, p_session_id uuid, p_attempts jsonb)`

### Security Findings:
1. **SECURITY DEFINER & Search Path**:
   - Both functions declare `security definer` and set `search_path = pg_catalog, public`.
   - All internal table references are explicitly schema-qualified (`public.study_sessions`, `public.question_attempts`).
2. **Concurrency & Advisory Locks**:
   - `create_verified_study_session`: Serializes on `hashtextextended(p_owner::text || ':session_request:' || p_request_id::text, 0)`.
   - `commit_verified_study_batch`: Serializes on `hashtextextended(p_owner::text || ':session:' || p_session_id::text, 0)`.
   - Transaction-scoped advisory locks automatically release on transaction commit or rollback, preventing race conditions during batch commits.
3. **Caller Identity & Authorization**:
   - Enforces `if auth.uid() is null or auth.uid() <> p_owner then raise exception 'Unauthorized caller identity.'`.
   - Prevents cross-user attempt injection or session creation.
4. **Privilege Revocation & Caller Alignment (Architectural Discovery)**:
   - Migration 25 executes:
     ```sql
     revoke all on function public.create_verified_study_session(...) from public, anon, authenticated;
     revoke all on function public.commit_verified_study_batch(...) from public, anon, authenticated;
     ```
   - **Critical Condition**: Because `EXECUTE` is revoked from `authenticated`, browser clients cannot call these RPCs directly via PostgREST.
   - However, if the Next.js server calls these RPCs via `service_role`, `auth.uid()` defaults to `NULL`, triggering `'Unauthorized caller identity.'`.
   - **Resolution Required Before Production Deployment**: The server route handler must either invoke the RPC using `service_role` with a user context claim, or the database function must be updated to inspect `auth.jwt() ->> 'sub'` or accept explicit server-authenticated claims.

---

## 5. XP & Reward Integrity Audit

### Attack Vectors Analyzed:
- **Client-Forged Correctness**: Blocked. Server persistence ignores client-supplied `isCorrect` and evaluates answers via server-only `gradeAnswer()`.
- **Caller-Supplied XP Amounts**: Blocked. Neither `create_verified_study_session` nor `commit_verified_study_batch` accept XP parameters.
- **Fake Question Identifiers**: Blocked. Validated against the server canonical registry (`getCanonicalQuestion()`).
- **Duplicate Slot Replays**: Blocked by `question_attempts_session_slot_key unique (session_id, session_slot)`.
- **Forged Timestamps**: Blocked. `verified_at` and `competitive_at` are derived from PostgreSQL `now()`.

### Blocker / Legacy Bypass Notice:
- While the new trusted persistence path is secure, **legacy RPCs remain active**:
  - `record_question_attempt` (Migration 23) remains executable by `authenticated`.
  - `record_progression_award` (Migration 20) accepts arbitrary client amounts and remains executable by `authenticated`.
- **Requirement**: As part of the future live cutover (Phase 3J / production activation), `record_progression_award` and `record_question_attempt` must be deprecated or restricted to prevent clients from bypassing server grading.

---

## 6. Matching Question & Rodak Metadata Verification

1. **Matching Question Persistence**:
   - In `202608280004_weakness_dashboard.sql`, `selected_answer` has check constraint `(selected_answer is null or selected_answer between 0 and 3)`.
   - All 16 matching questions (2 in Rodak, 14 in Strasinger) persist `selected_answer = NULL`. In SQL, `NULL is null` evaluates to `TRUE`, cleanly satisfying the check constraint without errors.
   - Local state retains the exact matching arrays and encoded values for UI feedback.
2. **Rodak Metadata Resolution**:
   - `studyQuestionMetadata.ts` correctly resolves all 34 historically untagged Rodak records (Chapters 4–6) to `rodak-hematology` and `rodak-chXX`.
   - No question JSON was modified, and no fake citations were invented.

---

## 7. Rollback Safety Analysis

Audited `supabase/rollbacks/202610150025_trusted_study_persistence_rollback.sql`:
- **Execution Status in PostgreSQL**: NOT TESTED (no local database runtime).
- **Static Safety Assessment**:
  1. Sets `trusted_study_config.enabled = false`.
  2. Replaces `create_verified_study_session` and `commit_verified_study_batch` with disabled stubs raising error `55000` (`Trusted study persistence is disabled.`).
  3. Re-executes `revoke all ... from public, anon, authenticated`.
  4. **Non-Destructive**: Zero `DROP TABLE`, zero `DROP COLUMN`, zero `DELETE FROM`. Historical attempt records, user subscriptions, and progress remain completely intact.
  5. Leaderboard privacy hardening (Migration 24) remains active.

---

## 8. Application Regressions & Content Integrity

- **Question Content Integrity**:
  - All 4,441 MCQs match entry baseline SHA-256 hashes (100% match).
  - All 47 positional-shuffle fixes intact.
  - All 42 Strasinger shuffle protections intact.
  - All 38 reviewer assets intact.
- **Automated Regressions**:
  - Focused suites (`tests/trusted-study.test.ts`, `tests/client-session-adapter.test.ts`): 20/20 PASS.
  - Unit test suite (`tests/*.test.ts`): 171/171 PASS across 26 test files.
  - Content test suite (`tests/reviewer-content.test.mjs`): 16/16 PASS.
  - TypeScript typecheck (`npx tsc --noEmit`): clean (0 errors).
  - ESLint (`npm run lint`): clean (0 errors, 104 existing warnings).
  - Production build (`npx next build`): clean (0 route leaks).
  - Security secrets scan (`npm run security:secrets`): clean (0 leaks across 4,242 files).
- **Cloud-Sync Gate**:
  - `NEXT_PUBLIC_STRASINGER_CLOUD_SYNC_ENABLED` remains `false`.
  - Fail-closed checks verified in unit tests.

---

## 9. Final Decision & Recommendations

### Decision: **CONDITIONAL GO**

### Required Action Items Prior to Production Deployment:
1. **Runtime Database Staging Verification**: Apply Migrations 23, 24, 25 and the rollback on an isolated PostgreSQL 17 / Supabase staging instance to verify live trigger execution, lock contention, and rollback execution.
2. **Server-Side RPC Invocation Alignment**: Align the `commit_verified_study_batch` caller identity check (`auth.uid()`) with the server-side API route handler client (e.g. setting claims or dedicated trusted caller role).
3. **Legacy RPC Lockdown Plan**: Plan the deprecation or permission revocation of `record_progression_award` and direct `record_question_attempt` calls upon trusted persistence activation.
