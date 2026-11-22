# Billing Recording — Production SQL Approval

Status: LOCAL PROPOSAL. Not executed. Production SQL requires explicit owner approval.

## Files

| File | SHA-256 |
| --- | --- |
| `docs/admin-dashboard/BILLING-RECORDING.PROPOSAL.sql` | `857d4a01bb8ee1312f8dab253d2c88b0174684025bf001f087786939c8427640` |
| `docs/admin-dashboard/BILLING-RECORDING.ROLLBACK.sql` | `d86613b7696748db34723114d1d4611c22fc6ceb092e29ae89810fea98b392e8` |

Expected post-install `md5(prosrc)`:

- `public.admin_apply_subscription_change(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean,numeric)` = `7b4b54f8a55d52578efd75a6aeeb0de0`
- `public.admin_read_subscriptions(text,jsonb,integer)` = `c3dbfb77a8348246103b437608e32aea`

Approved pre-install baselines:

- writer = `bcf56ed8de8564405649685f592fc70f`
- reporting = `db9d92384058ecd509b46214b80f403f`

Rollback restores exactly those baselines (`bcf56ed8...` and `db9d9238...`) and drops the 12-argument writer.

## Behaviour

- Purchased preset grant/extend/renew: amount is the authoritative plan price from `app/lib/proPlans.ts` and stored as `admin_confirmed`.
- Purchased custom duration: optional manual amount, up to two decimals, `0` allowed, blank stays `unknown` with `NULL`.
- Gift/Prize: `complimentary`, amount `0`, never converted to a paid sale.
- Reject: negative, malformed, above ₱1,000,000, more than two decimals, `NaN`/`Infinity`, or an amount on a non-grant action.
- `paid` keeps its existing provider-verified meaning. The admin path never claims provider verification and still sends `p_payment_verified: false`.
- Modify Expiration and Revoke never record a sale.
- Reporting counts both `paid` and `admin_confirmed` for recorded totals, adds `recordedPurchases` and `renewalSales`, and leaves historical `NULL` amounts as Unknown.

## Required checks before execution

1. Re-run the guards in the proposal against a fresh read-only catalog.
2. Confirm `subscription_history` still has no non-null `amount_php` (the proposal refuses otherwise).
3. Run `EXPLAIN` (without `ANALYZE`) for the reporting query paths.
4. Stop if any other function calls `admin_apply_subscription_change`.
5. Apply as one transaction, then verify both new fingerprints and the ACL: `postgres`, `service_role` only.

## Sequencing

Install this SQL package **before** deploying the application change, because the app sends the additive `p_amount_php` argument. The reverse order is safe at the database layer (old 11-argument callers resolve to the new function through the default), but the new app against the old 11-argument function would fail on the unknown argument. No application deploy is authorized here.

`docs/admin-dashboard/HISTORY-SUBSCRIBER-IDENTITY.PROPOSAL.sql` changes the same reporting function and guards the `db9d...` baseline. It must be rebased onto the new reporting definition and re-approved; do not install both files as written. The identity SQL is intentionally unchanged by this package.

## Rollback

Run `BILLING-RECORDING.ROLLBACK.sql` only before any `admin_confirmed` row or fractional amount exists. The rollback refuses otherwise and never deletes history or issues a refund.
