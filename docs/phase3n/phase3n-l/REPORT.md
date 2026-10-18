# Phase 3N-L: Migration 27 Independent Staging Review and Runtime Test Preparation

**Date**: 2026-10-16  
**Final Verdict**: **READY FOR SEPARATE STAGING EXECUTION AUTHORIZATION**  
**Target Staging Project**: `revit-staging` (`qnepjfcbzsycmesrcbjb`, `ap-southeast-2`, PostgreSQL 17.11.0.003 GA)  
**Production Target**: `lznsdxfvxeckflxsohig` — **100% UNTOUCHED** (0 queries, 0 writes, 0 DDL)  
**Phase Scope**: Read-only catalog inspection, SQL audit, and synthetic runtime test preparation only. Migration 27 was **NOT applied** during this phase.

---

## 1. Verified Target and Current Staging Migration State

### 1.1 Target Preflight Verification
- **Project Reference**: `qnepjfcbzsycmesrcbjb` (`revit-staging`, organization `pwtbepjrubowaqwunhdn`)
- **Region**: `ap-southeast-2` (Sydney)
- **Status**: `ACTIVE_HEALTHY`
- **PostgreSQL Engine**: `17` (`17.11.0.003` on x86_64-pc-linux-gnu)
- **Server Address**: `2406:da1c:16f1:f602:c4ac:d79e:4eec:d2a1`
- **Isolation Setting**: `read committed`
- **Production Reference Safeguard**: `lznsdxfvxeckflxsohig` confirmed separate, completely unaccessed and untouched.

### 1.2 Migration Registry on Staging (`supabase_migrations.schema_migrations`)
Read-only query via `list_migrations` confirmed 4 applied migrations on staging:
1. `202610130023_strasinger_book_edition_support` (`20261015163552`)
2. `202610150024_leaderboard_helper_privileges` (`20261015163612`)
3. `202610150025_trusted_study_persistence` (`20261015163653`)
4. `202610160026_trusted_persistence_idempotency_hardening` (`202610160026`)

**Migration 27 is NOT applied on staging.**

### 1.3 Baseline Data Cleanliness
Aggregate row counts confirmed 0 synthetic fixtures remaining on staging:
- `auth.users`: `0`
- `public.study_sessions`: `0`
- `public.question_attempts`: `0`
- `public.activity_events`: `0`
- `public.user_progress`: `0`
- `public.trusted_study_config`: `0`

---

## 2. Exact Live Catalog Definitions and Effective Privileges Inspected

### 2.1 Routine Definitions & Effective Privilege Matrix

| Function Signature | Owner | SecDef | Effective `anon` | Effective `authenticated` | Effective `service_role` | Live Catalog Finding |
|---|---|---|---|---|---|---|
| `create_verified_study_session(uuid,uuid,jsonb,text)` | `postgres` | `true` | `false` | `false` | `true` | Active Migration 25; `search_path = pg_catalog, public` |
| `commit_verified_study_batch(uuid,uuid,jsonb)` | `postgres` | `true` | `false` | `false` | `true` | Active Migration 26; `search_path = pg_catalog, public` |
| `record_question_attempt(uuid,text,text,text,text,text,text,text,smallint,boolean,text,uuid,boolean,timestamptz)` | `postgres` | `true` | `false` | **`true`** | `true` | **Active Legacy Writer**; client-invocable |
| `record_study_activity(text,text)` | `postgres` | `true` | `false` | **`true`** | `true` | **Active Legacy Writer**; client-invocable |
| `check_and_unlock_achievements()` | `postgres` | `true` | `false` | **`true`** | `true` | **Active Legacy Mutator**; client-invocable |
| `leaderboard_metric_rows(text,text,text)` | `postgres` | `true` | `false` | `false` | `true` | Hardened by Migration 24; service-role only |
| `leaderboard_metric_rows(text,text,text,text)` | `postgres` | `true` | `false` | `false` | `true` | Hardened by Migration 24; service-role only |
| `get_leaderboard(...)` | `postgres` | `true` | `false` | `true` | `true` | Privacy-wrapper function |
| `get_current_user_leaderboard_position(...)` | `postgres` | `true` | `false` | `true` | `true` | Privacy-wrapper function |
| `set_question_attempt_book()` | `postgres` | `true` | `false` | `false` | `true` | Trigger function for `question_attempts` |
| `handle_new_user()` | `postgres` | `true` | `false` | `false` | `true` | Trigger function on `auth.users` |

*Note*: Functions `record_progression_award` and table `user_xp_transactions` do not exist on staging or production.

