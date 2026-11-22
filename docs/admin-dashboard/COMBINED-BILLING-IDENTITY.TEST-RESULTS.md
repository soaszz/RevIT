# Combined package — isolated PostgreSQL 17 test results

All tests ran in a disposable `postgres:17-alpine` Docker container on the local machine.
Synthetic accounts only. No production connection, credential, subscriber data, or production
network access. Results below are executed, not inferred.

Reproduction: `powershell -NoProfile -ExecutionPolicy Bypass -File scratch/combined-safety/run-integration-tests.ps1`
Log: `scratch/combined-safety/integration-run.log`

## Setup

1. Created the relevant production-shaped objects: `auth.users`, `public.profiles`,
   `public.subscription_history` (columns, checks, indexes, RLS), and
   `public.pro_activation_notifications`.
2. Installed the exact live baseline bodies, fetched read-only from production:
   - writer `bcf56ed8de8564405649685f592fc70f`, 6,589 bytes;
   - reporting `db9d92384058ecd509b46214b80f403f`, 11,981 bytes.
3. Inserted six synthetic accounts (`alpha` … `foxtrot`).

## Baseline compatibility (before install)

- Baseline writer and reporting body md5 matched the production values.
- Old 11-argument call succeeded and recorded `unknown` / `NULL`, as production does today.
- New `p_amount_php` argument failed with `undefined_function` on the old writer, proving that the
  new application cannot run against the old database.
- The transaction was rolled back, leaving the fixtures free for the install phase.

## Pre-install preflight

All guards true: 11-arg writer present, 12-arg absent, one writer overload, one reporting overload,
baseline md5s exact, `amount_php` integer, expected billing constraints, history RLS on,
`profiles.username` present, zero non-null amounts, zero `admin_confirmed` rows.

## Install and post-install verification

- Install transaction completed without error.
- Writer: 12-arg present, 11-arg dropped, exactly one overload, md5
  `7b4b54f8a55d52578efd75a6aeeb0de0`, owner `postgres`, `SECURITY DEFINER`, `VOLATILE`,
  `search_path=pg_catalog, public`, ACL `{postgres=X/postgres,service_role=X/postgres}`.
- Reporting: md5 `7c48e4669969147e110ca4381025b129`, `SECURITY INVOKER`, `STABLE`,
  `search_path=pg_catalog, pg_temp;statement_timeout=5s;lock_timeout=1s`, same ACL.
- `amount_php` is `numeric`, precision 12, scale 2.
- Status check includes `admin_confirmed`; snapshot check includes the new admin-confirmed branch and
  the grant-event restriction; amount check and plan-months check preserved.
- RLS on, `profiles.username` present, indexes unchanged, 0 history rows at verify time (fixtures
  had not written yet).

## Writer tests A–P (all passed)

| Test | Case | Observed |
| --- | --- | --- |
| A | Old 11 named args, purchased 1-month preset | `admin_confirmed`, 79, plan 1, `activated` |
| B | Custom 45 days, amount 149.50 | `admin_confirmed`, 149.50, plan `NULL` |
| C | Custom 30 days, blank amount | `unknown`, `NULL` |
| D | Custom 30 days, explicit 0 | `admin_confirmed`, 0 |
| E | Gift 3 months | `complimentary`, 0, plan 3 |
| F | Extend 6-month preset with amount 1 | `admin_confirmed`, 399 (preset wins) |
| G | New 12-arg activation, 3-month preset | `admin_confirmed`, 219 |
| H | Modify Expiration to +400 days | `unknown`, `NULL`, `expiration_modified` |
| I | Renew with 1-month preset, 60 days | `admin_confirmed`, 79, `renewed` |
| J | Modify Expiration + amount | rejected `22023` |
| K | Revoke + amount | rejected `22023` |
| L | Gift + amount | rejected `22023` |
| M | Amount 1,000,000.01 | rejected `22023` |
| N | Amount 12.345 | rejected `22023` |
| O | `p_payment_verified = true` + amount | rejected `22023` |
| P | Stale `p_expected_expires_at` | rejected `40001` / `CONFLICT_STALE_STATE` |

## Reporting tests (all passed)

With the rows from A–I (eight grant events, one gift, one modify, one renewal):

- `recordedPurchases = 6` (explicit zero counted once).
- `recordedBilling = 925.50` (79 + 149.50 + 0 + 399 + 219 + 79).
- `renewals = 1`, `renewalSales = 1`, `manualGrants = 1`.
- `revenue` and `paidOrders` are `null`.
- `totalSubscribers = 6`.
- Detail for `alpha` returns `username = alpha` and all legacy fields.
- Every transactions row has a `username` key.
- `event = renewed` filter returns exactly the renewed row.
- Monthly: recorded events 6, recorded amount 925.50, unknown amounts 1; plan 1 = 158 (2 events),
  plan 3 = 219, plan 6 = 399, custom/`NULL` months = 149.50 (2 events).
- Invalid status filter and detail without `userId` both rejected `22023`.

## Identity fallback and revoke

- Deleted one synthetic profile while keeping the auth user and history. Detail returned
  `username = NULL` with the `username` key present.
- Revoke recorded `unknown` / `NULL` / `revoked` and did not change sales totals.

## ACL

- `anon` execution failed with `permission denied for function admin_read_subscriptions`.
- `service_role` executed the summary successfully (`totalSubscribers = 5` after the synthetic
  profile deletion).

## Rollback

- With an `admin_confirmed` row present, rollback refused with
  `Admin-confirmed history exists; resolve recorded billing before rollback`.
- After deleting only the synthetic history rows, rollback completed.
- Restored writer md5 `bcf56ed8de8564405649685f592fc70f` (11-arg, 12-arg absent), reporting md5
  `db9d92384058ecd509b46214b80f403f`, column type `integer`, `admin_confirmed` removed from the
  status check.
- Post-rollback: the old 11-arg call succeeded (`unknown` / `NULL`); the new `p_amount_php` call
  failed with `undefined_function`.

## Not tested and not claimed

- No production SQL, production mutation, deployment, commit, or push.
- No authenticated owner-admin application route walkthrough.
- No full production schema was reproduced; only the objects relevant to the writer, reporting,
  profiles, history, and notification side effects.
- No browser, visual, or responsive verification was run for this database package.
