# Phase 3N-N2 concurrency execution pack — PREPARATION ONLY

Prepared 2026-10-16. **Not executed; scenarios 6 and 12 NOT TESTED.** This document contains future database writes. Do not paste its setup, worker or cleanup blocks until separately authorized for this exact committed staging procedure. Existing rollback-only suite authorization is insufficient. No automatic runner is provided.

**Coverage revision APPLIED LOCALLY; NOT AUTHORIZED TO RUN.** See [focused coverage review](CATALOG_COVERAGE_REVIEW.md). The captured N6 incoming-FK closure contains 28 relations / 28 incoming edges, plus five outgoing-parent edges. Four managed-auth leaf tables are count-only, always zero: no additional fixtures, row exports, DELETEs or restoration grants. This exact closure is conditional on fresh catalog comparison; a new node/edge/action/owner/trigger/partition or nonzero untracked row still stops. Six event definitions are pinned before any temporary helper DDL. Fresh metadata, operational quiescence, six-session readiness and separate write authorization remain outstanding. No startup-setting request substitutes for an observed mode.

Target exclusively `qnepjfcbzsycmesrcbjb`, dashboard URL `https://qnepjfcbzsycmesrcbjb.supabase.co`. Never connect to production `lznsdxfvxeckflxsohig`. Do not use CLI link/push/repair, registry writes, migration replay, standalone rollback, new grants/roles, real accounts, application activation or HTTP traffic.

## Source contract and readiness gates

Reviewed against `202610160027_trusted_cutover_and_attempt_numbering.sql`, the prepared verification/rollback suites, current staging runbook, foundation/attempt/session schemas, and `app/lib/server/trustedStudyRoutes.ts`, `trustedStudyGate.ts`, `trustedStudyPersistence.ts`. Migration 27 takes configuration FOR SHARE, then trusted-owner advisory lock, session FOR UPDATE, sorted attempt UUID advisory locks, then legacy-compatible question advisory locks. It allocates `max(attempt_number)+1`, retries exact stored records, and writes attempts only. Route transport is separately gated; do not change its environment or admit requests.

Before future execution, re-hash Migration 27; reviewed SHA-256 is `aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589`. Compare all three installed trusted definitions to that source. Abort on source/schema/overload/trigger/ACL drift; do not adapt the procedure live.

The operator must independently verify the private URI's host, port, database and username against **the staging dashboard's Session Pooler**, using the privately configured PowerShell process. A generic pooler IP or `current_database()='postgres'` does not identify the project. No dashboard host was supplied here; none is guessed. Reject transaction pooling and any URI/username containing the prohibited project. Keep URI/password out of argv, transcripts, chat and evidence: use private libpq connection environment in that shell rather than a literal URI argument. Do not retrieve credentials from MCP. This pack supplies no credential conversion/launcher.

Require stopped ingress to this disposable staging database, no real users, no background writers/jobs, no prepared transactions, no unreviewed user-trigger/cascade effects, and an approved owner connection capable of existing `SET ROLE service_role` and monitoring. No membership/grant changes to meet prerequisites. Review the FK/trigger query below against the source; unexpected dependent tables or triggers block writes. Session Pooler session mode and distinct stable backend PIDs must be demonstrated before authorization is considered executable. Desktop URI inheritance is irrelevant to local preparation. Future operator diagnostics are **user-supplied evidence**, unless independently obtained through an authorized connection.

Six independent psql processes/connections, all privately staging-verified:

| Label / application_name | Boundary |
|---|---|
| O / `revit-n2-O` | postgres coordinator; snapshots, temporary fencing, fixtures, cleanup/restoration |
| A / `revit-n2-A` | postgres; question advisory blocker only |
| B / `revit-n2-B` | owner login; each worker transaction uses actual SQL `SET LOCAL ROLE service_role` plus service JWT claims |
| C / `revit-n2-C` | independent worker, same role boundary as B |
| D / `revit-n2-D` | postgres; configuration-disable transaction |
| M / `revit-n2-M` | existing monitoring-capable owner; read-only evidence, no mutations |

SQL service role plus simulated JWT claims tests the SQL boundary; it does not prove PostgREST/browser authentication. No JWT-only owner call counts as service-role evidence. Never share a connection between B/C; no multiplexed transaction pooler. O must remain connected to retain temporary snapshots; durable local copies below allow recovery if it disconnects.

## 1. Private read-only diagnostics (operator, before any writes)

Start psql with `-X` and stop-on-error, using already-private libpq authentication. Do not log its connection banner/connection command or use `\conninfo` (can expose endpoint/user details). Set a different application name in each process, substituting its literal label; the following example is O. Only this diagnostics block may run under the current read-only scope. It creates no temporary objects.

```sql
\set ON_ERROR_STOP on
\set VERBOSITY verbose
\pset pager off
SHOW default_transaction_read_only;
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT current_database(), version(), current_user, session_user,
       current_setting('transaction_isolation') AS isolation,
       current_setting('transaction_read_only') AS read_only,
       inet_server_addr(), inet_server_port(), pg_backend_pid();
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT id, enabled, updated_at FROM public.trusted_study_config ORDER BY id;
SELECT 'auth.users' AS relation, count(*) FROM auth.users
UNION ALL SELECT 'profiles',count(*) FROM public.profiles
UNION ALL SELECT 'user_preferences',count(*) FROM public.user_preferences
UNION ALL SELECT 'study_sessions',count(*) FROM public.study_sessions
UNION ALL SELECT 'question_attempts',count(*) FROM public.question_attempts
UNION ALL SELECT 'activity_events',count(*) FROM public.activity_events
UNION ALL SELECT 'daily_activity',count(*) FROM public.daily_activity
UNION ALL SELECT 'user_progress',count(*) FROM public.user_progress
UNION ALL SELECT 'user_achievements',count(*) FROM public.user_achievements
UNION ALL SELECT 'question_reinforcement',count(*) FROM public.question_reinforcement;
SELECT conrelid::regclass AS child, confrelid::regclass AS parent,
       pg_get_constraintdef(oid) FROM pg_constraint
WHERE contype='f' AND (confrelid IN ('auth.users'::regclass,
 'public.study_sessions'::regclass,'public.question_attempts'::regclass))
ORDER BY conrelid::regclass::text, confrelid::regclass::text;
SELECT tgrelid::regclass AS relation, pg_get_triggerdef(oid),pg_get_functiondef(tgfoid)
FROM pg_trigger WHERE NOT tgisinternal AND
 (tgrelid='auth.users'::regclass OR tgrelid IN
 (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace))
ORDER BY tgrelid, tgname;
SELECT * FROM pg_prepared_xacts;
-- Capture full 28-relation + configuration metadata; catalog only, no auth row values.
SELECT (WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
), scope(oid) AS (SELECT oid FROM reach UNION SELECT 'public.trusted_study_config'::regclass::oid)
SELECT jsonb_build_object(
 'event_settings',jsonb_build_array(current_setting('event_triggers',true),current_setting('session_replication_role')),
 'event_functions',(SELECT jsonb_agg(jsonb_build_object('name',e.evtname,'function',e.evtfoid,
 'owner',p.proowner,'security_definer',p.prosecdef,'settings',p.proconfig,'acl_null',p.proacl IS NULL,
 'acl',ARRAY(SELECT z::text FROM unnest(p.proacl) z ORDER BY z::text),
 'effective',(SELECT jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY r)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r)) ORDER BY e.evtname)
 FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid),
 'schemas',(SELECT jsonb_agg(jsonb_build_array(n.oid,n.nspname,n.nspowner,n.nspacl IS NULL,
 ARRAY(SELECT z::text FROM unnest(n.nspacl) z ORDER BY z::text),
 (SELECT jsonb_agg(jsonb_build_array(r,has_schema_privilege(r,n.oid,'USAGE'),has_schema_privilege(r,n.oid,'CREATE')) ORDER BY r)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r)) ORDER BY n.oid)
 FROM pg_namespace n WHERE n.oid IN(SELECT relnamespace FROM pg_class WHERE oid IN(SELECT oid FROM scope))),
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.oid::regclass::text,
 'kind',c.relkind,'persistence',c.relpersistence,'access_method',c.relam,'owner',c.relowner,
 'partition',c.relispartition,'replica_identity',c.relreplident,'options',c.reloptions,
 'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl_null',c.relacl IS NULL,
 'acl',ARRAY(SELECT z::text FROM unnest(c.relacl) z ORDER BY z::text),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,
 a.attnotnull,a.attidentity,a.attgenerated,a.attacl IS NULL,
 a.attcollation,a.attstorage,a.attcompression,a.attislocal,a.attinhcount,
 ARRAY(SELECT z::text FROM unnest(a.attacl) z ORDER BY z::text),pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'effective',(SELECT jsonb_agg(jsonb_build_array(r,priv,has_table_privilege(r,c.oid,priv)) ORDER BY r,priv)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) priv),
 'effective_columns',(SELECT jsonb_agg(jsonb_build_array(r,a.attnum,priv,has_column_privilege(r,c.oid,a.attnum,priv)) ORDER BY r,a.attnum,priv)
 FROM pg_attribute a CROSS JOIN unnest(ARRAY['postgres','anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) priv
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.oid)
 FROM pg_class c WHERE c.oid IN(SELECT oid FROM scope)),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(oid,conrelid,confrelid,conname,contype,
 convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY oid)
 FROM pg_constraint WHERE conrelid IN(SELECT oid FROM scope) OR confrelid IN(SELECT oid FROM scope)),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexrelid,indrelid,indisvalid,indisready,
 pg_get_indexdef(indexrelid)) ORDER BY indexrelid) FROM pg_index WHERE indrelid IN(SELECT oid FROM scope)),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY polrelid,polname) FROM pg_policy p WHERE polrelid IN(SELECT oid FROM scope)),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid,t.tgrelid,t.tgname,t.tgisinternal,t.tgconstraint,
 t.tgenabled,pg_get_triggerdef(t.oid),t.tgfoid,p.proowner,p.prosecdef,p.proconfig,p.proacl IS NULL,
 ARRAY(SELECT z::text FROM unnest(p.proacl) z ORDER BY z::text),
 (SELECT jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY r)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r),
 CASE WHEN NOT t.tgisinternal THEN pg_get_functiondef(p.oid) END) ORDER BY t.tgrelid,t.tgname)
 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN(SELECT oid FROM scope)),
 'dependencies',(SELECT jsonb_agg(jsonb_build_array(d.refobjid,d.refobjsubid,d.classid,d.objid,d.objsubid,d.deptype)
 ORDER BY d.refobjid,d.refobjsubid,d.classid,d.objid,d.objsubid,d.deptype) FROM pg_depend d
 WHERE d.refclassid='pg_class'::regclass AND d.refobjid IN(SELECT oid FROM scope)),
 'inheritance',(SELECT jsonb_agg(to_jsonb(i) ORDER BY inhparent,inhrelid,inhseqno) FROM pg_inherits i
 WHERE inhparent IN(SELECT oid FROM scope) OR inhrelid IN(SELECT oid FROM scope)),
 'role_attributes',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcanlogin,rolbypassrls) ORDER BY rolname)
 FROM pg_roles WHERE rolname IN('postgres','anon','authenticated','service_role','pg_read_all_stats')))) AS coverage_metadata;
ROLLBACK;
```

