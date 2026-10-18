# Phase 3N-H3 Live Staging Execution Evidence Summary

**Execution Context**:
- Command: `node scripts/phase3n/concurrent-persistence-test.mjs --run-staging`
- Target Reference: `qnepjfcbzsycmesrcbjb` (`revit-staging`)
- Database Platform: Supabase PostgreSQL 17.11 GA
- Evidence Source: Captured Live Terminal Output
- Execution State: Live Staging Run Completed; Credentials subsequently removed from shell environment.

---

## 1. Captured Terminal Output Summary

```text
================ LIVE STAGING RESULTS ================
[RESULT] Scenario A: Identical attempt ID & payload: PASS (Overlap: true, Rows: 1)
[RESULT] Scenario B: Same attempt ID, conflicting digest: PASS (Overlap: true, Rows: 1)
[RESULT] Scenario C: Slot collision, different IDs: PASS (Overlap: true, Rows: 1)
[RESULT] Scenario D: Session creation idempotency: PASS (Overlap: true, Rows: 1)
[RESULT] Scenario E: Disjoint batches in same session: PASS (Overlap: true, Rows: 2)
[RESULT] Scenario F: Independent session batches: PASS (Overlap: true, Rows: 2)
[RESULT] Scenario G: Cross-owner attempt collision: PASS (Overlap: true, Rows: 1)
[RESULT] Scenario H: Lost-ack retry idempotency: PASS (Overlap: false, Rows: 1)
Cleanup Status: CLEAN
```

---

## 2. Per-Scenario Reported Results Table

| Scenario | Name | Reported Status | HTTP Overlap | Reported DB Rows | Concurrency Classification |
|---|---|---|---|---|---|
| **A** | Identical attempt ID and payload | PASS | `true` | 1 | In-flight HTTP overlap observed |
| **B** | Conflicting response digest | PASS | `true` | 1 | In-flight HTTP overlap observed |
| **C** | Session-slot collision | PASS | `true` | 1 | In-flight HTTP overlap observed |
| **D** | Session-creation idempotency | PASS | `true` | 1 | In-flight HTTP overlap observed |
| **E** | Disjoint batches in same session | PASS | `true` | 2 | In-flight HTTP overlap observed |
| **F** | Independent-session batches | PASS | `true` | 2 | In-flight HTTP overlap observed |
| **G** | Cross-owner attempt collision | PASS | `true` | 1 | In-flight HTTP overlap observed |
| **H** | Lost-ack retry idempotency | PASS | `false` | 1 | Sequential recovery test (NOT concurrent) |

---

## 3. Evidence Scope and Limitations

1. **Captured Output vs Detailed Machine Telemetry**:
   - The captured terminal output records the summary results, per-scenario pass/fail status, HTTP overlap boolean, and row count.
   - Raw individual HTTP request/response payloads, exact correlation IDs, individual SQLSTATE strings from intermediate queries, and microsecond timestamps were not redirected to a persistent log file during execution.
2. **HTTP Overlap vs PostgreSQL Transaction Concurrency**:
   - `Overlap: true` indicates overlapping in-flight HTTP requests between the Node.js test process and the Supabase API gateway.
   - It does not conclusively prove concurrent PostgreSQL engine transaction execution, as Supabase/PostgREST connection pooling or serialization may serialize requests before transaction execution.
3. **Reward & Activity Event Verification**:
   - Scenario A and H verify stored question attempt row count (1).
   - Activity events and XP records are not directly inserted by Migration 26 (`commit_verified_study_batch`), so duplicate XP prevention relies on architectural separation rather than live XP table assertions in this harness.
4. **Environment Isolation**:
   - Target verified: `qnepjfcbzsycmesrcbjb` (`revit-staging`).
   - Production target: `lznsdxfvxeckflxsohig` remained 100% untouched.
   - Dedicated staging credentials (`REVIT_STAGING_SUPABASE_URL`, `REVIT_STAGING_SERVICE_ROLE_KEY`) were removed from PowerShell following the test run.
