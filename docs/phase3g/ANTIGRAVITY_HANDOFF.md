# Phase 3G handoff

Date: 2026-10-15. **NO-GO: Critical issues remain.**

Local implementation is prepared: exact matching-ID validation in proposed Migration 23 and one shared outgoing NULL normalization in `cloudService.ts`. Nine new focused tests pass; the complete pass has 139 unit tests plus 16 content tests, successful typecheck/build/secret scan, and lint with zero errors/104 existing warnings. Do not repeat those completed checks in Antigravity.

Strasinger synchronization remains disabled. No production writes, connections, migration execution, deployment, subscription changes, environment changes, commit, or push occurred.

## Release blocker requiring a scope decision

The existing RPC trusts client-reported `p_is_correct`. Stored correctness drives XP, public rankings, mastery, weakness, and study history. Exact matching-ID membership proves type eligibility, not an answered question or correct response. Own-row direct INSERT/UPDATE grants in repository migrations are also bypass candidates. First-daily/idempotency protections do not authenticate correctness.

Before release, obtain an explicit user decision on a separate trusted-grading/competitive-integrity mitigation. A new application route alone is insufficient if direct RPC/table paths can still manufacture correctness. Do not silently redesign grading, change formulae/permissions, or treat this risk as resolved by the allowlist. See REPORT.md for the source evidence and containment recommendation.

## Read-only live contract confirmation, only if needed before controlled review

Reuse Phase 3E's schema/constraints/history observations; do not fetch real attempt rows or repeat its count/distribution audit. Codex did not independently reverify production.

Object: `public.record_question_attempt(uuid,text,text,text,text,text,text,text,smallint,boolean,text,uuid,boolean,timestamptz)` plus all raw helper overloads and their wrappers.

Needed: detect drift from the historical baseline and confirm the exact rollback source, owner, signature, security mode, search path, and effective client grants. Safe metadata query:

```sql
select p.oid::regprocedure::text as signature,
       pg_get_function_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.proconfig, p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('record_question_attempt', 'leaderboard_metric_rows',
                    'get_leaderboard_snapshot', 'get_leaderboard',
                    'get_current_user_leaderboard_position')
order by signature;
```

Expected historical state: one smallint attempt RPC with the old NULL/correct rejection; both metric helper overloads exist. Phase 3E reported both helpers publicly executable. The prepared target revokes direct client/public access to raw helpers while preserving authorized privacy-filtered wrappers. Report current metadata rather than assuming remediation has happened. Reason: local CREATE OR REPLACE and ACL files do not establish live state or inherited permissions.

For the client-correctness bypass assessment, inspect metadata only:

```sql
select has_table_privilege('authenticated', 'public.question_attempts', 'INSERT') as can_insert,
       has_table_privilege('authenticated', 'public.question_attempts', 'UPDATE') as can_update;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('question_attempts', 'question_reinforcement');
```

Expected repository contract: authenticated own-row insert/update rather than trusted answer grading. Report any divergence. Do not demonstrate attacks against production, create a synthetic production record, call a writing RPC, retrieve participant data, or change grants. Additional ownership/inheritance/alternate exposure checks from the Phase 3D handoff remain applicable where not covered by existing Phase 3E evidence.

## Isolated PostgreSQL 17 work still required

Codex found no suitable runtime; no installation was authorized. All SQL execution tests remain NOT TESTED. With a separately available disposable local environment and synthetic data only, validate:

1. Pre-feature function definitions/signatures/ACLs and relevant trigger/RLS schema faithfully reconstructed from verified sources.
2. Migration 23 and independent Migration 24, preserving one attempt-RPC signature and the smallint/0–3 constraint.
3. Both correct and incorrect NULL attempts for all 16 exact matching IDs; metadata, attribution, stable IDs, timestamps, and numbering preserved.
4. Ordinary indexes 0/3 accepted; ordinary or unknown ID NULL/correct=true rejected; NULL/false retains existing behavior. Legacy matching numeric 0–3 remains numeric; values outside the old CHECK/type remain rejected.
5. Harr/Ciulla/Rodak/Strasinger attribution, both Strasinger prefixes, first-daily metrics, XP calculations, own-user RLS, anonymous denial, authenticated wrapper success, and no raw participant leakage.
6. Failed/ambiguous acknowledgments and stable-ID retries do not create duplicate database rows.
7. Dedicated feature rollback restores the previous guard/functions without deleting matching NULL/correct history or weakening independent helper hardening. Document that retries may then fail the restored validation before stable-ID lookup.

These checks are not substitutes for the correctness mitigation decision. Keep deployment/sync changes paused. The compatible RPC must precede a future compatible-client rollout; feature rollback requires coordinating that client too. No migration execution commands or production execution approval are included in this handoff.