Before opening O/A/B/C/D/M, compare the fresh catalog to CATALOG_COVERAGE_REVIEW.md and its captured 28-node/33-FK contract. Review every changed edge/action/owner/constraint/index/policy/trigger/event definition; no silent re-baselining. The added metadata output must establish permanent ordinary-table persistence, no inheritance and the complete managed-auth schema. Existing N6 capture did not establish all those fields. Require current ingress/job quiescence and existing SET-role/monitor capability; actual six-session proof is the separate read-only handshake, not a pre-existing fact. Do not create a helper for this review. No connection or writes are authorized by this document. Use the separately prepared COVERAGE_READ_ONLY_RECHECK.psql only after read-only authorization.

Record all actual migration version/name rows. Require exactly one `202610160027 / trusted_cutover_and_attempt_numbering`; retain earlier rows verbatim. Require exactly config id 1 false and all ten counts zero, optional XP table absent or empty. The read-only transaction reports `on` by design; separately establish writable owner capability through session metadata outside it **only after authorization**, without a write probe. PostgreSQL server version must be captured, not inferred from psql 17.11.

## 2. Shared session initialization — future authorized run only

Run in O/A/B/C/D (M uses only application_name and read-only monitor queries). Replace `revit-n2-O` with the exact label. Confirm all six distinct PIDs in M; capture a PID at each later BEGIN and confirm it matches initialization. A changed PID or lost connection aborts the run. The SQL marker below is an operator attestation after independent endpoint verification, never independent project proof.

```sql
\set ON_ERROR_STOP on
\set VERBOSITY verbose
\pset pager off
SET application_name = 'revit-n2-O';
SET revit.test_target = 'qnepjfcbzsycmesrcbjb';
SET search_path = pg_catalog,public,pg_temp;
SET TimeZone = 'UTC';
SET DateStyle = 'ISO, YMD';
SET default_transaction_isolation = 'read committed';
SET statement_timeout = '90s';
SET lock_timeout = '60s';
SET idle_in_transaction_session_timeout = '120s';
SELECT current_user='postgres' AND session_user='postgres'
 AND current_setting('transaction_read_only')='off' AS owner_executor_writable \gset
\if :owner_executor_writable
\else
\echo OWNER_EXECUTOR_NOT_WRITABLE_STOP_NO_OVERRIDE
SELECT 1/0 AS prerequisite_failed_stop;
\endif
SELECT pg_backend_pid() AS initial_pid \gset
-- Fresh approved catalog contract, before any pg_temp helper creation.
-- md5 is a normalized-definition drift check, not target authentication.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
WITH RECURSIVE expected(name,event,tags,signature,definition_md5) AS (VALUES
 ('issue_graphql_placeholder','sql_drop',ARRAY['DROP EXTENSION']::text[],'extensions.set_graphql_placeholder()','f370151e9464a57aa228d1ed2ab4d44d'),
 ('issue_pg_cron_access','ddl_command_end',ARRAY['CREATE EXTENSION']::text[],'extensions.grant_pg_cron_access()','83fd5bb1dbcdec0803a0f6850bfc01c3'),
 ('issue_pg_graphql_access','ddl_command_end',ARRAY['CREATE EXTENSION']::text[],'extensions.grant_pg_graphql_access()','74a0af7dce99c5ca229364cf7034925a'),
 ('issue_pg_net_access','ddl_command_end',ARRAY['CREATE EXTENSION']::text[],'extensions.grant_pg_net_access()','9b066bbc48eb98ab24b1427aad98bfa6'),
 ('pgrst_ddl_watch','ddl_command_end',NULL::text[],'extensions.pgrst_ddl_watch()','5636b78e87c4fa9f6930340cefe67115'),
 ('pgrst_drop_watch','sql_drop',NULL::text[],'extensions.pgrst_drop_watch()','6fb5a1ec0ed602a0e1d958a452efb104')
), actual AS (
 SELECT e.evtname::text AS name,e.evtevent::text AS event,e.evttags AS tags,
 e.evtenabled,pg_get_userbyid(e.evtowner) AS owner,pg_get_userbyid(p.proowner) AS function_owner,
 e.evtfoid,
 md5(btrim(regexp_replace(replace(pg_get_functiondef(e.evtfoid),E'\r\n',E'\n'),
 E'[ \t]+$', '', 'gn'),E' \t\r\n')) AS definition_md5
 FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid
), reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
), graph AS (
 SELECT md5(jsonb_agg(jsonb_build_array(c.conname::text,n.nspname||'.'||child.relname,
 pn.nspname||'.'||parent.relname,c.conkey::text,c.confkey::text,c.confdeltype::text,
 c.confupdtype::text,c.condeferrable,c.condeferred,c.convalidated,pg_get_constraintdef(c.oid))
 ORDER BY (n.nspname||'.'||child.relname) COLLATE "C",c.conname::text COLLATE "C")::text) AS fingerprint
 FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
 JOIN pg_namespace n ON n.oid=child.relnamespace JOIN pg_class parent ON parent.oid=c.confrelid
 JOIN pg_namespace pn ON pn.oid=parent.relnamespace
 WHERE c.contype='f' AND (c.confrelid IN(SELECT oid FROM reach) OR c.conrelid IN(SELECT oid FROM reach)
 OR c.confrelid='public.trusted_study_config'::regclass OR c.conrelid='public.trusted_study_config'::regclass)
), trigger_graph AS (
 SELECT md5(jsonb_agg(jsonb_build_array(n.nspname||'.'||c.relname,t.tgname::text,t.tgisinternal,
 t.tgconstraint::integer,t.tgenabled::text,pg_get_triggerdef(t.oid),p.oid::regprocedure::text,
 pg_get_userbyid(p.proowner)::text,p.prosecdef,p.proconfig::text,
 CASE WHEN NOT t.tgisinternal THEN md5(btrim(regexp_replace(replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'),
 E'[ \t]+$', '', 'gn'),E' \t\r\n')) END)
 ORDER BY (n.nspname||'.'||c.relname) COLLATE "C",t.tgname::text COLLATE "C")::text) AS fingerprint
 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE t.tgrelid IN(SELECT oid FROM reach) OR t.tgrelid='public.trusted_study_config'::regclass
)
SELECT current_user='postgres' AND session_user='postgres'
 AND current_setting('transaction_read_only')='on' AND current_setting('transaction_isolation')='read committed'
 AND current_setting('session_replication_role')='origin'
 AND coalesce(current_setting('event_triggers',true),'missing')='on'
 AND (SELECT fingerprint='c97fef3a674d6d2ae5ead3ebaf4c8f7d' FROM graph)
 AND (SELECT fingerprint='cb4f6ac47d7a4454d97cef2c507d2e1a' FROM trigger_graph)
 AND (SELECT count(*)=6 FROM actual) AND count(a.name)=6 AND
 bool_and((a.event=x.event AND a.tags IS NOT DISTINCT FROM x.tags AND a.evtenabled='O'
 AND a.owner='supabase_admin' AND a.function_owner='supabase_admin'
 AND a.evtfoid=to_regprocedure(x.signature) AND a.definition_md5=x.definition_md5) IS TRUE)
 AS coverage_catalog_ok FROM expected x LEFT JOIN actual a USING(name) \gset
ROLLBACK;
\if :coverage_catalog_ok
\else
\echo CATALOG_COVERAGE_CONTRACT_DRIFT_STOP_BEFORE_HELPERS
SELECT 1/0 AS prerequisite_failed_stop;
\endif
CREATE FUNCTION pg_temp.check_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF current_user <> 'postgres' OR session_user <> 'postgres'
 OR current_setting('revit.test_target',true) IS DISTINCT FROM 'qnepjfcbzsycmesrcbjb'
 OR current_setting('transaction_isolation') <> 'read committed'
 OR current_setting('transaction_read_only') <> 'off'
 OR current_setting('session_replication_role') <> 'origin'
 OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
  RAISE EXCEPTION 'Staging owner/session precondition failed';
 END IF;
END $$;
SELECT pg_temp.check_owner();
CREATE FUNCTION pg_temp.check_pid(expected integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF pg_backend_pid()<>expected THEN RAISE EXCEPTION 'Backend changed'; END IF; END $$;
CREATE FUNCTION pg_temp.require(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.item(id uuid,q text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('id',id,'question_id',q,'session_slot',0,
 'subject_id','synthetic','subject_name','Synthetic','topic_id','synthetic',
 'topic_name','Synthetic','subtopic','Synthetic','difficulty','Unspecified',
 'book','Harr','content_version','synthetic-v1','response_digest',repeat('a',64),
 'selected_answer',0,'is_correct',true)
$$;
\set owner '3e9a0000-3a2e-4e60-8000-000000000001'
```

