# RevIT Phase 3I-E: Trusted Persistence Authentication Contract and Legacy Writer Safety Review

**Date**: 2026-10-15  
**Author**: Antigravity Gemini 3.8 Flash Medium  
**Verdict**: **GO for Local Implementation Preparation** (Zero production writes, zero migrations applied; read-only live catalog inspection complete)

---

## 1. Executive Summary

Phase 3I-E investigated the caller-identity conflict identified in Phase 3I-D and audited live Supabase database catalog metadata (`lznsdxfvxeckflxsohig`) to establish a verified authentication contract for trusted server grading.

### Key Conclusions:
1. **The Identity Conflict Resolved**:
   - `commit_verified_study_batch` and `create_verified_study_session` in Migration 25 revoked `EXECUTE` from `public, anon, authenticated` while simultaneously asserting `auth.uid() = p_owner`.
   - Under Supabase PostgREST, a user-scoped client executes as role `authenticated` (and gets rejected with `42501 permission denied`), whereas a server `service_role` client bypasses table RLS but sets `auth.uid()` to `NULL` (triggering `'Unauthorized caller identity.'`).
   - Granting `EXECUTE` to `authenticated` (Option A) is fundamentally insecure because any student could call the RPC directly via PostgREST to submit forged `is_correct: true` attempts without passing through Next.js server grading.
   - **Recommended Architecture (Option B)**: The Next.js server route handler validates user session cookies (`supabase.auth.getUser()`), computes canonical grading server-side, and invokes the RPC using `createAdminServiceClient()` (`service_role`). The database function verifies `current_user in ('service_role', 'postgres')` and validates `p_owner` against `auth.users`, keeping direct browser invocation 100% blocked.
2. **Fresh Live Catalog Findings (`lznsdxfvxeckflxsohig`)**:
   - Migrations 23, 24, and 25 are confirmed **unapplied** in production.
   - Direct table `INSERT`/`UPDATE` on `question_attempts`, `daily_activity`, and `activity_events` is already revoked from `authenticated`.
   - `question_attempts` currently enforces `CHECK (((selected_answer IS NULL) OR ((selected_answer >= 0) AND (selected_answer <= 3))))`, confirming `selected_answer = NULL` for matching questions is natively compatible with the live database.
   - The live version of `record_question_attempt` currently raises error `22023` for `selected_answer IS NULL AND is_correct = true`.
   - `record_progression_award` and `user_xp_transactions` (Migration 20) **do not exist in production**.
3. **Legacy Writer Plan**:
   - Outlines a safe 3-phase transition: (1) deploy trusted persistence dormant; (2) activate Next.js server route & verify; (3) lock down or deprecate legacy `record_question_attempt` without breaking historical attempt queries.

---

## 2. Precise Caller-Identity Explanation

### How Supabase / PostgREST Establishes Identity
When a client sends an HTTP request to PostgREST (`/rest/v1/rpc/...`):
1. **User Client (`createServerClient` with session cookie)**:
   - Header: `Authorization: Bearer <user_jwt_access_token>`.
   - PostgREST sets PostgreSQL session variables:
     - `SET LOCAL ROLE authenticated;`
     - `SET LOCAL request.jwt.claims = '{"sub": "<user_uuid>", "role": "authenticated", ...}';`
   - `auth.uid()` resolves to `(request.jwt.claims->>'sub')::uuid`.
   - `current_user` is `authenticated`.
2. **Service Role Client (`createAdminServiceClient` with `SUPABASE_SERVICE_ROLE_KEY`)**:
   - Header: `Authorization: Bearer <service_role_jwt>`.
   - PostgREST sets PostgreSQL session variables:
     - `SET LOCAL ROLE service_role;`
     - `SET LOCAL request.jwt.claims = '{"role": "service_role", ...}';` (no `"sub"` user ID present).
   - `auth.uid()` resolves to `NULL`.
   - `current_user` is `service_role`.

