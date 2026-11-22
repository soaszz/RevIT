# Combined package — compatibility report

Scope: writer secret-argument overload, PostgREST resolution, SQL callers, grants, reporting JSON
shape, old/new application matrix. Read-only production evidence only; no production write.

## Writer overload decision

Live state has exactly one function named `admin_apply_subscription_change`:
`(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean)`, md5
`bcf56ed8de8564405649685f592fc70f`.

The package drops that function and creates one 12-argument function with
`p_amount_php numeric default null` as the trailing argument. It does **not** keep both overloads.

Why drop instead of overload:

- Two overloads with a trailing default argument are ambiguous for an 11-argument call. PostgreSQL
  and PostgREST could resolve the call to either candidate or reject it as ambiguous.
- A single 12-argument function with a default keeps the old 11-argument call valid.
- The combination cannot be applied twice: the guard requires the 11-arg function to exist and the
  12-arg function to be absent, and requires exactly one writer overload.

Read-only production evidence:

- `writer_overload_count = 1`.
- No other routine or view references `admin_apply_subscription_change`.
- No view depends on it.
- ACL is `{postgres=X/postgres,service_role=X/postgres}` before install; the package re-applies the
  same ACL after recreating the function.

## PostgREST resolution

Old application code sends 11 named arguments:

`p_user_id, p_action, p_source, p_duration_days, p_custom_expires_at, p_admin_id, p_custom_message,
p_expected_expires_at, p_allow_shorten, p_plan_months, p_payment_verified`

After install, the only candidate is the 12-arg function, and `p_amount_php` has a default, so the
old call resolves. New code sends the same 11 plus `p_amount_php`, which resolves to the same
function. `notify pgrst, 'reload schema'` is issued in the install transaction.

The 11-argument call was executed successfully against the combined function in the isolated
PostgreSQL 17 test, and the 12-argument call was also executed successfully.

## Application matrix

| Application | Database | Result |
| --- | --- | --- |
| Old app (11 args) | Old database | Works today. |
| Old app (11 args) | Combined database | Works; `p_amount_php` defaults to `NULL`; extra reporting fields are ignored. |
| New app (12 args) | Combined database | Works. |
| New app (12 args) | Old database | **Fails**: `p_amount_php` is not a parameter of the old writer (`42883`). Database must be installed first. |
| New app (12 args) | Rolled-back database | **Fails** for the same reason. Rollback requires reverting the app too. |

The isolated test proved both directions: after install, old and new calls succeed; after rollback,
the old call succeeds and the new argument fails with `undefined_function`.

## Reporting function compatibility

Signature is unchanged: `admin_read_subscriptions(text,jsonb,integer)`, `STABLE`,
`SECURITY INVOKER`, same `search_path` and timeouts, same ACL.

Additive fields:

- `summary.recordedPurchases` — count of purchased grant events with `paid` or `admin_confirmed`.
- `summary.renewalSales` — count of renewed events among those recorded purchases.
- `monthly.renewalSales` — same count inside the requested month range.
- `detail` / `transactions` rows: `username` from `profiles.username`.

All previous fields and branches are preserved: summary counts, subscriber directory, pagination,
filters, ordering, monthly months/plans/sources, CSV consumption, `revenue`/`paidOrders` `null`,
`recordedBilling` `null` unless a stored positive/confirmed amount exists.

The identity join is inside the existing bounded query:

`left join public.profiles p on p.id = h.user_id`

`profiles.id` is the primary key. At most `v_limit + 1` rows (<= 251) are joined per request, so the
join adds one primary-key lookup per returned row and no extra client round-trip,
per-row RPC, or `auth.admin.listUsers` call. A missing profile row yields `username = NULL`, which
the existing UI already treats as `Account unavailable`.

## Constraint compatibility

- `amount_php` widening `integer -> numeric(12,2)` is a table rewrite of 54 rows, negligible. All
  live values are `NULL`; 0 non-null amounts and 0 fractional amounts were verified.
- `paid` semantics are unchanged, including `plan_months is not null`, purchased source, amount > 0.
- `admin_confirmed` is new and accepts purchased grant events with amount >= 0.
- `complimentary` remains gift/prize with amount 0; the new snapshot check also restricts it to
  grant events.
- `unknown` remains amount `NULL`.
- Legacy `NULL` billing status remains allowed.
- The writer rejects more than 2 decimals before insert. A direct SQL insert bypassing the writer
  would be rounded by `numeric(12,2)`; the writer is the supported path.

## Deployment ordering constraint

Install the SQL before deploying the new application. The reverse order fails at the writer call.
Old application code does not need to be reverted after install, so the install can be applied
before the application deployment with no subscriber-facing breakage.

## Residual risks

- A concurrent admin write during the DDL transaction blocks on the function/table locks and then
  sees the committed new state. The transaction is atomic; there is no mixed-signature window.
- New history rows written after install require the new constraint definitions; the writer and
  constraints were tested together.
- Once an `admin_confirmed` or fractional row exists, rollback refuses. Forward repair is the only
  safe recovery path.
- PostgREST schema cache reload is requested explicitly, but the deployment smoke test should still
  confirm the 12-arg writer is callable before the application switch.
