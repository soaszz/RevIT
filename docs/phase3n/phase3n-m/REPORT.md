# Phase 3N-M3 — installed staging state independently confirmed — 2026-10-16

**CONDITIONAL GO: Migration 27 installation, disabled configuration and clean current staging state independently verified through read-only inspection. Both suites are user-reported PASS; complete execution logs are unavailable. Scenarios 6 and 12 remain NOT TESTED. No activation or production cutover is authorized.** This entry supersedes the earlier absent-migration/blocker snapshot below, which remains historical evidence of that earlier attempt.

## Evidence boundaries and manual execution report

The user states that Migration 27 and both prepared SQL verification suites were executed manually in a separate PowerShell terminal and that both suites passed. The user confirms complete stdout/assertion logs were not saved and provides no captured log path. The app terminal reader returned `No app terminal session is attached to this thread yet.` The inspected workspace evidence contains setup/help material, not execution transcripts. No terminal history, credentials or private process connection was retrieved.

Accordingly, the manual command, application stdout/exit code, exact assertion counts, observed expected-error SQLSTATEs and final ROLLBACK command tags cannot be reconstructed. Prepared SQL expectations and a clean current database are not substitutes for those missing results. No test, migration, rollback or cleanup operation was rerun to manufacture evidence.

| Evidence item | Observed result / attribution |
|---|---|
| Migration 27 manual command/application terminal output | User reports application; terminal output, exact command and exit code unavailable |
| Migration 27 registry and installed definitions | Independently verified below |
| `trusted_cutover_verification.sql` result | User-reported PASS; not independently verified from execution logs |
| Base-suite assertion count / observed SQLSTATEs / final ROLLBACK output | Unavailable; no numerical count, SQLSTATE or command result claimed |
| `trusted_cutover_rollback_verification.sql` result | User-reported PASS; not independently verified from execution logs |
| Rollback-suite assertion count / observed SQLSTATEs / final ROLLBACK output | Unavailable; no numerical count, SQLSTATE or command result claimed |
| Current disabled configuration, counts and privileges | Independently verified by SELECT-only checks below |
| Scenario 6: engine-level overlapping attempts | NOT TESTED; no independent-connection/engine-lock evidence supplied |
| Scenario 12: disable fence during lock waits | NOT TESTED; no independent-connection/engine-lock evidence supplied |

The documentation-only phase observed no PostgreSQL query error. This does not establish which SQLSTATEs the manual suites exercised. Atomic insert-before-failure behavior, actual SQL-role test execution and rollback data-preservation assertions remain within the user's overall pass report, without detailed independently captured runtime proof.

## Independently verified target and registry

First called only `revit-staging-verify.get_project_url`, which returned exactly `https://qnepjfcbzsycmesrcbjb.supabase.co`. Subsequent reads used that same staging-specific connection, reporting effective/session role `supabase_read_only_user` and `transaction_read_only=on`. No writer or generic Supabase connection was used. Production was not accessed.

Actual current registry, from `list_migrations` and SELECT-only metadata:

| Version | Registry Name | Stored statements | Stored SQL characters |
|---|---|---:|---:|
| `20261015163552` | `202610130023_strasinger_book_edition_support` | 1 | 10464 |
| `20261015163612` | `202610150024_leaderboard_helper_privileges` | 1 | 380 |
| `20261015163653` | `202610150025_trusted_study_persistence` | 1 | 6261 |
| `202610160026` | `202610160026_trusted_persistence_idempotency_hardening` | 1 | 70 |
| `202610160027` | `trusted_cutover_and_attempt_numbering` | 17 | 12946 |

Migration 27 is recorded exactly once under the required version/name. Migration 26 remains applied. The four earlier version/name tuples, statement counts and stored-text lengths match the pre-application observations; no extra unrelated registry entry appears. A byte-for-byte comparison of every earlier stored SQL payload is not established by those metadata comparisons. The known incomplete Migration 26 history placeholder remains historical bookkeeping, not reconstructable source.

## Installed function definitions and effective execution permissions

Read `pg_proc.prosrc` for the three trusted routines and compared locally with the reviewed original Migration 27. All three bodies match, normalizing only line endings and outer body whitespace. The original file still hashes to `aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589`. No routine was invoked for this check. These are the reviewed implementations, not the standalone rollback's disabled stubs.

| Routine | Owner | SECURITY DEFINER | Fixed search_path | anon EXECUTE | authenticated EXECUTE | service_role EXECUTE |
|---|---|---|---|---|---|---|
| `assert_trusted_study_enabled()` | `postgres` | true | `pg_catalog, public, pg_temp` | false | false | false |
| `create_verified_study_session(uuid,uuid,jsonb,text)` | `postgres` | true | `pg_catalog, public, pg_temp` | false | false | true |
| `commit_verified_study_batch(uuid,uuid,jsonb)` | `postgres` | true | `pg_catalog, public, pg_temp` | false | false | true |

Only the expected three trusted signatures are present. ACLs contain owner execution and, for the two public trusted RPCs, service-role execution; no PUBLIC execution entry is present. The guard remains owner-internal. Effective checks include inherited privileges rather than inferring access from named grants alone.

The legacy writer functions `record_question_attempt` (existing full signature), `record_study_activity(text,text)` and `check_and_unlock_achievements()` retain effective EXECUTE false/true/true for anon/authenticated/service_role respectively. Both `leaderboard_metric_rows` overloads retain false/false/true. Their owners, security settings, ACLs and definition MD5s match the earlier captured preflight:

| Preserved routine | Definition MD5 |
|---|---|
| `record_question_attempt` | `b2f5c34c8fa2a75eb4d828dd3d11fc11` |
| `record_study_activity` | `ae24a0d21e2f8e78efd379c1b6f554ee` |
| `check_and_unlock_achievements` | `84a1bdf84cb7ae339f89a85b0b45ce18` |
| `leaderboard_metric_rows(text,text,text)` | `1fa2790f9eeff1eccb236e5e697443ed` |
| `leaderboard_metric_rows(text,text,text,text)` | `98ed988dfdb00f008eb86d233b6a6717` |

