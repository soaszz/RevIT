# Coverage reconciliation finalized locally — 2026-10-16

**CONDITIONAL GO for fresh read-only evidence review. STOP before connections or writes in this task.** Active execution pack now contains the reviewed coverage changes and corrections. Scenarios **6/12 remain NOT TESTED**. No Supabase/production connection, SQL/psql/launcher invocation, fixture, configuration/permission/schema/migration write, activation, deployment or Git command occurred. No current staging-state, engine SQLSTATE, assertion count, lock, notification or restoration result is claimed.

## Applied contract and preservation

Before edits, verified original pack SHA-256 `5b0ab6e3d5985b481eb434318c918a54503462c77e953843c53447d2bc0785a9` against this review's recorded anchor. Read the entire original proposal; preserved its bytes and the original candidate. Created byte-identical **EXECUTION_PACK.pre-coverage.md**. Active pack equals original proposal plus separately retained **CATALOG_COVERAGE_CORRECTIONS.patch**; both diff round trips pass (10 original hunks,16 correction hunks). Original log, old24-node map, bootstrap, Migration27/rollback/suites, N3/N5/N6 diagnostics/launchers, N5/N6 reports and N6 source manifest remain intact. Preserved the earlier review below as historical evidence.

The active closure is the exact28 sorted names, not just a count:33 FK semantics (28 incoming-delete edges plus5 outgoing-parent edges),125 row triggers (122 internal/3 user) and6 event contracts. Four added managed-auth leaves remain zero-only/count-only; no managed-auth fixture, token export or DELETE was added. Every dependency-count consumer, untracked-child check and child-empty cleanup guard calls the same exact28-node helper. New edges/types/owners/persistence/inheritance/trigger behavior and nonempty managed descendants stop rather than extend the contract.

Expected anchors are **unchanged**: FK MD5 `c97fef3a674d6d2ae5ead3ebaf4c8f7d`, trigger MD5 `cb4f6ac47d7a4454d97cef2c507d2e1a`, all6 event-definition MD5s retained from the original proposal. Independently re-extracted all6 captured source bodies and checked their normalizations/digests. SQL/Python normalization replaces CRLF, removes horizontal trailing spaces/tabs per line and trims outer space/tab/CR/LF. No internal source/logic normalization or expected-hash repair. Actual PostgreSQL JSON/normalization parity remains **NOT ESTABLISHED** until the fresh read-only engine output is reviewed. MD5 detects drift here; it does not authenticate a database.

## Corrections required by this pass

| Defect/gap | Local correction and stop condition |
|---|---|
| Original cleanup's attempt-manifest assertion had an extra closing parenthesis | Removed that parenthesis. All22 active SQL fenced blocks now pass lexical delimiter checks. This is a source correction, not a PostgreSQL parse/execution result. |
| Limited auth projection could hide a changed field before deleting the synthetic owner | Snapshot checks every public owner with IS NOT TRUE, then exports only the existing synthetic identity projection plus opaque full-auth-row MD5. No credential columns/values or managed-auth row data are exported. Cleanup compares that fingerprint and all unchanged seed/session rows before DELETE; any change stops. |
| Abort/lost-connection cleanup relied on prose to repeat preservation assertions | Added executable pre-DELETE equality of fenced metadata/ACLs/memberships/schema, all non-attempt/non-config seed data, and full historical rows selected by fixed IDs2001/2002. Missing or changed history fails even if its attempt_number changed. Recovery explicitly imports both original baseline and seed, checks one row each, verifies recorded file hashes, and never re-exports a changed baseline or replays setup. |
| Child rows could arrive between zero-check and parent cleanup | Cleanup's single READ WRITE transaction now locks the exact28 validated tables plus configuration, sorted/quoted, in SHARE ROW EXCLUSIVE mode before validation/deletion. Lock timeout5s/statement timeout15s; any inability to lock aborts, never retries or changes grants. Attempt/session DELETEs also specify exact manifest IDs. Count-only descendants must remain zero before parent DELETE; CASCADE/SET NULL cannot be used to clear an unexpected child. Actual lock acquisition/privileges still need separate future writable-readiness evidence. |
| ACL support guards followed baseline export | Moved baseline serialization/export after empty/config/registry/prepared and supported explicit-owner/column-ACL/grantor checks. Unsupported restoration shapes stop before exporting a baseline. Actual GRANT generation, grant options, original disabled timestamp, atomic restoration and final equality remain required. |
| Schema snapshot omitted additional attributes/owner effective rights | Added relation options/replica identity/partition state, column collation/storage/compression/local/inheritance attributes and postgres effective rights alongside browser/service rights. Complete direct ACLs retain NULL distinction and sorted grantor/grantee/options; memberships, registry, config and row values remain in preservation comparisons. |
| New launcher safety at source loading/start failure | New fixed-file launcher verifies its own/SQL/redactor hashes before loading redactor, initializes stream-task references before starting a child, captures only sanitized output/actual exit status, and refuses overwrite/retries. Historical launchers unchanged. |

