# Phase 3N-N5 — discrepancy investigation and local preparation

2026-10-16, Asia/Shanghai. **READY FOR READ-ONLY RECHECK.** This means the new diagnostic sources are ready for separate review/authorization, not that concurrency writes are authorized or safe to begin. Scenarios 6 and 12 remain **NOT TESTED**. No staging/production connection, SQL execution, original-launcher run, database mutation or application-gate change occurred.

## Evidence and instructions

Read root/applicable AGENTS.md instructions, handoff, N report/execution pack, staging runbook, original preflight SQL/launcher, historical migrations, staging bootstrap and the captured log. No nested instructions apply to these paths. Used investigate-first and migration guidance for local source/preservation review. No Git commands, installation or deployment.

Primary capture remains [N3 log](C:/Users/mypc/Desktop/Projects/RevIT/scratch/phase3n-n2-evidence/read-only-preflight-20261016T090846965Z-314d197d.log:1), SHA-256 `749f4276cf36075ae83b49a6ff5ce01e43ca3a8fe456ad58a4c4f27b368410bc`; capture-time 2026-10-16 17:08:52 Asia/Shanghai. User-run evidence, locally reviewed; no claim that the database still has that state. Its installed bodies and catalog rows are evidence; old reports or expected script output are not new runtime assertions.

## 1. Auth-trigger discrepancy: implementation source resolved

| Source stage | Actual definition/layout |
|---|---|
| [Migration 1](C:/Users/mypc/Desktop/Projects/RevIT/supabase/migrations/202608200001_revit_cloud_foundation.sql:90) | Creates handle_new_user for profile/preferences plus on_auth_user_created. |
| [Migration 5](C:/Users/mypc/Desktop/Projects/RevIT/supabase/migrations/202608300005_level_achievements_v1.sql:44) | Introduces progress seeding through a separate handle_new_user_progress and on_auth_user_progress_created. It does not insert progress inside handle_new_user. |
| [Migration 7](C:/Users/mypc/Desktop/Projects/RevIT/supabase/migrations/202609030007_legal_consent_versioning.sql:24) | Intentionally replaces handle_new_user to add legal-consent fields; profile/preferences remain its two inserts. It does not drop the separate progress trigger. No later historical migration in the current repository redefines this auth function or removes that separate trigger. |
| [Staging bootstrap](C:/Users/mypc/Desktop/Projects/RevIT/supabase/tests/staging_baseline_init.sql:248) | Consolidates profile/preferences/progress creation into handle_new_user. Lines 321–323 create only the profile-protection, auth-user-created and attempt-book triggers. It never creates the separate progress helper/trigger. |
| [Captured installed layout](C:/Users/mypc/Desktop/Projects/RevIT/scratch/phase3n-n2-evidence/read-only-preflight-20261016T090846965Z-314d197d.log:102) | Auth body matches the bootstrap exactly after psql padding/line-ending/trailing-whitespace normalization; all three trigger names and operations match the bootstrap inventory. The inline progress insert is at log line 132. |

Bootstrap SHA-256 is `b2bd34f792f148fac1a7c8744f36e9b8a9c5c09f9743dc5663cf9091a494f99f`, matching the pre-existing J/K/local-completion baseline records. This resolves N4's repository-reference gap: comparing only migration-directory definitions omitted the staging bootstrap. The captured layout is internally consistent for the three seed operations, rather than evidence of a missing progress seed. Exact command, actor, time and whether any trigger was ever dropped cannot be reconstructed from this capture; no such history is fabricated. An identical implementation could have been installed by another command. No historical migration, bootstrap or live trigger was altered.

