# Phase 3N-N6 — local diagnostic audit and operator checklist

## N7 captured Catalog review — 2026-10-16

**NO-GO for starting the six-session read-only check from this capture.** The requested exact file exists; no fallback was needed. Reviewed [the user-run Catalog log](C:/Users/mypc/Desktop/Projects/RevIT/scratch/phase3n-n2-evidence/n6-readonly-Catalog-20261016T101526228Z-268f5f2b.log) locally against the N6 checklist/driver/guard/supplement and execution pack. This is captured operator evidence, not an independent Codex database inspection or proof that staging remains unchanged afterward. The earlier desktop missing-variable result below remains historical to that execution process; this log establishes that the user-run Catalog actually completed.

Evidence: **621,334 bytes, 2,634 lines**, SHA-256 `853010a06c421d489a34146a2131f22addcff601552d6ce55b0b8f5b14f8f230`. All line references below refer to that immutable log. Header L5 records driver hash `ebf7ee08bc11c685a7601d03f6d6f6ed843b34b5e255a647084d71523f4c43fd`, matching the reviewed driver. No source, launcher or evidence was changed. No connection, SQL rerun, O/A/B/C/D/M session, database write, production access, deployment or Git operation occurred during this review.

### Gate decisions

| Gate | Result | Specific captured evidence and limit |
|---|---|---|
| 1. Four read-only transaction completions/markers | **PASS** | Four BEGIN tags: L9/L23/L660/L1308. Four actual ROLLBACK tags: L19/L655/L1305/L2630. Corresponding completion markers: L20/L656/L1306/L2631; final driver marker L2632. These correspond to the four reviewed BEGIN READ ONLY sources. Explicit mode is observed in the session rows below; the supplement does not independently print another mode row. |
| 2. Staging identity and session properties | **PASS, operator-attested identity consistency** | L2–3 record approved project qnepjfcbzsycmesrcbjb, dashboard Session Pooler host aws-0-ap-southeast-2.pooler.supabase.com, port5432 and postgres.qnepjfcbzsycmesrcbjb, privately compared before connection. L16/L31/L669 show database postgres, PostgreSQL17.11/version_num170011, postgres/postgres, explicit read-only on and READ COMMITTED. L31 shows replication origin/non-recovery. Backend90438 appears across the guard/N5/N3 transactions and at L1302. No SQL marker or backend address is treated as project proof; the dashboard was not independently reopened during this local review. Backend ssl=false at L674 does not establish client-to-pooler TLS. |
| 3. Exact Migration27 and previous registry | **PASS** | L680–685 contain the expected five tuples; L689 gives version_27_entries=1 and exact_27_entries=1. L684 is 202610160027 / trusted_cutover_and_attempt_numbering. Earlier four version/name tuples match the historical comparison table below, also repeated at L639–644. No registry-body or migration-execution provenance is inferred from these name/version rows. |
| 4. One disabled configuration row | **PASS** | L648–649 and L695–696: exactly one row, id1, enabled=f, updated_at2026-10-16 06:16:39.2326+00, matching the earlier capture. |
| 5. Ten empty required tables; optional XP | **PASS** | L701–711: all ten named counts0. L715 is NULL for optional public.user_xp_transactions. The optional-count section reaches L2629 and rolls back at L2630; no scan is emitted for the absent table. Additionally all28 recursively reachable relations have count0 at L161–296. |
| 6. Complete reviewed dependency/trigger coverage | **FAIL — pack coverage gate** | L90–123 contain33 FK rows, including28 incoming-delete-path edges and5 outgoing-parent edges; L128–156 list28 reachable ordinary local relations. The pack allows only24. Four additional managed-auth descendants and extra edges are detailed below. Captured user triggers remain the known three at L302/L337/L362, but the larger closure, internal-trigger/dependency inventory and six event triggers have not been accepted into the pack's baseline/restoration coverage. Empty counts do not waive this gate. |
| 7. Full installed-source/security/schema baseline match | **NOT ESTABLISHED in full; known subsets PASS** | Three trusted bodies at L838/L880/L980 exactly match reviewed Migration27 after psql padding/line-ending/trailing-whitespace normalization. Their owners/security/settings/direct and effective execution rights match the earlier capture. L1316–1319 additionally show three postgres-owned plpgsql SECURITY DEFINER routines, leakproof=f, volatile=v, parallel=u and expected search_path/signatures/results. Previously captured trigger, routine/ACL, target table/column schema, study constraint/index, effective table-right and public-policy sections (L747–1266) match the earlier N3 log section-for-section after trailing-whitespace normalization. Supplemental51 constraints,41 indexes,15 policies,9 schema/table-right rows and387 individual column-right rows are captured at L2105–2627; a fully approved baseline for expanded managed dependencies/event effects is still missing. Do not turn these partial matches into a blanket full-schema/cleanup approval. |
| 8. No prepared transactions | **PASS** | L651–653 and L1296–1298 show0 rows. |
| 9. Actual process completion and no SQL errors | **PASS** | L6: psql_exit_code=0, wrapper_failed=False, timeout=False. Four actual ROLLBACK tags and all markers as gate1; N6_CATALOG_RECHECK_COMPLETE at L2632. L2634 is STDERR with no subsequent content. No ERROR:/FATAL:/PANIC: or redaction markers occur in the captured log. Routine-source text is not counted as executed SQL or an error. Exit0 is not used to override gates6/7/10. |
| 10. Ingress/background, role-switch and monitor readiness | **NOT ESTABLISHED** | L47 and L1280 report existing SET-service-role/monitoring capability; L61–79 show membership metadata. No actual service-role switch or six-session read-lock/PID evidence exists here. L1285–1292 show8 activity rows, including pg_net, pg_cron, PostgREST, Storage and the Catalog backend. Other visible rows have no open transaction then, but this single snapshot does not prove stopped ingress, disabled schedules/queues or future writer absence. No operational quiescence attestation is included. |

