# Active Pro breakdown + recent purchases — approval package

Status: **INSTALLED AND VERIFIED IN PRODUCTION (2026-11-27, Asia/Manila).** Installed reporting md5 is
now `7000c395c79b1c3b5c9f74c1f5e30f35`; the writer is unchanged. See
`ACTIVE-PLAN-RECENT-PURCHASES.INSTALL-RESULTS.md` for the sanitized execution evidence.
Worktree: `scratch/admin-dashboard-v1140`, branch `codex/admin-dashboard-v1140`.
Baseline commit: `36bf2a5f9e6e39e1ef992e8052fdc322f1725f4c`.
Date prepared: 2026-11-27.

## Why this package exists (data-availability finding)

The v1.15.0 Sales & Billing refinement adds two views: a **current Pro breakdown by recorded
duration** and a **recent purchases** list. Neither can be answered from the *installed* bounded
reporting response (`admin_read_subscriptions`, body md5 `7c48e4669969147e110ca4381025b129`):

- `summary` returns only an `activePro` count — no grouping by stored `plan_months`.
- `monthly` returns range aggregates (`months`, `plans`, `sources`, `renewals`, `renewalSales`) but
  **no per-event rows**, so it cannot supply a "newest first" purchase list.
- `transactions` returns the needed per-event fields (including `username`) but is a *separate*
  request and cannot be filtered server-side to *purchased-with-amount only*. Reading it on the
  Billing tab would add an extra RPC on initial tab load, which the refinement forbids.

The correct move is to add the two fields to the **existing `monthly` response**, so the Sales &
Billing view keeps using the one request it already makes. That is a reporting-contract change and
requires owner approval, which is what this package requests.

## Artifacts and hashes

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `ACTIVE-PLAN-RECENT-PURCHASES.PROPOSAL.sql` | 18,675 | `ccc66c15acd134e2f4427075815078c1f78e8c91ad5af024b236748c3b6c268a` |
| `ACTIVE-PLAN-RECENT-PURCHASES.ROLLBACK.sql` | 14,512 | `733d09e862272d9416a5ccd42f173a8b77c796d756928b7739d6f8f1075a219e` |

Expected `md5(prosrc)` with LF line endings and the file executed exactly as stored:

| Function | Before (installed) | After |
| --- | --- | --- |
| `admin_read_subscriptions(text,jsonb,integer)` | `7c48e4669969147e110ca4381025b129` | `7000c395c79b1c3b5c9f74c1f5e30f35` |
| `admin_apply_subscription_change(...11 args...,numeric)` | `7b4b54f8a55d52578efd75a6aeeb0de0` | unchanged |

Both "before" fingerprints were reproduced locally from `COMBINED-BILLING-IDENTITY.PROPOSAL.sql`
using the exact `$function$ … $function$` slicing Postgres uses for `prosrc`.

## What the install transaction changes

Exactly one object: `public.admin_read_subscriptions(text,jsonb,integer)`. The full function body
is replaced with the current installed body plus two additive keys in the **`monthly`** return:

1. `activePlanBreakdown` — effective Pro accounts (`plan='pro' and pro_expires_at > now()` at the
   snapshot) grouped by the duration stored on their most recent recorded grant:
   - `1` / `3` / `6` from stored `plan_months`;
   - `custom` when `plan_months` is null but the grant's `billing_status` is
     `paid` or `admin_confirmed` (a recorded purchase with no preset duration);
   - `unknown` ("Duration not recorded") otherwise.
   Duration is read only from stored grant metadata — **never** derived from expiration dates or
   prices. The lateral join is the same bounded "latest grant per profile" shape already used by the
   `subscribers` branch.
2. `recentPurchases` — the newest recorded purchases within the requested range, `limit 25`:
   `source='purchased'` **and** the recorded-amount predicate the UI helper `recordedAmount` uses
   (`admin_confirmed` with `amount>=0`, or `paid` with `amount>0`) **and** a grant event type. Gift/Prize are therefore excluded and no sale
   is fabricated. Identity comes from the same `left join public.profiles p on p.id=h.user_id` the
   installed detail/transactions branch already uses — no per-row client lookup, no Auth call.

