# Active Pro breakdown + recent purchases — production install results

Status: **INSTALLED AND VERIFIED.** Installed once against Supabase project `lznsdxfvxeckflxsohig`
(RevIT, production) on 2026-11-27 (Asia/Manila).
Executed file: `ACTIVE-PLAN-RECENT-PURCHASES.PROPOSAL.sql`, unmodified, LF line endings, 18,675 bytes.
Rollback staged, not executed: `ACTIVE-PLAN-RECENT-PURCHASES.ROLLBACK.sql` (14,512 bytes).

All evidence below is sanitized: aggregates and catalog metadata only. No subscriber username, email,
UUID, note, billing row, or per-subscriber amount is recorded here.

## 1. Pre-execution confirmation

| Check | Value | Result |
| --- | --- | --- |
| Project | `lznsdxfvxeckflxsohig` / RevIT / production | match |
| CLI target line | `Target: project RevIT (lznsdxfvxeckflxsohig) · production` | match |
| Proposal SHA-256 | `ccc66c15acd134e2f4427075815078c1f78e8c91ad5af024b236748c3b6c268a` | match approved |
| Rollback SHA-256 | `733d09e862272d9416a5ccd42f173a8b77c796d756928b7739d6f8f1075a219e` | match approved |
| Line endings | 0 CRLF / 258 LF (proposal), 0 CRLF / 206 LF (rollback) | unchanged |
| Reporting baseline | `7c48e4669969147e110ca4381025b129` (prosrc 12,945) | match |
| Writer baseline | `7b4b54f8a55d52578efd75a6aeeb0de0` (prosrc 7,690, 12 args) | match |
| Reporting overloads | 1 | guard pass |
| Writer overloads | 1 (11-arg absent, 12-arg resolves) | guard pass |
| Reporting attributes | STABLE, SECURITY INVOKER, `search_path=pg_catalog, pg_temp`, 5 s / 1 s timeouts | guard pass |
| Reporting ACL | `{postgres=X/postgres,service_role=X/postgres}` | guard pass |

## 2. Execution