Fixture IDs, worker/monitor scenarios6/12 choreography, expected numbering/history1/7→8/9 and scenario assertions remain unchanged. Only the same six manifested relations can be deleted. Future setup remains one explicit transaction with pre-COMMIT seed export/acknowledgement; setup failure rolls back. Disable commits false before cleanup, then drain/close identified workers. Cleanup/restoration commits only after full original-baseline equality; an error requires rollback/close and leaves committed false. Lost acknowledgement requires read-only manifest reconciliation, never a fabricated PASS or INSERT retry. Existing historical data is not admitted by this disposable-empty procedure.

## Separate read-only augmentation — prepared, never run

Added **COVERAGE_READ_ONLY_RECHECK.psql**, **run-coverage-read-only-recheck.ps1** and **COVERAGE_SOURCE_HASHES.json** in this directory. This is a separate fixed-source copy because the unchanged N6 launcher has no arbitrary-file option. It never selects the execution pack or a suite. The new SQL has **no includes**, temporary objects, helper/RPC calls, DDL/DML/ACL/schema/migration changes, persistent settings, COMMIT, auth row projection or unrelated live query text.

One explicit BEGIN READ ONLY encloses all diagnostics; statement15s/lock3s/idle30s bounds, ON_ERROR_STOP, ECHO none and final ROLLBACK followed by COVERAGE_READ_ONLY_ROLLBACK_COMPLETE. Only two generated command paths exist: identifier-quoted SELECT counts from the validated28-node closure and an ordinary/permanent/noninherited optional XP relation. Any nonzero count deliberately errors; unsupported relation/owner/bypass/inheritance/contract/state stops before scans. On error/disconnect the launcher closes its own connection; do not claim an explicit ROLLBACK tag or completion marker then.

Exact new-file statement order: session/version/PID/read-only/isolation/event settings → unchanged expected FK/125-trigger/6-event fingerprint gates with actual engine hashes/counts printed → exact28 ordinary/permanent/owner/no-inheritance guard → complete registry/version27/config/prepared state →28 zero counts and optional XP absence/empty count → all33 FK semantics → full managed/public schema/owner/persistence/inheritance/normalized direct and effective schema/table/column/callback ACL metadata, constraints/indexes/RLS/policies/dependencies → additional named column/table details → trusted/legacy routine definitions/security/rights →6 event definitions/owners/tags/enabled/security/direct ACLs → all internal/user callback definitions → memberships/role capabilities and sanitized activity/own-lock metadata → final PID/mode → ROLLBACK/marker. Capture includes relevant metadata only; no environment dump, URI/password/JWT, pg_authid/password view, credential-bearing job command/header or unrelated pg_stat_activity.query.

The historical Catalog include order is unchanged: RELATION_READ_ONLY_GUARD.sql → ../phase3n-n5/READ_ONLY_RECHECK.sql → ../../../scratch/phase3n-n2-evidence/read-only-preflight.sql → SCHEMA_READ_ONLY_SUPPLEMENT.sql → N6_CATALOG_RECHECK_COMPLETE. Its four read-only transactions run through its existing launcher. The augmentation runs separately through its new launcher in a fifth transaction/new connection, never appended beneath the historical driver. New launcher hashes SQL, unchanged N6 redactor and itself; the manifest below records exact bytes. Startup PGOPTIONS remains a request, not observed enforcement. Private URI/password stay in process memory/child libpq environment, never argv or files; no credential store fallback.

## Observed offline validation