### 2.2 Table Privileges and RLS Status

| Table Name | RLS Enabled | `anon` Effective Permissions | `authenticated` Effective Permissions | `service_role` Effective Permissions | Current Posture / Gap |
|---|---|---|---|---|---|
| `trusted_study_config` | **`false`** | `SELECT, INSERT, UPDATE, DELETE` | `SELECT, INSERT, UPDATE, DELETE` | Full | **Unprotected in Mig 25**; Migration 27 enables RLS & revokes client DML |
| `study_sessions` | `true` | `SELECT, INSERT, UPDATE, DELETE` (table) | `SELECT, INSERT, UPDATE, DELETE` (table) | Full | RLS policy limits SELECT, but table DML grant remains; Migration 27 revokes DML |
| `question_attempts` | `true` | None | `SELECT` only | Full | Correctly locked to SELECT only |
| `question_reinforcement` | `true` | `SELECT, INSERT, UPDATE, DELETE` | `SELECT, INSERT, UPDATE, DELETE` | Full | Direct client writes open under RLS own-row policy |
| `activity_events` | `true` | None | `SELECT` only | Full | Direct writes revoked |
| `daily_activity` | `true` | None | `SELECT` only | Full | Direct writes revoked |
| `user_progress` | `true` | None | `SELECT` only | Full | Direct writes revoked |
| `user_achievements` | `true` | None | `SELECT` only | Full | Direct writes revoked |

### 2.3 Table Constraints Inspected on Staging
- `question_attempts`:
  - `question_attempts_session_slot_key`: `UNIQUE (session_id, session_slot)`
  - `question_attempts_user_question_number_key`: `UNIQUE (user_id, question_id, attempt_number)`
  - `question_attempts_selected_answer_check`: `CHECK (((selected_answer IS NULL) OR ((selected_answer >= 0) AND (selected_answer <= 3))))`
  - `question_attempts_attempt_number_check`: `CHECK ((attempt_number > 0))`
  - `question_attempts_review_mode_check`: `CHECK ((review_mode = ANY (ARRAY['reviewer', 'adaptive', 'wrong_answers', 'weakness_focus', 'pre_test', 'post_test', 'oral_review'])))`
  - `question_attempts_difficulty_check`: `CHECK ((difficulty = ANY (ARRAY['Easy', 'Medium', 'Hard', 'Unspecified'])))`
- `study_sessions`:
  - `study_sessions_user_request_key`: `UNIQUE (user_id, request_id)`
- `trusted_study_config`:
  - `trusted_study_config_id_check`: `CHECK ((id = 1))`

---

## 3. Migration 27 Compatibility Findings & Independent Audit

Audited source: `supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql` against staging catalog.

1. **Function Signatures and Overload Pre-Check**:
   - Migration 27 tests:
     ```sql
     if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('create_verified_study_session', 'commit_verified_study_batch')) <> 2
       or to_regprocedure('public.create_verified_study_session(uuid,uuid,jsonb,text)') is null
       or to_regprocedure('public.commit_verified_study_batch(uuid,uuid,jsonb)') is null then
       raise exception 'Trusted function signatures require review.';
     end if;
     ```
   - Live query test on staging returned `would_raise_exception = false`. Overload pre-check passes cleanly.

2. **`SECURITY DEFINER` and Search Paths**:
   - All three functions (`assert_trusted_study_enabled`, `create_verified_study_session`, `commit_verified_study_batch`) set `SECURITY DEFINER` and `SET search_path = pg_catalog, public, pg_temp`. Prevents search-path hijacking.

3. **`auth.role()` vs `CURRENT_USER`**:
   - In Migration 25/26, `current_user not in ('service_role', 'postgres')` ran as the SECURITY DEFINER owner (`postgres`), rendering the check ineffective for authenticating caller JWT role.
   - Migration 27 correctly checks `if auth.role() is distinct from 'service_role' then raise exception ... errcode = '42501'`. Evaluates caller's JWT claims directly.

4. **Advisory Lock Alignment Across Writers**:
   - Legacy `record_question_attempt` line 37 locks on:
     `hashtextextended(v_user_id::text || ':' || p_question_id, 0)`
   - Migration 27 line 157 locks on:
     `hashtextextended(p_owner::text || ':' || v_key, 0)`
   - Namespaces match exactly. Lock ordering in Migration 27 is sorted alphabetically by `question_id` and `id`, preventing AB-BA deadlocks during concurrent multi-question batches.