### Concrete dependency blocker

The execution pack explicitly rejects a closure different from its24-relation allowlist. This capture contains **all24 known relations plus four more**, with no known relation missing:

| Additional relation | Captured incoming FK | Readiness/count evidence |
|---|---|---|
| auth.mfa_amr_claims | L94: session_id to auth.sessions, ON DELETE CASCADE | L132 ordinary local/countable; L166 count0 |
| auth.mfa_challenges | L95: factor_id to auth.mfa_factors, ON DELETE CASCADE | L133 ordinary local/countable; L171 count0 |
| auth.mfa_recovery_codes | L99: recovery_code_set_id to auth.mfa_recovery_code_sets, ON DELETE CASCADE | L136 ordinary local/countable; L186 count0 |
| auth.refresh_tokens | L105: session_id to auth.sessions, ON DELETE CASCADE | L140 ordinary local/countable; L206 count0 |

L97 also captures the existing auth.mfa_recovery_code_sets to auth.mfa_factors edge omitted by the earlier direct-root query. L100/L102/L106/L108 add outgoing references to auth.oauth_clients/auth.sso_providers. These parents are not incoming cleanup descendants. L107 retains SCIM's ON DELETE SET NULL edge. All33 FKs are validated/nondeferrable/not initially deferred in this capture. These are **newly observed coverage**, not proof the database changed or that Migration27 created them.

The expanded supplement records **125 triggers** at L1324–1529:122 internal referential-integrity triggers and the same three user triggers (L1368/L1453/L1504). L1533–2103 records570 catalog dependency rows across pg_type/pg_class/pg_attrdef/pg_constraint/pg_trigger/pg_policy. This is relation-scoped catalog inventory, not proof of every dynamic/application dependency or absence of source-defined side effects.

Six enabled supabase_admin-owned event triggers and their sources appear at L389/L444/L479/L523/L571/L601, ending L629: issue_graphql_placeholder, issue_pg_cron_access, issue_pg_graphql_access, issue_pg_net_access, pgrst_ddl_watch and pgrst_drop_watch. In particular the watcher source contains schema-reload NOTIFY behavior (L596/L624), with temporary-object conditions at L594/L622. These were catalog reads only; no event-trigger execution is claimed. Their exact relevance to future helper creation/drop and restoration still needs explicit source/baseline review. Do not approve them merely because their owner is managed or the Catalog exited0.

### Preservation and remaining limits

