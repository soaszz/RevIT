# Admin dashboard — production reporting SQL approval package (Stage 3)

Status: EXECUTED AND VERIFIED 2026-11-21 (owner-authorized). The reporting function and the
per-subscriber index are installed in `lznsdxfvxeckflxsohig`. The global history index was NOT
installed. Execution results are recorded in `AGENT_HANDOFF.md` and in §11 below.

Project: `lznsdxfvxeckflxsohig` · Worktree: `scratch/admin-dashboard-v1140` · Branch: `codex/admin-dashboard-v1140`

## 1. Exact artifacts and SHA-256 (over the exact file bytes)

| File | Purpose | SHA-256 |
|---|---|---|
| `docs/admin-dashboard/READ-ONLY-RPCS.PROPOSAL.sql` | creates the reporting function | `846465d4b2497b351c00e8d6f3b2e5d5fc6ba41f2aff73ececc97212e6b3896d` |
| `docs/admin-dashboard/ROLLBACK-READ-ONLY-RPCS.sql` | drops only that function | `f9842fd40fb716f3d043601dde4bad2dfda310adc67eb8737066a2833209f6c4` |
| `docs/admin-dashboard/PREFLIGHT-PRE-INSTALL.sql` | read-only fingerprint check | `66fd115a68fa0e384f4b1e960f124ecacc8a42b726d8fe5cdfeb3e52bc4f3c5f` |
| `docs/admin-dashboard/VERIFY-POST-INSTALL.sql` | read-only post-install catalog/ACL check | `b8f7f767f20e8d6c4d8a3b0f0a2ea1ce7e8c4e27e88db122e4e1da9f430e126f` |
| `docs/admin-dashboard/HISTORY-INDEXES.PROPOSAL.sql` | optional index(es) | `21546ebdcd8ab6c46001216d642b287ddf6b0530c656f80df8d35dd43b136635` |
| `docs/admin-dashboard/INDEX-USER-HISTORY.SINGLE.sql` | the ONE index actually installed | `172e6e0fb7f4c7ad94d33fc4bcdd45d4ed9e009df37bdda561b8a878866bcaab` |

Record these hashes in the change record. Do not execute a file whose hash differs.

## 2. Exact change (change 1 — the reporting function)

One `CREATE FUNCTION public.admin_read_subscriptions(p_mode text, p_filters jsonb default '{}', p_limit integer default 25)`.
Everything else is a no-op for the database.

- Read-only: `STABLE`, `SECURITY INVOKER`, no dynamic SQL, SELECT-only.
- No subscriber mutations, no writer change, no RLS change, no new table, no trigger, no cron/job,
  no persistent analytics log, no grant on any table.
- Fixed `search_path = pg_catalog, pg_temp`; `statement_timeout = 5s`, `lock_timeout = 1s`.
- Bounded: `p_limit in (25,50,250)`, `page 1..400`, `q 2..80`, date ranges ≤ 731 days.
- Arbiter: `revoke all ... from public, anon, authenticated`; `grant execute ... to service_role`.
- Modes: `summary | subscribers | detail | transactions | monthly`. All classifications come from ONE
  CASE shared by summary and directory. Access consistency mirrors the deployed `get_my_entitlement()`
  rule (`plan='pro' and pro_expires_at>now()`); no per-user RPC is ever called.
- Financials: `revenue` and `paidOrders` are `null` (Unknown); every recorded amount is the true sum of
  stored `amount_php` (null/Unknown when no stored paid amount). Presets are never used to infer amounts.

## 3. Index decision (change 2 — optional, separate approval)

`subscription_history_user_created_idx on public.subscription_history (user_id, created_at desc, id desc)`

- **Benefit**: removes the only superlinear path — the subscribers directory runs TWO lateral lookups per
  profile, each currently a seq scan filtered by `user_id` (O(profiles × history)). The index turns both
  into bounded index lookups.
- **Storage**: now (54 rows, 80 kB) a few kB. Entry ≈ 16 B (uuid) + 8 B (timestamptz) + 4 B (id) + tuple
  overhead ≈ 40–50 B, so ≈ 4–5 MB per 100k rows. Negligible.
- **Write overhead**: one extra btree insert per `subscription_history` INSERT. Writes are event-driven
  (admin action / expiry sweep), low volume → negligible.
- **Recommendation**: install **together with** the RPC. It is cheap, bounded, and removes the one
  directory pattern that would degrade as history grows. Use plain `CREATE INDEX` (54 rows → instant);
  run it as its own statement, not inside `BEGIN`.
- The global `subscription_history_created_idx` (`created_at desc, id desc`) is **deferred** and must not
  be installed without separate approval — global paging/monthly ranges are trivial at current size.

## 4. Production safeguards (all present)