`record_progression_award` is not installed. No live legacy-writer revocation or leaderboard reader cutover was performed by this task.

## Configuration, table security and preservation

- `trusted_study_config` contains row `id=1, enabled=false`; RLS is enabled, with no client policy. Effective anon/authenticated SELECT and DML rights are false. `service_role` has SELECT only, with INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER and column INSERT/UPDATE all false. This is the expected Migration 27 hardening.
- `study_sessions` RLS is enabled. The existing authenticated SELECT policy remains `user_id = auth.uid()`. Both browser roles lack effective INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER and column INSERT/UPDATE. Existing SELECT grants remain; anon has no SELECT policy. Raw browser ACLs are `rm`, so pre-existing MAINTAIN grants also remain; no claim is made that all privileges were removed. The service role retains its pre-existing table privileges.
- `question_attempts`, `activity_events`, `daily_activity`, `user_progress` and `user_achievements` retain RLS, authenticated SELECT only among inspected row-access rights, anon denial and existing service-role table rights. Browser DML and column INSERT/UPDATE remain false.
- `question_reinforcement` retains RLS and its existing browser/service-role table privileges, including the pre-existing legacy write paths. Temporary test fencing is not present in the current effective grants. No permanent fencing was added.
- No column-specific ACL entries exist on the eight inspected tables. These current results match the reviewed migration's intended config/session changes and preserve the documented unrelated legacy privileges. They do not establish a complete byte-for-byte post-install-versus-post-test snapshot comparison: no contemporaneous snapshot/log from the user's manual run is available.

## Current cleanup evidence — not reconstructed ROLLBACK output

All inspected aggregate row counts are zero:

| Table | Current rows |
|---|---:|
| `auth.users` | 0 |
| `public.profiles` | 0 |
| `public.user_preferences` | 0 |
| `public.study_sessions` | 0 |
| `public.question_attempts` | 0 |
| `public.activity_events` | 0 |
| `public.daily_activity` | 0 |
| `public.user_progress` | 0 |
| `public.user_achievements` | 0 |
| `public.question_reinforcement` | 0 |

The optional `user_xp_transactions` table is absent. Catalog checks found zero suite temporary tables named `trusted_test_results`/`rollback_snapshot` and zero temporary helper routines named `expect_error`/`attempt`. No residual synthetic records exist in the inspected tables. Configuration remains false and legacy effective permissions remain open as documented. This verifies clean current state; it cannot establish that the missing terminal output ended in ROLLBACK or how cleanup occurred. No cleanup writes were needed or performed in this phase.

## Pending work and final decision

**CONDITIONAL GO for further separately authorized staging validation; no real-user activation.** Migration 27's installed state is independently confirmed. Preserve the manual suite outcomes as user-reported PASS with unavailable detailed logs; do not relabel them as observed numerical assertions, captured SQLSTATEs or proven concurrency. Scenarios 6 and 12 remain NOT TESTED until separately authorized independent PostgreSQL connections and `pg_stat_activity`, `pg_locks`, `pg_blocking_pids` evidence exist.

Atomic rewards/completion, leaderboard eligibility/cohort cutover, permanent legacy-writer revocation and real-user trusted-persistence activation remain pending. Strasinger synchronization and production cutover remain unauthorized. Current DB disablement is verified; this task did not audit or alter deployment environment flags.

This phase performed only staging read-only metadata/catalog/count queries, local evidence/source reads and the four requested documentation edits. It did not rerun suites, apply/rollback migrations, modify databases, invoke cleanup, alter privileges/configuration, access production, enable persistence/rewards, change application/SQL/environment files, deploy, commit or push. Earlier report entries are preserved. **Stop after documenting this verified state; no automatic continuation.**

# Phase 3N-M3 — stopped at required process connection — 2026-10-16

**CONDITIONAL GO: authorized staging execution remains blocked before writes. `REVIT_STAGING_DB_URL` is absent from the current command execution process.** No CLI database connection, dry run, migration or verification suite was attempted. This is an unmet prerequisite, not a database permission denial or SQL failure.

## Current authorization and observed prerequisite results

The M3 request authorizes only Migration 27 and the two prepared synthetic suites on `qnepjfcbzsycmesrcbjb`, with exact registry tuple `202610160027` / `trusted_cutover_and_attempt_numbering`. It explicitly requires a process-scoped connection, dashboard-established Session Pooler identity and a safe owner executor before migration, and requires stopping if a prerequisite differs. Existing write authorization does not waive those requirements.

- Read current project instructions, applicable-instruction inventory, latest handoff/report, complete staging runbook and migration/rollback/suite sources. No applicable nested instruction file was found below affected paths. No source or workspace file was modified.
- A credential-safe process-variable presence check returned `processDbUrlPresent=false`. No URI, password or secret was printed, serialized or logged. No `.env.local`, user/machine environment, credential-store or MCP-secret fallback was used.
- The dashboard-confirmed Session Pooler host/port/staging username has not been established in this chat. With the required variable absent, the CLI target cannot be independently authenticated. No host, port or credential was guessed, and no CLI database connection was attempted.
- Actual pinned binary `--version` output remains `2.54.11`. No installation or link operation occurred.
- The isolated active migration directory now contains exactly these five filenames, unlike its earlier M2 snapshot: `20261015163552_202610130023_strasinger_book_edition_support.sql`, `20261015163612_202610150024_leaderboard_helper_privileges.sql`, `20261015163653_202610150025_trusted_study_persistence.sql`, `202610160026_202610160026_trusted_persistence_idempotency_hardening.sql`, `202610160027_trusted_cutover_and_attempt_numbering.sql`. Their presence is observed; this attempt did not fetch them or independently establish the prior fetch provenance/history reconciliation.
- Original Migration 27, pending-source copy and active isolated migration copy all have SHA-256 `aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589`. Base/generated suite hashes remain `9bab554f9b2665e82b85ca506f067a8c73800b59ec6a690d0c0463c712031e50` and `6830902c33cef3f393321f1a4c2e94c0e114b89f6ef23e41d0b712041f50ecb8`.
- `Get-Command psql` found no executable on PATH. This is not proof that no SQL library/client exists anywhere. A supported executor connected to the same verified staging database as owner `postgres`, with transaction control, READ COMMITTED, role switching and stop-on-error, has **not been established**. No executor was installed or substituted. Do not assume the read-only MCP connection can execute the suites.

