# Phase 3D regression results

Date: 2026-10-15.

## Focused checks

| Command/check | Result |
|---|---|
| `npx tsx --test tests/strasinger.test.ts tests/pro-entitlements.test.ts tests/leaderboard.test.ts tests/skip-question.test.ts tests/matching-question.test.ts tests/reviewer-library.test.ts tests/flashcards.test.ts` | 34 passed |
| `npx eslint . --ignore-pattern dist --ignore-pattern .next --rule 'react-hooks/refs:error' --format json --output-file scratch/phase3d-refs-baseline.json` | Baseline: one existing refs error at leaderboard row map; 104 warnings |
| `npx tsx --test tests/phase3d.test.ts` before implementation | Four tests failed, exposing prefix/sync/ACL deficiencies |
| Same test file after implementation and additional content/API tests | Six passed |
| Structured question comparison against existing pre-repair backups | Only 47 intended `disableShuffle` additions; no other record-field differences |

Focused logs remain under `scratch/phase3d-*.log`. Original-repair comparison: [log](prior-repairs.log).

## Comprehensive pass

| Command | Final result | Log |
|---|---|---|
| `npx tsc --noEmit` | PASS, exit 0 | [typecheck](typecheck.log) |
| `npm run lint` | PASS, exit 0; 0 errors, 104 existing warnings | [lint](lint.log) |
| `npm run build` | PASS, exit 0 | [build](build.log) |
| `npx tsx --test tests/*.test.ts` | 130 passed, 0 failed | [unit](unit.log) |
| `node --test tests/reviewer-content.test.mjs` | 16 passed, 0 failed | [content](reviewer-content.log) |
| `npm run security:secrets` | PASS, 0 detected leaks | [secrets](secrets.log) |

The unit pass includes reviewer-content-adjacent logic, Strasinger data, entitlements, matching, skip, leaderboard, adaptive repetition, AI security, and existing application unit tests. It is not an end-to-end browser or SQL test. `npm test` was decomposed into its build/unit/content commands to avoid a second unnecessary build.

The local runner `scratch/phase3d/run-regression.mjs` invokes these commands with credential-free child environments. It retains OS/runtime paths, clears application environment-file variable names, prevents environment loading from supplying credentials, and sets Strasinger synchronization off. No `.env` file was edited. Unit Supabase calls use fixtures/mocks.

Initial sandboxed focused tests could not spawn workers (`EPERM`); rerunning the authorized tests outside the sandbox succeeded. Initial comprehensive typecheck/build included recoverable backup `.ts`/`.tsx` files in the existing TypeScript glob. Renaming those backups `.bak` corrected the cause without changing TypeScript exclusions or application source. Only typecheck/build were repeated. Initial evidence is retained as `typecheck.initial.log` and `build.initial.log`; final exit codes are in [machine-readable results](regression-results.json).

Existing warnings are separate from failures: 104 lint warnings were present in the baseline and final run. Node 26 emits a `module.register()` deprecation warning during the build. No assertion or lint severity was weakened to pass Phase 3D.

## Not tested

- PostgreSQL migration/rollback execution and actual SQL outputs.
- Role-based EXECUTE, wrapper ownership permissions, RLS enforcement, trigger firing, or database concurrency.
- Live Supabase schema/subscription behavior, remote APIs, production environment flags, and deployed caching.
- Browser interactions or visual responsiveness. No visual UI change was made.
- Dependency vulnerability audit (`npm audit`); the requested local security checks used the repository secret scan, existing AI/security tests, and scoped source review.
