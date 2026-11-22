# Combined billing recording + History subscriber identity — approval package

Status: **PREPARED, NOT EXECUTED IN PRODUCTION.**
Worktree: `scratch/admin-dashboard-v1140`, branch `codex/admin-dashboard-v1140`.
Baseline commit: `10f97ef294e70ad7e9e287453d56e2dd740ae4ea`.
Date prepared: 2026-11-22.

This package installs the final combined database state for two earlier proposals that edited the
same reporting function and could not be installed back-to-back:

- `BILLING-RECORDING.PROPOSAL.sql` — admin-confirmed billing + writer `p_amount_php`.
- `HISTORY-SUBSCRIBER-IDENTITY.PROPOSAL.sql` — `profiles.username` in recorded history.

Those historical files are unchanged. They remain evidence of the earlier approvals. This package
supersedes both as the install artifact and must be re-approved as a whole.

## Artifacts and hashes

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `COMBINED-BILLING-IDENTITY.PROPOSAL.sql` | 29,748 | `87b36c9afb70dacd4e688682a8036e08a3f5d3554ba5bc63873ef9623ade6660` |
| `COMBINED-BILLING-IDENTITY.ROLLBACK.sql` | 23,704 | `e8a7b8127b8a0d69d43c2db7de41486c6c5824528ac33a517531a8c2034e4f98` |
| `COMBINED-BILLING-IDENTITY.PREFLIGHT.sql` | 5,034 | `9800fb2c25bee7017cca12a2d59fdd7f331a9284d6548aa234ecfa4d52dcfc3b` |
| `COMBINED-BILLING-IDENTITY.VERIFY.sql` | 5,670 | `7ebab8079741f06560185d0eaf351c4221565676fb0e6cc6762d9f777dfe9d08` |

Expected `md5(prosrc)` after install, with LF line endings and the file executed exactly as stored:

| Function | Expected `md5(prosrc)` | Bytes |
| --- | --- | ---: |
| `admin_apply_subscription_change(...11 args..., numeric)` | `7b4b54f8a55d52578efd75a6aeeb0de0` | 7,690 |
| `admin_read_subscriptions(text,jsonb,integer)` combined | `7c48e4669969147e110ca4381025b129` | 12,945 |

Rollback restores the pre-combined installed bodies exactly:

| Function | Restored `md5(prosrc)` |
| --- | --- |
| `admin_apply_subscription_change(...11 args...)` | `bcf56ed8de8564405649685f592fc70f` |
| `admin_read_subscriptions(text,jsonb,integer)` | `db9d92384058ecd509b46214b80f403f` |

## Read-only production preflight (2026-11-22)

Run as `supabase_read_only_user` against `lznsdxfvxeckflxsohig` (production). Result: all guards true.

- Writer 11-arg present, 12-arg absent, exactly one writer overload, md5
  `bcf56ed8de8564405649685f592fc70f`, owner `postgres`, `SECURITY DEFINER`, `VOLATILE`,
  `search_path=pg_catalog, public`, ACL `{postgres=X/postgres,service_role=X/postgres}`.
- Reporting present, exactly one overload, md5 `db9d92384058ecd509b46214b80f403f`, owner
  `postgres`, `SECURITY INVOKER`, `STABLE`,
  `search_path=pg_catalog, pg_temp;statement_timeout=5s;lock_timeout=1s`, same ACL.
- `subscription_history.amount_php` is `integer`, precision 32, scale 0; 0 non-null amounts,
  0 fractional amounts, 0 `admin_confirmed` rows.
- Billing constraints present with the expected pre-install definitions.
- History RLS enabled; profiles RLS enabled; `profiles.username` present.
- Indexes: `subscription_history_expired_once_idx`, `subscription_history_pkey`,
  `subscription_history_user_created_idx`.
- 54 history rows, 1,048 profiles. No routine or view references the writer.
- No subscriber identity, email, note, or payment detail was read or printed.

Machine-readable result: `scratch/combined-safety/preflight-production.json`.

## What the install transaction changes

1. `alter table public.subscription_history alter column amount_php type numeric(12,2)` using a
   widening cast. Live values are all `NULL`, so no value is lost or reinterpreted.
2. `subscription_history_billing_status_check` gains `admin_confirmed`; `paid` keeps its
   provider-verified meaning.
