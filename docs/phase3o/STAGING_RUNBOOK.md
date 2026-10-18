# Phase 3O staging validation — prepared, not executed

**Prepared, not executed. Separate Migration 28 installation and staging runtime approval required.** No command here was run against staging. Preserve the accepted Phase 3N result; do not repeat its handshake/scenarios.

## Before migration

Runtime transaction coverage is provided by the prepared one-command staging operator below (real staging PostgreSQL 17.11), which supplies equivalent or stronger engine evidence than a disposable localhost cluster; local `share/postgres.bki` repair is NOT required. The local disposable harness (`node scripts/phase3o/local-postgres.mjs`) remains optional; this installation lacks `share/postgres.bki` and it stops before initializing a server. Direct evidence is still **NOT TESTED / no engine PASS yet** until the operator runs. The operator prepares real service-role concurrent completions, observed advisory blocking/PIDs, identical receipts, duplicate-prevention checks, fault injection before/during rewards, actual deferred error at COMMIT, independent baseline comparison and rollback-only testing (see "One-command rollback validation").

After separate approval (offline validation complete; staging is the runtime-evidence source), use only staging `qnepjfcbzsycmesrcbjb` / `https://qnepjfcbzsycmesrcbjb.supabase.co`. Reconfirm `get_project_url` through a staging-specific read-only connection and independently verify fresh dashboard Session Pooler host/port/username/database against the private execution process. Never use production `lznsdxfvxeckflxsohig`, retrieve credentials from MCP, echo the URI, run debug/transcription/credential-bearing argument logging or modify environment files.

Migration 28 must preserve exact filename, reviewed bytes, version `202610170028`, name `atomic_study_completion`. Use the established isolated Supabase CLI 2.54.11 history-fetch/list/dry-run procedure in `docs/phase3n/phase3n-m/REPORT.md`, with a fresh unique ignored workspace. Fetch actual current remote history there, then add exactly the reviewed 28 file. Do not copy historical repository migrations 1–26 into that directory or replay the incomplete Migration 26 registry placeholder. Do not reuse stale assumptions about fetched history. Require list/dry-run to show exactly 28 pending; otherwise stop. No `link`, history repair, direct registry DML, roles/seeds payload or main-repository blind `db push`. A one-file dry run proves a plan, not runtime permission/schema compatibility. Migration application is a separate approved operation; the validation operator below intentionally cannot apply it.

Before application, capture original migration rows (including statements), disabled config and original grants. After approved CLI application, require exactly one new `202610170028 / atomic_study_completion`, earlier entries unchanged, config unchanged/disabled, all existing data unchanged, Migration 27 source intact, two new nullable session columns and three event columns, five new postgres-owned routines and exact service/private ACLs. No backfill, new FK or persistent trigger is expected. Do not regenerate an expected database baseline from unexpected results.

## One-command rollback validation

Only after the gates above and separate approval, from the private PowerShell process already holding `REVIT_STAGING_DB_URL`:

```powershell
& 'C:\Users\mypc\Desktop\Projects\RevIT\docs\phase3o\run-staging-validation.ps1' -ValidateRuntime
```

The launcher checks private-variable presence without displaying its value, psql 17.11, exact manifest/source hashes, fresh dashboard details and explicit stopped-ingress/background-writer attestation. It passes no URI/password on child command arguments. Node strips libpq fallbacks/rc/preloads, enforces the staging username/reference and SSL, and sanitizes saved output. No automated retries or server-session termination.

Exact order:

1. Read-only Phase 3O snapshot: database/roles/READ COMMITTED/read-only status; exact 27/28 registry records; one disabled config row; prepared transaction absence; exact installed routine bodies, signatures, owners/security/settings/effective execution; legacy routine ACLs and full registry/membership preservation reference.
2. Unchanged, pinned Phase 3N coverage augmentation as a fresh dependency safety gate. This checks the accepted 28-node/33-FK/125-trigger/six-event-trigger contract, all 28 zero counts and optional XP absence/emptiness; captures full relevant schema/ACL/RLS/index/constraint/callback metadata. It is not the six-session handshake and opens no workers.
3. Read-only activity gate: fail if another client is active or has an open transaction. Idle pooled backends are not terminated. Operational ingress/background-job quiescence still requires the operator's fresh attestation.
4. One transaction: `atomic_study_completion_verification.sql` with only its reviewed fixture include expanded. Bounded statement/lock/idle timeouts; ON_ERROR_STOP; synthetic UUID owners; temporary fencing and config enablement; authoritative batch/completion assertions and fault-injection tests; actual SET ROLE service_role evidence; final **ROLLBACK**. No COMMIT exists in this input. Failure closes the client/transaction; never repair/clean up through unreviewed writes.
5. Non-destructive rollback probe: wraps the reviewed rollback body in one new transaction ending **ROLLBACK**, not the standalone rollback's COMMIT. Checks new entry routines disappear inside that transaction and the Migration 27 writer remains. Stops on any source boundary mismatch.
6. Independent fresh read-only Phase 3O snapshot and coverage capture, including after a suite failure where a connection remains possible. Require exact baseline equality (configuration timestamp/disabled flag, registry statements, canonical grant sets, memberships, routines) and full coverage metadata equality, plus zero dependency counts/no prepared transactions. No expected values are regenerated. A failed test remains failed even when preservation succeeds.

Evidence is create-new under `scratch/phase3o/staging-<timestamp>-<UUID>/evidence.json`. Require actual process exit 0, no SQL errors/timeouts, real ROLLBACK tags, completion markers, assertion notices and service_role/postgres/READ COMMITTED evidence. Never accept exit code alone. Before/after JSON comparisons keep non-ACL fields strict; ACL items are complete sorted PostgreSQL grants, preserving grantor/options.

The operator has three mutually exclusive, separately approved modes on the existing launcher: `-InstallMigration28` (isolated CLI history fetch/list/dry-run, then the single migration write), `-ValidateRuntime` (the sequence above: read-only gates, rollback-only suite, rollback probe, then committed synthetic seed, service-role concurrent identical completion with advisory-lock evidence, an actual deferred pre-COMMIT failure probe, and guarded manifest-only cleanup plus exact baseline restoration), and `-RecoverEvidence <dir>` (imports the retained original baseline/seed to restore after a lost owner without re-running tests). A bare invocation fails closed. Runtime mode does not apply/roll back migrations permanently, rerun Phase 3N, or claim real-user/legacy-writer cutover; that remains Phase 3P. Do not silently expand any mode.

## Failure / rollback boundaries

No wrapper may enable real users. Runtime `REVIT_TRUSTED_STUDY_ENABLED` remains off; config must return disabled with original metadata. Temporary fencing disappears with rollback. On an error, stop; preserve original evidence and inspect independent final reads. No permission workaround, automatic SQL retry, expected-hash replacement, registry repair or Supabase-managed session termination.

Permanent rollback, if separately required later: first disable/drain trusted runtime using the existing reviewed operational fence, require config disabled, then use the reviewed rollback migration. It removes only Phase 3O entry/helper routines; retains historical rewards/attempts/receipts/columns. It does not make legacy writers trusted or reverse earned progress. Mixed/new client calls fail closed when the new RPC is absent. Do not mark a registry version reverted without separately reviewing the supported migration-history procedure.

Legacy AI/exam/mission/milestone writers, competitive readers, permanent revocation, Strasinger and real-user/client activation remain Phase 3P or later work. Stop after reviewing consolidated validation evidence.