### The Design Dilemma in Migration 25
Migration 25 currently contains:
```sql
if auth.uid() is null or auth.uid() <> p_owner then
  raise exception 'Unauthorized caller identity.' using errcode = '42501';
end if;
...
revoke all on function public.commit_verified_study_batch(...) from public, anon, authenticated;
```
- If invoked via user client: PostgREST rejects before function execution (`42501 permission denied for function commit_verified_study_batch`).
- If invoked via service-role client: The function executes, but `auth.uid()` is `NULL`, causing it to throw `'Unauthorized caller identity.'`.

---

## 3. Comparison of Architectural Options

| Criterion | Option A: Grant EXECUTE to `authenticated` | Option B: Dedicated `service_role` RPC (Recommended) | Option C: Session Impersonation Claims |
|---|---|---|---|
| **Invocation Client** | `createServerClient(cookieStore)` | `createAdminServiceClient()` (server-only) | Service client with synthetic user JWT |
| **Browser Exposure** | **HIGH RISK**: Direct PostgREST access allows browser console to bypass Next.js grading | **ZERO RISK**: `EXECUTE` revoked from `authenticated` and `anon`. Browser cannot call RPC | **MEDIUM RISK**: Complex JWT generation logic on server |
| **Identity Verification** | In SQL via `auth.uid() = p_owner` | In Next.js via `auth.getUser()`, plus SQL validates `p_owner` in `auth.users` | In SQL via custom claims |
| **PostgreSQL Permissions** | Granted to `authenticated` | Granted to `service_role` (revoked from `authenticated`) | Granted to `service_role` |
| **SQL Function Check** | `auth.uid() = p_owner` | `current_user in ('service_role', 'postgres')` | `auth.uid() = p_owner` |
| **Complexity** | Low, but insecure | Minimal, clean, and standard for RevIT admin operations | High (requires signing custom JWTs) |

### Recommendation: Option B
Option B is the standard pattern in RevIT for privileged server operations (as used in `app/lib/admin/adminAuth.ts`). The database function must require `current_user in ('service_role', 'postgres')` and verify that `p_owner` matches `study_sessions.user_id`.

---

## 4. Fresh Live Catalog Inspection Findings (`lznsdxfvxeckflxsohig`)

Catalog queries were executed against live project `lznsdxfvxeckflxsohig` using read-only SQL:

1. **Functions**:
   - `create_verified_study_session`: **Does not exist** (confirms Migration 25 unapplied).
   - `commit_verified_study_batch`: **Does not exist** (confirms Migration 25 unapplied).
   - `record_progression_award`: **Does not exist** (Migration 20 unapplied).
   - `record_question_attempt`: Exists with signature `(p_id uuid, p_question_id text, ... p_answered_at timestamptz)`. Owned by `postgres`. `SECURITY DEFINER`. `EXECUTE` granted to `authenticated`.
   - `leaderboard_metric_rows`: Exists with overloads (3 args and 4 args). `EXECUTE` granted to `PUBLIC`, `anon`, `authenticated` (confirms Migration 24 unapplied).
   - `set_question_attempt_book()`: Exists, but only contains logic for Ciulla and Rodak; Strasinger logic is absent (confirms Migration 23 unapplied).
2. **Tables & Columns**:
   - `study_sessions`: **Does not exist**.
   - `trusted_study_config`: **Does not exist**.
   - `user_xp_transactions`: **Does not exist**.
   - `question_attempts`: Provenance columns (`session_slot`, `content_version`, `response_digest`, `verified_at`, `competitive_at`) **do not exist**.
3. **Table Permissions on `public.question_attempts`**:
   - `authenticated`: Has `REFERENCES`, `SELECT`, `TRIGGER`, `TRUNCATE`.
   - `authenticated`: **NO `INSERT`, NO `UPDATE`, NO `DELETE`**.
   - Direct table writes by learners are already locked down.
4. **Constraints on `question_attempts`**:
   - `CHECK (((selected_answer IS NULL) OR ((selected_answer >= 0) AND (selected_answer <= 3))))`.
   - Directly proves that `selected_answer = NULL` is natively valid and supported on production.