- Existing87 focused checks **PASS**, plus93 original unified-diff context/deletion checks. These still test the unchanged original proposal against its immutable original backup.
- **170 additional checks PASS** on active pack/augmentation/preserved sources: both diff round trips, count-only closure, unchanged anchors, real captured event-source normalization, pre-helper guards, pre-export guards, NULL/foreign owners, opaque auth drift, historical changes/missing rows, manifest deletes, lock placement, recovery imports, schema/owner rights, all22 SQL-block delimiter structures, read-only allowlist, generated SELECT quoting, source hashes and UTF8/newline/conflict/trailing-whitespace integrity.
- New launcher PowerShell AST: **0 errors**. Existing pure extracted redaction-pattern tests: **8 PASS**, actual local exits0. No launcher or SQL source executed by those tests.
- Evidence: ignored scratch/phase3n-n-coverage-review/local-review.json and final-local-review.json plus checker sources; AST/redaction outputs captured in this Codex turn. No PostgreSQL parser available; no SQL engine, table lock, trigger/event, notification, concurrency or restoration test. Source checks do not prove runtime SQL syntax or outcomes.

## Exact next read-only command sequence — DO NOT RUN IN THIS TASK

After separate authorization covering the new augmentation, use the **same private PowerShell process** holding REVIT_STAGING_DB_URL. Do not paste credentials into chat, argv, transcripts or evidence. Freshly consult the staging dashboard for Session Pooler host/port5432/staging username/database postgres; both launchers prompt only those non-secret values and privately compare the URI. If any value or evidence is ambiguous, stop; do not open workers or retry/repair.

First command only:

```powershell
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:REVIT_STAGING_DB_URL)) {
    throw 'Private staging connection variable missing. Stop before connection.'
}
Set-Location -LiteralPath 'C:\Users\mypc\Desktop\Projects\RevIT'
& '.\docs\phase3n\phase3n-n6\run-read-only-recheck.ps1' -Mode Catalog
```

Stop for actual sanitized Catalog review. Require exit0/no timeout/no wrapper failure, four actual ROLLBACKs/all original markers, fresh dashboard consistency and all state/security gates. Historical exit0 is insufficient. Only if that review passes and authorization covers the new source, run the separate augmentation:

```powershell
& '.\docs\phase3n\phase3n-n\run-coverage-read-only-recheck.ps1'
```

Expected new log pattern (not created here): scratch/phase3n-n2-evidence/coverage-readonly-Catalog-*.log; old driver retains n6-readonly-Catalog-*.log. Record exact paths and hashes/actual status/SQL error output. Require new actual exit0, timeout=False, wrapper_failed=False, actual ROLLBACK and COVERAGE_READ_ONLY_ROLLBACK_COMPLETE, no SQL errors/redactions. Verify printed engine counts33/125, exact anchors and all6 normalized event sources; missing/off event_triggers, changed hash or incomplete output is a blocker, never permission to turn it on or replace expected constants. Inspect all newly exposed schema fields rather than automatically accepting them. New optional XP/dependency/source drift needs deliberate review, even if its count is0.

Stop after both captures for independent evidence review. **Do not open O/A/B/C/D/M from these commands.** Neither launcher starts workers. A later separately resumed six-session read-only sequence still needs both stable-PID/role/READ COMMITTED/read-only/read-lock monitoring barriers, closure and final independent Catalog preservation check. Concurrency writes need separate explicit authorization afterward.

## Outstanding gates — NOT ESTABLISHED

| Gate | Required fresh evidence / stop |
|---|---|
| Current staging identity and state | Dashboard Session Pooler/project qnepjfcbzsycmesrcbjb/database/username comparison in exact private process plus actual server/role/mode outputs. No SQL test marker proves identity. Exact one202610160027/trusted_cutover_and_attempt_numbering, previous four tuples from historical review retained, one id1 false config with reviewed timestamp, ten/all28 counts0, optional XP absent/approved empty and no prepared transactions. |
| Exact schema/event fingerprint parity | New live engine hashes/33FK/125trigger/6event comparison and full new schema/ACL/dependency fields independently reviewed. Existing log cannot establish omitted persistence/inheritance/access-method/managed-column fields or effective event_triggers. Never regenerate anchors to force a match. |
| Six stable independent sessions / monitor / roles | Actual six unique backend PIDs stable across both transactions, actual B/C SET LOCAL ROLE service_role and observed roles, READ COMMITTED/read-only and engine read-lock visibility in sixth M. Catalog capability booleans, own-backend locks and old exit0 do not prove any of these. |
| Ingress/background quiescence | Dated owner-specific attestation covering application/API/legacy/trusted clients, auth login/refresh/MFA, Storage/sync, database/app schedules, pg_net/other queues and in-flight work for entire future write/restoration window. Sanitized activity/schedule/queue metadata/counts, no job commands/headers. Idle snapshots cannot prove quiescence; no shutdown/termination is authorized here. |
| Later writable/restoration readiness | Separate authorization; existing owner writable mode/managed table-lock rights/count/bypass and worker/monitor capabilities, without grant/role changes or write probe in read-only phase. Supported ACL restoration, original durable run-specific export hashes, disable/drain/locked cleanup and post-commit independent equality. Lock/restore availability is not tested by this pass. |