Everything else in the function is byte-identical to the installed body: the `summary`,
`subscribers`, `detail`/`transactions` branches, pagination, filters, ordering, expiration math and
all financial predicates are unchanged.

## What is NOT changed

- No writer, RLS policy, table, column, index, trigger, cron, notification or historical row.
- No new table or persistent analytics log; no `auth.admin.listUsers`; no per-user entitlement call.
- Financial semantics unchanged: `revenue`/`paidOrders` stay `null` (Unknown); historical `NULL`
  amounts stay Unknown; explicit ₱0 is preserved; Gift/Prize remain complimentary and are not sales.

## Guards (all present)

1. Exactly one `admin_read_subscriptions` overload, else abort.
2. Installed reporting `md5(prosrc)` must equal `7c48e4669969147e110ca4381025b129`, else abort.
3. Exactly one `admin_apply_subscription_change` overload, else abort.
4. Writer `md5(prosrc)` must equal `7b4b54f8a55d52578efd75a6aeeb0de0`, else abort.
5. Single transaction with `lock_timeout = 1s` and `statement_timeout = 5s`.
6. ACLs re-applied: revoked from `PUBLIC`, `anon`, `authenticated`; granted to `service_role`.
7. `notify pgrst, 'reload schema'` after commit.

The rollback mirrors this: it aborts unless the installed body is the reviewed add-on build
(`7000c395…`) and otherwise recreates the approved installed body exactly.

## Bounded cost

Per Sales & Billing tab load the request budget is **unchanged**: still 1 auth verify + 1 `monthly`
RPC. The two new sub-selects reuse the already-bounded shapes (one grouped lateral over `profiles`,
one `limit 25` ordered history read). No polling, no Realtime, no Redis, no N+1.

## Deployment sequence (database first)

1. Obtain explicit owner approval for this exact file set and hashes.
2. Re-run the existing read-only preflight immediately before install; stop if any baseline differs.
3. Install `ACTIVE-PLAN-RECENT-PURCHASES.PROPOSAL.sql` once, in its single transaction. Do not split.
4. Verify the installed `md5(prosrc)` equals `7000c395c79b1c3b5c9f74c1f5e30f35` and the ACLs match.
5. Confirm PostgREST serves the new response fields.
6. Deploy the application code. Before step 3 the new sections show an explicit "not reported by
   this response" pending state; after step 3 they populate. No further code change is required for
   them to light up.

## Rollback

`ACTIVE-PLAN-RECENT-PURCHASES.ROLLBACK.sql` recreates the installed baseline body
(`7c48e466…`) and restores the `service_role`-only ACL. It refuses when the installed body is not
the reviewed add-on build. It never touches history, profiles, the writer or RLS.

## UI mapping (branch code that consumes these fields)

- `app/admin/sections/SalesBillingSection.tsx` — section order Billing summary → Current Pro
  breakdown → Recent purchases → Monthly sales → Billing limitations. Both new sections read
  `monthly.activePlanBreakdown` / `monthly.recentPurchases` and degrade to an explicit pending note
  when the response omits them.
- `app/lib/admin/adminReportingCore.ts` — optional `activePlanBreakdown` / `recentPurchases` types
  and the `PLAN_BUCKETS` / `planBucketLabel` presentation helpers (clean text labels, no pills).
- `app/admin/salesPreviewData.ts` — the disposable dev preview derives the same two fields from its
  fixtures so both sections are demonstrable locally without any production read.

## Limits

- Production SQL was not executed. No production subscriber was read or mutated.
- The add-on body was executed end-to-end in an isolated disposable `postgres:17-alpine` container
  during the owner-approved verification: the exact installed baseline was reproduced (`7c48e466...`),
  this proposal was applied verbatim through its guards (reporting becomes `7000c395...`, writer stays
  `7b4b54f8...`), every data-correctness rule was asserted, and the rollback restored `7c48e466...`.
  The instance was destroyed afterward. The after-install `md5` remains the production integrity check.
- Authenticated acceptance of the rendered sections remains owner-verified; no deployed admin
  session is available here.
- The dev preview (`npm run dev`, `app/offline/admin-preview`) is synthetic only and is not a
  production read.
