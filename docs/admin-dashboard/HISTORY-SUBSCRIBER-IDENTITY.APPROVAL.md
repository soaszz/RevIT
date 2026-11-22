# History Subscriber Identity — Production SQL Approval Package

**Status: NOT AUTHORIZED, NOT EXECUTED, NOT INSTALLED.** Read-only verification only.

This package lets the owner approve or reject the single reporting-RPC change that adds a subscriber
name to the History table. Nothing in this document has been applied to production.

## Project

- Supabase project: `lznsdxfvxeckflxsohig` (RevIT, production)
- Function: `public.admin_read_subscriptions(p_mode text, p_filters jsonb, p_limit integer)`
- Baseline was verified read-only on 2026-11-21T15:24Z.

## Artifacts and approved fingerprints

| Artifact | SHA-256 | Expected RPC body md5 |
| --- | --- | --- |
| `HISTORY-SUBSCRIBER-IDENTITY.PROPOSAL.sql` (15,491 bytes, LF) | `8425d60107079fab6c1c61eab5c789718bbcb9670d54cab9756c8b9ef796ebab` | `917e965ac4bd37436955a2b6fcc2895e` after install |
| `HISTORY-SUBSCRIBER-IDENTITY.ROLLBACK.sql` (13,433 bytes, LF) | `94b3297b0596244b6bb552e567bb54cdfb5cb1c9c180cab62dffc5a8834c0811` | `db9d92384058ecd509b46214b80f403f` after rollback |

- Installed baseline `md5(prosrc)` read live: `db9d92384058ecd509b46214b80f403f` — matches the approved baseline.
- The identity body’s md5, extracted from the proposal between `$function$` markers without trimming,
  is `917e965ac4bd37436955a2b6fcc2895e` — matches the approved expected fingerprint.
- The rollback body’s md5 is `db9d92384058ecd509b46214b80f403f` — restores the installed baseline byte-for-byte.
- Do not edit either file after approval: any edit changes the hashes above. Line endings must stay LF.

## Exact change (three edits inside the function body only)

```diff
-      select h.* from public.subscription_history h
+      select h.*, p.username from public.subscription_history h
+      left join public.profiles p on p.id=h.user_id
...
-    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id,'eventType',event_type,'source',source,
+    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id,'username',username,'eventType',event_type,'source',source,
```

Everything else — summary, directory, monthly and transaction branches, filters, ordering, pagination,
financial math, consistency CASE, return type, argument list and all safety settings — is unchanged.
No schema change, no RLS change, no writer change, no historical data change, no new table, no new index.

## Verified live properties (read-only)

- Owner: `postgres`; volatility `STABLE` (`s`); `SECURITY INVOKER` (`prosecdef = false`).
- Config: `search_path=pg_catalog, pg_temp; statement_timeout=5s; lock_timeout=1s`.
- ACL: `{postgres=X/postgres,service_role=X/postgres}` — no `anon` or `authenticated` EXECUTE.
- Argument list `p_mode text, p_filters jsonb, p_limit integer`; return type `jsonb`.
- `public.profiles`: RLS enabled, not forced, 4 policies. `service_role` has `BYPASSRLS`; the API path
  runs as `service_role`, so the new primary-key join reads only the one matched profile row.
  `profiles_pkey` is a unique btree on `id`.
- Plan for the new select shape: `Limit -> Sort -> Nested Loop Left Join -> Seq Scan on
  subscription_history + Memoize -> Index Scan using profiles_pkey (id = h.user_id)`.
- Size: `profiles` 344 kB / 1,048 rows; `subscription_history` 96 kB / 54 rows. Bounded to the existing
  page size and the existing 5 s statement timeout; no unbounded scan, no per-row RPC, no extra browser request.
- Isolated disposable-Postgres evidence from Stage 4 already passed: writer contract, identity install,
  rollback, and post-rollback suites; `anon`/`authenticated` denied, `service_role` allowed.

## Rollback

`HISTORY-SUBSCRIBER-IDENTITY.ROLLBACK.sql` restores the installed definition exactly
(`db9d92384058ecd509b46214b80f403f`). If installed behavior is wrong, run the rollback file as stored;
the client keeps the `Account unavailable` fallback because `username` is optional in the response type.

## Explicitly not done

- No production SQL execution, no install, no rollback execution, no subscription or history write.
- No hashes were updated after approval; no owner, ACL, policy, index or table was changed.
- Real production usernames were not fetched into reports or logs.

## Owner decision required

Approve installation of `HISTORY-SUBSCRIBER-IDENTITY.PROPOSAL.sql` as stored, or reject. This package
does not authorize execution by itself.