Rewards/completion, leaderboard cutover, permanent legacy-writer revocation, real-user trusted persistence, Strasinger and client runtime activation remain pending. **CONDITIONAL GO only; stop after local preparation.**

## Current source hashes

| Artifact | SHA-256 |
|---|---|
| EXECUTION_PACK.pre-coverage.md | 5b0ab6e3d5985b481eb434318c918a54503462c77e953843c53447d2bc0785a9 |
| CATALOG_COVERAGE_PROPOSED.patch | 2335b3f4ebf620cf46ce5e24550dc9ee46119e7a5ecd4369b86154b01d6677ee |
| CATALOG_COVERAGE_CORRECTIONS.patch | 9d1ff4cb16e567ad060d87eccea873f0e65e2b1abfafa70ff94ce18614a9c030 |
| EXECUTION_PACK.md | 8ca23d28ced6a84c5d603629fffeceaf387c7b44810f5449d40c26f170c03a90 |
| COVERAGE_READ_ONLY_RECHECK.psql | b2ea404c69abdcc2a60a7e18b6e0936d9ccb29618866d2c850caeda00ba62f97 |
| run-coverage-read-only-recheck.ps1 | d4066de99b00620a799d572d246d2c1e91081c16e98065f9d5c3f6373f827908 |
| COVERAGE_SOURCE_HASHES.json | 8e93e65b9b75088cb535eca332dffcf3436d480e8656bfb4d2534b94fc2885f7 |

The captured Catalog SHA remains `853010a06c421d489a34146a2131f22addcff601552d6ce55b0b8f5b14f8f230`; N6 SOURCE_HASHES.json remains `728e6f94153049794043e321eba5afd0f145842e0f81870a21a88e0426b590a5`. SHA updates above identify intentionally changed local source bytes; expected SQL contract fingerprints were not regenerated.

---

## Preserved earlier proposal review (historical; superseded only by local status above)

# Catalog coverage reconciliation — local proposal only

2026-10-16. **Coverage changes are justified for review. Original execution pack remains blocked and unchanged.** Prepared [CATALOG_COVERAGE_PROPOSED.patch](C:/Users/mypc/Desktop/Projects/RevIT/docs/phase3n/phase3n-n/CATALOG_COVERAGE_PROPOSED.patch), not applied. No database connection, Catalog rerun, six-session launch, fixture/configuration/privilege/schema/migration operation, deployment or Git command occurred. Scenarios **6/12 remain NOT TESTED**. This report neither resumes the read-only checkpoint nor authorizes concurrency writes.

Reviewed N5/N6 reports, current pack, old local dependency map, staging bootstrap and auth-trigger migrations1/5/7. Evidence is the immutable [N6 Catalog log](C:/Users/mypc/Desktop/Projects/RevIT/scratch/phase3n-n2-evidence/n6-readonly-Catalog-20261016T101526228Z-268f5f2b.log), SHA-256 `853010a06c421d489a34146a2131f22addcff601552d6ce55b0b8f5b14f8f230`. All `L` references below mean this log. The map `scratch/phase3n-n5-evidence/dependency-map.json` describes the earlier direct-root capture:24 nodes and `complete_live_graph:false`. It remains a historical input, not a current28-node map; it was not overwritten. Expanded evidence/model results are separate ignored artifacts under `scratch/phase3n-n-coverage-review/`.

## 1. Confirmed blockers and disposition

| Blocker | Evidence / disposition |
|---|---|
| Old closure guard rejects current capture | Pack original L168–174 encodes24 exact names; Catalog L128–156 contains28. All24 remain present. Four additions are examined below; merely changing a count is insufficient. Proposed exact sorted28-name guard is paired with a33-FK semantic contract and125-trigger contract. |
| Previously unreviewed event-trigger effects | Six enabled event records/function sources at L387–629. Source analysis and upstream PostgreSQL17.11 behavior support temporary-object exclusions below. Proposed guard pins names/events/tags/owners/function identities/normalized definitions before helper DDL; no event trigger is changed. Runtime invocation/non-notification remains untested. |
| Incomplete managed-schema baseline | Original snapshot already recurses FK and user-trigger metadata but table/column/ACL/policy coverage is mainly public; internal triggers, complete managed constraints/indexes/dependencies/inheritance are missing. Proposed metadata projection fills that scope without exporting managed-auth row values. Fresh inspection of those new fields is still required. |
| Empty checks follow baseline serialization/export | Original pack L252–267 exports baseline before its all-empty/config/prepared/registry guards. Proposed patch moves those guards before baseline creation/export and rejects untracked dependent rows inside every snapshot. This prevents treating a populated managed descendant as an acceptable baseline. |
| Operational and six-session evidence absent | L1285–1292 is one8-backend activity snapshot, not ingress/job quiescence. L47/L1280 are capability metadata, not actual SET ROLE or stable six-backend monitoring. These remain outstanding and are not resolved by this local proposal. |