- The known pre-fence permissions are preserved in the captured sections. Trusted guard execution remains denied to anon/authenticated/service_role; the two trusted RPCs remain denied to browsers and executable by service_role (L838/L880/L980). Legacy RPC execution and broad reinforcement grants remain as previously recorded. L1211–1213 retain reinforcement rights; L1223–1225 retain service SELECT-only configuration access; L1226–1228 retain browser study-session SELECT+MAINTAIN without DML. No permanent fence or activation is inferred.
- L36/L38/L42 capture application_name=Supavisor, default_transaction_read_only=off and explicit transaction_read_only=on; setting origins/reset values are visible at L34–43. They narrow current behavior but do not resolve deployed pooler startup-forwarding/reset provenance. Requested startup settings are not server acknowledgements. No override or permission workaround was attempted.
- Actual six-session role/PID/isolation/read-lock monitoring remains NOT ESTABLISHED. One backend observed across several transactions does not establish six independent stable backends or either contention scenario.
- No final post-six-session Catalog exists from this workflow; those sessions have not started. The log confirms clean/disabled state at its recorded time only. Scenarios6/12 remain **NOT TESTED**; no race assertion, SQLSTATE outcome or committed-fixture cleanup success is claimed.

**Stop before O/A/B/C/D/M.** Required resolution is local review and deliberate reconciliation of the expanded dependency/event-trigger/baseline coverage, plus current ingress/background-writer evidence. This task does not authorize changing the pack/allowlist, schema, grants, evidence or database, nor rerunning anything. Updated only this existing report, aggregate Phase3N report, STATUS and handoff once. Rewards/completion, leaderboard cutover, permanent legacy-writer revocation, real-user activation and Strasinger synchronization remain pending. Earlier authorization/preparation sections below are retained as historical context; this NO-GO governs progression from the reviewed capture.

## Authorized execution checkpoint — 2026-10-16

**CONDITIONAL GO — execution blocked at prerequisite 1; stopped before connecting.** The user authorized the complete prepared staging-only read-only sequence. Read the latest checklist and project instructions, then performed a presence-only check in the actual desktop execution process. Captured result: `REVIT_STAGING_DB_URL=ABSENT_OR_EMPTY` (local check exit code 0). No URI/password value was displayed, serialized or logged. A successful presence-check command is not a successful database diagnostic.

| Required execution evidence | Observed result |
|---|---|
| Private URI available to actual executor | FAIL: absent or empty in that process. No credential fallback or retrieval attempted. |
| Fresh operator dashboard Session Pooler comparison | NOT ESTABLISHED; not requested after the earlier prerequisite failed. Historical dashboard values were not reused. |
| Initial Catalog diagnostic | NOT RUN; psql NOT STARTED. No SQL exit code, completion markers, ROLLBACK tags or new diagnostic log path exists for this checkpoint. |
| Catalog acceptance gates | NOT ESTABLISHED: no fresh identity/version/roles/mode/registry/configuration/count/schema/ACL/dependency/prepared-transaction or ingress/job evidence was collected. Historical findings are context only. |
| Five workers and sixth monitor | NOT STARTED. No sessions opened, PIDs observed, role switches performed, monitoring visibility established or transaction barriers executed. |
| Session closure and final Catalog | NOT RUN; no diagnostic connections existed to close. No postcheck/preservation success is claimed. |

The private variable in a separate user PowerShell does not become available to an already-running desktop executor. Provide it privately to the process that launches a new executor, or execute the **existing** operator checklist from the already-configured private PowerShell. Never paste credentials into chat, argv or logs; never retrieve them from another process, MCP, environment files or a credential store. Fresh dashboard host/5432/staging username/database verification remains required immediately before a future connection. Existing read-only authorization is retained; this blocker does not require repeating source audits or obtaining the same authorization again.

Updated this existing report, aggregate report, STATUS and handoff once for the consolidated stopped checkpoint. No replacement script, source change, test/audit rerun, launcher/SQL/psql invocation, database/production access, fixture/configuration/privilege/schema/migration write, application activation, deployment or Git command occurred. Scenarios **6/12 remain NOT TESTED**. Not ready for concurrency-write authorization. Stop pending availability in the correct private execution process.

## Preserved preparation findings and operator checklist