Timeouts are bounds, not synchronization. Stage windows must fit inside 60 seconds of actual lock waiting and 120 seconds idle transaction time. Rehearse terminal arrangement without database calls. Any 55P03, 57014, 40P01, disconnect, timeout, unexpected success/error, missing monitor visibility or failed assertion stops all further test steps. Roll back open transactions, retain evidence, then follow abort cleanup. Never retry a failed stage over partially committed fixtures or declare missing evidence PASS.

## 3. Immutable fixture manifest

Single-use run `phase3n-n2-20261016`; reject collisions, never reuse existing rows. All UUIDs share prefix `3e9a0000-3a2e-4e60-8000-`; suffixes below are the last twelve characters. One owner `000000000001`, email `phase3n-n2-20261016@revit.invalid`, metadata username `n2_20261016_owner`.

| Object | Suffix / exact synthetic question | Ownership |
|---|---|---|
| S6 B session/request | `000000001001` / `000000003001` | owner, adaptive, target 1 |
| S6 C session/request | `000000001002` / `000000003002` | owner, wrong_answers, target 1 |
| S12 forward session/request | `000000001011` / `000000003011` | owner, reviewer, target 1 |
| S12 reverse session/request | `000000001012` / `000000003012` | owner, reviewer, target 1 |
| Profile / preference seed keys | owner UUID / owner UUID | profiles.id / user_preferences.user_id |
| Progress seed key | `000000004001` | user_progress.id; owner UUID; assigned before setup COMMIT |
| S6 historical attempts | `000000002001`, `000000002002` | owner; numbers 1, 7 |
| S6 new attempts B/C | `000000002101`, `000000002102` | respective S6 sessions, slot 0 |
| S12 forward/reverse attempts | `000000002111`, `000000002112` | respective sessions, slot 0 |
| Disabled fresh attempt | `000000002113` | reverse session, slot 0; must never persist |
| Question S6 | `phase3n-n2-20261016-s6` | shared across S6 sessions |
| Question S12 forward | `phase3n-n2-20261016-forward` | forward only |
| Question S12 reverse | `phase3n-n2-20261016-reverse` | reverse only |

All content versions `synthetic-v1`; all attempt digests 64 `a`, request digests 64 `b`. Direct owner-created issued-session fixtures isolate commit concurrency; this pack does not test the issuance RPC. The captured bootstrap's single auth trigger seeds profiles/preferences/progress. Profile/preference keys equal owner; progress receives the manifest ID before COMMIT (its initial random default is never committed). Assert exactly these three seed rows and snapshot/export their values **inside** setup before COMMIT. Those seed rows are not RPC reward writes. No synthetic account signs in; no real transport enabled.

## 4. O baseline and durable restoration material (before first committed write)

Create local ignored `scratch/phase3n-n2-evidence/` manually before the future run; no secrets in its files. Start SQL output capture only after authentication. The following temporary helper snapshots full targeted row values, registry rows, trusted/legacy/leaderboard definitions, normalized direct ACLs, effective rights, memberships, public table metadata, policies and triggers. No persistent helper/schema is created. Keep O alive; export baseline and restore SQL **before** fencing. Review both exports and confirm files exist and contain complete SQL. Do not infer preservation merely from counts.

Refuse existing baseline.json, seed.json or restore-body.sql before export; never overwrite earlier evidence. Record export hashes before the first setup COMMIT. Auth rows are restricted to the manifest owner and a non-secret projection; no auth password/token fields or managed-auth records are serialized. Every accepted reachable table must be empty before setup. The generated pre-commit seed file describes tentative values until the setup COMMIT acknowledgement or a separate read-only reconciliation establishes committed state.