## 2. Why the four relations can be included, conditionally

All four are owned by **supabase_auth_admin**, ordinary/countable local relations in this capture (L132/L133/L136/L140); postgres is bypass-RLS (L55). No ownership/grant/RLS change is proposed. Each is a leaf in the **captured FK graph**: no row among L90–123 references one as a parent. This does not establish absence of inheritance or future dependencies; the proposed guard rejects inheritance/partitioning and requires fresh permanent-table confirmation.

| Relation | Reachability/delete path | RLS and triggers | Count / required future invariant |
|---|---|---|---|
| auth.mfa_amr_claims | auth.users → auth.sessions → this relation; L94 session_id FK, CASCADE | RLS on, force off (L132). Two internal FK insert/update checks; no custom row trigger in the125-trigger inventory. Parent-side RI cascade is on auth.sessions. | L166 count0. No session/login fixture is authorized; any row aborts baseline/setup/snapshots/cleanup. |
| auth.mfa_challenges | auth.users → auth.mfa_factors → this relation; L95 factor_id FK, CASCADE | RLS on, force off (L133). Two internal FK checks; no custom row trigger. Parent cascade is on auth.mfa_factors. | L171 count0. No MFA factor/challenge fixture; any row aborts. |
| auth.mfa_recovery_codes | auth.users → auth.mfa_recovery_code_sets → this relation; L99 recovery_code_set_id FK, CASCADE. Sets are also reached via auth.mfa_factors (L97). | RLS off, force off (L136); managed ownership unchanged. Two internal FK checks; no custom row trigger. Parent cascade is on recovery_code_sets. | L186 count0. No recovery-set/code fixture; any row aborts. Never serialize a recovery-code value. |
| auth.refresh_tokens | auth.users → auth.sessions → this relation; L105 session_id FK, CASCADE | RLS on, force off (L140). Two internal FK checks; no custom row trigger. Parent cascade is on auth.sessions. | L206 count0. Synthetic user must never sign in or receive a refresh token; any row aborts. Never serialize a token value. |

All33 captured FKs are validated, nondeferrable and not initially deferred. There are28 incoming-delete-path edges and five outgoing-parent edges, not33 deletion descendants. Additional outgoing edges at L100/L102/L106/L108 reference auth.oauth_clients/auth.sso_providers; the existing achievement-parent edge is L119. These parents are not new fixture/cleanup targets. The existing SCIM user FK remains SET NULL (L107), not CASCADE.

Source justification for zero-only treatment: bootstrap [handle_new_user](C:/Users/mypc/Desktop/Projects/RevIT/supabase/tests/staging_baseline_init.sql:248) inserts only profiles, preferences and progress. Its three triggers (bootstrap L321–323; captured L302/L337/L362) match the as-built inventory. Profile protection permits the existing administrative boundary; attempt-book normalization preserves the planned synthetic Harr rows. None of those sources creates auth sessions, MFA material or refresh tokens. Migration1 originally seeded two tables; migration5 added a separate progress seed/update trigger; migration7 preserved the split seed layout while adding consent fields. The bootstrap consolidates the three seed inserts and omits those separate progress triggers. Do not replay migrations or restore a hypothetical migration-only trigger layout.

This is source-based expectation, not proof that a live auth service/background writer cannot add rows. Therefore **all28 counts must be zero before fixtures**. During future fixtures, only the existing six manifested relations may be nonempty: auth.users, profiles, preferences, progress, study_sessions and question_attempts. Every other reachable table, including these four, stays zero. No new fixture IDs, row exports, DELETE/UPDATE targets or ACL restoration entries are added. If an unexpected child appears, retain evidence, follow the already-authorized disable/drain abort procedure, and leave cleanup unresolved; never delete a token/factor/session to make the test pass. Existing nonempty staging cannot use this disposable-empty pack.

### Every old-size assumption and its propagation