- Command shape: `supabase db query --remote=lznsdxfvxeckflxsohig --file <proposal> --yes`.
- Result: exit 0, empty result set (DDL batch), no error text from PostgreSQL.
- Transaction shape: the proposal's own `begin; ... commit;` with a `DO $guard$` block, `set local
  lock_timeout='1s'`, `set local statement_timeout='5s'`, then `create or replace function`,
  `revoke`/`grant`, and `notify pgrst, 'reload schema'`. Executed exactly once.
- No `HISTORY-INDEXES.PROPOSAL.sql`, no index creation, no subscription record change, no
  grant/extend/revoke action, no commit/push/deploy of the application.

## 3. Post-install fingerprints

| Function | md5(prosrc) | prosrc length | Attributes |
| --- | --- | ---: | --- |
| `admin_read_subscriptions(text,jsonb,integer)` | `7000c395c79b1c3b5c9f74c1f5e30f35` | 14,749 | owner `postgres`, plpgsql, STABLE, SECURITY INVOKER, `search_path=pg_catalog, pg_temp`, `statement_timeout=5s`, `lock_timeout=1s`, 1 overload |
| `admin_apply_subscription_change(...12 args..., numeric)` | `7b4b54f8a55d52578efd75a6aeeb0de0` | 7,690 | unchanged, 1 overload |

ACL after install: reporting and writer remain `{postgres=X/postgres,service_role=X/postgres}`.
`anon` and `authenticated` cannot execute either function; `service_role` can.

## 4. Response verification

`monthly` response now carries `activePlanBreakdown` and `recentPurchases` alongside the unchanged
`asOf`, `months`, `plans`, `sources`, `renewals`, `renewalSales`.

Exact reconciliation against independent SQL over `public.subscription_history` (Asia/Manila range
`2026-11` minus 11 months through `2026-12-01` exclusive):

| Field | Function | Recomputed | Result |
| --- | --- | --- | --- |
| `months` array | matches | matches | exact |
| `plans` array | matches | matches | exact |
| `sources` array | matches | matches | exact |
| `renewals` | 1 | 1 | match |
| `renewalSales` | 0 | 0 | match |
| Recorded amount (total) | ₱395 | ₱395 | match |
| Recorded events | 5 | 5 | match |
| Historical unknown amounts | 30 | 30 | match |

Month grouping (Asia/Manila): `2026-11` recorded ₱395 / 5 events / 11 unknown; `2026-10` no recorded
amount / 0 recorded events / 19 unknown. `2026-10` correctly keeps a null recorded amount rather than
inventing zero.

Current Pro reconciliation (`activePlanBreakdown` vs authoritative `profiles.plan='pro' and
pro_expires_at > now()`):

| Bucket | Active Pro |
| --- | ---: |
| 1 month | 1 |
| 3 months | 0 (absent from response) |
| 6 months | 0 (absent from response) |
| custom | 0 (absent from response) |
| Duration not recorded | 15 |
| **Total** | **16** |

Sum equals the authoritative active-Pro total (16); bucket order is a valid subsequence of
`1,3,6,custom,unknown`; no duplicate buckets; every returned count is ≥ 1.

Recent purchases: 5 rows, newest first, all `source='purchased'`, all `billingStatus='admin_confirmed'`,
all amounts present and ≥ 0, all `planMonths` in `{1,3,6}` or null, total ₱395. No
`complimentary`/`gift`/`prize` row appears; no row lacks an identity join. Row key set is exactly the
11 approved fields (no email, note, or extra column).

## 5. Existing behavior compatibility

| Mode | Keys | Rows / semantics | Result |
| --- | --- | --- | --- |
| `summary` | `asOf`, `summary` + all 14 summary keys | `activePro` 16 = authoritative 16; `recordedPurchases` reconciles with all-time recorded purchases; `revenue` and `paidOrders` remain `null` (Unknown, not fabricated) | unchanged |
| `transactions` | `asOf`, `hasMore`, `history` | 25 rows, `hasMore=true` (68 total), full 11-field row contract, newest first | unchanged |
| `subscribers` | `asOf`, `hasMore`, `subscribers` | 25 rows, bounded, boolean `hasMore` | unchanged |

## 6. Catalog / resource state

- `subscription_history` indexes unchanged at 3: `subscription_history_pkey`,
  `subscription_history_user_created_idx`, `subscription_history_expired_once_idx`.
  `subscription_history_created_idx` remains absent (deliberately not installed in this task).
- Table counts unchanged: 1,053 profiles, 68 history rows, 16 active Pro. No historical row was
  modified.
- Single RPC on tab load retained; the two new fields ride the existing `monthly` request. No new
  RPC, polling, Realtime, Redis, or per-subscriber lookup.

## 7. Rollback readiness

Rollback was not executed. It remains applicable: it requires the installed reporting md5
`7000c395c79b1c3b5c9f74c1f5e30f35` (now true), restores `7c48e4669969147e110ca4381025b129`, leaves the
writer untouched, re-applies the service_role-only ACL, and was proven end-to-end in the prior
isolated PG17 run.

## 8. Remaining release blockers

1. Application deploy: the refined Sales & Billing UI is still uncommitted/unpushed; production UI
   will show the existing layout (it ignores the two new keys) until deployed.
2. `subscription_history_created_idx` still absent; not a correctness blocker at 68 rows, but install
   `HISTORY-INDEXES.PROPOSAL.sql` separately before sustained history growth.
3. Release date for the Updates tab remains pending the actual Asia/Manila deployment day.

## 9. Confirmation

No commit, push, deploy, or promotion. No index created. No subscription record modified. No
grant/extend/revoke action. No proposal or rollback file changed.