```sql
CREATE FUNCTION pg_temp.dependency_counts() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE names text[]; t text; n bigint; counts jsonb:='{}';
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR
 NOT coalesce((SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),false) THEN
  RAISE EXCEPTION 'Existing owner/bypass boundary required; no filtered empty counts';
 END IF;
 WITH RECURSIVE reach(oid) AS (
  SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,
  'public.question_attempts'::regclass::oid])
  UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
 ) SELECT array_agg(n.nspname||'.'||c.relname ORDER BY (n.nspname||'.'||c.relname) COLLATE "C") INTO names
 FROM reach r JOIN pg_class c ON c.oid=r.oid JOIN pg_namespace n ON n.oid=c.relnamespace;
 IF names IS DISTINCT FROM ARRAY[
 'auth.identities','auth.mfa_amr_claims','auth.mfa_challenges','auth.mfa_factors',
 'auth.mfa_recovery_code_sets','auth.mfa_recovery_codes','auth.oauth_authorizations','auth.oauth_consents',
 'auth.one_time_tokens','auth.refresh_tokens','auth.scim_users','auth.sessions',
 'auth.users','auth.webauthn_challenges','auth.webauthn_credentials','public.activity_events',
 'public.ai_chats','public.ai_messages','public.daily_activity','public.exam_schedule',
 'public.grades','public.profiles','public.question_attempts','public.question_reinforcement',
 'public.study_sessions','public.user_achievements','public.user_preferences','public.user_progress']::text[] THEN
  RAISE EXCEPTION 'Unreviewed dependency closure; recheck source before any writes';
 END IF;
 -- Capture has ordinary managed/public tables only. Do not adopt partitions/inheritance.
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
  WHERE c.oid IN(SELECT to_regclass(x) FROM unnest(names) x) AND
  (c.relkind<>'r' OR c.relpersistence<>'p' OR
   pg_get_userbyid(c.relowner)<>CASE WHEN s.nspname='auth' THEN 'supabase_auth_admin' ELSE 'postgres' END))
 OR EXISTS(SELECT FROM pg_inherits i WHERE i.inhparent IN(SELECT to_regclass(x) FROM unnest(names) x)
 OR i.inhrelid IN(SELECT to_regclass(x) FROM unnest(names) x)) THEN
  RAISE EXCEPTION 'Unreviewed owner/persistence/type/inheritance; no count or cleanup expansion';
 END IF;
 FOREACH t IN ARRAY names LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I',split_part(t,'.',1),split_part(t,'.',2)) INTO n;
  counts:=counts||jsonb_build_object(t,n);
 END LOOP;
 RETURN counts;
END $$;
CREATE FUNCTION pg_temp.snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE data jsonb:='{}'; t text; rows jsonb; meta jsonb; foreign_owner boolean;
BEGIN
 IF EXISTS(SELECT FROM jsonb_each_text(pg_temp.dependency_counts()) d
 WHERE d.key NOT IN('auth.users','public.profiles','public.user_preferences','public.user_progress',
 'public.study_sessions','public.question_attempts') AND d.value::bigint<>0) THEN
  RAISE EXCEPTION 'Untracked dependent row: preserve evidence; never export/delete auth descendants';
 END IF;
 IF EXISTS(SELECT FROM auth.users WHERE id<>'3e9a0000-3a2e-4e60-8000-000000000001'
 OR email IS DISTINCT FROM 'phase3n-n2-20261016@revit.invalid') THEN
  RAISE EXCEPTION 'Unrelated auth user present; do not snapshot credentials or private rows';
 END IF;
 FOREACH t IN ARRAY ARRAY['public.profiles','public.user_preferences','public.user_progress',
 'public.study_sessions','public.question_attempts'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT FROM %s WHERE (%I = %L::uuid) IS NOT TRUE)',
   t,CASE WHEN t='public.profiles' THEN 'id' ELSE 'user_id' END,
   '3e9a0000-3a2e-4e60-8000-000000000001') INTO foreign_owner;
  IF foreign_owner THEN RAISE EXCEPTION 'Untracked owner before snapshot: %',t; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['auth.users','public.profiles','public.user_preferences',
 'public.study_sessions','public.question_attempts','public.activity_events',
 'public.daily_activity','public.user_progress','public.user_achievements',
 'public.question_reinforcement','public.user_xp_transactions','public.trusted_study_config'] LOOP
  IF to_regclass(t) IS NULL THEN rows:='null';
  ELSIF t='auth.users' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) INTO rows
   FROM (SELECT u.id,u.aud,u.role,u.email,u.created_at,u.updated_at,
   md5(to_jsonb(u)::text) AS full_row_md5 FROM auth.users u) x;
  ELSE
   EXECUTE format('SELECT coalesce(jsonb_agg(j ORDER BY j::text),''[]''::jsonb) FROM (SELECT to_jsonb(x) j FROM %s x) s',t) INTO rows;
  END IF;
  data:=data||jsonb_build_object(t,rows);
 END LOOP;
 SELECT jsonb_build_object(
 'coverage',(WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f'
), scope(oid) AS (SELECT oid FROM reach UNION SELECT 'public.trusted_study_config'::regclass::oid)
SELECT jsonb_build_object(
 'event_settings',jsonb_build_array(current_setting('event_triggers',true),current_setting('session_replication_role')),
 'event_functions',(SELECT jsonb_agg(jsonb_build_object('name',e.evtname,'function',e.evtfoid,
 'owner',p.proowner,'security_definer',p.prosecdef,'settings',p.proconfig,'acl_null',p.proacl IS NULL,
 'acl',ARRAY(SELECT z::text FROM unnest(p.proacl) z ORDER BY z::text),
 'effective',(SELECT jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY r)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r)) ORDER BY e.evtname)
 FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid),
 'schemas',(SELECT jsonb_agg(jsonb_build_array(n.oid,n.nspname,n.nspowner,n.nspacl IS NULL,
 ARRAY(SELECT z::text FROM unnest(n.nspacl) z ORDER BY z::text),
 (SELECT jsonb_agg(jsonb_build_array(r,has_schema_privilege(r,n.oid,'USAGE'),has_schema_privilege(r,n.oid,'CREATE')) ORDER BY r)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r)) ORDER BY n.oid)
 FROM pg_namespace n WHERE n.oid IN(SELECT relnamespace FROM pg_class WHERE oid IN(SELECT oid FROM scope))),
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.oid::regclass::text,
 'kind',c.relkind,'persistence',c.relpersistence,'access_method',c.relam,'owner',c.relowner,
 'partition',c.relispartition,'replica_identity',c.relreplident,'options',c.reloptions,
 'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl_null',c.relacl IS NULL,
 'acl',ARRAY(SELECT z::text FROM unnest(c.relacl) z ORDER BY z::text),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,
 a.attnotnull,a.attidentity,a.attgenerated,a.attacl IS NULL,
 a.attcollation,a.attstorage,a.attcompression,a.attislocal,a.attinhcount,
 ARRAY(SELECT z::text FROM unnest(a.attacl) z ORDER BY z::text),pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'effective',(SELECT jsonb_agg(jsonb_build_array(r,priv,has_table_privilege(r,c.oid,priv)) ORDER BY r,priv)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) priv),
 'effective_columns',(SELECT jsonb_agg(jsonb_build_array(r,a.attnum,priv,has_column_privilege(r,c.oid,a.attnum,priv)) ORDER BY r,a.attnum,priv)
 FROM pg_attribute a CROSS JOIN unnest(ARRAY['postgres','anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) priv
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.oid)
 FROM pg_class c WHERE c.oid IN(SELECT oid FROM scope)),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(oid,conrelid,confrelid,conname,contype,
 convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY oid)
 FROM pg_constraint WHERE conrelid IN(SELECT oid FROM scope) OR confrelid IN(SELECT oid FROM scope)),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexrelid,indrelid,indisvalid,indisready,
 pg_get_indexdef(indexrelid)) ORDER BY indexrelid) FROM pg_index WHERE indrelid IN(SELECT oid FROM scope)),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY polrelid,polname) FROM pg_policy p WHERE polrelid IN(SELECT oid FROM scope)),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid,t.tgrelid,t.tgname,t.tgisinternal,t.tgconstraint,
 t.tgenabled,pg_get_triggerdef(t.oid),t.tgfoid,p.proowner,p.prosecdef,p.proconfig,p.proacl IS NULL,
 ARRAY(SELECT z::text FROM unnest(p.proacl) z ORDER BY z::text),
 (SELECT jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY r)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r),
 CASE WHEN NOT t.tgisinternal THEN pg_get_functiondef(p.oid) END) ORDER BY t.tgrelid,t.tgname)
 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN(SELECT oid FROM scope)),
 'dependencies',(SELECT jsonb_agg(jsonb_build_array(d.refobjid,d.refobjsubid,d.classid,d.objid,d.objsubid,d.deptype)
 ORDER BY d.refobjid,d.refobjsubid,d.classid,d.objid,d.objsubid,d.deptype) FROM pg_depend d
 WHERE d.refclassid='pg_class'::regclass AND d.refobjid IN(SELECT oid FROM scope)),
 'inheritance',(SELECT jsonb_agg(to_jsonb(i) ORDER BY inhparent,inhrelid,inhseqno) FROM pg_inherits i
 WHERE inhparent IN(SELECT oid FROM scope) OR inhrelid IN(SELECT oid FROM scope)),
 'role_attributes',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcanlogin,rolbypassrls) ORDER BY rolname)
 FROM pg_roles WHERE rolname IN('postgres','anon','authenticated','service_role','pg_read_all_stats')))),
 'registry',(SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM supabase_migrations.schema_migrations m),
 'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,
 'definition',pg_get_functiondef(p.oid),'acl_null',p.proacl IS NULL,
 'acl',ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text),
 'effective',jsonb_build_array(has_function_privilege('anon',p.oid,'EXECUTE'),
 has_function_privilege('authenticated',p.oid,'EXECUTE'),has_function_privilege('service_role',p.oid,'EXECUTE')))
 ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
 ('assert_trusted_study_enabled','create_verified_study_session','commit_verified_study_batch',
 'record_question_attempt','record_study_activity','record_progression_award',
 'check_and_unlock_achievements','leaderboard_metric_rows')),
 'tables',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'owner',c.relowner,'rls',c.relrowsecurity,
 'force_rls',c.relforcerowsecurity,'acl_null',c.relacl IS NULL,
 'acl',ARRAY(SELECT a::text FROM unnest(c.relacl) a ORDER BY a::text),
 'columns',(SELECT jsonb_agg(jsonb_build_object('n',a.attnum,'name',a.attname,'type',a.atttypid,
 'acl_null',a.attacl IS NULL,'acl',ARRAY(SELECT z::text FROM unnest(a.attacl) z ORDER BY z::text)) ORDER BY a.attnum)
 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'effective',(SELECT jsonb_agg(jsonb_build_array(r,priv,has_table_privilege(r,c.oid,priv)) ORDER BY r,priv)
 FROM unnest(ARRAY['postgres','anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) priv),
 'effective_columns',(SELECT jsonb_agg(jsonb_build_array(r,a.attnum,priv,has_column_privilege(r,c.oid,a.attnum,priv)) ORDER BY r,a.attnum,priv)
 FROM pg_attribute a CROSS JOIN unnest(ARRAY['postgres','anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) priv
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.oid)
 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
 'foreign_keys',(WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f')
 SELECT jsonb_agg(jsonb_build_array(oid,conrelid,confrelid,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY oid)
 FROM pg_constraint WHERE contype='f' AND (connamespace='public'::regnamespace OR confrelid IN(SELECT oid FROM reach) OR conrelid IN(SELECT oid FROM reach))),
 'event_triggers',(SELECT jsonb_agg(jsonb_build_array(evtname,evtevent,evtenabled,evttags,evtowner,
 (SELECT proowner FROM pg_proc WHERE pg_proc.oid=evtfoid),
 pg_get_functiondef(evtfoid)) ORDER BY evtname) FROM pg_event_trigger),
 'triggers',(WITH RECURSIVE reach(oid) AS (
 SELECT unnest(ARRAY['auth.users'::regclass::oid,'public.study_sessions'::regclass::oid,'public.question_attempts'::regclass::oid])
 UNION SELECT c.conrelid FROM pg_constraint c JOIN reach r ON r.oid=c.confrelid WHERE c.contype='f')
 SELECT jsonb_agg(jsonb_build_array(tgrelid,tgname,tgenabled,pg_get_triggerdef(oid),pg_get_functiondef(tgfoid),
 (SELECT proowner FROM pg_proc WHERE pg_proc.oid=tgfoid)) ORDER BY tgrelid,tgname)
 FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid='auth.users'::regclass OR tgrelid IN
 (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) OR tgrelid IN(SELECT oid FROM reach)))
 ) INTO meta;
 RETURN jsonb_build_object('data',data,'meta',meta,'dependency_counts',pg_temp.dependency_counts());
END $$;
SELECT pg_temp.require((SELECT count(*)=1 AND bool_and(id=1 AND NOT enabled) FROM public.trusted_study_config),'one disabled config');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM pg_prepared_xacts),'no prepared transactions');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM jsonb_each_text(pg_temp.dependency_counts()) d WHERE d.value::bigint<>0),'all accepted dependent tables empty');
SELECT pg_temp.require((SELECT count(*)=1 FROM supabase_migrations.schema_migrations
 WHERE version='202610160027' AND name='trusted_cutover_and_attempt_numbering'),'migration 27');
DO $$ DECLARE t text; n bigint; BEGIN
 FOREACH t IN ARRAY ARRAY['auth.users','public.profiles','public.user_preferences','public.study_sessions',
 'public.question_attempts','public.activity_events','public.daily_activity','public.user_progress',
 'public.user_achievements','public.question_reinforcement','public.user_xp_transactions'] LOOP
  IF to_regclass(t) IS NOT NULL THEN EXECUTE format('SELECT count(*) FROM %s',t) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Disposable empty prerequisite failed: %',t; END IF;
  END IF;
 END LOOP;
END $$;
```

