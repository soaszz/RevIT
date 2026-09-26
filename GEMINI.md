# RevIT Project Memory & Guidelines

## 1. README.md & Public Documentation Policy
- **Never put private, internal, or technical implementation info in `README.md`**.
- `README.md` must only showcase the site's core product features from the learner's perspective.
- Keep developer notes, architecture details, and internal changelogs in `changelog-private.md` (which is git-ignored).

## 2. Privacy & Telemetry Rules
- **Online Presence**: Real-time counter (`app/lib/useOnlinePresence.ts`) uses Supabase Realtime channel `online-learners`.
- **Zero PII**: Presence keys must remain purely anonymous session tokens (`sessionStorage`). Never broadcast `userId`, emails, or database identifiers.

## 3. UX & Architectural Conventions
- **Sound Effects**: Default ON permanently. Do not add sound toggles to session preference modals.
- **Review Library**: Subjects use accordion expand/collapse; only major subjects show initially, and topics stay open until the user closes them.
- **Flashcards**: Choices appear horizontally below questions on the front, remain selectable, and reveal answers on flip.
- **Leaderboard Privacy**: Opt-in toggle lives only in the top filter control card (`controlCard`). Do not add duplicate buttons below the position card.

## 4. Updates Tab Guidelines
- **Plain & Straightforward Language**: When adding entries to `app/data/siteUpdates.ts` (Updates tab), keep titles, summaries, and highlights simple, direct, and plain-English (e.g., "Combined Hematology 1 and 2 on Harr", "Added Ciulla Book Fourth Edition").
- **No Overly Deep Words**: Avoid dense technical jargon or overly elevated prose. Use clear words that users easily understand.

## 5. Multi-Book Edition Architecture Rules
- When adding any new book editions (e.g. beyond Harr and Ciulla):
  - **Progress**: Support book edition filtering and consistent MTAP 1 vs Other Majors categorization.
  - **Leaderboards**: Add edition to filter controls (`All`, `Harr`, `Ciulla`, `<New Book>`), handle unified score aggregation in "All Books", and render book edition pill badges.
  - **Weakness Analytics**: Ensure filtering works by edition, populate the dedicated `Book edition` table column, and style with corresponding book badge pills.
  - **Review Library & Flashcards**: Register in `getUnifiedSubjects`, provide book edition dropdowns/badges, and keep separate book accordions when "All Books" is selected.

## 6. Question Extraction & Stimulus Media Rules
- **Mandatory Visuals Extraction**: When processing or extracting questions from source PDFs, ALWAYS extract, crop, and attach any associated graphs, diagrams, figures, scatterplots, charts, morphologies, or images.
- **Stimulus Configuration**: Save images to `public/reviewer-assets/...` and populate the question's `stimulus` property (`kind: "image"` with `src`, `alt`, `width`, `height`, and optional `caption`, or `kind: "table"` for tabular data). Never omit, skip, or describe away visual stimuli that belong to the question.

## 7. Pre-Push Verification Checklist
Before pushing to remote:
1. **Bring Turnstile back (Re-enable protection)**: Turnstile was disabled temporarily for local testing. Always re-enable and enforce it (`disableCaptcha = false` in `AuthPanel.tsx` and `ForgotPanel.tsx`, `NEXT_PUBLIC_DISABLE_CAPTCHA=false`) before any push. Never push with Turnstile bypassed.
2. `npm run security:secrets` (must pass with 0 leaks)
3. `npx tsc --noEmit` (clean typecheck)
4. `npm test` (`next build` + all tests passing)

## Execution & Output Rules
- **No autonomous browser testing or verification:** Do NOT run browser automation, test scripts, or verification suites unless explicitly instructed with commands like "test this", "verify", or "run tests".
- **No visual artifacts/screenshots:** Do NOT capture, render, or attach screenshots, screen recordings, or visual previews unless explicitly asked.
- **No Git or Push or Security Checks without command:** Do NOT run git commands (commit, push, log, diff, stash, etc.), do NOT push to remote, and do NOT run security checks unless user explicitly instructs to push or check.

## 8. Communication Style
- **Default Mode**: Always communicate in ultra-compressed caveman mode (`/caveman ultra`). Cut filler, pleasantries, articles, and unnecessary words. Keep all technical substance, exact code symbols, and accuracy 100% intact.