1. **Function-existence guard** — aborts if `to_regprocedure('public.admin_read_subscriptions(text,jsonb,integer)') is not null`.
2. **Writer-signature guard** — aborts unless the 11-arg writer exists, the 9-arg writer is absent, and
   `protect_profile_subscription_fields()` exists.
3. **Writer fingerprint guard** — aborts unless `md5(prosrc)` of the 11-arg writer = `bcf56ed8de8564405649685f592fc70f`.
4. **Billing-schema guard** — aborts unless `plan_months`, `amount_php`, `billing_status` all exist and are not dropped.
5. **RLS guard** — aborts unless `subscription_history` RLS is enabled.
6. **Transaction limits** — outer `BEGIN`; `lock_timeout = 1s` and `statement_timeout = 5s` set on both the
   transaction and the function body.
7. **ACL guard (post-install)** — `VERIFY-POST-INSTALL.sql` asserts `service_role` can execute and
   `anon`, `authenticated`, and `PUBLIC (grantee 0)` cannot.
8. **Read-only preflight** — `PREFLIGHT-PRE-INSTALL.sql` was executed read-only this stage and returned:
   `reportingFunctionAbsent true`, `writer11Present true`, `writer9Absent true`, `protectFieldsPresent true`,
   `writerFingerprintMatches true`, `billingColumns 3`, `historyRlsOn true`, `userCreatedIndexAbsent true`,
   `createdIndexAbsent true`, `getMyEntitlementMd5 23b5d2d7a7c6460070ad6fe538e84cc3`.
9. **Authenticated admin-only read test (post-install)** — the app routes call the RPC only through
   `createAdminServiceClient()` after `verifyAdminSession()` (valid session + `REVIT_ADMIN_USER_IDS`).
   Smoke call: `select public.admin_read_subscriptions('summary','{}'::jsonb,25);` plus
   `select public.admin_read_subscriptions('subscribers','{"status":"review"}'::jsonb,25);`.
10. **Non-admin denial test (post-install)** — `has_function_privilege('anon', ...)` and
    `has_function_privilege('authenticated', ...)` must be `false`; attempting the call as those roles
    raises `42501`. No subscriber data or private notes are printed by any check.

## 5. Ordered execution (only after written owner authorization)

1. Run `PREFLIGHT-PRE-INSTALL.sql` (read-only) and confirm every boolean is as listed in §4.8.
2. Apply `READ-ONLY-RPCS.PROPOSAL.sql` (its embedded guard re-checks §4.1–4.5).
3. Run `VERIFY-POST-INSTALL.sql` (read-only) and confirm:
   `functionExists true`, `securityInvoker true`, `volatile 's'`, `searchPathConfig {search_path=pg_catalog, pg_temp}`,
   `serviceRoleExecute true`, `anonExecute false`, `authenticatedExecute false`, `publicHasExecute false`,
   `writerMd5Unchanged bcf56ed8de8564405649685f592fc70f`, `historyRlsUnchanged true`.
4. Run the two smoke calls from §4.9.
5. (Separate approval) apply `subscription_history_user_created_idx` as its own statement, then confirm
   `userCreatedIndexValid true`.
6. Expose the dashboard sections only after step 4 returns real data.

## 6. Rollback

- Function: `docs/admin-dashboard/ROLLBACK-READ-ONLY-RPCS.sql` → `drop function if exists public.admin_read_subscriptions(text,jsonb,integer);`
  Drops ONLY that function. No history row, writer, cron, table grant or existing RLS policy is touched.
- Index (own approval): `drop index if exists public.subscription_history_user_created_idx;`

## 7. Resource budget (per user action, after install)

| Action | Server cost |
|---|---|
| Overview | 1 auth verify + 1 summary RPC (1 seq scan `profiles` + 1 DISTINCT ON over history; cached ≤10 min) |
| Subscribers page | 1 auth + 1 `subscribers` RPC (25 rows; 2 lateral lookups per profile — index removes the seq scans) |
| Monthly billing | 1 auth + 1 `monthly` RPC (created_at range hash aggregate) |
| History | 1 auth + 1 `transactions` RPC (bounded 25 rows) |
| Manual Refresh | 1 auth + 1 fresh RPC (bypasses summary cache once) |
| CSV export | 1 auth + ≤4 RPC batches × 250 (cap 1000 rows) |

Access-consistency indicators add **zero** requests (they ride the summary/directory reads).
No polling, no Realtime, no Redis, no `auth.admin.listUsers`, no full-table download, no N+1, no new
tables, no persistent logs.

## 8. Backup / recovery limitations