This restoration generator deliberately supports only existing owner-issued direct ACLs on the touched privileges, with no NULL ACL reset ambiguity or column-level write grants. An unsupported grantor, NULL touched ACL, or column write grant stops **before** writes. It does not attempt to repair role inheritance. The original touched fence tables have no column ACLs; profiles are outside this fence and retain their existing column ACLs. Fresh verification is mandatory. Grant options are preserved. Restoration is exact semantic ACL equality (sorted ACL items), not grant-array ordering.

```sql
CREATE TEMP VIEW n2_functions AS SELECT p.oid,p.proowner,p.proacl,p.oid::regprocedure AS obj
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
 ('record_question_attempt','record_study_activity','record_progression_award','check_and_unlock_achievements');
CREATE TEMP VIEW n2_tables AS SELECT c.oid,c.relowner,c.relacl,c.oid::regclass AS obj
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN
 ('question_attempts','activity_events','daily_activity','user_progress','user_achievements',
 'user_xp_transactions','question_reinforcement','study_sessions','trusted_study_config');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM n2_functions WHERE proacl IS NULL OR proowner<>'postgres'::regrole)
 AND NOT EXISTS(SELECT FROM n2_tables WHERE relacl IS NULL OR relowner<>'postgres'::regrole),'supported explicit owner ACLs');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM pg_attribute WHERE attrelid IN(SELECT oid FROM n2_tables)
 AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL),'no column ACL mutation needed');
CREATE TEMP TABLE n2_restore(seq integer,sql text);
INSERT INTO n2_restore
SELECT 10,format('GRANT %s ON FUNCTION %s TO %s%s;',a.privilege_type,f.obj,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM n2_functions f CROSS JOIN LATERAL aclexplode(f.proacl) a
WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole);
INSERT INTO n2_restore
SELECT 20,format('GRANT %s ON TABLE %s TO %s%s;',a.privilege_type,t.obj,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM n2_tables t CROSS JOIN LATERAL aclexplode(t.relacl) a
WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole)
 AND a.privilege_type IN('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER');
SELECT pg_temp.require(NOT EXISTS(
 SELECT FROM n2_functions f CROSS JOIN LATERAL aclexplode(f.proacl) a
 WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole) AND a.grantor<>f.proowner)
 AND NOT EXISTS(SELECT FROM n2_tables t CROSS JOIN LATERAL aclexplode(t.relacl) a
 WHERE a.grantee IN(0,'anon'::regrole,'authenticated'::regrole)
 AND a.privilege_type IN('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER') AND a.grantor<>t.relowner),
 'restore grantors must equal owner');
-- All empty/config/registry and ACL-restorability guards precede serialization/export.
CREATE TEMP TABLE n2_baseline AS SELECT pg_temp.snapshot() AS j;
\copy (SELECT j FROM n2_baseline) TO 'scratch/phase3n-n2-evidence/baseline.json' WITH (FORMAT text)
INSERT INTO n2_restore SELECT 30,format(
 'UPDATE public.trusted_study_config SET enabled=false,updated_at=%L::timestamptz WHERE id=1;',updated_at)
FROM public.trusted_study_config WHERE id=1;
\copy (SELECT sql FROM n2_restore ORDER BY seq,sql) TO 'scratch/phase3n-n2-evidence/restore-body.sql' WITH (FORMAT text)
```

Exports use text COPY escaping: before future execution, verify restore-body.sql contains no COPY backslash escapes in these fixed identifiers/timestamps. If any appear, stop and prepare a correctly quoted export; do not execute an escaped file. Baseline reimport uses `\copy ... FROM ... WITH (FORMAT text)` into a single jsonb column, decoding escapes. Baseline files are run-specific, never regenerate after mutation. Recovery requires the original exports; never reconstruct grants from memory.

## 5. O atomic setup — separately authorized committed writes

First capture the full activity inventory in M and obtain stopped-ingress/drained attestation. Exclude only the six identified test backends; **any other client backend with an open transaction** blocks setup. Review other active sessions even without xact_start; query text alone cannot certify absence of writers. No automatic termination of unrelated backends. Then in O:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE;
SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_baseline),'no drift since baseline');
-- RESTRICT is intentional: dependent grants/inherited rights abort; never use CASCADE.
SELECT format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated RESTRICT;',obj)
FROM n2_functions ORDER BY oid \gexec
SELECT format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER ON TABLE %s FROM PUBLIC,anon,authenticated RESTRICT;',obj)
FROM n2_tables ORDER BY oid \gexec
UPDATE public.trusted_study_config SET enabled=true,updated_at=clock_timestamp() WHERE id=1;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT public.assert_trusted_study_enabled(); -- owner probe, NOT actual worker-role proof
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,email_confirmed_at,created_at,updated_at)
VALUES ('3e9a0000-3a2e-4e60-8000-000000000001','authenticated','authenticated',
 'phase3n-n2-20261016@revit.invalid','{"username":"n2_20261016_owner"}',now(),now(),now());
UPDATE public.user_progress SET id='3e9a0000-3a2e-4e60-8000-000000004001'
WHERE user_id='3e9a0000-3a2e-4e60-8000-000000000001';
SELECT pg_temp.require((SELECT count(*)=1 AND bool_and(id='3e9a0000-3a2e-4e60-8000-000000004001')
 FROM public.user_progress WHERE user_id='3e9a0000-3a2e-4e60-8000-000000000001'),'progress manifest seed');
INSERT INTO public.study_sessions(id,user_id,request_id,mode,target_count,question_pool,request_digest)
SELECT ('3e9a0000-3a2e-4e60-8000-'||s)::uuid,'3e9a0000-3a2e-4e60-8000-000000000001',
 ('3e9a0000-3a2e-4e60-8000-'||r)::uuid,m,1,
 jsonb_build_array(jsonb_build_object('question_id',q,'content_version','synthetic-v1')),repeat('b',64)
FROM (VALUES ('000000001001','000000003001','adaptive','phase3n-n2-20261016-s6'),
 ('000000001002','000000003002','wrong_answers','phase3n-n2-20261016-s6'),
 ('000000001011','000000003011','reviewer','phase3n-n2-20261016-forward'),
 ('000000001012','000000003012','reviewer','phase3n-n2-20261016-reverse')) f(s,r,m,q);
INSERT INTO public.question_attempts(id,user_id,question_id,subject_id,subject_name,topic_id,topic_name,
 subtopic,difficulty,selected_answer,is_correct,attempt_number,review_mode,answered_at,book)
SELECT ('3e9a0000-3a2e-4e60-8000-'||i)::uuid,'3e9a0000-3a2e-4e60-8000-000000000001',
 'phase3n-n2-20261016-s6','synthetic','Synthetic','synthetic','Synthetic','Synthetic',
 'Unspecified',0,true,n,'reviewer',clock_timestamp(),'Harr'
FROM (VALUES('000000002001',1),('000000002002',7)) f(i,n);
CREATE TEMP TABLE n2_seed AS SELECT pg_temp.snapshot() AS j;
\copy (SELECT j FROM n2_seed) TO 'scratch/phase3n-n2-evidence/seed.json' WITH (FORMAT text)
SELECT pg_temp.require((SELECT count(*)=1 FROM auth.users)
 AND (SELECT count(*)=4 FROM public.study_sessions)
 AND (SELECT count(*)=2 FROM public.question_attempts)
 AND (SELECT count(*)=1 FROM public.profiles)
 AND (SELECT count(*)=1 FROM public.user_preferences)
 AND (SELECT count(*)=1 FROM public.user_progress),'setup manifest counts');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM jsonb_each_text(pg_temp.dependency_counts()) d
 WHERE d.key NOT IN('auth.users','public.profiles','public.user_preferences','public.user_progress',
 'public.study_sessions','public.question_attempts') AND d.value::bigint<>0),'no untracked trigger-created children');
COMMIT;
\echo N2_SETUP_COMMIT_ACKNOWLEDGED
```

Require exactly one owned auth user, four sessions and two attempts, historical `[1,7]`, no unexpected auth-trigger rows outside the reviewed ownership manifest. If setup aborts, `ROLLBACK`; verify original snapshot before attempting any cleanup. If COMMIT acknowledgement is lost, inspect by manifest in a new verified owner session; do not replay INSERTs.

## 6. M evidence queries and barriers

M stays autocommit or starts a **new READ ONLY transaction for each observation**; do not retain an old statistics snapshot. Set `application_name='revit-n2-M'`, statement_timeout 15s. Capture output including clock_timestamp and real PIDs (no connection strings). First query must show exactly six labels, each once, six distinct PIDs and the expected session owner username. `pg_stat_activity.usename` shows login, not B/C's current SQL role; capture role checks inside workers separately.

```sql
SELECT clock_timestamp(),pid,application_name,usename,state,xact_start,
 wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers,
 CASE WHEN application_name IN('revit-n2-O','revit-n2-A','revit-n2-B','revit-n2-C','revit-n2-D','revit-n2-M')
 THEN query ELSE '<non-test SQL omitted>' END AS query
FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid;
SELECT clock_timestamp(),a.application_name,l.pid,l.locktype,l.mode,l.granted,
 l.database,l.relation,l.page,l.tuple,l.virtualxid,l.transactionid,
 l.classid,l.objid,l.objsubid
FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
WHERE a.application_name IN('revit-n2-A','revit-n2-B','revit-n2-C','revit-n2-D')
ORDER BY a.application_name,l.locktype,l.granted,l.mode;
-- Edges retain exact lock identity; row locks often manifest as transactionid waits.
SELECT clock_timestamp(),w.application_name AS waiter,w.pid AS waiter_pid,
 b.application_name AS blocker,b.pid AS blocker_pid
FROM pg_stat_activity w CROSS JOIN LATERAL unnest(pg_blocking_pids(w.pid)) p(pid)
JOIN pg_stat_activity b ON b.pid=p.pid
WHERE w.application_name IN('revit-n2-B','revit-n2-C','revit-n2-D');
SELECT k,hashtextextended(k,0) AS signed_key,
 ((hashtextextended(k,0)>>32)&4294967295::bigint) AS expected_classid,
 (hashtextextended(k,0)&4294967295::bigint) AS expected_objid
FROM (VALUES
 ('3e9a0000-3a2e-4e60-8000-000000000001:trusted-study'),
 ('3e9a0000-3a2e-4e60-8000-000000000001:phase3n-n2-20261016-s6'),
 ('3e9a0000-3a2e-4e60-8000-000000000001:phase3n-n2-20261016-forward')) f(k);
```

For bigint advisory locks require matching database/classid/objid, objsubid=1, blocker granted=true and waiter granted=false; owner/question keys must be distinct in this live engine (abort on collision). For config races record transactionid wait/holder (or visible row-lock evidence), relation locks on `trusted_study_config`, blocking PID edge, exact submitted SQL and the controlled prior question-lock barrier. Relation lock presence alone cannot prove FOR SHARE/UPDATE contention. Missing PID visibility is a blocker; do not change monitor grants. Save one evidence set at each named barrier before release; elapsed overlap is insufficient.

## 7. Scenario 6 choreography

Use all following blocks **in the indicated separate sessions**, pausing at each barrier. Never put them in a single batch that commits before monitoring.

A:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE; SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
SELECT pg_advisory_xact_lock(hashtextextended(
 '3e9a0000-3a2e-4e60-8000-000000000001:phase3n-n2-20261016-s6',0));
-- HOLD until M records B->A and C->B with exact advisory keys.
```

B variable selection (C uses its alternative):

```sql
\set sid '3e9a0000-3a2e-4e60-8000-000000001001'
\set aid '3e9a0000-3a2e-4e60-8000-000000002101'
\set q 'phase3n-n2-20261016-s6'
```

C alternative:

```sql
\set sid '3e9a0000-3a2e-4e60-8000-000000001002'
\set aid '3e9a0000-3a2e-4e60-8000-000000002102'
\set q 'phase3n-n2-20261016-s6'
```

Shared **worker BEGIN/call** block; B first. Only after M sees B waiting on A's question lock start C with this same block:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE;
SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
SELECT jsonb_build_array(pg_temp.item(:'aid'::uuid,:'q')) AS payload \gset
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT current_user,session_user,pg_backend_pid(),current_setting('transaction_isolation');
SELECT * FROM public.commit_verified_study_batch(:'owner'::uuid,:'sid'::uuid,:'payload'::jsonb);
-- HOLD after result; COMMIT only at prescribed barrier.
```

M barrier S6.1: B->A question advisory, C->B owner advisory, all independent PIDs. Then A `COMMIT;`. B must return number 8 while C stays blocked by B; capture result and S6.2 monitor evidence before B `COMMIT;`. C must then return number 9, then C `COMMIT;`. If either number/order/lock relationship differs, fail. M/O query exactly four S6 rows `[1,7,8,9]`, new slots 0, sessions/modes adaptive and wrong_answers respectively, repeat=true, verified_at nonnull, competitive_at null, answered_at=verified_at. No session completed_at change. Save O `CREATE TEMP TABLE n2_s6 AS SELECT pg_temp.snapshot() AS j;` before retries.

In **each B and C**, repeat the shared worker BEGIN/call block with unchanged variables, then `COMMIT;`. Exact retries must return the same complete row (including id, timestamps, provenance and mode); O requires the entire snapshot equal `n2_s6`, not just count. Then in each worker run this conflict block:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE;
SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
SELECT jsonb_build_array(pg_temp.item(:'aid'::uuid,:'q')||jsonb_build_object('response_digest',repeat('f',64))) AS payload \gset
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT current_user,session_user,pg_backend_pid();
SELECT format($probe$DO $assert$ DECLARE actual text; BEGIN
 BEGIN PERFORM public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE;
 RAISE NOTICE 'observed_sqlstate=%% expected=23505',actual;
 IF actual<>'23505' THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected 23505, operation succeeded';
 END $assert$;$probe$,:'owner',:'sid',:'payload') \gexec
ROLLBACK;
```

O runs `SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_s6),'exact retry/conflict snapshot');` after each retry/conflict. The inline invoker DO block logs **actual** caught SQLSTATE; unexpected success/errors stop. Payloads are built before SET ROLE; service-role SQL invokes no owner-only temporary helper and receives no temporary schema/function grants. Sequential retry/conflict checks establish immutability/idempotency after concurrency; no claim of concurrent same-UUID or cross-owner collision is made. Those variants require separate barrier packs/authorization.

## 8. Scenario 12 forward: guarded commit precedes disable

Only after S6 assertions pass. A:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE; SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
SELECT pg_advisory_xact_lock(hashtextextended(
 '3e9a0000-3a2e-4e60-8000-000000000001:phase3n-n2-20261016-forward',0));
```

B selects the following variables, then runs the shared worker BEGIN/call block. M captures B->A exact question key; this proves execution passed guard into question wait.

```sql
\set sid '3e9a0000-3a2e-4e60-8000-000000001011'
\set aid '3e9a0000-3a2e-4e60-8000-000000002111'
\set q 'phase3n-n2-20261016-forward'
```

D, while B waits:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE; SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
UPDATE public.trusted_study_config SET enabled=false,updated_at=clock_timestamp() WHERE id=1
RETURNING id,enabled;
-- HOLD after UPDATE returns; do not COMMIT early.
```

M S12.F1 captures B->A and D->B (config transactionid/row wait) while B retains granted config relation lock. A `COMMIT;`. B returns forward attempt number 1, repeat=false; **leave B open**. M S12.F2 captures D still blocked by B after B's RPC returned. B `COMMIT;`, then D's UPDATE returns false; D still holds transaction open. From O/M outside D confirm committed forward attempt exists and config is still true; capture. Then D `COMMIT;`. O/M must see config false and exactly five total attempts (two history, two S6, one forward).

B selects these variables and runs the following **fresh-error worker** block. This is a fresh disabled RPC, not an immutable retry. Capture actual PT503; O confirms id 2113 absent and total still five.

```sql
\set sid '3e9a0000-3a2e-4e60-8000-000000001012'
\set aid '3e9a0000-3a2e-4e60-8000-000000002113'
\set q 'phase3n-n2-20261016-reverse'
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE;
SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
SELECT jsonb_build_array(pg_temp.item(:'aid'::uuid,:'q')) AS payload \gset
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT current_user,session_user,pg_backend_pid(),current_setting('transaction_isolation');
SELECT format($probe$DO $assert$ DECLARE actual text; BEGIN
 BEGIN PERFORM public.commit_verified_study_batch(%L::uuid,%L::uuid,%L::jsonb);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE;
 RAISE NOTICE 'observed_sqlstate=%% expected=PT503',actual;
 IF actual<>'PT503' THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected PT503, operation succeeded';
 END $assert$;$probe$,:'owner',:'sid',:'payload') \gexec
ROLLBACK;
```

## 9. Scenario 12 reverse: disable wins before guard

