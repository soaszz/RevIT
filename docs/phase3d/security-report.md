# Phase 3D security verification

Date: 2026-10-15. Scope: proposed Strasinger migration/rollback, raw leaderboard helpers and callers, Strasinger API, and cloud attempt paths.

## Leaderboard privacy defect corrected locally

The entry Migration 23 and both rollback files revoked `PUBLIC`/`anon` access to the four-argument raw helper but explicitly granted EXECUTE to `authenticated`. That SECURITY DEFINER helper returns participant UUIDs and metrics from attempts/events without the opt-in filtering applied by its wrappers. Restricting anonymous users alone was insufficient.

All three feature files now revoke direct helper access from `PUBLIC`, `anon`, and `authenticated`. Independent `202610150024_leaderboard_helper_privileges.sql` applies the same restriction to both three-argument and four-argument helpers. It changes ACLs only and deliberately has no security-weakening feature rollback.

Source callers are `get_leaderboard_snapshot(text,text,text,text)`, `get_leaderboard(text,text,text,integer,integer,text)`, and `get_current_user_leaderboard_position(text,text,text,text)`, plus retained legacy overloads. Their SECURITY DEFINER execution permits owner-mediated calls without granting the browser raw-helper access, provided live owners have the necessary rights. Application `loadLeaderboard` only calls those wrappers.

Reviewed wrappers require `auth.uid()`, filter public rankings through `leaderboard_opt_in`, and expose the current user's own position separately. Their public result shapes do not include raw participant UUID columns. This does not prove there are no alternate live views/functions or inherited grants. Catalog and isolated-role checks remain required.

The [PostgreSQL 17 function documentation](https://www.postgresql.org/docs/17/sql-createfunction.html) explains owner-context execution and default public function access. [Supabase function guidance](https://supabase.com/docs/guides/database/functions) also recommends explicit EXECUTE restrictions. These support the design; runtime behavior was not tested here.

## Cloud isolation defect corrected locally

Entry UI guards blocked newly answered Strasinger questions, but shared `saveQuestionAttempt`, history migration, and queue flush functions did not apply the capability gate. Startup/session-restoration paths call these shared functions independently of the answer UI.

Shared question/subject/topic-prefix gating now:

- Rejects direct blocked attempt/reinforcement saves before any Supabase call.
- Prevents new blocked attempt/reinforcement queue entries.
- Retains old blocked queue entries while allowing other books to flush.
- Filters local attempt/activity migrations and leaves completion markers pending when Strasinger history is deferred.

Synthetic tests exercise both Strasinger ID prefixes, subject-only identification, Harr/Ciulla/Rodak uploads, old mixed queues, disabled direct writes, migration markers, and queue stable-ID deduplication. No real user record or live client is used.

The gate remains default-off; environment files were not modified. A `NEXT_PUBLIC_` flag is a build-time rollout control, not server authorization. The earlier misleading comment claiming client manipulation could not enable it was removed.

## Server content authorization

The actual Strasinger GET source was executed with mocked module boundaries, not a reimplemented authorization simulator. Tested: unavailable configuration 503, anonymous 401, free/expired 403, entitlement error 500, server-confirmed Pro 200, and private/no-store headers. Unauthorized paths never read the premium payload. The existing `get_my_entitlement` server RPC remains authoritative.

These tests do not verify live token validation, live subscription expiry calculations, deployment caching, or network failure behavior. No production connection was made.

## Preserved boundaries and limitations

- Existing SQL attempt writes authenticate `auth.uid()` and bind attempt records to that user. They do not independently enforce book subscriptions or the frontend rollout flag; the historical own-row direct table-write policies also remain. Premium content access continues to require server Pro authorization. Do not present frontend gating as a database security boundary.
- Trusted function ownership, role inheritance, `public` schema CREATE privileges, effective ACLs on all overloads, live RLS, and alternate exposure routes remain unverified.
- Proposed functions use `search_path = pg_catalog, public` and schema-qualified application tables/auth calls; no dynamic SQL or user-controlled relation interpolation was added. Live ownership/schema trust must still be checked.
- Matching encoding is incompatible with the checked-in database answer contract; see the database report. This blocks migration readiness even though local question scoring passes.
- Global `react-hooks/refs` checks are restored. Only the existing leaderboard row-map cache expression has a documented exception; its state/cache redesign is deferred. Other existing lint exceptions are untouched.
- Secret scan passed with zero detected leaks. No credentials or environment values are stored in these reports or handoffs.

Runtime leaderboard privacy/privileges and RLS verdict: **NOT TESTED**. The source fix is prepared; production remediation has not occurred.