3. `subscription_history_billing_snapshot_check` is replaced:
   - `paid` — purchased, preset months, amount > 0, grant event.
   - `admin_confirmed` — purchased, amount >= 0, grant event.
   - `complimentary` — gift/prize, amount = 0, grant event.
   - `unknown` — amount `NULL`.
   - `NULL` — legacy rows stay `NULL`.
   The grant-event restriction is a tightening; production has zero `paid`/`complimentary`
   rows, so no existing row is rejected.
4. The 11-arg writer is dropped and recreated with a trailing
   `p_amount_php numeric default null`. Exactly one overload remains. No routine or view depends
   on the old function.
5. The reporting function is replaced with the combined body: billing predicates, the two additive
   summary fields (`recordedPurchases`, `renewalSales`), monthly `renewalSales`, and
   `username` in the detail/transactions branch via `left join public.profiles p on p.id=h.user_id`.
6. ACLs are re-applied: revoked from `PUBLIC`, `anon`, `authenticated`; granted to `service_role`.
7. `notify pgrst, 'reload schema'` makes the new signatures visible immediately after commit.

No Auth, RLS policy, table, index, email, note, profile plan/expiry, or historical row is changed by
the install.

## Billing rules preserved

- Presets 1 month ₱79 / 3 months ₱219 / 6 months ₱399, authoritative in the writer and in
  `app/lib/proPlans.ts`.
- Purchased preset sends the preset price even if a custom amount is also present; the preset wins.
- Purchased custom duration accepts an optional amount: 0 to ₱1,000,000, at most 2 decimals.
  Blank stays `unknown` / `NULL`. Explicit `0` is `admin_confirmed` and counts once with zero value.
- Gift/Prize is `complimentary` / 0 and is never a sale.
- `paid` is unchanged and still requires `p_payment_verified = true`; the app continues to send
  `p_payment_verified: false`, so admin-entered amounts are `admin_confirmed`, never `paid`.
- Grant and Activate record a purchase when `source = purchased`.
- Extend records a sale only for explicit purchased grants.
- Modify Expiration and Revoke record no sale; a supplied amount is rejected.
- No reference, provider order, or revenue is fabricated. `revenue` and `paidOrders` stay `null`.
- Historical `NULL` stays Unknown; unknown amounts are counted separately and never inflate totals.

## Deployment sequence (database first)

1. Obtain explicit owner approval for this exact file set and hashes.
2. Re-run `COMBINED-BILLING-IDENTITY.PREFLIGHT.sql` read-only immediately before install. Stop if
   any guard differs.
3. Install `COMBINED-BILLING-IDENTITY.PROPOSAL.sql` once, as the database owner, in its single
   transaction. Do not split the file.
4. Run `COMBINED-BILLING-IDENTITY.VERIFY.sql`. Stop on any mismatch.
5. Confirm PostgREST serves the 12-arg writer and the combined reporting function.
6. Deploy the application code that sends `p_amount_php` and renders `username`.
7. Exercise one authenticated owner-admin Grant/Extend in production only if separately authorized.
8. Record the deployment date in `app/data/siteUpdates.ts` only when production deployment actually
   occurs, per the release-date rule.

Old application code remains compatible with the combined database. New application code is **not**
compatible with the old database: it sends `p_amount_php`, which the old writer does not define.
Do not deploy the new application before step 3.

## Rollback and forward repair

`COMBINED-BILLING-IDENTITY.ROLLBACK.sql` restores the exact pre-combined writer and reporting bodies,
the `integer` column, and the pre-install constraints. It refuses when:

- any `admin_confirmed` row exists;
- any fractional amount exists;
- the column is not `numeric`;
- the installed reporting body is not one of the known combined/billing/identity bodies.

It never deletes history, revokes Pro, changes profiles, or issues a refund.

After the first combined-schema write, rollback is unsafe by design. Use forward repair: keep
`numeric(12,2)` and the wider checks, and deploy a corrected writer/reporting definition. Reverting
the data shape would discard attested amounts.

## Limits

- Production SQL was not executed. No production subscriber was mutated.
- The authenticated owner-admin route walkthrough was not exercised; no owner session is available.
- The identity RPC is not installed, so live History still shows the neutral fallback.
- Isolated tests used a disposable PostgreSQL 17 container with a synthetic schema that reproduces
  the relevant production objects, not the full production schema.
- Environment-blocked repository suites remain `reviewer-compatibility`,
  `reviewer-release-profile` (need `.private-reviewers/`) and `phase3n-*` evidence suites.