O takes `CREATE TEMP TABLE n2_before_reverse AS SELECT pg_temp.snapshot() AS j;`, then only this separately authorized test transition:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE; SELECT pg_temp.check_owner();
UPDATE public.trusted_study_config SET enabled=true,updated_at=clock_timestamp() WHERE id=1;
COMMIT;
```

D runs its disable BEGIN/UPDATE block again and **holds after UPDATE returns**, before COMMIT. B sets the following variables, then runs the fresh-error worker BEGIN through ROLLBACK block from section 8 (without resetting the variables to 2113). It must now block inside the guard, not return yet.

```sql
\set sid '3e9a0000-3a2e-4e60-8000-000000001012'
\set aid '3e9a0000-3a2e-4e60-8000-000000002112'
\set q 'phase3n-n2-20261016-reverse'
```

M S12.R1 captures B->D config transactionid/row wait with exact PIDs. B must have **no granted trusted-owner/question/attempt advisory lock**: the guard has not passed. O/M outside D still sees true and no reverse row. D `COMMIT;`. B must emit actual PT503 and reach ROLLBACK. O/M sees config false, ids 2112/2113 absent and five total attempts, with no session completion or reward/activity change. Record these engine facts before cleanup; do not call the race passing from PT503 alone.

## 10. O exact persistence assertions (before cleanup)

Keep session completion/expiry/created fields byte-equivalent to n2_seed; all non-attempt data except the config row must equal seed. Historical attempts must match full seed JSON, not renumbered. The snapshot includes reward/progress/reinforcement values (not only counts), optional XP absence/rows, metadata and effective ACLs. Use this block after S6 with `expected_count=4`, and after S12 with `expected_count=5` (set psql variable first). Config-only metadata changes are excluded deliberately, nowhere else.

```sql
SELECT pg_temp.require((SELECT count(*)= :expected_count FROM public.question_attempts),'attempt count');
SELECT pg_temp.require(
 ((pg_temp.snapshot()->'data') - 'public.question_attempts' - 'public.trusted_study_config') =
 ((SELECT j->'data' FROM n2_seed) - 'public.question_attempts' - 'public.trusted_study_config'),
 'no reward/activity/progress/reinforcement/session/other user writes');
SELECT pg_temp.require(pg_temp.snapshot()->'meta'=(SELECT j->'meta' FROM n2_seed),'metadata/privileges unchanged during scenarios');
SELECT pg_temp.require((pg_temp.dependency_counts()-'public.question_attempts')=
 ((SELECT j->'dependency_counts' FROM n2_seed)-'public.question_attempts'),'no untracked dependent records');
SELECT pg_temp.require(NOT EXISTS(
 SELECT FROM public.question_attempts a WHERE a.attempt_number IN(1,7)
 AND a.question_id='phase3n-n2-20261016-s6' AND NOT
 ((SELECT j->'data'->'public.question_attempts' FROM n2_seed) @> jsonb_build_array(to_jsonb(a)))),'historical rows immutable');
SELECT pg_temp.require((SELECT array_agg(attempt_number ORDER BY attempt_number)=ARRAY[1,7,8,9]
 FROM public.question_attempts WHERE question_id='phase3n-n2-20261016-s6'),'history gap preserved, 8/9 allocated');
SELECT pg_temp.require((SELECT count(*)=2 AND bool_and((is_adaptive_repeat AND verified_at IS NOT NULL
 AND user_id='3e9a0000-3a2e-4e60-8000-000000000001'
 AND question_id='phase3n-n2-20261016-s6' AND pg_temp.item(id,question_id)<@to_jsonb(a)
 AND competitive_at IS NULL AND answered_at=verified_at AND session_slot=0
 AND content_version='synthetic-v1' AND response_digest=repeat('a',64)
 AND ((id='3e9a0000-3a2e-4e60-8000-000000002101' AND session_id='3e9a0000-3a2e-4e60-8000-000000001001' AND attempt_number=8 AND review_mode='adaptive')
 OR (id='3e9a0000-3a2e-4e60-8000-000000002102' AND session_id='3e9a0000-3a2e-4e60-8000-000000001002' AND attempt_number=9 AND review_mode='wrong_answers'))) IS TRUE)
 FROM public.question_attempts a WHERE id IN('3e9a0000-3a2e-4e60-8000-000000002101','3e9a0000-3a2e-4e60-8000-000000002102')),'S6 provenance');
SELECT id,session_id,attempt_number,review_mode,is_adaptive_repeat,session_slot,answered_at,verified_at,competitive_at
FROM public.question_attempts ORDER BY id;
```

For S12 additionally run these exact assertions. Save actual returned rows and actual assertion/error outputs; this preparation predicts outcomes, records none.

```sql
SELECT pg_temp.require((SELECT count(*)=1 AND bool_and(
 user_id='3e9a0000-3a2e-4e60-8000-000000000001'
 AND session_id='3e9a0000-3a2e-4e60-8000-000000001011'
 AND question_id='phase3n-n2-20261016-forward' AND attempt_number=1
 AND review_mode='reviewer' AND NOT is_adaptive_repeat AND session_slot=0
 AND verified_at IS NOT NULL AND answered_at=verified_at AND competitive_at IS NULL
 AND (pg_temp.item(id,question_id) <@ (to_jsonb(a)||jsonb_build_object('session_slot',session_slot))))
 FROM public.question_attempts a WHERE id='3e9a0000-3a2e-4e60-8000-000000002111'),'forward exact payload/provenance');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM public.question_attempts WHERE id IN
 ('3e9a0000-3a2e-4e60-8000-000000002112','3e9a0000-3a2e-4e60-8000-000000002113')),'disabled calls inserted nothing');
SELECT pg_temp.require((SELECT count(*)=1 AND bool_and(id=1 AND NOT enabled) FROM public.trusted_study_config),'disabled after both races');
SELECT pg_temp.require(((pg_temp.snapshot()->'data') - 'public.trusted_study_config')=
 ((SELECT j->'data' FROM n2_before_reverse) - 'public.trusted_study_config'),'reverse race changed no data');
```

## 11. Disable, drain, cleanup, restore — normal and abort paths

Keep ingress stopped throughout restoration. No extension/schema creation/drop, permanent DDL or explicit NOTIFY is allowed. All helper DDL remains in this session's pg_temp namespace. Captured pgrst creation/drop watchers exclude temporary objects under upstream PostgreSQL17 semantics; this is a source inference, not an observed no-notification result. A changed event contract stops before helpers; never disable a trigger or acknowledge an unexpected notification as harmless. Close only identified test sessions to remove their temporary objects. First have A/B/C/D explicitly ROLLBACK any open/aborted transaction, or close their verified test connections. A rollback cannot undo B/C commits; manifest cleanup is mandatory after setup COMMIT. Never leave D uncommitted, as it can block disable.

O with owner boundary and verified PID:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE;
SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
SET LOCAL lock_timeout='60s'; SET LOCAL statement_timeout='90s';
UPDATE public.trusted_study_config SET enabled=false,updated_at=clock_timestamp() WHERE id=1;
COMMIT;
```

If this blocks/times out, identify blockers in M; stop scheduling test calls, request rollback/close of **only identified test sessions**. Do not terminate unknown sessions or broaden permissions. An executing test may commit before disable; include its tracked rows in cleanup. Owner disable obtains the conflicting row lock, thereby waiting for earlier guarded transactions; it does not cancel pre-guard/legacy transactions.

After disable commits, require M inventory shows A/B/C/D idle with no xact_start or disconnected, no prepared transactions and no other writer transactions. Close worker/blocker/disable connections to prevent new work. Recheck config false, all remaining rows owned by manifest, and no unexpected inserted IDs/users. If ingress cannot remain stopped, disable/drain cannot complete, or ownership differs, mark failed/cleanup incomplete and stop for operator resolution. Do not restore legacy writer permissions while trusted config might be true.

O cleanup and restoration are a **single atomic transaction**; leave committed false outside it if cleanup fails:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE;
SELECT pg_temp.check_owner(); SELECT pg_temp.check_pid(:initial_pid);
-- Lock the exact validated closure before checking/deleting; prevent a child insert
-- between a zero-count check and FK CASCADE/SET NULL. Missing locks abort, no retry.
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s';
SELECT format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE;',split_part(k,'.',1),split_part(k,'.',2))
FROM (SELECT jsonb_object_keys(pg_temp.dependency_counts()) AS k
 UNION SELECT 'public.trusted_study_config') locked ORDER BY k COLLATE "C" \gexec
SELECT pg_temp.require((SELECT count(*)=1 AND bool_and(id=1 AND enabled IS FALSE) FROM public.trusted_study_config),'disabled before cleanup');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM auth.users WHERE id<>'3e9a0000-3a2e-4e60-8000-000000000001'),'no foreign users');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM auth.users WHERE
 email IS DISTINCT FROM 'phase3n-n2-20261016@revit.invalid' OR raw_user_meta_data->>'username' IS DISTINCT FROM 'n2_20261016_owner'),'owner manifest');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM jsonb_each_text(pg_temp.dependency_counts()) d
 WHERE d.key NOT IN('auth.users','public.profiles','public.user_preferences','public.user_progress',
 'public.study_sessions','public.question_attempts') AND d.value::bigint<>0),'untracked child present: STOP, never cascade cleanup');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM public.study_sessions WHERE
 user_id<>'3e9a0000-3a2e-4e60-8000-000000000001' OR (id,request_id) NOT IN
 (('3e9a0000-3a2e-4e60-8000-000000001001'::uuid,'3e9a0000-3a2e-4e60-8000-000000003001'::uuid),
 ('3e9a0000-3a2e-4e60-8000-000000001002'::uuid,'3e9a0000-3a2e-4e60-8000-000000003002'::uuid),
 ('3e9a0000-3a2e-4e60-8000-000000001011'::uuid,'3e9a0000-3a2e-4e60-8000-000000003011'::uuid),
 ('3e9a0000-3a2e-4e60-8000-000000001012'::uuid,'3e9a0000-3a2e-4e60-8000-000000003012'::uuid))),'only manifest sessions/requests');
