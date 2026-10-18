# Phase 3F handoff — RPC contract decision required

Date: 2026-10-15. **NO-GO: Critical blockers remain.**

Codex recovered and read `scratch/phase3e_targeted_supabase_schema_verification.md`. Its recorded live RPC explicitly rejects `p_selected_answer IS NULL AND p_is_correct` with `22023`. Migration 23 and both rollback files retain that guard. The Phase 3F request forbids synthetic 0/1 values and requires stopping if NULL is incompatible; no application/SQL fix was implemented.

Do not repeat Phase 3E's confirmed constraint/type/history/overload inspection or retrieve user records. No new production query is needed to establish the blocker: the existing recorded full function body is decisive, unless another actor has changed that body since Phase 3E.

## If schema drift is suspected

Use only the existing authorized read-only Supabase catalog inspection. Exact object:

```text
public.record_question_attempt(uuid,text,text,text,text,text,text,text,smallint,boolean,text,uuid,boolean,timestamp with time zone)
```

Read-only query:

```sql
select p.oid::regprocedure::text as signature,
       pg_get_function_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'record_question_attempt';
```

Expected from Phase 3E: one smallint overload containing the NULL/correct rejection. Reason: determine whether the already documented blocking contract changed. Return schema metadata only. Do not call the attempt RPC or write a test record in production.

## Resolve with the user before implementation

Recommend a separate, narrowly scoped matching-aware RPC validation change, preserving type/check/signature/history and ordinary unanswered-MCQ rejection. It must cover existing Rodak matching support independently of Strasinger rollout, avoid feature rollback restoring the incompatibility, and preserve independent Migration 24 hardening. No such SQL change has been drafted or executed in Phase 3F.

After that contract change is explicitly scoped, the application sender can be reviewed for one shared matching-to-NULL normalization without modifying local encoded answers. It must identify all 16 matching IDs even for legacy queued/history records, without per-question database queries or client exposure of premium datasets.

## Checks still required after a compatible design exists

- Isolated PostgreSQL 17 execution with synthetic data: correct/incorrect matching NULLs, ordinary answer indexes 0/3, unanswered standard correctness rejection, retries/stable IDs, migration 23/24 and rollback, attribution, triggers, RLS, wrapper access, helper denial, history preservation, and SQL calculations.
- Focused cloud-boundary/queue/history/restoration tests, including encoded values 21, 108, 22,875, and above 32,767; preserve local feedback and failed attempts.
- One full application regression pass after implementation. Phase 3F did not run these tests because its prerequisite failed.
- Remaining live ownership/ACL/alternate-exposure checks already listed in the Phase 3D handoff, using Phase 3E evidence where available. Phase 3E reports both helpers remain publicly executable; source hardening is not deployed remediation.

Keep Strasinger cloud synchronization disabled. No credentials requested, production writes, migration execution, environment edits, subscription changes, deployment, commit, or push. Await explicit user direction.
