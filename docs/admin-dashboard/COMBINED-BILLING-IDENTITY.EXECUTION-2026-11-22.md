# Combined billing + History identity — production execution record

Executed: **2026-11-22 04:06 UTC** (2026-11-22 12:06 Asia/Manila).

Target: Supabase project `lznsdxfvxeckflxsohig` (RevIT, production), linked target reported by the CLI
as `{"kind":"linked","project_ref":"lznsdxfvxeckflxsohig","project_name":"RevIT","environment":"production"}`.

## Artifact installed

| Item | Value |
| --- | --- |
| File | `docs/admin-dashboard/COMBINED-BILLING-IDENTITY.PROPOSAL.sql` |
| Bytes | 29,748 |
| SHA-256 | `87b36c9afb70dacd4e688682a8036e08a3f5d3554ba5bc63873ef9623ade6660` |
| Command | `supabase db query --remote=lznsdxfvxeckflxsohig --file docs/admin-dashboard/COMBINED-BILLING-IDENTITY.PROPOSAL.sql --yes --output-format json` |
| Exit code | 0 |
| Rows returned | none |
| Transaction | single `begin; ... commit;` inside the file, with `lock_timeout=1s` and `statement_timeout=5s` |

The file was executed exactly as stored. No substitution, no edit, no additional statement.

## Preflight result (PASS, immediately before install)

- writer 11-arg present, 12-arg absent, exactly 1 writer overload, md5
  `bcf56ed8de8564405649685f592fc70f`.
- reporting present, exactly 1 overload, md5 `db9d92384058ecd509b46214b80f403f`.
- writer owner `postgres`, `SECURITY DEFINER`, `VOLATILE`, not strict, not leakproof,
  `search_path=pg_catalog, public`, ACL `{postgres=X/postgres,service_role=X/postgres}`.
- reporting owner `postgres`, `SECURITY INVOKER`, `STABLE`,
  `search_path=pg_catalog, pg_temp;statement_timeout=5s;lock_timeout=1s`, same ACL.
- `amount_php` integer, precision 32, scale 0; 0 non-null amounts; 0 fractional; 0 `admin_confirmed`.
- Billing constraints matched the approved pre-install definitions.
- History RLS on; profiles RLS on with four `*_own` policies; `profiles.username` present.
- Indexes: `subscription_history_pkey`, `subscription_history_expired_once_idx`,
  `subscription_history_user_created_idx` (btree `user_id, created_at DESC, id DESC`).
- 54 history rows, 1,048 profiles, latest history `2026-11-19T20:15:00Z`, 7 rows in the last 7 days.
- No routine or view references the writer.
- Rollback applicable: no `admin_confirmed` row, no fractional amount.

Evidence: `scratch/combined-safety/preflight-preinstall-2026-11-22.json`,
`scratch/combined-safety/60-preflight-supplement.json`.

## Post-install state

| Item | Value |
| --- | --- |
| Writer | 12 args, md5 `7b4b54f8a55d52578efd75a6aeeb0de0` |
| Writer trailing arg | `p_amount_php numeric DEFAULT NULL::numeric` |
| Writer defaults | 10 of 12 parameters defaulted |
| Old 11-arg function | absent |
| Writer overloads | 1 |
| Reporting | md5 `7c48e4669969147e110ca4381025b129`, overloads 1 |
| `amount_php` | `numeric(12,2)` |
| Status check | `paid, complimentary, unknown, admin_confirmed` |
| Snapshot check | paid / admin_confirmed / complimentary / unknown with grant-event restriction |
| ACLs | writer and reporting still `{postgres=X/postgres,service_role=X/postgres}` |
| Modes | writer `SECURITY DEFINER` `VOLATILE`; reporting `SECURITY INVOKER` `STABLE` |
| Search paths / timeouts | unchanged |
| RLS | history on, profiles on |
| History rows | 54, latest `2026-11-19T20:15:00Z` |
| Profiles | 1,048; Pro 16; `pro_started_at` not null 37 |
| Notifications | 28 total, 2 in last 7 days |
| Non-null amounts | 0 |
| `admin_confirmed` rows | 0 |

## Resolution probes (no execution, no writes)

- `EXPLAIN` of the old 11 named arguments as `postgres` inside `begin read only; ... rollback;`
  returned `Result` with exit 0. `EXPLAIN` does not execute a volatile function, and the read-only
  transaction would have rejected any write.
- `EXPLAIN` of the new 12 named arguments (including `p_amount_php => 79.00`) returned `Result`
  with exit 0.
- The read-only role `supabase_read_only_user` was denied `EXECUTE` on both functions
  (`42501 permission denied`), confirming the ACL is still service-role-only.
- PostgREST schema cache now advertises the writer with 12 arguments, including `p_amount_php`,
  and only `p_user_id` and `p_action` required:
  `rpc_argument_count=12`, `rpc_has_p_amount_php=true`.
- Reporting smoke: `summary` returned 1,048 total subscribers, 16 active Pro, 0 recorded purchases,
  `recordedBilling` null, `revenue` null, `paidOrders` null; `monthly` returned 2 months and 0
  recorded events; `transactions` sampled 25 rows, all 25 carrying the `username` key and a non-empty
  value. No username value was printed.

Evidence: `71-verify-postinstall.json`, `72-verify-postinstall-2.json`,
`73-probe-old-11-named.json`, `74-probe-new-12-named.json`, `75-postgrest-cache-probe.log`,
`76-postgrest-spec-inspect.log`, `77-final-state.json`.

## Not performed

- No subscription grant, extend, revoke, or expiration change.
- No profile, history, notification, Auth, or RLS row/policy change.
- No git commit or push, no Vercel deployment, no promotion, no pricing change.
- No rollback execution.

## Rollback applicability after install

`COMBINED-BILLING-IDENTITY.ROLLBACK.sql` still applies: it accepts reporting md5
`7c48e4669969147e110ca4381025b129`, refuses when any `admin_confirmed` row or fractional amount
exists, and restores writer `bcf56ed8...`, reporting `db9d...`, and the `integer` column. It becomes
unsafe after the first new-schema billing write; use forward repair from that point.