Original pack references: L5's provisional24-relation statement and the literal array at L168–174 are the only closure-size assumptions. They change in the proposal. The remaining consumers are already generic and must include all28 through the helper:

| Original pack location | Effect of proposed revision |
|---|---|
| L157–186 dependency_counts | Exact28 names, C ordering, existing owner/bypass requirement; reject nonpermanent/nonordinary relations, owner changes, and any inheritance. Identifier-quoted schema/table COUNT, no ACL workaround. |
| L187–250 snapshot | Add managed metadata; reject nonempty unmanifested descendants before row projection. Counts remain counts, not auth row dumps. |
| L252–267 baseline guards/export | Move guards before serialization/export; require all28 empty, one false config, exact migration/prepared-state checks. |
| L335/L351–360 setup seed/export | Existing deterministic progress key4001 and three bootstrap seeds unchanged. Generic dependent-count guard now covers the additional four; tentative seed export remains before COMMIT. |
| L540–586 scenario equality | Existing full-row/historical `[1,7]` and future `[8,9]`, idempotency/conflict and metadata/count comparisons unchanged. New nested metadata participates automatically. |
| L616–642 cleanup guards/deletes | All untracked28-node counts checked before deletion; all children empty before auth parent deletion. Same six explicit manifested DELETE targets only. CASCADE/SCIM SET NULL must affect zero child rows. |
| L646–656 final/recovery comparisons | Existing snapshot equality now includes expanded metadata/counts. Original config timestamp/direct ACL/membership/registry requirements and durable original exports remain mandatory. |

The old N5 map/reports and original log remain historical records. Their24-node statements are not edited into fabricated28-node observations. The ten-table user/study data projection and synthetic fixture manifest are not mistaken for the dependency closure and are not enlarged into managed-auth fixtures.

## 3. Six event triggers and temporary-object effects

Catalog facts: all six have evtenabled=O; trigger and function owners are supabase_admin (L387–629). Current capture records replication origin at L31 but does **not** record the effective event_triggers setting. Function source is visible; actual event invocation is not observed by these read-only diagnostics.

| Event trigger / captured source | Filter and consequential code | Effect inferred for the unchanged pack operations |
|---|---|---|
| issue_graphql_placeholder, L389–442 | sql_drop, tag DROP EXTENSION; can install a graphql_public.graphql placeholder. | No DROP EXTENSION is planned. Temporary object deletion and row DELETE do not satisfy this tag. |
| issue_pg_cron_access, L444–477 | ddl_command_end, CREATE EXTENSION; source can alter cron grants/default privileges. | No CREATE EXTENSION. Do not infer harmlessness if tags/source change. |
| issue_pg_graphql_access, L479–521 | ddl_command_end, CREATE EXTENSION; can replace a public GraphQL wrapper, attach it to an extension and grant access. | Excluded by the planned command tags, not disabled. No extension operation or wrapper change permitted. |
| issue_pg_net_access, L523–569 | ddl_command_end, CREATE EXTENSION; can create a role and modify net grants/security/settings for some extension versions. | Excluded by tags. No HTTP call occurs in this function source. This is not permission to invoke an extension operation. |
| pgrst_ddl_watch, L571–599 | Unfiltered ddl_command_end; listed CREATE/ALTER tags, but rejects schema_name=pg_temp. Consequential branch NOTIFY pgrst, reload schema. | CREATE FUNCTION pg_temp.*, CREATE TEMP TABLE/AS and CREATE TEMP VIEW can invoke the hook; their normal temporary-object records are excluded by its predicate. GRANT/REVOKE are not in its source tag list. DML/DO are not matched helper-DDL tags. No permanent DDL, COMMENT or explicit NOTIFY is added. |
| pgrst_drop_watch, L601–627 | Unfiltered sql_drop; listed object kinds and is_temporary=false; emits the same notification. | Reported temporary functions/tables/views are excluded. Row cleanup DELETE is not object DROP. Session-end temp removal is not assumed to produce a particular hook invocation; no persistent DROP/CASCADE is planned. |