---

## 5. Legacy-Writer Lockdown Plan

To transition from client-driven correctness to server-verified persistence without service disruption:

### Phase 1: Dormant Deployment
- Deploy Migrations 23, 24, and 25 (with Option B service-role contract).
- `trusted_study_config.enabled` remains `false`.
- Legacy `record_question_attempt` remains active. Older and current clients continue functioning.

### Phase 2: Next.js Server Route Rollout
- Deploy `/api/study/session` and `/api/study/batch` in Next.js.
- Activate client session adapter (`clientSessionAdapter.ts`).
- Set `trusted_study_config.enabled = true`.
- Updated web clients use trusted server grading. Attempts are recorded with `session_slot`, `response_digest`, and `verified_at`.

### Phase 3: Legacy RPC Lockdown Migration (Migration 26)
- Once active client traffic has transitioned:
  ```sql
  -- Migration 202610200026_restrict_legacy_writers.sql
  revoke execute on function public.record_question_attempt(...) from public, anon, authenticated;
  grant execute on function public.record_question_attempt(...) to service_role;
  ```
- Any older client attempting direct `record_question_attempt` will receive an upgrade prompt (`55000: Please refresh or update RevIT to sync progress`).
- Historical attempt records, user analytics, and `SELECT` queries remain 100% operational.

---

## 6. Staging / Isolated PostgreSQL 17 Test Checklist

When testing in an isolated PostgreSQL 17 environment:
1. **Privilege Boundary**:
   - Verify `anon` cannot call `commit_verified_study_batch` (must return `42501`).
   - Verify `authenticated` cannot call `commit_verified_study_batch` (must return `42501`).
   - Verify `service_role` executes successfully.
2. **Owner Identity & Session Validation**:
   - Verify passing non-existent `p_owner` fails with `22023`.
   - Verify attempting to commit attempts to another user's `session_id` fails with `42501`.
   - Verify committing to an expired session fails with `55000`.
3. **Slot & Attempt Idempotency**:
   - Verify duplicate commit with identical attempt ID and slot returns existing attempt without error.
   - Verify committing different attempt ID into already-occupied slot fails with unique constraint error.
4. **Matching Question NULL Persistence**:
   - Verify matching question with `selected_answer = NULL` and `is_correct = true` commits successfully.
5. **Advisory Lock Serialization**:
   - Verify concurrent batches for the same session do not produce deadlock or duplicate slots.
6. **Rollback Verification**:
   - Apply `202610150025_trusted_study_persistence_rollback.sql`.
   - Verify RPCs return `55000: Trusted study persistence is disabled.`.
   - Verify zero historical attempt rows are deleted.

---

## 7. Proposed SQL Updates for Migration 25 (Option B)

In `supabase/migrations/202610150025_trusted_study_persistence.sql`, update the caller verification and permission blocks:

```sql
-- 4. Session creation RPC (Updated for Service-Role caller)
create or replace function public.create_verified_study_session(
  p_owner uuid,
  p_request_id uuid,
  p_plan jsonb,
  p_request_digest text
)
returns public.study_sessions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.study_sessions;
begin
  -- Strict server-only caller boundary
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Trusted study persistence requires server service role.' using errcode = '42501';
  end if;

  if p_owner is null or not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'Invalid owner identity.' using errcode = '22023';
  end if;

  select * into v_session
  from public.study_sessions
  where user_id = p_owner and request_id = p_request_id;
  if found then
    return v_session;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':session_request:' || p_request_id::text, 0));

  insert into public.study_sessions (
    user_id, request_id, mode, target_count, question_pool, request_digest
  ) values (
    p_owner,
    p_request_id,
    coalesce(nullif(btrim(p_plan->>'mode'), ''), 'reviewer'),
    coalesce((p_plan->>'target_count')::integer, 0),
    coalesce(p_plan->'question_pool', '[]'::jsonb),
    p_request_digest
  )
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.create_verified_study_session(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_verified_study_session(uuid, uuid, jsonb, text) to service_role;


-- 5. Atomic verified attempt persistence RPC (Updated for Service-Role caller)
create or replace function public.commit_verified_study_batch(
  p_owner uuid,
  p_session_id uuid,
  p_attempts jsonb
)
returns setof public.question_attempts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_attempt public.question_attempts;
  v_now timestamptz := now();
begin
  -- Strict server-only caller boundary
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Trusted study persistence requires server service role.' using errcode = '42501';
  end if;

  -- Validate session ownership and active status
  if not exists (
    select 1 from public.study_sessions
    where id = p_session_id and user_id = p_owner
  ) then
    raise exception 'Session not found or owner mismatch.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.study_sessions
    where id = p_session_id and expires_at < v_now
  ) then
    raise exception 'Study session has expired.' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':session:' || p_session_id::text, 0));

  for v_item in select * from jsonb_array_elements(p_attempts)
  loop
    insert into public.question_attempts (
      id, user_id, question_id, subject_id, subject_name, topic_id, topic_name,
      subtopic, difficulty, selected_answer, is_correct, attempt_number,
      review_mode, session_id, session_slot, content_version, response_digest,
      verified_at, competitive_at, answered_at, book
    ) values (
      (v_item->>'id')::uuid,
      p_owner,
      v_item->>'question_id',
      coalesce(nullif(btrim(v_item->>'subject_id'), ''), 'uncategorized'),
      coalesce(nullif(btrim(v_item->>'subject_name'), ''), 'Uncategorized'),
      coalesce(nullif(btrim(v_item->>'topic_id'), ''), 'uncategorized'),
      coalesce(nullif(btrim(v_item->>'topic_name'), ''), 'Uncategorized'),
      coalesce(nullif(btrim(v_item->>'subtopic'), ''), 'Uncategorized'),
      coalesce(nullif(v_item->>'difficulty', ''), 'Unspecified'),
      case when v_item->>'selected_answer' is null then null else (v_item->>'selected_answer')::smallint end,
      (v_item->>'is_correct')::boolean,
      1,
      'reviewer',
      p_session_id,
      (v_item->>'session_slot')::integer,
      v_item->>'content_version',
      v_item->>'response_digest',
      v_now,
      v_now,
      v_now,
      v_item->>'book'
    )
    on conflict (id) do update set
      verified_at = coalesce(public.question_attempts.verified_at, v_now)
    returning * into v_attempt;

    return next v_attempt;
  end loop;

  return;
end;
$$;

revoke all on function public.commit_verified_study_batch(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_verified_study_batch(uuid, uuid, jsonb) to service_role;
```

---

## 8. Handoff for Codex GPT-6.1 Sol

When Codex resumes implementation in Phase 3J:
1. **Target Files**:
   - `supabase/migrations/202610150025_trusted_study_persistence.sql`
   - `supabase/rollbacks/202610150025_trusted_study_persistence_rollback.sql`
   - `app/lib/server/trustedStudyPersistence.ts`
   - `tests/trusted-study.test.ts`
2. **Implementation Steps**:
   - Update `202610150025_trusted_study_persistence.sql` with Option B caller checks (`current_user in ('service_role', 'postgres')`) and `grant execute ... to service_role`.
   - Update `app/lib/server/trustedStudyPersistence.ts` to use `createAdminServiceClient()` for RPC execution while continuing to use `createClient()` (cookie client) for `auth.getUser()`.
   - Update `tests/trusted-study.test.ts` mock caller role to reflect service-role execution.
   - Run full regression: `npx tsc --noEmit && npx tsx --test tests/*.test.ts && npm run lint`.
3. **Unresolved Blockers**:
   - Live PostgreSQL execution remains unverified locally (requires staging or isolated Docker instance).
   - Migration 23 (Strasinger book support) must be applied prior to or alongside Migration 25.
