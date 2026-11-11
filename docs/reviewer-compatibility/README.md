# BOC / Elsevier compatibility — prepared, not activated

Baseline: `c6127324280a6d8da80ebc914ab3972951860bf3` (live v1.12.5).
Both books remain unpublished. No production SQL or deployment is authorized here.

## Prepared correction

The production fourteen-argument writer infers Ciulla/Rodak from prefixes and
otherwise writes Harr. Its unchanged legacy path is retained for existing books.
The installation proposal rejects BOC/Elsevier on that signature instead of
silently writing Harr. A separately named, service-only RPC accepts a validated
explicit book and writes the existing attempt table. It does not introduce a
study-session engine, question catalog, recurring job, or trusted cutover.

The owner-bound HTTP adapter reuses cookie authentication, effective Pro
entitlement, canonical question lookup/grading and the existing server service
client. Client-supplied correctness, owner and subject/topic metadata are not
accepted. The RPC rechecks active database Pro after its advisory lock, using a
shared profile lock without changing profiles. The response is stored atomically
with the attempt; stable-ID retries cannot change its owner/question/response.

Only the nine source-confirmed fifth-choice IDs may store scalar index4.
Canonical grading validates every actual question's choice count, including
two/three-choice questions. Matching uses the existing renderer and positional
key model. All five authentic vectors are stored as JSON in nullable
`answer_response`; matching `selected_answer` is NULL. History adapters restore
the existing local encoding without discarding the exact stored vector. There
is no historical backfill or automatic reclassification.

Ordinary authenticated direct writes to new-book rows are rejected. The old RPC
cannot bypass this through a new-book prefix. Old-book writer ownership, grants,
search_path, comments and remaining body are preserved. Existing source-bank
bytes, subscription repairs, pricing, cron and service worker are unchanged.

The existing four-argument leaderboard helper already reads `attempt.book` and
supports new-book XP prefixes. Its Harr XP predicate, however, excludes only
Ciulla/Rodak. `LEADERBOARD.PROPOSAL.sql` adds only BOC/Elsevier exclusions, with
an exact body/ACL/config guard and reversible body proof. It preserves the old
three-argument overload and existing four-book behavior, including the separate
pre-existing Strasinger cloud hold. This proposal does not replay migration23/31.

## Disabled rollout controls

- `QUESTION_BANKS.boc.published = false`, `elsevier.published = false`.
- `NEXT_PUBLIC_REVIEWER_COMPATIBILITY_ENABLED` defaults OFF. While OFF, existing
  history queries request their original columns; new-book queues remain held.
- `REVIT_REVIEWER_COMPATIBILITY_ENABLED` defaults OFF and disables the POST route
  before authentication/database requests. It grants no database authority.
- No environment files or production settings were changed. Future activation
  requires separate approval after SQL and publication verification.

The six new source/metadata files retain their original CRLF byte pins through
six appended attributes. All earlier attributes remain unchanged. Twenty-two exact
source-code transitions extend the existing preservation chain; no baseline or
assertion was replaced.

## Evidence and limits

Current results are in `scratch/reviewer-publication-preparation/compatibility/`
outside this worktree: focused tests, original559 hash assertions,306 new/38
existing asset pins, TypeScript, embedded SQL cases and a fresh network-disabled
PostgreSQL17.11 installation/response/permission smoke check. The latter uses
synthetic records only; owned containers are stopped.

The actual captured production leaderboard helper and its dependencies pass on isolated PostgreSQL17.11:36 unchanged old-book metric scopes,18 new-book scopes, All Books/source-subject filtering and unchanged historical synthetic rows. The corrected helper preserves its owner, ACL and search_path.

BOC's 2,469 source-supported records retain all saved fields and the intentional
93-question exclusion. Available-subset certification is valid in principle;
the missing independent final source-vs-final audit cannot be replaced by
matching hashes, first-pass notes or structural checks. No new EXACT status is
asserted. Elsevier's existing exact-hash independent audit remains applicable.

This is the compatibility preparation, not a finished publication release.
Reviewer-only integration is now prepared using49 explicitly selected App hunks and existing components. The dirty root App was not copied. The live VIP entitlement fix remains intact; pending trusted recovery is excluded. A matching encoded-answer restoration bug was corrected. A legacy projection retains original four-book names, ordering, descriptions and topic memberships when no new books are loaded.
The bounded local browser verification passes150 layout/render/reveal/restore states using actual candidate components and controlled data. Real deployment/cross-device/reward verification, full release gates and
explicit SQL/publication/deployment approvals remain outstanding. Existing
historical Updates entries remain unchanged; no unreleased announcement added.

## Minimum future execution order — approval required

1. Finish BOC independent textual certification. The independent inventory/topic/pixel pass is complete; full semantic source review remains incomplete. Local UI, session, matching, source-format and leaderboard checks are prepared and pass within their documented scopes.
2. Review exact final scope and guarded SQL against fresh production metadata and
   valid recovery evidence. Reuse the exact passing isolated leaderboard evidence if its inputs remain unchanged.
3. Under separate production approval, apply only the two reviewed SQL proposals;
   reload PostgREST once. Keep both books and rollout controls OFF until every
   object/permission/preservation check passes. Never replay migrations23–31.
4. Verify exact deployment with production alias unchanged, then obtain explicit
   activation/publication approval. Bind Updates to actual successful Manila
   release day. No automatic rollback, historical rewrite or queue deletion.