SELECT pg_temp.require(NOT EXISTS(SELECT FROM public.question_attempts WHERE
 user_id<>'3e9a0000-3a2e-4e60-8000-000000000001' OR id NOT IN
 ('3e9a0000-3a2e-4e60-8000-000000002001','3e9a0000-3a2e-4e60-8000-000000002002',
 '3e9a0000-3a2e-4e60-8000-000000002101','3e9a0000-3a2e-4e60-8000-000000002102',
 '3e9a0000-3a2e-4e60-8000-000000002111','3e9a0000-3a2e-4e60-8000-000000002112',
 '3e9a0000-3a2e-4e60-8000-000000002113')),'only manifest attempts');
-- Abort/recovery preservation checks execute before the first DELETE too.
SELECT pg_temp.require(pg_temp.snapshot()->'meta'=(SELECT j->'meta' FROM n2_seed),
 'cleanup metadata/ACL/membership/schema must match original fenced seed');
SELECT pg_temp.require(
 ((pg_temp.snapshot()->'data')-'public.question_attempts'-'public.trusted_study_config')=
 ((SELECT j->'data' FROM n2_seed)-'public.question_attempts'-'public.trusted_study_config'),
 'cleanup immutable auth fingerprint, seeds and session rows');
SELECT pg_temp.require(
 (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb)
  FROM public.question_attempts a WHERE a.id IN
  ('3e9a0000-3a2e-4e60-8000-000000002001','3e9a0000-3a2e-4e60-8000-000000002002'))=
 (SELECT jsonb_agg(v ORDER BY v->>'id') FROM n2_seed s,
  LATERAL jsonb_array_elements(s.j->'data'->'public.question_attempts') v
  WHERE v->>'id' IN('3e9a0000-3a2e-4e60-8000-000000002001','3e9a0000-3a2e-4e60-8000-000000002002')),
 'cleanup historical seed rows present and byte-equivalent');
DELETE FROM public.question_attempts WHERE user_id='3e9a0000-3a2e-4e60-8000-000000000001' AND id IN
 ('3e9a0000-3a2e-4e60-8000-000000002001','3e9a0000-3a2e-4e60-8000-000000002002',
 '3e9a0000-3a2e-4e60-8000-000000002101','3e9a0000-3a2e-4e60-8000-000000002102',
 '3e9a0000-3a2e-4e60-8000-000000002111','3e9a0000-3a2e-4e60-8000-000000002112',
 '3e9a0000-3a2e-4e60-8000-000000002113');
DELETE FROM public.study_sessions WHERE user_id='3e9a0000-3a2e-4e60-8000-000000000001' AND id IN
 ('3e9a0000-3a2e-4e60-8000-000000001001','3e9a0000-3a2e-4e60-8000-000000001002',
 '3e9a0000-3a2e-4e60-8000-000000001011','3e9a0000-3a2e-4e60-8000-000000001012');
-- Only manifested seed rows may be removed. No auth-managed/untracked child delete is allowed.
SELECT pg_temp.require(NOT EXISTS(SELECT FROM public.user_progress WHERE
 user_id<>'3e9a0000-3a2e-4e60-8000-000000000001' OR id<>'3e9a0000-3a2e-4e60-8000-000000004001'),'progress manifest before delete');
DELETE FROM public.user_progress WHERE user_id='3e9a0000-3a2e-4e60-8000-000000000001'
 AND id='3e9a0000-3a2e-4e60-8000-000000004001';
DELETE FROM public.user_preferences WHERE user_id='3e9a0000-3a2e-4e60-8000-000000000001';
DELETE FROM public.profiles WHERE id='3e9a0000-3a2e-4e60-8000-000000000001';
SELECT pg_temp.require(NOT EXISTS(SELECT FROM jsonb_each_text(pg_temp.dependency_counts()) d
 WHERE d.key<>'auth.users' AND d.value::bigint<>0),'all children empty before parent; CASCADE/SET NULL must be no-ops');
DELETE FROM auth.users WHERE id='3e9a0000-3a2e-4e60-8000-000000000001'
 AND email='phase3n-n2-20261016@revit.invalid';
-- Exact pre-generated GRANTs and original disabled config timestamp, no BEGIN/COMMIT inside:
\i scratch/phase3n-n2-evidence/restore-body.sql
SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_baseline),'full baseline restored');
COMMIT;
-- Independent fresh statement after COMMIT, then a second verified read-only session:
SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_baseline),'committed restoration');
```

Before DELETE additionally compare historical rows to seed using section 10; an untracked child row fails cleanup and requires separate review while config remains disabled. Never remove it automatically. Delete only manifested synthetic rows; never TRUNCATE, broad cleanup, sequence reset, schema rollback or registry repair. The four added auth descendants remain count-only zero at baseline/seed/each snapshot, before parent DELETE and after restoration. There is no new managed-auth fixture, row export, DELETE/UPDATE or ACL change. Any such row stops cleanup with configuration disabled; do not remove a session/factor/token to make counts pass. With all accepted dependents empty before parent deletion, existing FK CASCADE and SCIM SET NULL actions affect zero rows; they are not used as cleanup mechanisms. Optional XP/dependency additions block the known graph until reviewed. On recovery import original seed.json into `n2_seed(j jsonb)`; it was exported before setup COMMIT and is not itself proof that COMMIT succeeded. Resolve committed state against manifest and captured acknowledgement before any cleanup; never fabricate or overwrite baseline/seed exports.

If O disconnects, no automatic continuation. First reverify endpoint and stopped ingress, then use the authorized disable/drain path; no helper is needed for the configuration UPDATE itself. Initialize a replacement verified owner session using section2's pre-helper catalog guard and shared helpers, then only section4's dependency_counts/snapshot definitions, **not section4's fresh-baseline guards/export or setup**. Never overwrite original baseline/seed/restore files. Import both original baseline.json and seed.json into n2_baseline(j jsonb) and n2_seed(j jsonb) before the cleanup guards. Under the same separately authorized recovery scope:

```sql
CREATE TEMP TABLE n2_baseline(j jsonb);
CREATE TEMP TABLE n2_seed(j jsonb);
\copy n2_baseline(j) FROM 'scratch/phase3n-n2-evidence/baseline.json' WITH (FORMAT text)
\copy n2_seed(j) FROM 'scratch/phase3n-n2-evidence/seed.json' WITH (FORMAT text)
SELECT pg_temp.require((SELECT count(*)=1 FROM n2_baseline) AND
 (SELECT count(*)=1 FROM n2_seed),'one original baseline and seed export');
```

If setup COMMIT did not occur, verify baseline equality and close; do not clean a nonexistent committed setup. If committed state or the acknowledgement is ambiguous, stop for read-only manifest reconciliation, never retry INSERTs. For confirmed committed setup, review drift, reuse original verified restore-body.sql and apply the same atomic locked cleanup. If original exports are missing or their recorded hashes differ, do not guess grants/config timestamp or manufacture a replacement seed. Classify NO-GO / restoration unresolved.

Final independent read-only diagnostics must confirm ten counts zero, optional XP baseline preserved, no run-specific user/email/session/request/question/attempt IDs, disabled config including original updated_at, exact prior registry rows, full routine definitions/owners/security/search_path, normalized direct table/column/function ACLs, effective browser/service rights, memberships/RLS/policies/triggers and session rows restored. Compare snapshot to original imported baseline in a new verified owner session if read-only connector cannot inspect all metadata. Close O/M; temporary helpers/tables disappear. Verify no remaining test backends/open transactions/advisory locks. Save postcheck output. A cleanup or comparison failure makes the run failed even if races passed.

## Evidence decision and stop

Log session role/PID outputs, each named monitor barrier, exact RPC rows, actual caught SQLSTATEs, transaction command results and pre/seed/post baselines. No claimed assertion counts or PASS rows exist until those actual outputs are captured. No source model, prior HTTP overlap, or prior unlogged user-reported suite pass substitutes for engine evidence. Both scenarios remain **NOT TESTED** now.

Outstanding execution gates: separate explicit authorization covering committed setup/fencing/config transitions and cleanup; dashboard endpoint proof; fresh source/definition/schema/ACL/FK/trigger review; empty/disabled current staging diagnostics; six-session stability/monitor visibility; durable reviewed baseline/restore exports and stopped ingress. This is a prepared source procedure, not an executed or engine-certified harness.

Rewards/completion persistence, leaderboard cohort/cutover, permanent legacy-writer revocation, real-user trusted activation and Strasinger synchronization remain pending. Stop after preparation; no deployment, commit, push or production operation.

PostgreSQL references: [row/advisory locking](https://www.postgresql.org/docs/17/explicit-locking.html), [READ COMMITTED behavior](https://www.postgresql.org/docs/17/transaction-iso.html), [psql error handling and command behavior](https://www.postgresql.org/docs/17/app-psql.html). Locks are transaction scoped here; a disable UPDATE must conflict with the held FOR SHARE row lock. READ COMMITTED is required by the reviewed guard. `ON_ERROR_STOP` stops script processing; explicitly roll back or close a connection on unexpected error, including interactive sessions.

Coverage restoration clarification: auth snapshots export only the synthetic identity projection plus an opaque full-row MD5 drift fingerprint, never credential column values. Immutable auth/seed/session values, original fenced metadata and both historical attempt IDs are checked before any cleanup DELETE, including abort/recovery. A changed or missing seed/history row stops cleanup; do not normalize it away. Fingerprints are drift checks, not credential protection or database identity. Original baseline/seed exports remain required and must be trusted, durable, run-specific and unchanged.