5. **Repeat Attempt Numbering & Legacy Gaps**:
   - Allocation formula: `select coalesce(max(attempt_number)::bigint, 0) + 1 into v_number from public.question_attempts where user_id = p_owner and question_id = v_item->>'question_id'`.
   - Respects gaps: if user has historical attempts 1 and 7, next attempt receives 8, then 9.
   - Integer overflow check: `v_number > 2147483647` fails closed with `22003: Attempt number exhausted`.

6. **Exact-Retry Idempotency Before Allocation**:
   - Existing attempt row checked via `FOR SHARE` before allocating attempt number or checking session expiration.
   - Exact retries return existing record without mutating disk, allocating new attempt numbers, or incrementing slot counters.

7. **Matching Question NULL Compatibility**:
   - `(v_item->>'selected_answer')::smallint` produces SQL `NULL`. Cleanly satisfies `question_attempts_selected_answer_check`.
   - Equality comparison `v_attempt.selected_answer is distinct from ...` correctly handles `NULL IS DISTINCT FROM NULL = false`.

8. **Competitive Eligibility & Leaderboard Readers**:
   - Migration 27 sets `competitive_at = NULL` for trusted attempts.
   - Live catalog query of `leaderboard_metric_rows` confirmed: the current implementation queries `from public.question_attempts attempt where attempt.answered_at >= v_period_start` without filtering on `competitive_at is not null`.
   - **Critical Architecture Invariant**: Until `leaderboard_metric_rows` is updated or a cutover is performed, trusted attempts must not be enabled for real users to avoid uncontrolled leaderboard mutations.

---

## 4. Database-Level Activation Guard Evaluation

The proposed activation guard `assert_trusted_study_enabled()` was evaluated against live staging schema:

1. **Configuration Row Guard**:
   - If `trusted_study_config` row 1 is absent or `enabled` is false/null, fails with `PT503: Trusted study persistence is disabled`.
   - Locks configuration row `FOR SHARE`, blocking concurrent transactions from committing while configuration is being updated `FOR UPDATE`.

2. **Role & Isolation Guard**:
   - `auth.role() is distinct from 'service_role'` fails with `42501`.
   - `current_setting('transaction_isolation') <> 'read committed'` fails with `40001`.

3. **Legacy-Writer Double-Lock Fence**:
   - Evaluated live staging catalog via query:
     `legacy_writers_detected = true`
   - Reason: `record_question_attempt`, `record_study_activity`, and `check_and_unlock_achievements` still have `authenticated_execute = true`, and `question_reinforcement` has open direct table write privileges.
   - **Conclusion**: Even if the configuration flag `trusted_study_config.enabled` were set to `true`, `assert_trusted_study_enabled()` will **FAIL CLOSED** with `PT503: Legacy writers must be fenced before trusted persistence`.
   - This provides absolute fail-closed safety against accidental activation before the coordinated cutover.

---

## 5. Proposed Runtime Test Matrix (Ready for Authorized Staging Execution)

