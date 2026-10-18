# RevIT Phase 3F — NULL persistence compatibility stop

Date: 2026-10-15.

**NO-GO: Critical blockers remain.**

The required pre-implementation compatibility check failed. No application-level normalization was implemented. Phase 3F section 4 explicitly says: “If NULL would break another component, stop and document the incompatibility before implementing an alternative.” This report records that stop; Phase 3F's persistence fix is not complete.

## Blocking evidence

The recovered `scratch/phase3e_targeted_supabase_schema_verification.md` records this production RPC body:

```sql
if p_selected_answer is null and p_is_correct then
  raise exception 'An unanswered question cannot be correct.' using errcode = '22023';
end if;
```

The same validation exists in:

- Proposed Migration 23: `supabase/migrations/202610130023_strasinger_book_edition_support.sql`, lines 74–75.
- Local pre-feature Migration 22: `supabase/migrations/202610110022_rodak_book_edition_support.sql`, lines 67–68.
- Both dedicated Strasinger rollback paths, lines 69–70.

The Phase 3E report is previously observed production evidence supplied by Antigravity. Codex has not independently reverified it or connected to production.

| Matching attempt payload | Contract outcome |
|---|---|
| Encoded answer above 3 | Rejected by the 0–3 constraint, or by smallint conversion when out of range |
| `NULL`, `p_is_correct = false` | Does not trip this guard; other authentication/input constraints still apply |
| `NULL`, `p_is_correct = true` | Explicitly rejected with `22023` before attempt-ID lookup or insertion |

Therefore normalizing every matching attempt to NULL while preserving correctness cannot work with this RPC. The 54 historically reported NULL rows do not establish that correct NULL attempts are permitted. A client-only change would turn correctly answered Rodak matching attempts into persistent failures; applying Migration 23 would retain the same failure for Strasinger. Both rollback copies would also restore this guard.

Phase 3E suggests synthetic 0/1 answer markers as one option. The current Phase 3F request explicitly forbids substituting 0 or 1, so that suggestion was not followed. No correctness values were changed, SQL guards bypassed, direct table writes introduced, or constraints/types altered.

## Pipeline inspected before stopping

| Area | Source finding |
|---|---|
| TypeScript attempt type | `QuestionAttempt.selectedAnswer` accepts `number | null` |
| Database row mapping | `QuestionAttemptRow.selected_answer` and `questionAttemptFromRow` preserve nullable values |
| RPC boundary | `saveQuestionAttempt` sends `attempt.selectedAnswer` directly; this is the shared send boundary |
| Legacy/offline queue | JSON preserves the local value; `flushQuestionAttemptQueue` calls the shared sender and retains failed entries |
| Local-history migration | Calls the shared sender; on failure it returns without setting the completed marker |
| Deduplication | Queue uses stable IDs; RPC's existing stable-ID handling is after the incompatible NULL/correct guard |
| Session restoration | Restored attempts reach queue/history paths; local parsing accepts nullable answers |
| Matching scoring/feedback | Scoring requires the original encoded integer. No local/session value was normalized or changed |
| Reinforcement | Separate question-ID/level writes; no selected-answer payload; existing cloud gate remains |
| Analytics/leaderboards | Reviewed Phase 3D/3E evidence uses correctness and metadata; no calculation change made |

No end-to-end compatibility claim is made beyond these inspected sources. Live RPC execution, database retry/concurrency, cloud round-trip reconstruction, restored feedback after a future normalization, and deployed behavior remain unverified. Existing Skip and mistake repetition code was not modified.

## Database migration review

- Migration 23 retains both `strasinger7-` and `strasinger-` recognition. Its NULL/correct validation is incompatible with the requested representation.
- Migration 24 independently revokes raw helper EXECUTE from `PUBLIC`, `anon`, and `authenticated` on both three-argument and four-argument `leaderboard_metric_rows` overloads.
- Both dedicated Strasinger rollbacks retain helper restrictions, so feature rollback does not reverse the independent privilege hardening. Exact local body comparisons from Phase 3D remain historical evidence; no SQL file changed in Phase 3F.
- Current PATH checks found no `docker`, `psql`, `pg_ctl`, `initdb`, or `supabase`; checked installation locations/services also found no suitable PostgreSQL/Docker runtime.
- Migration apply, rollback, RLS, trigger firing, role privileges, attribution, synthetic NULL persistence, SQL leaderboard calculations, and historical-row preservation: **NOT TESTED in PostgreSQL**.
- No software installed, local database altered, or production connection made.

## Integrity and testing

Fresh SHA-256 comparison against the saved Phase 3D manifest confirms all four dataset files are unchanged: Harr 1,593; Ciulla 1,890; Rodak 491; Strasinger 467; total 4,441. Exact protected-ID lists match: 47 prior repairs and 42 Strasinger protections. All 38 reviewer asset files match the saved aggregate hash. See `content-integrity.json`.

No application implementation occurred after the compatibility prerequisite failed. Consequently the requested new normalization tests and comprehensive typecheck/lint/build/unit/security pass were **NOT RUN in Phase 3F**. Repeating unchanged application tests cannot make the rejecting RPC accept correct NULL attempts. Phase 3D's prior 130 unit tests, 16 content tests, successful typecheck/build/secret scan, and 104 existing lint warnings remain historical results, not fresh Phase 3F results.

Strasinger synchronization remains default-off in `cloudSyncGate.ts`; existing direct/queued/history/reinforcement guards are unchanged. No flag or environment file was edited. Rodak synchronization retains its existing matching-persistence defect; this phase does not claim it was fixed.

## Exact files changed in Phase 3F

1. Added `docs/phase3f/REPORT.md` — failed compatibility prerequisite and scope of inspected evidence.
2. Added `docs/phase3f/content-integrity.json` — fresh dataset/asset equality results.
3. Added `docs/phase3f/ANTIGRAVITY_HANDOFF.md` — next contract decision and remaining checks.
4. Appended Phase 3F status to `STATUS.md`.
5. Appended Phase 3F handoff to `AGENT_HANDOFF.md`.

Recoverable pre-edit documentation copies: `scratch/phase3f/backups/STATUS.md.bak` and `AGENT_HANDOFF.md.bak`. Existing work/backups are preserved. Application source, tests, SQL, datasets, subscription logic, and environment files were not modified. No existing cloud progress or historical records were accessed or changed.

## Required next decision

Recommended future scope: review a narrowly scoped, matching-aware RPC validation change that permits correct NULL persistence for verified matching question IDs while retaining ordinary unanswered-MCQ validation. This can retain the existing column type, CHECK constraint, RPC signature, and historical records, but it is a server SQL behavior change and needs compatible feature/rollback handling plus isolated PostgreSQL tests. This recommendation is not implemented or approved for production.

An application-only change cannot satisfy both correct matching preservation and the present RPC's NULL/correct guard. Resolve this contract conflict before implementing normalization. See `ANTIGRAVITY_HANDOFF.md`. Stop pending explicit user direction; no production migration, deployment, cloud-sync activation, commit, or push is authorized.