## Fresh read-only staging observations

Called `revit-staging-verify.get_project_url` first: exactly `https://qnepjfcbzsycmesrcbjb.supabase.co`. Registry inspection then returned the same four records:

| Version | Name |
|---|---|
| `20261015163552` | `202610130023_strasinger_book_edition_support` |
| `20261015163612` | `202610150024_leaderboard_helper_privileges` |
| `20261015163653` | `202610150025_trusted_study_persistence` |
| `202610160026` | `202610160026_trusted_persistence_idempotency_hardening` |

SELECT-only metadata reports effective role `supabase_read_only_user`, `transaction_read_only=on`, configuration rows 0, enabled rows 0 and no `assert_trusted_study_enabled()` guard. Migration 26 remains registered and Migration 27 absent. Configuration remains disabled by absence; no false configuration row has been installed. This MCP identity does not establish identity or authority for a separate CLI/owner connection.

## Actual execution, permissions and cleanup evidence

| Operation | Actual result |
|---|---|
| CLI migration list / one-file dry run | NOT RUN; required process connection absent |
| Migration 27 application / registry insertion | NOT ATTEMPTED; zero database writes |
| Post-install definitions/owners/search paths/effective grants | NOT APPLICABLE; no installation occurred |
| Fresh complete pre-migration ACL baseline | NOT COMPLETED after the connection blocker; earlier ACL findings remain historical |
| Base suite / generated rollback-verification suite | NOT TESTED; zero runtime assertions and zero PASS rows |
| Scenarios 6 and 12 | NOT TESTED; separate multi-connection prerequisites/authorization still required |
| Standalone rollback / registry repair | NOT RUN |
| Fixtures and cleanup | This attempt created no fixtures or temporary fences; no cleanup writes required or performed |
| SQLSTATEs | None: read-only inspection succeeded; no migration/suite SQL was submitted |

No post-install or post-test cleanup claim is possible. No privileged writer fallback, automatic retry, migration repair, standalone rollback, live grant/configuration change, trusted-persistence/reward activation, production access, global software/application dependency installation, tracked environment edit, deployment or Git operation occurred.

Missing prerequisites: make `REVIT_STAGING_DB_URL` privately available to the process that will execute commands; establish the non-secret dashboard Session Pooler host, port and staging-specific username; establish a supported owner SQL executor before migration. Never paste credentials into chat. Once prerequisites are supplied, repeat fresh identity/registry/source/schema checks and the actual one-file dry run; retain all original execution boundaries. Updated only the four requested local reports/status/handoff files, preserving earlier entries. **Stop before writes; no automatic continuation.**

# Phase 3N-M2 — isolated CLI prepared; private database connection missing — 2026-10-16

**CONDITIONAL GO: local setup complete; history fetch and dry-run validation blocked. No database writes or remote CLI command occurred.** The workspace does not yet satisfy the required four-fetched-plus-one-pending layout, and no CLI confirmation that only Migration 27 is pending exists.

## Exact installation scope and observed local results