For a fresh synthetic auth row, the captured auth function **attempts** one profiles row keyed by owner id, one preferences row keyed by user_id, and one progress row keyed by user_id. Existing ON CONFLICT clauses do not prove insertion success, so the pack now explicitly checks one of each before setup COMMIT. Profile protection permits owner/service administrator insertion; the attempt-book trigger does not rewrite the synthetic Harr identifiers. Expected progress XP is its schema default zero. The auth trigger does not call reward/activity/achievement/reinforcement/completion routines. These are source-derived predictions, not an executed fixture assertion. Fresh trigger owners/enabled flags and downstream managed-auth triggers are included in the new diagnostic.

## 2. Reachable dependency graph and cleanup

The N3 query returned **24 FK rows**. Local graph traversal yields **23 incoming reachable edges / 24 known relations** from the three requested roots. The remaining row is user_achievements -> achievements: deleting the child does not delete its achievement parent. Known graph:

| Parent | Referencing children in capture | Delete effect |
|---|---|---|
| auth.users | public.activity_events, ai_chats, daily_activity, exam_schedule, grades, profiles, question_attempts, question_reinforcement, study_sessions, user_achievements, user_preferences, user_progress | CASCADE |
| auth.users | auth.identities, mfa_factors, mfa_recovery_code_sets, oauth_authorizations, oauth_consents, one_time_tokens, sessions, webauthn_challenges, webauthn_credentials | CASCADE |
| auth.users | auth.scim_users | SET NULL |
| public.ai_chats | public.ai_messages | CASCADE |
| public.study_sessions / public.question_attempts | No incoming edge shown by the captured query | Not proof of absence across all schemas |

These are the exact captured edges, [log line 73 onward](C:/Users/mypc/Desktop/Projects/RevIT/scratch/phase3n-n2-evidence/read-only-preflight-20261016T090846965Z-314d197d.log:73). The N3 query included all public FKs and direct auth.users dependents; it did **not** recursively enumerate managed-auth grandchildren or cross-schema children of the other roots. It also omitted non-internal triggers on auth child tables. Full current graph completeness is therefore unresolved, not inferred from the 24 rows. The local machine-readable map is `scratch/phase3n-n5-evidence/dependency-map.json`, explicitly marked incomplete.

Prepared [READ_ONLY_RECHECK.sql](C:/Users/mypc/Desktop/Projects/RevIT/docs/phase3n/phase3n-n5/READ_ONLY_RECHECK.sql): recursive incoming-FK traversal with UNION cycle termination, all constraint actions/validation/deferral flags, reachable relation kinds, count-only queries, reachable non-internal trigger owners/enabled flags/source and DDL event-trigger inventory. It rejects foreign-table/non-local inheritance paths before generated counts. It requires the existing postgres owner/bypass boundary and does not query auth token/password rows. Generated commands are only schema/identifier-quoted SELECT COUNT; all run inside BEGIN READ ONLY with bounded timeouts and ROLLBACK. Missing privileges/objects or an unexpected closure is a stop, never a grant/schema workaround. Nothing in this file ran.

### Concrete cleanup/snapshot corrections in the local execution pack