Companion test suite created: [`supabase/tests/trusted_cutover_verification.sql`](file:///c:/Users/mypc/Desktop/Projects/RevIT/supabase/tests/trusted_cutover_verification.sql).

| Test # | Scenario | Precondition / Fixture | Execution | Expected Mechanism / SQLSTATE | Assertions / Verification |
|---|---|---|---|---|---|
| **1** | Attempt numbering (no prior history) | Synthetic user with 0 attempts | Commit batch slot 0 | Fresh insert under question advisory lock | `attempt_number = 1`, `is_adaptive_repeat = false` |
| **2** | Repeated question across sessions | Session 1 has attempt on Q1; new Session 2 | Commit Q1 in Session 2 slot 0 | Under question lock: `max(attempt_number) + 1` | `attempt_number = 2`, `is_adaptive_repeat = true` |
| **3** | Legacy history with gaps | Insert legacy attempts 1 and 7 on Q_gap | Commit Q_gap in trusted session | `max(attempt_number) + 1` evaluates to `7 + 1` | `attempt_number = 8` |
| **4** | Exact retry (lost ack) | Attempt already committed | Resubmit identical attempt ID & payload | Detected via `FOR SHARE` check before numbering | Returns original row, `count(*) = 1`, no new attempt number |
| **5** | Conflicting retry & reused slot | Attempt committed; slot 0 occupied | Resubmit same ID with tampered digest, or new ID with slot 0 | Payload mismatch check or slot conflict check | Raises `23505 unique_violation` |
| **6** | Concurrent attempts for same owner & Q | 2 concurrent batches for same owner & question | Dispatched simultaneously | Question advisory lock `hashtextextended(owner:Q, 0)` serializes | Both succeed, numbers allocated sequentially (N, N+1) |
| **7** | Mixed-batch atomic rollback | 2-item batch: item 1 valid, item 2 duplicate slot | Single batch call | Plpgsql exception aborts entire transaction | Item 1 is rolled back; 0 rows leaked on disk |
| **8** | Cross-owner & cross-session collision | User B resubmits User A's attempt ID; User A resubmits in Session 2 | Distinct sessions & owners | `v_attempt.user_id <> p_owner` / `session_id <> p_session_id` | Raises `42501 insufficient_privilege` without returning row |
| **9** | Expired or completed session | `expires_at < clock_timestamp()` or `completed_at is not null` | Commit attempt | Expiry recheck after lock waits | Raises `55000 object_not_in_prerequisite_state` |
| **10** | Matching question with NULL answer | Matching question payload with `selected_answer = null` | Commit batch | Cast `(v_item->>'selected_answer')::smallint` produces NULL | Insert succeeds; check constraint passes; retry matches |
| **11** | Session creation idempotency | Duplicate `(user_id, request_id)` | Call `create_verified_study_session` | Advisory lock on request ID | Identical returns same row; conflicting plan raises `23505` |
| **12** | Disabling gate while commit waiting | Active commit holds `FOR SHARE` on config | Concurrent `UPDATE trusted_study_config SET enabled = false` | Update waits for in-flight commits; subsequent commits fail | Waiting commit finishes; next commit fails with `PT503` |
| **13** | Effective privileges for browser roles | `authenticated` role with JWT claims | Invoke RPCs directly | Postgres privilege check | Trapped with `42501 insufficient_privilege` |
| **14** | Non-destructive rollback verification | Run rollback script in transaction | Replaces RPCs with `PT503` stubs | `enabled = false`, table data preserved | Calls raise `PT503`; historical attempts intact |
| **15** | Competitive eligibility | Trusted attempt inserted | Inspect attempt row | Server derives `competitive_at = null` | `competitive_at IS NULL`; confirms leaderboard cutover prerequisite |

---

## 6. Local Application Compatibility Review

Review of `app/lib/server/trustedStudyPersistence.ts` and `app/lib/trustedStudyClient.ts`:
1. **Contract Parity**: Input fields mapped in Next.js (`id`, `session_slot`, `question_id`, `content_version`, `response_digest`, `selected_answer`, `is_correct`, `subject_id`, `topic_id`, `book`) match Migration 27's JSONB expectations 100%.
2. **Attempt ID & Slot Stability**: Next.js client retains durable attempt-ID/slot ledger across pruning and retries.
3. **Attempt Number Resolution**: Application no longer assumes or hardcodes `attempt_number = 1`; database allocates authority.
4. **Error Mapping**: `PT503` maps to `TRUSTED_STUDY_DISABLED`; `23505`/`42501` map to `ATTEMPT_CONFLICT`; `55000` maps to `SESSION_EXPIRED`.
5. **Default-Off State**: Client feature gate `REVIT_TRUSTED_STUDY_ENABLED` remains unset/off; zero trusted requests emitted in default mode.

---

## 7. Rollback and Cleanup Strategy

- **Test Isolation**: All synthetic test executions in staging must be enclosed in `BEGIN; ... ROLLBACK;` or track synthetic UUIDs for `finally` cleanup.
- **Rollback Script Integrity**: `202610160027_trusted_cutover_and_attempt_numbering_rollback.sql` updates `trusted_study_config.enabled = false`, replaces all 3 RPCs with stubs raising `PT503`, and preserves all table schemas, constraints, and rows.

---

## 8. Confirmation of Strict Operation Boundaries

- **Zero Database Writes**: Staging database `qnepjfcbzsycmesrcbjb` received strictly read-only catalog queries.
- **Zero Migrations Applied**: Migration 27 was NOT applied.
- **Zero Production Access**: Production database `lznsdxfvxeckflxsohig` was completely untouched.
- **Zero Git / Deploy Operations**: No commits, no pushes, no deployments.

---

## 9. Final Recommendation & Decision

**READY FOR SEPARATE STAGING EXECUTION AUTHORIZATION**

Migration 27's SQL structure, catalog compatibility, locking architecture, and fail-closed activation guard are verified and sound. The companion synthetic runtime test suite is prepared in `supabase/tests/trusted_cutover_verification.sql`. Live migration application and test execution await separate, explicit user authorization.