2026-10-16. **READY FOR READ-ONLY RECHECK AUTHORIZATION.** This decision covers local preparation only. No database connection, diagnostic launcher/SQL execution, fixture, configuration/ACL/schema/migration operation, production access, deployment or Git command occurred. Scenarios **6 and 12 remain NOT TESTED**. Separate explicit authorization is required before the operator executes any commands below.

Read root AGENTS.md, applicable-instruction inventory, handoff, N5 report, execution pack, staging runbook, all three N5 diagnostics and both original scratch preflight files. All requested paths exist. No applicable nested AGENTS.md was found under these paths. Original N3/N5 sources, captured log, execution pack, runbook, historical migrations and verification suites remain unchanged.

## Local findings and corrections

| Audit requirement | Local result |
|---|---|
| Database mutations | PASS: diagnostic SQL contains SELECT/catalog reads, BEGIN READ ONLY, transaction-local settings/role control and ROLLBACK. No DDL, DML, grant/revoke, role creation, migration application/repair, registry writes, prepared transaction creation or COMMIT. No application RPC is called. |
| Transaction/error bounds | PASS: ON_ERROR_STOP in every source and fixed include driver; statement timeout 15s, lock timeout 3s. Catalog transactions idle timeout 30s; session/monitor transactions 120s. Explicit read-only mode protects each transaction independently of startup settings. Failed guards issue a constant read-only error after rollback where supplied; an unrolled aborted transaction is rolled back by psql connection closure. No failure path includes setup or a write source. |
| FK cycles and generated counts | PASS: recursive OID sets use UNION, terminating on finite catalog cycles/duplicate paths. Generated counts use format with %L for the relation label and %I.%I for schema/table identifiers. Inheritance descendants are checked before generated scans; foreign tables, views, materialized views and other unsupported relkinds fail closed. Missing required objects also stop. No auth record values are dumped. |
| Identity and role evidence | PASS for source design: backend PIDs come from pg_backend_pid(), not test labels or client process IDs. Worker B/C perform actual SET LOCAL ROLE service_role inside read-only transactions, then assert current_user/service_role and session_user/postgres. Other sessions assert owner boundaries. Labels are correlation aids only. |
| Monitor limits | PASS for source design: actual supplied worker PIDs, monitor's own observed PID, pg_stat_activity, granted pg_locks AccessShareLock and pg_blocking_pids are checked twice. Six unique PIDs and session labels must match. These are read-lock visibility checks, not advisory/configuration contention or scenario 6/12 results. |
| Old launcher header | DEFECT, corrected in a new copy: original says default read-only is “forced on,” contradicted by historical server output. N6 records a request only; server enforcement must be observed. Original file and N5 unapplied patch are preserved. |
| Log protection | GAP, corrected in new copy: original redacts the private URI/password and PostgreSQL URI patterns, but lacks general JWT/credential-assignment redaction. New copy sanitizes both streams before disk, and session metadata before live display. Catalog bodies are not displayed live. No environment dump, connection URI/password argument, JWT claim assignment, credential-store lookup, unrelated pg_stat_activity.query text or raw exception serialization. |
| Catalog coverage | GAP, supplemented locally: N5 alone lacks the N3 trusted/schema/effective-ACL inventory; N3 alone lacks recursive closure and only reports optional XP presence. New fixed bundle combines both, adds an ordinary-local-relation precheck, optional XP count, trusted security attributes, all required-table constraints/indexes/policies, individual effective column permissions, catalog dependency records and triggers including inheritance descendants/internal FK triggers. |

SET LOCAL ROLE changes the effective role temporarily; it does not modify ACLs or memberships. set_config(application_name,...,true) and timeouts are transaction-local diagnostic controls. Neither writes trusted configuration. The guard requires postgres/postgres, bypass-RLS, PostgreSQL major 17, database postgres, READ COMMITTED, read-only on, replication origin and non-recovery; these properties still do not independently identify a Supabase project.

New files beside this report:

- `CATALOG_READ_ONLY_RECHECK.psql`: fixed includes, in order: relation guard, unchanged N5 recursive diagnostic, unchanged N3 preflight SQL, N6 schema supplement. Four separate read-only transactions; no setup include.
- `RELATION_READ_ONLY_GUARD.sql`, `SCHEMA_READ_ONLY_SUPPLEMENT.sql`: local safety/coverage additions described above.
- `MONITOR_TWO_PASSES.psql`: includes the unchanged N5 monitor twice in the same connection, with an operator barrier between them.
- `run-read-only-recheck.ps1`: new launcher copy; fixed modes Catalog/O/A/B/C/D/M only, installed psql 17.11, private process URI validation against separately entered staging dashboard Session Pooler values, explicit port 5432/database postgres, child-only libpq environment, no credential fallback. M requires five distinct actual positive PostgreSQL PIDs. Source-hash mismatch stops before connecting.
- `Redact-Evidence.ps1`, `SOURCE_HASHES.json`: pure string sanitizer and reviewed include/source hashes. Launcher rejects control characters in the decoded password, rather than risking fragmented live redaction. No arbitrary SQL-path parameter is accepted.

Logs use new, non-overwriting `scratch/phase3n-n2-evidence/n6-readonly-<Mode>-<UTC>-<unique>.log` names. Both streams are captured in memory and sanitized before persistence. The actual psql ExitCode, wrapper_failed and timeout flags are recorded separately. Catalog process bound is 120s; O/A/B/C/D/M bound is 360s. SQL timeouts remain tighter. Parent private connection variable is not changed. A wrapper/logging interruption, missing log or missing exit status is failed/incomplete evidence, never exit 0 by inference.

Redaction is protection, not definition-equivalence proof. Any redaction touching a required routine/policy/default/source comparison makes that comparison NOT ESTABLISHED. Do not remove redaction or publish raw output to resolve it. Do not assume arbitrary opaque embedded secrets can be identified by patterns. Only sanitized, locally reviewed logs may be shared; no transcripts, tracing, debug/environment dumps or raw captures.

## Operator sequence — only after separate read-only authorization

### 0. Before opening connections

Use the existing private PowerShell process holding REVIT_STAGING_DB_URL. Never paste it into a command, chat or argv. Do not retrieve credentials from MCP/files/stores. Freshly open **staging** dashboard project qnepjfcbzsycmesrcbjb and independently confirm its Session Pooler host, port 5432, username and database postgres. Do not open production. Historical host/user values and a SQL test marker do not substitute for this check.

Record a non-secret operator attestation with UTC time/project/Session Pooler mode/host/port/username. Backend inet_* and pg_stat_ssl describe the pooler-to-server connection; they do not authenticate the dashboard project or establish the client TLS leg. The launcher requests require or verify-full TLS, as supported by the privately supplied URI; no live TLS success is claimed here.

Arrange six interactive consoles and rehearse their order without DB commands. Confirm the staging application ingress, old clients, server workers, scheduled jobs/cron/queues, auth/synchronization jobs and other writers are accounted for. Record how each is stopped/drained or why it cannot write. Do not alter deployments, gates or jobs under this checklist. If stopping requires additional action/authorization, stop and obtain it separately. An activity snapshot or configuration false alone cannot establish quiescence. No such current attestation exists in N6.

Prepare these non-secret launcher arguments in the private process; **not executed during N6**:

```powershell
if ([string]::IsNullOrWhiteSpace($env:REVIT_STAGING_DB_URL)) {
    throw 'Private staging connection variable missing in this process. Stop.'
}
$revitLauncher = 'C:\Users\mypc\Desktop\Projects\RevIT\docs\phase3n\phase3n-n6\run-read-only-recheck.ps1'
$revitDashboardHost = (Read-Host 'Fresh staging dashboard Session Pooler host, no URI').Trim().ToLowerInvariant()
$revitDashboardPort = (Read-Host 'Fresh staging dashboard Session Pooler port').Trim()
$revitDashboardUser = (Read-Host 'Fresh staging dashboard Session Pooler username, no password').Trim()
if ($revitDashboardHost -notmatch '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$' -or
    $revitDashboardPort -ne '5432' -or
    $revitDashboardUser -cne 'postgres.qnepjfcbzsycmesrcbjb') {
    throw 'Staging dashboard identity mismatch. Stop.'
}
$revitReadOnlyOptions = @{
    ExpectedHost=$revitDashboardHost
    ExpectedPortText=$revitDashboardPort
    ExpectedUsername=$revitDashboardUser
}
```

Review SOURCE_HASHES.json and the source hashes below before invocation. Never edit/re-hash a changed source merely to pass the launcher gate. New private child consoles inherit the variable from this parent; pre-existing unrelated consoles do not. Neither a Codex desktop variable nor credentials in chat are required.