- Added a recursive dependency-count helper and an exact 24-relation allowlist from the capture. **That allowlist is provisional**: a newly discovered grandchild stops the pack until its source/ownership implications are reviewed and the manifest/snapshots are deliberately updated. No automatic expansion of cleanup follows discovery.
- Require every accepted reachable table empty before synthetic setup. Additional managed-auth/public relations are protected through zero-count baselines, not credential-containing row dumps. SCIM must remain empty; no SCIM DELETE/UPDATE is prepared. Pre-existing SCIM/orphan data fails the disposable-state prerequisite rather than being removed or nulled.
- Snapshot now includes dependency counts, recursive FK metadata, managed-child trigger definitions/owners/enabled flags and event-trigger metadata. Unexpected source/event behavior must be reviewed before even temporary helper creation. Auth snapshot data is restricted to the single manifest owner and non-secret columns; password/token fields and managed-auth records are not serialized.
- Added deterministic progress id `3e9a0000-3a2e-4e60-8000-000000004001`. The trigger's random default is replaced within the uncommitted synthetic setup, then checked; every **committed** seed has a manifest key. Profile/preferences use the owner UUID. This closes the previously unlisted generated-progress-id gap.
- Moved seed snapshot/export and exact counts before setup COMMIT. An export is tentative until acknowledged COMMIT or later read-only reconciliation. Refuse pre-existing baseline/seed/restore export files; preserve and hash them rather than overwriting. Lost COMMIT acknowledgement requires inspection, never repeated INSERTs or a fabricated seed.
- Removed cleanup DELETEs for events/daily activity/achievements/reinforcement/optional XP: this run manifests no such rows. A nonzero untracked relation now stops cleanup, preserving evidence with configuration disabled. The only DELETE targets are manifested attempts, sessions, progress, preference, profile and synthetic auth owner, with ownership/id checks.
- Before deleting auth parent, require **all accepted children empty** after explicit manifested-child deletion. Existing FK CASCADE and SCIM SET NULL then have zero rows to affect; they are not used as cleanup mechanisms. No TRUNCATE, DELETE CASCADE, broad table cleanup or unrelated-row modification was added. Unknown dependencies and unexpected rows remain blockers.
- Final baseline equality covers recorded data, dependency counts and metadata/privileges. Exact config false/original updated_at and semantic direct ACL grantor/grant-option restoration remain atomic with cleanup; unsupported NULL ACLs, column ACLs, grantors or dependent grants fail before fencing. No grants are changed in N5.
- Compatibility review removed the unsupported `\quit 3` form from newly prepared guards. Failure branches roll back when applicable, then issue a constant read-only error under ON_ERROR_STOP. In batch use this produces an error outcome instead of relying on an ignored quit argument; no actual SQLSTATE/exit result was exercised. [psql command/error behavior](https://www.postgresql.org/docs/17/app-psql.html).

No complete new baseline or cleanup success exists yet. A partial setup that aborts before COMMIT is rolled back; an ambiguous/lost connection after possible COMMIT uses durable exports plus exact manifest reconciliation. Failure is not converted to a successful test by cleanup.

## 3. Launcher discrepancy: proven observations and bounded inference

**Confirmed:** original launcher source assigns literal PGOPTIONS/PGAPPNAME to ProcessStartInfo before Start; SQL contains no command that sets the default read-only mode off or sets application_name to Supavisor. The original SQL hash in log line 5 matches the unchanged file. Actual line 21 shows transaction_read_only=on, default_read_only=off and application_name=Supavisor. The header's claim of a forced server default is therefore unsupported; it records intent, not server acknowledgement.

A harmless local child-PowerShell probe using the launcher's environment-handling pattern received both non-secret literal settings exactly (exit 0; empty STDERR). It did not invoke the launcher, psql or any SQL, and read no real connection variable/credential. This establishes the OS propagation mechanism works locally; it does not prove what the past psql process sent or what a deployed pooler forwarded. A preliminary probe that removed the **entire** child environment exited 1; that differs from the launcher and is not evidence about its behavior. The matching-pattern probe retained ordinary environment entries while removing PG entries/private URI from the child and assigning only the two harmless test settings.

**Leading inference:** pooler startup filtering/overriding explains both observed settings. Public upstream Supavisor code explicitly uses application_name Supavisor for pooled server connections and constructs a restricted upstream startup-options map. This provides a credible mechanism, not proof of the unknown deployed build or past packet handling. [Upstream database handler](https://github.com/supabase/supavisor/blob/main/lib/supavisor/db_handler.ex), [startup parameter structure](https://github.com/supabase/supavisor/blob/main/lib/supavisor/client_handler/startup_params.ex).

**Not established:** whether the captured deployment ignored arbitrary options, reset them after startup, or the executed process differed from current source. No deployed pooler version, sanitized child-request attestation, startup packet trace or server-setting source was captured. A new pg_settings source/reset_val observation can narrow the cause but cannot reconstruct the old packet. Provider-version/forwarding evidence may still be necessary; never request credentials or log authentication packets.

Original launcher and all its settings remain byte-identical and were not rerun. Prepared only [LAUNCHER_HEADER_CORRECTION.patch](C:/Users/mypc/Desktop/Projects/RevIT/docs/phase3n/phase3n-n5/LAUNCHER_HEADER_CORRECTION.patch), **unapplied**: it changes the false assurance to "requested; inspect actual settings". No connection-setting assignment changes. The in-memory candidate parses with zero PowerShell errors and all environment-assignment lines remain identical. No runtime fix or cause is claimed from that patch.

Protection distinctions:

1. Completed diagnostic: explicit BEGIN READ ONLY/on and observed ROLLBACK protected its transaction, regardless of default mode. Its backend ssl=false row does not describe the client-to-pooler TLS leg.
2. Default mode: actual capture says off; the launcher cannot certify on. Read-only work must remain in explicit read-only transactions with SQL-level timeouts, not rely on PGOPTIONS alone.
3. Future separately authorized coordinator/writers: different private sessions; verify current owner/mode before temporary setup, fail if not writable, use explicit READ COMMITTED READ WRITE transactions, bounded SQL settings and actual service-role worker switching. Do not repurpose the read-only launcher, force a role/default change to bypass a failure or infer write authorization from a writable mode. The local pack now spells out that check and explicit transaction mode.

## 4. Concurrency-pack review and remaining evidence

| Concern | Local disposition / runtime limit |
|---|---|
| Distinguishable six sessions | Prepared the read-only handshake below: five worker/coordinator processes plus M, SQL-local labels and actual stable PIDs across two transactions. No six-session capability has been demonstrated yet. |
| Role boundary | B/C handshake actually performs SET LOCAL ROLE service_role then records/asserts current_user, owner session_user, read-only mode and READ COMMITTED. Future writer calls retain their actual role/JWT setup; payload helpers run before role switching. No temporary schema/function grants are added. |
| Lock identity | Future S6 still requires B->A matching question bigint advisory key and C->B matching owner key, granted/ungranted pg_locks plus pg_blocking_pids, not launch timing. Future S12 retains question/config barriers and both transactionid/row wait directions. New readiness handshake checks real granted AccessShareLock visibility only, never claims it tested either race. |
| Numbering/retries | Prepared assertions require immutable historical 1/7 and future engine-observed B/C allocation 8/9 in enforced commit order, full-row exact retries and captured 23505 conflicts. None of those runtime outcomes was observed in N5. |
| Two disable directions | Forward holds B until monitor sees D waiting even after RPC returns; reverse captures B blocked before acquiring owner/advisory locks, then actual PT503/no insert. Both NOT TESTED. |
| Collisions/ownership | Empty accepted closure, fixed owner/session/request/attempt/seed keys and strict manifest checks. Hash identities must be read from the actual engine; no guessed PID or elapsed overlap is accepted. |
| Restoration | Original durable baseline and pre-generated ACL/config restore remain required; no permission repair/NULL-ACL reconstruction. Restoration and child cleanup commit atomically only after full equality checks; independent postcheck remains required. |
| Abort | Any unexpected success/error, timeout, visibility loss, source drift or disconnect halts all stage progression. Operator cancels/rolls back/closes identified test windows, preserves output and drains before bounded disable. No unrelated session termination, automatic retry, COMMIT after failed stage or privilege restoration while config may be true. Unknown children leave cleanup unresolved and disabled. |

### Prepared six-session read-only handshake — not executed or currently authorized

- [SESSION_READ_ONLY_RECHECK.psql](C:/Users/mypc/Desktop/Projects/RevIT/docs/phase3n/phase3n-n5/SESSION_READ_ONLY_RECHECK.psql): independent O/A/B/C/D psql connections, n5_label explicitly supplied as revit-n5-O/A/B/C/D. Each uses two bounded BEGIN READ ONLY transactions, SQL-local application label, captured initial PID and a fail-closed same-PID check across ROLLBACK. B/C switch existing SQL role locally and assert it. SELECT COUNT(study_sessions) holds a harmless AccessShareLock during each manual barrier. No configuration-row, fixture or advisory-lock operation.
- [MONITOR_READ_ONLY_RECHECK.psql](C:/Users/mypc/Desktop/Projects/RevIT/docs/phase3n/phase3n-n5/MONITOR_READ_ONLY_RECHECK.psql): sixth owner connection M. Operator supplies the five **observed** PIDs, never placeholders. Include twice in the same M process at the two barriers; it verifies its own PID stays stable, exactly six distinct matching PIDs/labels/databases/logins, transaction visibility, granted study_sessions read locks and pg_blocking_pids output. No unrelated query text is collected. Worker logs must separately prove current SQL roles.
- Hold barriers no longer than the 120s idle-transaction limit; a timeout/disconnect/mismatch makes the readiness check fail. Roll back/close all sessions. This is not scenario 6/12, does not generate contention, and establishes no race/attempt numbering claim. If a label is rewritten or the Session Pooler does not preserve PIDs, stop rather than change connection mode or permissions automatically.

No command to execute these sources is authorized by N5. Do not replace the immutable N3 SQL beneath its old launcher or run shared concurrency setup. Each new diagnostic source requires separate review/authorization and the same private staging identity proof before a connection. No credential is needed in chat.

## 5. Actual local validation, changes and limits

Ran `python scratch/phase3n-n5-evidence/check_preparation.py`: **35 local source/evidence checks PASS**. It uses Python standard-library file/text/hash analysis only, with no subprocess/network/database code. Checks cover bootstrap/auth mapping, captured trusted bodies, FK graph, negative unseen-grandchild/nonempty-SCIM models, manifested cleanup targets, seed export ordering, progress key, read-only diagnostic statement inventory, psql boolean quoting and immutable original hashes. These are not SQL assertions, SQLSTATEs, engine locks or runtime trigger tests. Result/map are in ignored `scratch/phase3n-n5-evidence/local-review.json` and `dependency-map.json`.

Original launcher PowerShell AST: zero parse errors, not invoked. Header-only patch candidate AST: zero errors; connection-setting assignment lines identical, candidate not written over launcher or executed. Harmless child probe result/failed preliminary variant are described above. No application/build/browser/security suite ran.

Prepared diagnostic source SHA-256:

- READ_ONLY_RECHECK.sql: `66ddc6c5bf31e079edd38e5818baafbfbb110b6e250acd18a15441c66864ee91`.
- SESSION_READ_ONLY_RECHECK.psql: `5efdf8ca097fc035bc90cb4fa64a907971e2f851f9afc3b08267808f4ff515f1`.
- MONITOR_READ_ONLY_RECHECK.psql: `fdd363d0810d35227c2621bcac8689ecb630502bdbfc11ed868c049a00f51100`.

Changed local execution-pack design, added this report/three diagnostic sources/unapplied logging patch and ignored local-check artifacts, and updated N report, aggregate Phase 3N report, STATUS.md and AGENT_HANDOFF.md. Historical SQL/bootstrap, Migration 27, original preflight SQL/launcher/log and application runtime gate remain unchanged; checks pin their original hashes where recorded. All database state remained untouched.

Remaining recheck requirements: full recursive graph/counts and trigger/event ownership/source, effective-setting origins and any provider evidence needed for exact startup cause, actual six-session/PID/role/monitor results, fresh staging/config/registry/privilege consistency and stopped-ingress/job attestation before any later write authorization. New graph discoveries require explicit source/manifest review; there is no automatic acceptance of them.

**Stop at READY FOR READ-ONLY RECHECK. No concurrency-write authorization follows.** Rewards/completion, leaderboard cutover, permanent legacy-writer revocation, real-user trusted persistence, Strasinger synchronization and production remain pending/prohibited. Scenarios 6/12 remain NOT TESTED.
