# Private BOC / Elsevier delivery

Preparation only. Both publication constants remain false. No new environment
variables, Supabase objects, Storage bucket, credentials or dependencies are needed.

## Source custody and upload

The public repository contains code, metadata and exact SHA-256 pins, never the two
commercial banks, their two source manifests, presentation fixture or 306 images.
`pins.json` binds the original 311 files to their new private locations. Bank bytes,
source image URLs, question IDs, order, answers, rationales and image bytes stay exact.

Keep the authoritative pack outside Git on an owner-controlled filesystem. The
prepared Windows master and working copy have owner/SYSTEM-only NTFS access.
They are **not encrypted**. Protect the disk, backups and all subsequent upload
checkouts accordingly. The recovery database backup does not back up this pack.
Do not copy the private master into another repository, public directory, issue,
CI artifact or release attachment. No third-party source files are committed.

From a fresh, clean, owner-only upload checkout of the approved release commit:

    node scripts/stage-private-reviewers.mjs <absolute-private-master-directory>
    node scripts/stage-private-reviewers.mjs

The first command copies only 308 runtime files (2 banks + 306 PNGs), after verifying
all hashes. It refuses conflicting destination bytes and linked paths. It never
copies the three audit fixtures. Without an argument it only verifies the pack.
The local test candidate also retains the three authentic fixtures under ignored
`.private-reviewers/verification/`; they are excluded from upload and file tracing.

Review the installed Vercel CLI dry upload inventory before authorization to upload.
The committed `.vercelignore` allowlist includes only runtime pack data plus approved
application/build/test inputs. It excludes handoffs, scratch, environments and audit
fixtures. Next's server file tracing includes runtime inputs; public output must
contain no private banks/images. A Git-only build cannot supply the private pack;
use the reviewed CLI clean-upload procedure. Missing/tampered runtime data fails
closed with 503 when requested; no fallback to public content exists.

## Request authorization

`/api/reviewer/boc`, `/api/reviewer/elsevier` and
`/api/reviewer/assets/{boc|elsevier}/{exact-pinned-filename}` all use the same guard.
The guard checks publication, configured authentication, `auth.getUser()` and
`get_my_entitlement`. It requires `effective_plan = pro`, finite `server_now` and
`pro_expires_at`, and expiration strictly later than **database** `server_now`.
Anonymous 401, Free/expired 403, unpublished/unknown 404, unavailable/tampered 503.
No client time, VIP override, service-role entitlement or entitlement cache is used.

Every authorized content/image request uses one user lookup and one entitlement RPC.
Unknown image paths and unpublished books make no Supabase calls. No polling,
per-question authorization loop or new background request is introduced.
All responses are private/no-store, including CDN headers; session cookies vary
responses. Canonical source/byte caching never replaces fresh authorization.

`QuestionStimulus` maps only the two new source-image prefixes to the API namespace.
It uses unoptimized images so the user's session cookie reaches the protected route.
The existing service worker excludes `/api/`; using the old static PNG namespace
would allow its manual image cache to outlive entitlement. That service worker is
unchanged. Original static URLs have no files; image optimization cannot supply an
authentication bypass. Four existing book URLs/rendering remain unchanged.

An authorized learner can retain content already received. This controls retrieval,
not copying or revocation of previously downloaded bytes. Provider project owners
can inspect private deployment source; Vercel project access must remain restricted.

## Coordinated release checkpoints

1. Resolve documented BOC independent comparisons and owner redistribution clearance.
2. Obtain explicit combined release, guarded SQL and publication approval. Keep date
   Pending until the actual authorized Asia/Manila release day. Review the exact
   Updates/publication/compatibility changes and append exact hash transitions.
3. Revalidate live baseline, recovery cutoff/limitations, SQL guards and Pro RPC
   return shape. Execute only INSTALL.PROPOSAL.sql then LEADERBOARD.PROPOSAL.sql,
   verify preservation and refresh PostgREST once. Do not replay migrations 23–31.
4. Run changed-input release gates, review exact public commit inventory and push
   only the approved branch. Keep the private pack out of Git.
5. Stage verified runtime pack into the clean upload checkout. Verify server traces,
   public-output absence and upload inventory. Create one protected, unaliased
   production-target artifact using the existing project and --prod --skip-domain.
6. Existing Vercel Authentication must protect the artifact; --skip-domain alone is
   not privacy. No authentication bypass. Owner-authenticated verification must
   exercise anonymous, Free, expired and active Pro boundaries using approved
   synthetic/test accounts without changing student records; verify all three
   private asset classes, sessions, matching/fifth choice, pricing and maintenance.
7. Stop for promotion approval. Promotion of the verified publication-enabled
   artifact is the single public activation point. There is no runtime publication
   toggle. Verify official alias, date, both new Pro books, four existing books,
   expiration/pricing/maintenance and asset denials immediately afterward.

Stop between checkpoints on any mismatch. No automatic rollback after structured
attempt data exists. No subscription, cron, pricing, Google Sheets, maintenance,
service-worker, trusted-persistence or unrelated SQL changes belong here.