The exclusion is supported by the matching **upstream PostgreSQL17.11 source**: command-end event rows obtain temporary schema names through get_namespace_name_or_temp, while dropped temporary namespace objects are identified as temporary. Thus the physical pg_temp_N name is not the value to compare for normal temporary-object event records. This is an upstream-source inference for the captured server version, not an engine experiment or attestation of the provider binary. [PostgreSQL17.11 event implementation](https://github.com/postgres/postgres/blob/REL_17_11/src/backend/commands/event_trigger.c), [event helper semantics](https://www.postgresql.org/docs/17/functions-event-triggers.html).

Ordinary helper DDL still invokes matching hooks; “temporary” does not mean all event hooks are bypassed. Other object hooks/provider modifications are not proven absent by this catalog. No temp-object/no-notification engine result is claimed. The source-based exclusion is the local rationale; if stronger engine proof is required, read-only inspection alone cannot supply it and a separately scoped authorization would be needed. This proposal adds no such probe or extra session.

Notifications cannot be restored by later snapshot equality. PostgreSQL delivers transactional notifications only after commit; an already committed notification cannot be undone by subsequent fixture cleanup. This matters because shared helper creation uses autocommit. Hence the proposed contract check runs **before the first helper**, not after baseline export. No trigger-disabling workaround is offered. [PostgreSQL NOTIFY](https://www.postgresql.org/docs/17/sql-notify.html), [event firing matrix](https://www.postgresql.org/docs/17/event-trigger-matrix.html).

## 4. Smallest preservation changes proposed

The separate309-line unified diff targets only EXECUTION_PACK.md and is **unapplied**. It changes no launcher, migration, bootstrap, existing diagnostic or captured evidence.

1. Replace the provisional guard with the exact reviewed28-name closure and zero-only managed-child rules. Strengthen COUNT's owner/bypass, relation-type, owner, persistence, inheritance and identifier handling. No schema/privilege repair path.
2. Before any pg_temp DDL in future writer initialization, use a bounded catalog-only read-only transaction to check six event contracts plus a canonical33-FK fingerprint and125-row-trigger fingerprint, including the three callback definitions. Reject changed source, enabled state, owner, tag, FK action/key, internal-trigger configuration or unexpected object. Require read-only/READ COMMITTED during that check, replication origin and effective event_triggers=on; never change a failing setting. These MD5 values are drift checks, not project authentication or adversarial-tamper proof. Original evidence/proposal use SHA-256 anchors.
3. Add one catalog-only projection, also nested in snapshots, for the28 relations plus configuration: owner/type/persistence/access method, columns/defaults/identity/generated state, normalized direct table/column/schema ACLs with NULL distinctions, effective rights, RLS/policies, constraints/indexes, internal/user triggers, relation dependency records, inheritance and role attributes. Existing event metadata, memberships, registry and public snapshots remain. Temporary harness objects are outside this scope, so their ordinary creation does not redefine the persistent baseline.
4. Normalize new ACL arrays rather than compare GRANT-induced array order. Preserve grantor/grant-option semantics and existing unsupported NULL/touched-column/inherited-right restrictions. Correct the old prose: **touched fence tables**, not every staging table, lack column ACLs; profiles' existing column ACLs stay outside the fence. The actual fencing/restoration SQL is unchanged.
5. Put all-empty/config/registry/prepared guards before baseline row export. Repeat the untracked-zero rule within each snapshot. Keep seed export before setup COMMIT, strict ownership/collision checks, original grantor restoration and atomic final equality. No extra managed-auth deletes or token exports.

The hashes are deliberately fail-closed. Fresh read-only execution must first establish PostgreSQL's actual normalized-definition/JSON checksum parity and inspect any mismatch; do not regenerate constants from a changed live result just to pass. This local work cannot establish engine parsing, checksum parity or runtime restoration. The proposed standalone catalog projection contains no DDL/DML and does not require creating its snapshot helper; it is included in the diff for a future **reviewed** read-only augmentation, not added beneath the existing launcher now.

## 5. Fresh questions and acceptance before opening O/A/B/C/D/M

These are separate from local graph reconciliation. **None is newly passed by this report.**

1. Review/accept the proposed coverage contract and patch as a local design. Keep the active pack blocked until deliberately updated; never execute its old24-node path against the28-node state. Read-only handshake scripts do not execute the pack and do not authorize applying its write blocks.
2. Fresh operator dashboard comparison for project qnepjfcbzsycmesrcbjb, Session Pooler host/5432/staging username/database; private URI present in the exact process, never disclosed. Confirm session pooling, observed server/roles/READ COMMITTED/read-only mode; SQL labels do not identify the project.
3. Fresh sanitized Catalog evidence: exact Migration27/previous registry, one configfalse row with preserved timestamp, ten empty required tables/optional XP absence or emptiness, all28 dependency counts0, no prepared transactions, all required rollbacks/markers/actual exits, no errors. Historical10:15 UTC capture is not a current-state guarantee.
4. Resolve the missing schema fields: all28 permanent-table persistence/access methods, no parent/child inheritance, full managed columns/defaults/ACLs/constraints/indexes/RLS/policies, trigger-function privilege metadata and public/auth schema rights. The unchanged N6 bundle alone does not capture every one of these fields. Review a read-only augmentation based on the proposed catalog projection before running it; do not replace existing sources silently. Capture/compare all33 FK semantics,125 triggers and six event definitions/settings/owners/tags. Verify actual event_triggers setting and normalized checksum parity; fail on missing/off/drift rather than enabling it. Capture-time counts do not establish this extra schema baseline.
5. Obtain a dated, source-specific stopped-ingress/drained attestation: application/API and old clients, trusted and legacy endpoints, auth sign-in/refresh/MFA flows, Storage/sync workers, scheduled database/application jobs, pg_net work and other queues. Record which owner controls each path and how it is prevented from writing through the test window. Review fresh activity and sanitized schedule/queue **metadata/counts**; never dump credential-bearing job commands, request headers, tokens or environment values. An idle PostgREST connection or cron scheduler is not proof of no scheduled work. Do not turn jobs/services off within this local/read-only scope or terminate unrelated sessions.
6. Establish existing owner/bypass/count access, service_role SET capability and monitoring membership/visibility without changing grants. Six actual independent, stable PIDs and worker role switching are the **outputs** of the subsequent read-only handshake, not circular prerequisites already proved by Catalog. All pre-handshake metadata and operational gates above must pass first. No automatic session launch follows this report.

After a separately resumed six-session read-only check, require both transaction barriers' actual PID/role/isolation/mode/read-lock evidence, all connections closed and final independent Catalog preservation checks. Only then can a separate concurrency-write authorization be considered. Before any future committed setup also require durable original baseline/seed/restore exports, supported exact ACL restoration, writable owner evidence without a write probe and the prepared disable/drain/abort/cleanup choreography. No historical users/sessions/attempts are admitted into this disposable-empty pack or renumbered. Rewards/completion, leaderboard cutover, permanent legacy revocation, activation and Strasinger remain pending.

## 6. Local checks and artifact anchors

Ran only file/text/models using Python standard library:

- **87 focused checks PASS**, plus93 unified-diff context/deletion checks; in-memory patch round trip reproduces the ignored candidate. Original pack never overwritten.
- Models trace all28 nodes/33 edges, four leaf owners/CASCADE parents, unknown-child/cycle and same-node FK-action drift; six event contract mutations;125-trigger source/configuration drift; temporary/permanent/NULL-schema watcher predicates; nonempty auth-child aborts; ACL ordering/NULL semantics and baseline-before-export order.
- Fixture manifest, actual fencing/restoration SQL, M monitoring, scenarios6/12 choreography and numbering/historical/equality assertions are unchanged. Six cleanup targets remain unchanged. Metadata projection/pre-helper guards have balanced delimiters and catalog-only statement forms. No auth credential row projection is added.
- PostgreSQL SQL parser unavailable locally; **no SQL parse/engine/DDL/lock/trigger/notification/restoration test ran**. File/model results are not SQL assertions or a passing runtime suite. Scenarios6/12 remain NOT TESTED.

Ignored preparation/check files: `prepare_proposal.py`, `check_proposal.py`, `EXECUTION_PACK.proposed.md`, `capture-map.json`, `coverage-metadata-select.txt`, `local-review.json` under `scratch/phase3n-n-coverage-review/`. The standalone SELECT is inert review material, not an executed or approved replacement diagnostic.

| Preserved/proposed artifact | SHA-256 |
|---|---|
| Original EXECUTION_PACK.md, unchanged | 5b0ab6e3d5985b481eb434318c918a54503462c77e953843c53447d2bc0785a9 |
| Proposed patch, not applied | 2335b3f4ebf620cf46ce5e24550dc9ee46119e7a5ecd4369b86154b01d6677ee |
| Ignored candidate pack | 09a872c8b7c8241f83fe2f47bc26f9aa1152a084ec39e9379c3b6e846d424528 |
| Old dependency-map.json, unchanged | cfbb7c553475c7a86a82b1dc9772da8e4a88d64c1690f9aaeda7a59c481b20b1 |
| Staging bootstrap, unchanged | b2bd34f792f148fac1a7c8744f36e9b8a9c5c09f9743dc5663cf9091a494f99f |

**Stop after review and proposed patch. No sessions or concurrency writes are authorized by this preparation.**