### 1. Recursive dependency and schema capture

```powershell
& $revitLauncher -Mode Catalog @revitReadOnlyOptions
```

Only this fixed bundle runs. Wait for psql to close. Review its sanitized log against the acceptance matrix below **before** opening the five session processes. Require four actual ROLLBACK command tags and N6_CATALOG_RECHECK_COMPLETE, plus all individual completion markers, exit 0/timeout False/wrapper_failed False and no SQL error. Guard failure, unsupported relation, nonempty table, new dependency/trigger, unexpected definition/ACL or ambiguous evidence stops progression. Do not substitute the shared initialization/setup or either suite.

### 2. Five independent owner-login connections

After catalog review passes, launch O/A/B/C/D from the same private parent. These windows are intentionally visible for operator interaction; only non-secret arguments are passed:

```powershell
$revitBaseArguments = @('-NoProfile','-NoExit','-File',('"' + $revitLauncher + '"'),
    '-ExpectedHost',$revitDashboardHost,'-ExpectedPortText',$revitDashboardPort,
    '-ExpectedUsername',$revitDashboardUser)
$revitDiagnosticProcesses = @{}
foreach ($revitLabel in @('O','A','B','C','D')) {
    $revitDiagnosticProcesses[$revitLabel] = Start-Process -FilePath 'powershell.exe' `
        -WindowStyle Normal -ArgumentList ($revitBaseArguments + @('-Mode',$revitLabel)) -PassThru
}
```

Do not use these PowerShell process IDs as PostgreSQL PIDs. Each child runs the unchanged session psql source once. At Barrier 1 record the **displayed SQL** backend PID and current_user/session_user/mode/isolation/application_name/count for each window. Require O/A/D postgres/postgres; B/C service_role/postgres; all READ COMMITTED/read-only on, session_rows 0, labels revit-n5-O/A/B/C/D, five distinct positive backend PIDs. Keep every session at Barrier 1 until M pass 1 completes. Do not press Enter early.

### 3. Sixth monitor connection and first observation

Still in the private parent, supply only the five observed SQL PIDs:

```powershell
$revitMonitorArguments = $revitBaseArguments + @('-Mode','M',
    '-O_pid',(Read-Host 'Observed PostgreSQL PID O'),
    '-A_pid',(Read-Host 'Observed PostgreSQL PID A'),
    '-B_pid',(Read-Host 'Observed PostgreSQL PID B'),
    '-C_pid',(Read-Host 'Observed PostgreSQL PID C'),
    '-D_pid',(Read-Host 'Observed PostgreSQL PID D'))
$revitDiagnosticProcesses['M'] = Start-Process -FilePath 'powershell.exe' `
    -WindowStyle Normal -ArgumentList $revitMonitorArguments -PassThru
```

M uses a sixth distinct SQL PID, owner login/current role, read-only transaction and READ COMMITTED. Require exactly six expected rows with matching database/login/labels, visible state/xact_start, and granted AccessShareLock on public.study_sessions for each PID. Capture actual blockers/wait fields; unexplained blockers/visibility gaps fail review. Monitor booleans or role-membership metadata without these rows do not pass. pg_stat_activity.usename records the login; B/C logs separately prove effective SQL roles.

Require first actual ROLLBACK and N5_MONITOR_RECHECK_COMPLETE in M, which then waits outside a transaction. Do not close or reconnect M between passes.

### 4. Repeated transactions and second observation

Press Enter once in each O/A/B/C/D window to release Barrier 1. Each source rolls back, starts its second read-only transaction and checks its backend PID is unchanged and the owner role was restored. B/C then switch locally again. Record the second role/isolation/read-only/PID/count rows. All five must now wait at Barrier 2 with their original PIDs.

Only then press Enter in M. Its second include verifies M's original PID and repeats the six-session visibility/read-lock checks. Require the same six distinct PIDs in both observations, two successful N5_MONITOR_RECHECK_COMPLETE markers/ROLLBACK tags, final N6_MONITOR_TWO_PASSES_COMPLETE and actual clean psql exit. A changed PID/rewritten label/missing role or lock row is failure, not a pooler workaround opportunity.