- Created `scratch/phase3n-m2-cli-workspace/`, covered by existing `/scratch/` ignore rule. No applicable nested AGENTS.md exists. Read current instructions/handoff/report/runbook and migration/rollback/suite sources; existing SQL hashes are unchanged.
- Installed official stable Supabase CLI **2.54.11**, Windows AMD64 standalone binary, at `scratch/phase3n-m2-cli-workspace/bin/supabase.exe`. GitHub release API confirmed `draft=false`, `prerelease=false`. No npm package, application dependency/lockfile, global installation or PATH change occurred. [Official release](https://github.com/supabase/cli/releases/tag/v2.54.11).
- Downloaded only the official release archive and checksum file into that scratch directory. Initial sandbox network request was refused; the approved network escalation completed the same scoped download. Archive SHA-256: `0dc069ca49021261c5f0b0d566c189567e597640f2943f7be4fe82bdd96cb7c6`. It matches both release asset metadata and published checksum entry. Executable SHA-256: `e0216601cb495fab7f583dd1dd53a4954c40d73726ffcb35f7b5429eda795bf6`. Only `supabase.exe` was extracted after checking archive paths.
- Actual `supabase.exe --version` output: `2.54.11` (exit 0). Actual local `init --workdir .../workspace` completed (exit 0), creating only isolated Supabase configuration/ignore/cache files. No local database/services were started. Main `supabase/config.toml` and main link file remain absent.
- Captured actual help for root, migration, fetch, list, db push and login commands. Installed help confirms `migration fetch --db-url`, `migration list --db-url`, and `db push --db-url --dry-run`. Help output is not evidence that any of those remote commands ran.
- Copied original `202610160027_trusted_cutover_and_attempt_numbering.sql` into `pending-source/` outside the isolated active migrations directory. Both original and copy SHA-256 equal `aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589`. No earlier repository migrations were copied, renamed or fabricated.
- Local evidence: `evidence/release.json`, `installation.json`, `version.txt`, command-help files and `source-baseline.json`. Post-setup hashes confirm application package/lockfile, original Migration 27, rollback and both suites unchanged. Scratch configuration has no populated vault stanza; no seed/role file exists. No scheduled-change claim is made without an actual dry run.

## Fresh target and remote history observations

Before the read-only remote operations, `revit-staging-verify.get_project_url` returned exactly `https://qnepjfcbzsycmesrcbjb.supabase.co`; it was reconfirmed before the final metadata SELECT. That connection reports `supabase_read_only_user` and `transaction_read_only=on`. No production or writer connection was used.

Actual MCP migration list remains:

| Version | Registry Name |
|---|---|
| `20261015163552` | `202610130023_strasinger_book_edition_support` |
| `20261015163612` | `202610150024_leaderboard_helper_privileges` |
| `20261015163653` | `202610150025_trusted_study_persistence` |
| `202610160026` | `202610160026_trusted_persistence_idempotency_hardening` |

Migration 26 is registered; Migration 27 remains absent. Configuration row count and enabled row count both remain 0: disabled by absent configuration, not an observed false row. Each history entry stores one statement; lengths remain 10464, 380, 6261 and 70 characters.

The exact 70-character stored Migration 26 statement was inspected through a metadata-only SELECT:

```text
create or replace function public.commit_verified_study_batch(...) ...
```

This is incomplete placeholder text, not the actual function body or a reconstructable Migration 26 source. It must never be replayed or treated as proof of schema contents. This was a history inspection, not a CLI fetch or SQL execution of the placeholder. Other full history bodies have not been fetched/inspected by CLI in M2.

## Authentication blocker and unsafe link behavior

No user-completed CLI authentication or privately supplied staging PostgreSQL connection has been established for this isolated executor. Existing MCP authorization does not provide a CLI database connection or authorize exporting its credentials. No credential store, environment secret or MCP credential was retrieved; no login URL/token/password was captured or logged.

Source inspection also found that **CLI 2.54.11 `supabase link` is not a strictly read-only remote setup command**: its `linkDatabase` calls `CreateMigrationTable` and `CreateSeedTable`, which issue schema/table creation and migration-column DDL even when some objects already exist. It also retrieves API keys. Therefore neither `link` nor browser-login-followed-by-link was attempted under M2's no-schema-write boundaries. The earlier M1 linked-workspace candidate must not be executed literally as a read-only setup workflow. [Exact link implementation](https://github.com/supabase/cli/blob/v2.54.11/internal/link/link.go), [migration/seed setup DDL](https://github.com/supabase/cli/blob/v2.54.11/pkg/migration/history.go).

The installed commands support an explicit `--db-url` instead of linking. A user-controlled, privately authenticated, staging-only PostgreSQL connection is the missing prerequisite for read-only fetch/list/dry-run. Browser account login alone is not a verified database connection. Do not paste credentials into chat, put them in tracked files or echo them in commands/logs. Do not broaden existing MCP roles or run link to work around this blocker. Before resuming any remote CLI command, independently validate its actual database endpoint/reference and reconfirm the MCP project URL; MCP identity alone cannot authenticate a separate executor.

## Actual fetch/list/dry-run status

| Required operation | Actual result |
|---|---|
| Supported CLI migration-history fetch | NOT RUN: approved private staging DB connection missing |
| Fetched history files | None; no synthetic replacements created |
| Isolated active migration files | Zero; Migration 27 held outside that directory pending real fetch |
| CLI migration list | NOT RUN; no actual output or reconciliation result |
| CLI db push dry run | NOT RUN; no actual output or pending-file confirmation |
| Exact four-applied-plus-one-pending layout | NOT ESTABLISHED |
| Only Migration 27 pending | NOT VERIFIED by CLI |
| Migration application / verification suites / rollback | NOT RUN; prohibited in M2 |

After the user establishes an approved private direct DB connection, the already authorized M2 continuation can recheck target and use the installed supported fetch workflow into the empty isolated migration directory. Inspect all fetched artifacts, retain their actual remote Version/Name identities, add the verified original Migration 27, then require actual list/dry-run output showing only that file. Stop on any conflict, target ambiguity, unexpected SQL/setup behavior or extra work; do not repair history. This is a description of the remaining preparation, not an automatically launched operation. No migration execution is authorized by M2, even if its dry run later succeeds.

Updated only this report, STATUS.md and AGENT_HANDOFF.md outside ignored scratch setup/evidence. No database schema/data/registry/configuration/permission change, synthetic fixtures, trusted-persistence/reward activation, production access, tracked environment edit, deployment or Git operation occurred. No test suite or migration was executed. **Stop at private database authentication; dry-run preparation remains incomplete.**

# Phase 3N-M1 — safe CLI execution planning — 2026-10-16

**Planning complete; execution remains blocked pending an approved CLI/owner executor and separate execution authorization. No database writes occurred.** A supported isolated staging-workspace procedure can avoid changing earlier remote history. It was not set up or executed here.

## Environment and actual command availability

- Read current AGENTS.md, latest handoff, Phase 3N-M/L reports, staging runbook and the four SQL sources. No applicable nested instructions exist below the affected directories. All four SQL SHA-256 values still match the preceding report. The generated suite's shared base content and rollback tail remain unchanged.
- No `supabase`, `supabase.exe` or `supabase.cmd` command is discoverable on PATH. No repository-local Supabase binary/package or package-lock dependency exists. No installed CLI version or available CLI help could therefore be recorded. This establishes command unavailability in this shell, not an exhaustive inventory of every file on the host.
- `supabase/config.toml` and `supabase/.temp/project-ref` are absent. There are 28 local migration files, including both distinct historical files whose names contain sequence 20. No configuration/link was created.
- **Actual `supabase migration list` output: NOT RUN — CLI unavailable. Actual `supabase db push --dry-run` output: NOT RUN — CLI unavailable.** Neither output below is represented as a real CLI execution. No `npx` auto-install, installation, credential lookup or CLI connection was attempted.

## Fresh read-only remote history and exact mapping

First called `revit-staging-verify.get_project_url`: exactly `https://qnepjfcbzsycmesrcbjb.supabase.co`. Then called its `list_migrations` and SELECT-only metadata tools. Effective/session role is `supabase_read_only_user`; `transaction_read_only = on`. Configuration row count is 0, enabled row count is 0, and the Migration 27 guard is absent. Persistence remains disabled by absent configuration. The writer connection was not used in this planning phase.

Actual remote migration list:

| Remote version | Actual remote Name |
|---|---|
| `20261015163552` | `202610130023_strasinger_book_edition_support` |
| `20261015163612` | `202610150024_leaderboard_helper_privileges` |
| `20261015163653` | `202610150025_trusted_study_persistence` |
| `202610160026` | `202610160026_trusted_persistence_idempotency_hardening` |

Actual local filenames are the Version plus underscore plus Name below, followed by `.sql`:

| Migration | Local filename Version | Local filename Name | Remote comparison |
|---|---|---|---|
| 23 | `202610130023` | `strasinger_book_edition_support` | Different remote version and prefixed remote Name |
| 24 | `202610150024` | `leaderboard_helper_privileges` | Different remote version and prefixed remote Name |
| 25 | `202610150025` | `trusted_study_persistence` | Different remote version and prefixed remote Name |
| 26 | `202610160026` | `trusted_persistence_idempotency_hardening` | Same version; remote Name includes version prefix |
| 27 | `202610160027` | `trusted_cutover_and_attempt_numbering` | Absent remotely |

Registry metadata shows one stored statement per remote entry, with stored SQL lengths 10464, 380, 6261 and 70 characters respectively. Available stored text permits a future history fetch, but registry presence/text length does not prove complete historical schema equivalence. In particular, do not treat the 70-character Migration 26 history payload as a complete schema reconstruction or replay it. No historical SQL was executed.

## Verified reference semantics and expected behavior

Because no CLI is installed, these are **source-derived predictions**, not installed-version runtime evidence. Inspected official CLI reference implementation `v2.54.11`; this is a documented reference version, not a claim that it is installed or the newest release. Recheck the chosen executable/version before any future execution.

- Filename regex is `^([0-9]+)_(.*)\.sql$`. The numeric prefix becomes Version and the remaining suffix becomes Name; a 12-digit prefix is accepted as a version string by this implementation. Migration 27 therefore maps to Version `202610160027`, Name `trusted_cutover_and_attempt_numbering`. A 14-digit date formatter may not render a 12-digit identifier as a normal timestamp; that does not change the stored version string. Existing prefixed remote Names need not be normalized. [Official filename and registry implementation](https://github.com/supabase/cli/blob/v2.54.11/pkg/migration/file.go).
- History comparison uses version strings. With a valid staging connection/configuration, the current full repository would fail with `Remote migration versions not found in local migrations directory.` for `20261015163552`, `20261015163612`, `20261015163653` before applying migration SQL. `--include-all` handles older local-only migrations, not missing local counterparts for remote IDs; it does not solve this error. Migration 26's matching version would be skipped despite its Name difference. This follows the reference comparison algorithm, not an observed CLI run. [History comparison](https://github.com/supabase/cli/blob/v2.54.11/pkg/migration/apply.go), [include-all handling](https://github.com/supabase/cli/blob/v2.54.11/internal/migration/up/up.go).
- `db push --dry-run` computes and prints pending filenames and skips migration application in the inspected implementation. It can report a one-file plan after histories are aligned locally. It does not execute/validate SQL, establish migration-write permission, prove schema equivalence, demonstrate lock behavior or rollback cleanup, or prevent drift between preview and execution. No dry run occurred here. [Dry-run control flow](https://github.com/supabase/cli/blob/v2.54.11/internal/db/push/push.go).
- There is no single-file positional argument in the documented `db push`/`migration up` interface; both operate on pending files. Directly sending SQL through psql/execute_sql would not supply supported migration registration by itself. MCP `apply_migration` still cannot specify the required version. No custom registry-writing runner is recommended. [CLI command reference](https://supabase.com/docs/reference/cli/supabase-db-push).
- `migration repair` edits migration bookkeeping, not the live schema: applied inserts history, reverted deletes history. It should follow independent schema/provenance reconciliation and explicit authorization, not precede it. Here it risks falsely marking old SQL as applied or making installed migrations eligible for replay, and violates the requirement to preserve earlier history. It is unnecessary for the isolated-workspace plan and remains prohibited. [Official repair semantics](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Smallest supported future procedure — not executed or authorized by M1

1. Obtain separate authorization for a pinned Supabase CLI, an isolated local staging workspace/configuration, an approved staging-only owner connection and the bounded migration/test execution. No credential retrieval/exposure or broadening of existing read-only MCP connections is part of this plan. Independently verify the CLI's actual target; a read-only MCP URL alone cannot authenticate a different executor. Avoid the current repository's implicit connection defaults.
2. In that separate empty workspace only, use the supported `migration fetch` against verified staging to materialize the **actual remote** Version/Name/Statements history. Fetch is a remote history SELECT plus local file generation in the inspected implementation; never run its overwrite path in the repository. It produces files such as `20261015163552_202610130023_strasinger_book_edition_support.sql` and `202610160026_202610160026_trusted_persistence_idempotency_hardening.sql`. These represent existing remote records without renaming repository files or changing remote history. Add one byte-identical copy of original Migration 27. Do not copy local Migrations 1–26 into this execution workspace, invent baselines or replay fetched files. [Supported fetch implementation](https://github.com/supabase/cli/blob/v2.54.11/internal/migration/fetch/fetch.go), [fetch reference](https://supabase.com/docs/reference/cli/supabase-migration-fetch).
3. Require the workspace to contain exactly four fetched applied IDs plus the unchanged Migration 27 file. Run the selected CLI's migration list and reviewed dry run on staging; require exactly Migration 27 pending and no roles/seeds/vault payload or unrelated work. Inspect any CLI startup/database-bootstrap behavior for that executable. If extra files, an unsupported version parser or history errors appear, stop without repair. Keep original SQL hash `aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589` and both suite hashes from the preceding report.
4. Immediately before separately authorized writes, recheck exact staging URL/reference through MCP and the executor, all four registry rows/metadata, source hash, relevant function/table/column ACLs and schema, role/isolation, zero users/fixtures and disabled configuration. Apply only the pending original Migration 27 through supported file-based CLI execution. Expect the new tuple `202610160027` / `trusted_cutover_and_attempt_numbering`; keep all earlier tuples unchanged. This is normal CLI naming, not a renamed SQL file. If a literal prefixed registry Name remains required, stop and resolve that requirement instead of silently changing it.
5. On success, verify registration and installed function signatures, owners, SECURITY DEFINER/search_path, effective grants and row `id=1, enabled=false`. Snapshot this post-install baseline before tests. Migration 27's reviewed configuration/session-table hardening is expected; do not add a broader permanent legacy-writer fence. Preserve the known legacy RPC/reinforcement privileges. Do not claim application/history atomicity solely from CLI batching: the exact migration contains COMMIT before CLI's appended registry insertion. On an error, inspect both schema and registry; stop without automatic retry, repair or rollback. The selected CLI also performs migration-table setup; inspect that behavior rather than assuming the only SQL sent is the migration body. [CLI migration setup](https://github.com/supabase/cli/blob/v2.54.11/pkg/migration/history.go).
6. Execute the two original verification suites through an approved owner SQL channel with stop-on-error, READ COMMITTED, documented timeouts and verified staging marker in the same session. Each suite owns one BEGIN/ROLLBACK; temporary configuration/fences/fixtures stay inside it. Do not use a wrapper that ignores ROLLBACK, inserts COMMIT or executes the standalone rollback. Close/roll back an aborted connection. Capture actual assertions/SQLSTATEs; base expects 14 PASS rows, rollback superset 15. No results are claimed now. Scenarios 6/12 need independent connections, committed synthetic prerequisites and separate authorization; leave them NOT TESTED here.
7. Independently compare post-test state with the post-install baseline: exact earlier registry tuples/SQL metadata retained, exactly one Migration 27 registration, zero synthetic users/profile/preferences/study/reward fixtures, no temporary objects, identical post-install function definitions/table/column ACLs/effective legacy grants and `enabled=false`. Fail cleanup verification on any difference. Preserve the new migration's hardening and never activate real clients/rewards/leaderboards/Strasinger.

## Decision and boundaries

**CONDITIONAL GO for a separately authorized CLI setup/preflight; no execution GO yet.** The history mismatch does not require remote repair if a separate workspace mirrors actual remote history. Current blockers are absent CLI/configuration/approved CLI executor and unverified executable-specific behavior; a successful one-file dry run would not remove runtime or permission requirements. If that controlled workspace cannot produce exactly one pending migration without changing historical remote records, stop.

M1 performed only local reads, official-source research and staging read-only MCP calls. No SQL error occurred in M1. No software installation, CLI command, migration/test/rollback execution, registry/data/schema write, credential retrieval, configuration/environment edit, privilege change, production access, deployment or Git operation occurred. Only this report, STATUS.md and AGENT_HANDOFF.md were updated because new verified environment/history/source findings justify them. Earlier report entries remain preserved. Stop before every database write.

# Phase 3N-M writer preflight — exact version blocker — 2026-10-16

**CONDITIONAL GO: staging source/catalog preflight passed; execution stopped before every database write because the exposed migration tool cannot preserve required registry version `202610160027`.** No migration authorization failure was observed: `apply_migration` was never invoked.

## Current authorization and stop decision

The user authorized Migration 27 and both prepared single-connection synthetic suites on staging only. The user subsequently authorized temporary configuration enablement and temporary legacy-writer fencing only inside the suites' single transactions ending with ROLLBACK. No permanent fencing or activation was authorized.

When the missing version parameter was identified, the user explicitly required exact version `202610160027`, rejected an automatically generated version, and instructed stopping before writes. Alternate SQL execution, migration renaming, registry repair and alternate-executor execution were not authorized. This current result supersedes earlier writer-unavailable reports below; those reports describe other attempts.

## Fresh observed staging evidence

- `revit-staging-writer.get_project_url` succeeded and returned exactly `https://qnepjfcbzsycmesrcbjb.supabase.co`. Independent repository constant `APPROVED_STAGING_REF` in `scripts/phase3n/concurrent-persistence-test.mjs` matches. No production connection was used.
- The writer exposes callable `get_project_url`, `execute_sql`, `list_migrations` and `apply_migration` functions. The latter accepts only `name` and `query`; it exposes no `version` argument. Function availability is not proof of migration endpoint authorization.
- Registry inspection returned versions `20261015163552`, `20261015163612`, `20261015163653`, and `202610160026`, with names for Migrations 23, 24, 25 and 26 respectively. Migration 26 is applied; Migration 27 is absent.
- Metadata SELECT returned `current_user = postgres`, `session_user = postgres`, `transaction_read_only = off`, and `transaction_isolation = read committed`. Read-only privilege inspection confirmed role-switch capability for the prepared `service_role`, `authenticated` and `anon` tests and temporary-object creation capability. No SET ROLE was executed.
- `trusted_study_config` has no rows. Persistence therefore remains disabled by absence of configuration; this is not an observed `enabled = false` row. Its pre-Migration-27 RLS setting remains false and its existing grants were not changed.
- Counts are zero in `auth.users`, `profiles`, `user_preferences`, `study_sessions`, `question_attempts`, `activity_events`, `daily_activity`, `user_progress`, `user_achievements` and `question_reinforcement`.
- The documented optional `user_xp_transactions` table and `record_progression_award` routine remain absent. One initial metadata SELECT referenced that absent table and returned SQLSTATE `42P01`, `relation "public.user_xp_transactions" does not exist`. A corrected read-only SELECT used `to_regclass` and confirmed absence. This was not a migration or suite failure and made no change.
- Trusted create/commit signatures remain the expected two overloads, owned by `postgres`, SECURITY DEFINER, `search_path=pg_catalog, public`; `anon` and `authenticated` lack effective EXECUTE and `service_role` has EXECUTE. The new guard is absent because Migration 27 has not been installed.
- Known legacy `record_question_attempt`, `record_study_activity` and `check_and_unlock_achievements` remain executable by `authenticated`. `question_reinforcement` and the pre-Migration-27 session/configuration grants remain open as documented in Phase 3N-L. Both raw `leaderboard_metric_rows` overloads remain denied to browser roles and executable by `service_role`. Their definitions/grants were not modified.
- Live constraint, trigger, table/column ACL and effective-privilege inspection matched the documented preflight. Auth-user trigger writes only ordinary transactional profile/preferences/progress rows; the question-book trigger derives book metadata. No unexpected trusted overload was found.

## Exact source and transaction review

No applicable nested AGENTS.md exists beneath the affected SQL/document paths. The four requested SQL files were read without edits. Migration and rollback hashes match the preserved local-completion baseline; the base-suite hash matches its recorded authorized repair.

| Source | SHA-256 |
|---|---|
| Migration 27 | `aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589` |
| Standalone rollback | `8f9a484325953d8b881d7e341c9f05e5e9c1b693d01e5cc772aa516666636845` |
| Base verification suite | `9bab554f9b2665e82b85ca506f067a8c73800b59ec6a690d0c0463c712031e50` |
| Generated rollback verification suite | `6830902c33cef3f393321f1a4c2e94c0e114b89f6ef23e41d0b712041f50ecb8` |

Each suite has one outer BEGIN, transaction-local isolation/timeouts, all fixture/configuration/fencing changes inside that transaction, and final ROLLBACK. Neither contains an embedded COMMIT or a nontransactional operation. The generated superset was compared with the generator's expected output using a read-only local comparison and exactly matches the current base suite plus rollback body with outer BEGIN/COMMIT removed. It was not regenerated or executed. The standalone rollback was never submitted. These are source-review results, not PostgreSQL runtime assertion results.

## Exact tooling limitation and supported future method

The exposed MCP migration schema has no way to submit version `202610160027`. Official Supabase MCP implementation forwards only `name` and `query` to the Management API. Supabase's published issue documents its server-generated migration timestamp. Prefixing `name` with the desired version does not supply a registry-version parameter. No write was used to probe this behavior.

Sources: [official MCP implementation](https://github.com/supabase/mcp/blob/main/packages/mcp-server-supabase/src/platform/api-platform.ts), [version-parameter limitation](https://github.com/supabase/mcp/issues/241).

The supported file-based alternative is Supabase CLI `db push` using the unchanged original `202610160027_trusted_cutover_and_attempt_numbering.sql` in an isolated staging-linked migration workspace. Its filename parser uses `202610160027` as Version and `trusted_cutover_and_attempt_numbering` as Name, preserving the complete original filename identity and reviewed SQL. An explicitly authorized executor would first verify the staging link, original hash, installed CLI behavior and a dry-run plan containing only Migration 27. The current repository's older local versions differ from the staging registry for Migrations 23–25, so blindly running `db push` here is not an approved or established safe plan. A staging-only local history representation must first be reviewed; no remote history repair is authorized. No CLI setup, link, dry run, fetch or execution occurred.

If "full migration name" instead requires the literal registry Name to include the version prefix (`202610160027_trusted_cutover_and_attempt_numbering`), standard CLI filename parsing does not produce that literal Name from the current filename. The official migration library exposes explicit Version/Name fields, but a separate executor using it would require its own review and explicit authorization; none was prepared or run. No currently exposed and authorized method has been established that meets that additional literal-name interpretation. Do not rename files or silently substitute naming semantics.

Sources: [official CLI db push reference](https://supabase.com/docs/reference/cli/supabase-db-push), [official migration filename/version implementation](https://github.com/supabase/cli/blob/pkg/v1.2.3/pkg/migration/file.go). This identifies a supported candidate, not permission to execute an alternate path.

## Actual execution status and remaining limits

| Operation | Observed result |
|---|---|
| Apply Migration 27 / record version `202610160027` | NOT ATTEMPTED; exact-version capability missing |
| Post-install signatures/owners/security/grants checks | NOT APPLICABLE; only pre-install catalog inspected |
| Base verification suite | NOT TESTED; zero runtime PASS assertions |
| Generated rollback verification suite / scenario 14 | NOT TESTED; zero runtime PASS assertions |
| Engine overlap / disable race, scenarios 6 and 12 | NOT TESTED; separate prerequisites and authorization remain required |
| Fixtures / cleanup | No fixtures or temporary fences created; no cleanup writes required or performed |
| Final state from this operation | No database writes, migration/registry/configuration/ACL changes or activation occurred |

No migration permission error or suite SQLSTATE exists because those operations were not invoked. The only SQLSTATE observed was the read-only metadata error `42P01` described above. No fresh post-install or post-test cleanup claim is made. Production, existing read-only connections, environment, application/SQL/content sources and deployment state remain untouched by this operation. No Git operation or local regression suite ran. Only the four requested local status/report/handoff documents were updated, preserving earlier entries. Stop; no automatic continuation or alternate execution.

## Earlier attempts — retained historical reports

# Phase 3N-M resumed execution — 2026-10-16

**CONDITIONAL GO: resumed execution blocked because `revit-staging-writer` is unavailable in this chat.** Existing staging execution authorization remains valid; no further authorization was requested.

- Read current project instructions, latest handoff/report, runbook, Migration 27, standalone rollback and prepared verification SQL. No applicable nested instructions were found under the affected SQL/report directories. No implementation or SQL file was changed.
- Fresh tool discovery exposes only `revit-staging-readonly` and `revit-staging-verify`; no writer tools or `apply_migration` are available. Exact MCP lookup result: `resources/list failed: unknown MCP server 'revit-staging-writer'`. This establishes current-session unavailability, not the state of a connection inspected elsewhere.
- Could not call the writer's required `get_project_url` or verify its current registry/permissions. No Supabase database request occurred in this resumed attempt. The previously reported target URL, Migration 26 applied/Migration 27 absent, and read-only-role observations below are historical; they were not freshly reconfirmed through a writer.
- Migration 27, base suite, rollback verification and engine scenarios 6/12 remain NOT ATTEMPTED / NOT TESTED in this attempt. Zero runtime assertions, SQLSTATEs, fixtures or cleanup operations exist to report. The MCP lookup error is not a PostgreSQL authorization error or an attempted migration result.
- Missing capability: expose the already authorized staging-specific writer in this chat, including its own `get_project_url`, migration tool and safe owner execution channel. Do not broaden read-only connections, bypass permissions, use a CLI substitute or invoke Antigravity automatically. Reconfirm exact staging identity, registry and source/schema prerequisites before any eventual write. No production access or activation permitted.
- Updated the four requested local documents and saved `resume-writer-availability.json`; previous text preserved. No database, MCP configuration, environment, role/grant, application, SQL, content, deployment or Git change occurred. No standalone rollback or local regression suite was run. Stop awaiting writer availability; no automatic follow-on operation.

## Earlier attempt — retained historical report

# Phase 3N-M: staging execution blocked at writable-access preflight

Date: 2026-10-16. **CONDITIONAL GO: execution blocked by missing staging-scoped writable MCP access.** No material migration defect was demonstrated in this attempt; Migration 27 and all PostgreSQL verification remain unexecuted.

## Authorization and stop condition

The user authorized Migration 27 installation and the two prepared single-connection synthetic verification suites on `revit-staging`, reference `qnepjfcbzsycmesrcbjb`, only. The request explicitly required stopping before database writes if no separately authorized staging-scoped writable connection already existed. It prohibited changing MCP configuration, broadening existing access, permission bypass, production access and automatic Antigravity handoff.

Tool discovery found only `revit-staging-readonly` and `revit-staging-verify` Supabase connections. Both are configured read-only as stated in the authorization. No separate writable Supabase connection or `apply_migration` capability is exposed. The presence of generic `execute_sql` does not establish write authority, and no write probe or transaction-mode change was attempted.

## Fresh read-only observations

Using `revit-staging-verify`:

1. `get_project_url` returned exactly `https://qnepjfcbzsycmesrcbjb.supabase.co`.
2. A metadata-only SELECT returned `current_user = supabase_read_only_user`, `session_user = supabase_read_only_user`, and `transaction_read_only = on`.
3. `list_migrations` returned:

| Registry version | Migration name |
|---|---|
| `20261015163552` | `202610130023_strasinger_book_edition_support` |
| `20261015163612` | `202610150024_leaderboard_helper_privileges` |
| `20261015163653` | `202610150025_trusted_study_persistence` |
| `202610160026` | `202610160026_trusted_persistence_idempotency_hardening` |

Migration 26 is applied. Migration 27 is absent. Target identity was verified before issuing the metadata SELECT or migration-registry read. Production `lznsdxfvxeckflxsohig` was never connected, queried or modified.

## Execution and verification status

| Operation | Actual result |
|---|---|
| Migration 27 application / registry insertion | NOT ATTEMPTED; writable-access prerequisite failed |
| Prepared base verification suite | NOT RUN; zero PostgreSQL assertions executed |
| Prepared transactional rollback verification superset | NOT RUN; zero PostgreSQL assertions executed |
| Standalone rollback | NOT RUN |
| Activation-guard runtime verification | NOT RUN |
| Post-install function/owner/search-path/ACL verification | NOT APPLICABLE; nothing installed |
| New fixture creation / cleanup | No fixtures created; no cleanup writes needed or performed |
| Engine scenarios 6 and 12 | NOT RUN; require distinct future authorization and independent connections/committed synthetic fixtures |

No SQLSTATE from a migration or verification failure exists: those operations were never submitted. The successful metadata SELECT is not a write-permission probe or a synthetic verification result.

Current schema, effective privileges, configuration contents and aggregate fixture counts were not re-audited after the access blocker. The preceding read-only preflight is historical context, not fresh post-execution evidence. This attempt made no configuration or privilege changes and performed no activation. Exact execution-file review and later execution prerequisites were not repeated after Step 1 stopped the database phase. Existing source/proposals, prepared suites and runbook remain untouched.

## Missing capability and next decision

User authorization for the bounded staging work is already present. The missing capability is a separately configured, staging-scoped writable MCP connection whose own project-URL tool confirms exactly `qnepjfcbzsycmesrcbjb`, with migration-application capability and a safe owner execution channel for the prepared transaction/role-switching verification suites. A service-role data API alone is not equivalent to the required `postgres` owner connection.

Do not change either existing read-only connection or attempt to disable read-only transactions. The user must decide whether to provide a separate approved staging writer or choose another executor. No credentials were requested, configured or exposed. Antigravity was not invoked or messaged. On a future authorized continuation, repeat immediate target, registry and drift checks before any database write; do not assume this snapshot remains current.

## Local documentation changes

- Created `docs/phase3n/phase3n-m/REPORT.md` and `documentation-baseline.json`.
- Prepended this blocked result to `docs/phase3n/REPORT.md`, `STATUS.md`, and `AGENT_HANDOFF.md`, preserving historical content.
- Documentation backups: `scratch/phase3n-m/backups/`.

No application, migration, rollback, verification SQL, question content, assets or environment files changed. No build/test/security suite was run for this documentation-only result. No database writes, temporary rows, role/configuration changes, deployment, Git operations or production access occurred.

**Stop: await the user's decision about the missing staging-only writable connection. No automatic migration, Antigravity handoff or additional database operation.**