- The function change is additive and read-only: recovery = DROP; no data backup is required for it.
- `CREATE INDEX` (non-concurrent) takes a brief ACCESS EXCLUSIVE lock; at 54 rows / 80 kB it is instant.
  A full pre-change physical backup cannot be produced from this environment; recovery relies on the
  Supabase project's platform backups / PITR. Rollback for the index is DROP INDEX.
- Historical rows are never rewritten; verification baselines remain unchanged.

## 9. Remaining risks

- Until the RPC is installed, every reporting section is unavailable (503) — the current expected state.
- The function is `service_role`-only; it must be called only from server routes (it is).
- 4 accounts are `activeNoRecord` (effective Pro, no recorded grant). Classified **Potential** only;
  no automatic revoke/repair is provided, and the dashboard claims no confirmed mismatch.
- Local end-to-end SQL execution was not possible (incomplete local PG 17 install; Docker daemon down);
  syntax/behavior were validated by executing the exact SELECT bodies + preflight read-only against production.
- `supabase/.temp/cli-latest` (git-ignored) re-drifts on CLI use; restored to baseline `v2.117.0` after checks.

## 10. Recommendation (superseded — see §11)

Owner authorization was granted 2026-11-21 and the change was executed. Original text retained:
**GO — ready to install on owner authorization.** The change is additive, read-only, guarded, bounded,
and reversible. Recommended sequence: RPC + the per-subscriber index together; defer the global index.

## 11. Execution results (2026-11-21, owner-authorized)

- Phase 1 preflight (read-only): `reportingFunctionAbsent true`, `writer11Present true`, `writer9Absent true`,
  `protectFieldsPresent true`, `writerFingerprintMatches true`, `writerMd5 bcf56ed8de8564405649685f592fc70f`,
  `billingColumns 3`, `historyRlsOn true`, `userCreatedIndexAbsent true`, `createdIndexAbsent true`,
  `getMyEntitlementMd5 23b5d2d7a7c6460070ad6fe538e84cc3`. All 5 artifact hashes matched. Confirmed
  project ref `lznsdxfvxeckflxsohig`, PG 17.6.
- Phase 2: `READ-ONLY-RPCS.PROPOSAL.sql` applied, exit 0, no rows (DDL).
- Phase 3: `INDEX-USER-HISTORY.SINGLE.sql` applied, exit 0. Global index NOT installed.
- Phase 4 verify (read-only): `functionExists true`, `securityInvoker true`, `volatile 's'`,
  `searchPathConfig [search_path=pg_catalog, pg_temp, statement_timeout=5s, lock_timeout=1s]`,
  `acl {postgres=X/postgres,service_role=X/postgres}`, `serviceRoleExecute true`, `anonExecute false`,
  `authenticatedExecute false`, `publicHasExecute false`, `writerMd5Unchanged bcf56ed8de8564405649685f592fc70f`,
  `historyRlsUnchanged true`, `historyPolicyCount 0`, index def
  `(user_id, created_at DESC, id DESC)`, `userIndexValid true`, `userIndexReady true`,
  `globalIndexAbsent true`, history 54 rows / profiles 1048 unchanged, `amountNonNull 0`.
  RPC fingerprint: signature `admin_read_subscriptions(text,jsonb,integer)`, returns `jsonb`, plpgsql,
  owner `postgres`, body md5 `db9d92384058ecd509b46214b80f403f` (11,981 bytes).
  EXPLAIN now shows `Index Scan using subscription_history_user_created_idx` with `Index Cond: (user_id = p.id)`.
- Phase 5 real reads: summary total 1048, activePro 16, expiringSoon 3, expired 16, formerPro 5, renewals 1,
  manualGrants 1, revenue null, paidOrders null, recordedBilling null; consistency activeConsistent 12,
  freeConsistent 1032, staleProLabel 0, missingExpiryPro 0, potentialAccessIssue 0, activeNoRecord 4,
  reviewNeeded 4, confirmedMismatch 0, verified false. Directory 25+hasMore (top-25 all free — expected
  pagination), page 2 25+hasMore, review filter returns exactly 4 rows all carrying `recordedExpiresAt`,
  monthly 2 months / renewals 1 / sources 2 / plans 0, transactions 25+hasMore,
  `event=revoked` filter returns only revoked, invalid filter → SQLSTATE `22023`.
  Non-admin read attempt → `42501 permission denied for function admin_read_subscriptions`.
- Phase 6: no polling/Realtime/Redis/cron/new tables/persistent logs; the only `setTimeout` is the 450 ms
  search debounce + blob-URL revoke; `auth.admin.listUsers|getUserById` remain only in the preserved legacy
  `adminService.ts` management/search, never in the reporting path.
- Application-route closure NOT claimed: dashboard not running with an authorized admin session, so the
  authenticated `/api/admin/*` request path was not exercised live. Direct RPC verification = PASS.