**Each worker barrier must finish within its 120s idle-transaction limit.** Catalog review happens before these windows open. Keep M transitions brisk and use elapsed time only as a timeout bound. Prompt transport, connection continuity and server behavior have not been runtime-tested locally. Missing/blocked console output is a stop, never permission to infer a completed barrier. No reconnect/retry is automatic.

### 5. Roll back, close, and capture actual results

After M pass 2, press Enter in all five windows to release Barrier 2. Require each log's two actual ROLLBACK tags, N5_SESSION_RECHECK_COMPLETE, psql_exit_code=0, timeout=False and wrapper_failed=False. The psql processes close; close the now-idle private PowerShell child windows as well. M must already have closed its psql process. Preserve all unique logs. Do not use a shell's stale LASTEXITCODE or child PowerShell process status instead of recorded psql ExitCode.

On error or timeout, stop all progression. Cancel/close only the six identified diagnostic connections; their read-only open/aborted transactions roll back on closure. Preserve partial sanitized evidence and mark missing rollbacks/exit statuses NOT ESTABLISHED. Do not issue COMMIT, cancel unrelated sessions, repair permissions, perform cleanup writes or retry the check automatically. No fixtures or persistent state exist to restore from this read-only phase. Transaction-local roles/labels/settings end with ROLLBACK or connection closure.

After all six close, perform the explicitly planned final Catalog invocation using the command in step 1. Review it independently for disabled/empty/preserved state and absence of the six known backend PIDs in activity. This is a new read-only postcheck, not a concurrency test. Expected completed evidence set: **two Catalog logs, five session logs and one two-pass M log**. Hash sanitized logs locally; never overwrite the N3 historical log. No automatic postcheck is provided.

## Fresh acceptance matrix — all runtime evidence still NOT ESTABLISHED in N6

| Gate | Required future evidence |
|---|---|
| Target | Fresh dashboard attestation and successful private host/5432/postgres/staging-username comparison for every launcher. Expected project qnepjfcbzsycmesrcbjb only. Metadata, SQL markers and backend IPs are insufficient alone. |
| Server/session | Actual version/version_num, database, postgres session_user, expected current role, explicit read-only on and READ COMMITTED. Settings/source/reset values recorded; startup PGOPTIONS/PGAPPNAME are requests. Default read-only off or pooler startup-label behavior must be recorded honestly; it does not replace explicit transaction checks or prove writable capability. |
| Registry | Exactly one 202610160027 / trusted_cutover_and_attempt_numbering, and earlier four tuples below unchanged; unexpected additional history requires review. |
| Configuration | Exactly one row, id=1 and enabled=false, before and after. Preserve observed updated_at. No temporary enabling occurs. |
| Data | All ten named N3 user/study table counts 0; optional XP absent or 0; every accepted incoming-FK dependent count 0, including managed auth and SCIM descendants. No data cleanup if nonzero. |
| Installed source/security | All three trusted definitions/overloads match exact reviewed Migration 27 (line endings/outer whitespace only); owners, SECURITY DEFINER, search_path/settings, language/other attributes, effective function/table/column/schema privileges and memberships agree with pack/source. Unchanged legacy grants remain open; this phase adds no fence. Redacted comparison text is NOT ESTABLISHED. |
| Schema/dependencies | Review full recursive incoming FK graph, actions/validation/deferral, inheritance descendants, trigger source/owners/enabled state, internal FK inventory, event triggers, catalog dependent objects, RLS/policies, constraints and indexes. Dynamic SQL/application side effects cannot be proven absent from catalog dependency rows alone; review source and operational evidence. |
| Provisional pack graph | Compare against the pack's 24-relation allowlist and as-built bootstrap mapping. Any new node, edge, partition, trigger, source or dependency affecting setup/snapshot/cleanup blocks concurrency preparation until deliberately reviewed and the future pack updated. Counting a newly found object does not authorize manipulating it. |
| Prepared transactions | Zero rows in pg_prepared_xacts. No prepared transaction is created by these sources. |
| Six sessions/monitor | Six distinct observed PIDs, stable across two transactions each; exact roles/mode/isolation and two actual monitoring/read-lock inventories. Existing capability only; no grant repair. Not advisory/config-row contention evidence. |
| Ingress/background writers | Explicit current operational attestation covering every ingress, old-client/background/scheduler/sync path, plus reviewed activity metadata. Unknown path/open non-test writer transaction is a blocker. N6 has no such evidence. Do not treat a short empty activity snapshot as proof. |
| Completion/preservation | All required command tags/markers, clean actual psql statuses and wrappers, no errors, complete sanitized logs; final fresh disabled/empty/registry/ACL/schema comparison and no known test backends. Exit 0 alone cannot pass other gates. |

