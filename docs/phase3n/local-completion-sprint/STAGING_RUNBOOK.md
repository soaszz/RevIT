# Staging verification pack — preparation only

No operation in this document has been executed. This sprint grants no staging authorization. Production access and real-user activation remain prohibited.

## Single next operation requiring Antigravity

Obtain explicit authorization for one isolated-staging Migration 27 verification run against `qnepjfcbzsycmesrcbjb`: apply the disabled proposal, execute the prepared synthetic verification pack, capture engine evidence, and confirm cleanup plus disabled configuration. Do not deploy or enable real-user persistence. Verify the target independently; a user-set SQL marker alone cannot authenticate a project.

Use the current Phase 3N-L catalog evidence as context. Confirm target identity, migration state, absence of users/fixtures, and required privileges immediately before execution. Abort on drift or an unexpected overload/writer; do not repair live permissions opportunistically. Production `lznsdxfvxeckflxsohig` must never be connected.

## Single-connection checks

The prepared `supabase/tests/trusted_cutover_verification.sql` requires Migration 27 installed with configuration false, an empty disposable staging database, an owner connection, independently checked target, and session marker `revit.test_target = 'qnepjfcbzsycmesrcbjb'`. Run with stop-on-error. It deliberately creates synthetic users, temporarily enables configuration, and temporarily fences named legacy functions and table/column grants inside one transaction. All changes roll back. Inherited rights that remain open must abort the test rather than bypass its guard.

Expected future evidence: 14 PASS rows covering scenarios 1–5, 7–11, 13, 15 plus missing/false configuration, legacy-fence rejection, and overflow. This is SQL persistence testing using synthetic metadata, not canonical content verification. Actual service-role execution and actual browser-role rejection are separate from owner-executed JWT simulations. No current local result claims these assertions passed in PostgreSQL.

The generated `supabase/tests/trusted_cutover_rollback_verification.sql` additionally tests scenario 14. Regenerate with `node scripts/phase3n/prepare-cutover-rollback.mjs` after changing either source. It includes the base suite, snapshots all rows in seven study/reward tables, injects the exact current rollback body without its outer BEGIN/COMMIT, then checks unchanged data, disabled configuration, PT503 stubs, and preserved browser denial for trusted RPCs and raw leaderboard helpers. Expected final output: 15 PASS rows, then ROLLBACK. Never include the original rollback file directly inside an outer test transaction: its COMMIT would commit fixtures and temporary grant changes.

The two scripts are alternatives; the generated superset is sufficient. A SQL error aborts the transaction; the owner must explicitly roll back or close the connection. Capture errors and SQLSTATEs without credentials. After completion, independently confirm original aggregate counts, migration state, grants and configuration false. Temporary objects must be gone.

## Scenario 6 — actual engine overlap

This requires multiple independent database connections and committed, tracked synthetic fixtures visible to them. A single rolled-back DO block cannot prove concurrency. Separately authorize temporary committed staging-only configuration/fencing, fixture setup and cleanup before this scenario. Never use production or admit real clients.

1. Under stopped ingress, drain old RPC transactions. Save exact staging ACLs/configuration and initial row counts. Create two owned issued sessions containing the same synthetic question and known historical attempt numbers 1 and 7. Use distinct attempt UUIDs and slot 0 in each session. Do not change historical records.
2. In owner connection A, BEGIN and hold `pg_advisory_xact_lock(hashtextextended('<synthetic-owner>:<question-id>', 0))`. Record connection PIDs. In service-role connections B and C, use READ COMMITTED and service JWT claims, BEGIN, and invoke the trusted batch RPC for each session.
3. From a monitoring connection, capture `pg_stat_activity`, `pg_locks`, and `pg_blocking_pids`: B must visibly wait behind A at the question lock; C must wait behind the trusted owner lock held by B. Merely launching two HTTP requests is insufficient.
4. Commit A, then allow B/C to complete. Check two inserted rows, numbers 8 and 9, correct session modes, repeat flags, noncompetitive provenance, no new reward rows, and exact retries returning unchanged rows. Allocation follows lock/commit order, not launch order.
5. Repeat UUID equivalence/conflict and cross-owner collision with explicit barriers if concurrency claims are made for them. Check returned SQLSTATEs and no foreign-row disclosure. Preserve pending client work on all failures.
6. Disable configuration, drain transactions, remove only tracked synthetic data in foreign-key order, restore exact staging test ACLs/configuration, and compare aggregate counts. Any cleanup failure is a failed run. Do not restore unsafe production privileges or run historical feature rollbacks.

## Scenario 12 — disable fence during lock waits

Use the same isolated, explicitly authorized multi-connection fixture setup.

- First direction: let a trusted commit hold its configuration FOR SHARE lock while blocked by connection A's question advisory lock. Issue the owner configuration-disable UPDATE in D. Capture D blocked by the guarded transaction. Release A; the commit completes before D can commit the disable. A later fresh RPC must fail PT503 without inserting an attempt.
- Reverse direction: A holds the disabled configuration UPDATE uncommitted. Start B's RPC and capture its row-lock wait. Commit the disable; B must fail PT503 and write nothing.
- Keep lock and statement timeouts. Record PID/lock evidence, final attempt counts and configuration false. Never treat elapsed request overlap as engine proof.

## Activation blockers beyond this verification pack

Passing Migration 27 does not authorize activation. Atomic attempt/event/reinforcement/counter/achievement/completion persistence still needs a database implementation and rollback tests. Current manifests cannot establish strict versus adaptive sequence evidence. Preserve historical balances/unlocks and approve any legacy baseline explicitly; never manufacture missing historical rewards.

Before any real cutover, stop ingress, drain legacy and Migration 25/26 calls, close every effective alternate/table/column/inherited writer, freeze the accepted legacy cohort, and reconcile retained queues by stable IDs and provenance. Revoking EXECUTE does not cancel existing transactions. Migration 27 checks known writers but does not revoke them or certify every unknown SECURITY DEFINER path.

Raw leaderboard readers currently include attempts regardless of `competitive_at`. Future readers must admit only the frozen legacy cohort plus eligible verified contributions, using server receipt dates while preserving existing Manila periods, first-daily-attempt ordering, 20/75/200 thresholds, filters, ties and privacy wrappers. Do not filter only on `verified_at`, backfill competitive timestamps, or rewrite old scores. No additional reader SQL is proposed until cohort policy and authoritative reward evidence exist.

Cross-tab queue coordination now uses native Web Locks across new clients. Future browser testing must exercise real simultaneous tabs, reload/tab termination during a flight, unavailable storage, unsupported-lock fallback, account switching and restoration; no browser runtime claim is made here. Old clients still require the coordinated cutover above.