Historical earlier registry tuples to compare, not a fresh remote observation:

| Version | Name |
|---|---|
| 20261015163552 | 202610130023_strasinger_book_edition_support |
| 20261015163612 | 202610150024_leaderboard_helper_privileges |
| 20261015163653 | 202610150025_trusted_study_persistence |
| 202610160026 | 202610160026_trusted_persistence_idempotency_hardening |

Full deployed pooler startup-forwarding/reset provenance remains unavailable. Fresh pg_settings narrows current behavior; it cannot reconstruct old packets. No packet/auth capture or secret retrieval is proposed. Even a passing read-only recheck authorizes no writes, proves no restoration under committed fixtures and supplies no scenario 6/12 result.

## Actual local validation and stop

- Existing N5 offline file/source/evidence checker: **35 PASS**; historical source/log preservation checks remain valid.
- New `scratch/phase3n-n6-evidence/check_local.py`: **75 PASS** for fixed include resolution/hashes, lexical SQL statement forms/no write tokens, error/transaction bounds, identifier-count generation, unsupported relation/cycle models, metadata coverage and launcher safeguards. These are static/model checks, not PostgreSQL parsing or engine assertions.
- New `scratch/phase3n-n6-evidence/check_redaction_patterns.ps1`: **8 PASS** on synthetic URI/JWT/credential/Bearer/known-value redaction and unaffected metadata, using regex data extracted from the AST. Does not invoke corrected scripts or SQL.
- New launcher/sanitizer and inert operator-command PowerShell ASTs: **0 parse errors**. Installed executable path exists and its file metadata reports **17.11**; /scratch/ remains ignored. No launcher, psql, SQL source, concurrency scenario or browser/application suite was executed. Interactive console/driver behavior and all database results remain untested. No runtime assertion count, SQLSTATE or successful rollback is claimed.

Current source hashes are pinned in SOURCE_HASHES.json; launcher and manifest hashes are recorded below after final local checks. Original scratch SQL/launcher hashes remain 5f5c4eb34281bd121aca7627655052cbdfef0c7bbe86160689cf8a8eddd9b8be / fa92a81f291df0f2cde5fec547e52091a0408a175449e9c86cc4b98496aab551. Reviewed Migration 27 remains aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589.

## Final local source anchors

| File | SHA-256 |
|---|---|
| run-read-only-recheck.ps1 | fe45e016310d5a1f2bf55ed5a6ba7f3acbf81c467d51f2bba98fd13cae63efee |
| SOURCE_HASHES.json | 728e6f94153049794043e321eba5afd0f145842e0f81870a21a88e0426b590a5 |
| CATALOG_READ_ONLY_RECHECK.psql | ebf7ee08bc11c685a7601d03f6d6f6ed843b34b5e255a647084d71523f4c43fd |
| RELATION_READ_ONLY_GUARD.sql | 380282aa23c944d5971193f5d4cbeefca4ffa854a59108ebd88efd372d04da68 |
| SCHEMA_READ_ONLY_SUPPLEMENT.sql | e9830fff3bddb42b6c28a7fe654c2309810736133d344d9750446003bb6ee07d |
| MONITOR_TWO_PASSES.psql | f3167648afc555e1a367cc484e72755f6a93758006b74bd67eb9438d9c8f78b5 |
| Redact-Evidence.ps1 | 859b2151042c57bf8e73f7aaaf6c55188a5a998c7066dda6bb2a673f3604fc03 |

Manifest verification must use these reviewed anchors; do not regenerate it after source drift.

**Stop. Await separate read-only connection authorization.** Rewards/completion, leaderboard cutover, permanent legacy-writer revocation, real-user activation and Strasinger synchronization remain pending. Production and scenarios 6/12 remain prohibited in this phase; no committed staging concurrency authorization follows this report.
