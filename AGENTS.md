<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Updates Tab Guidelines
- **Plain & Straightforward Language**: When adding entries to `app/data/siteUpdates.ts` (Updates tab), keep titles, summaries, and highlights simple, direct, and plain-English (e.g., "Combined Hematology 1 and 2 on Harr", "Added Ciulla Book Fourth Edition").
- **No Overly Deep Words**: Avoid dense technical jargon or overly elevated prose. Use clear words that users easily understand.
- **Sync Platform Version**: Every time RevIT has an update in `app/data/siteUpdates.ts`, ensure `RevIT Platform v#.#.#` at the bottom of the Updates tab (`app/components/SiteUpdatesModal.tsx`) matches and syncs to the latest update version (`SITE_UPDATES[0].version`).

## Multi-Book Edition Architecture Rules
- When adding any new book editions (e.g. beyond Harr and Ciulla):
  - **Progress**: Support book edition filtering and consistent MTAP 1 vs Other Majors categorization.
  - **Leaderboards**: Add edition to filter controls (`All`, `Harr`, `Ciulla`, `<New Book>`), handle unified score aggregation in "All Books", and render book edition pill badges.
  - **Weakness Analytics**: Ensure filtering works by edition, populate the dedicated `Book edition` table column, and style with corresponding book badge pills.
  - **Review Library & Flashcards**: Register in `getUnifiedSubjects`, provide book edition dropdowns/badges, and keep separate book accordions when "All Books" is selected.

## Question Extraction & Stimulus Media Rules
- **Mandatory Visuals Extraction**: When processing or extracting questions from source PDFs, ALWAYS extract, crop, and attach any associated graphs, diagrams, figures, scatterplots, charts, morphologies, or images.
- **Stimulus Configuration**: Save images to `public/reviewer-assets/...` and populate question `stimulus` (`kind: "image"` with `src`, `alt`, `width`, `height`, `caption`, or `kind: "table"` for tabular data). Never omit or skip visual stimuli from questions.

## Pre-Push Verification Checklist
Before pushing to remote:
1. **Always Update Updates Tab (`app/data/siteUpdates.ts`)**: Whenever instructed to push to git, FIRST create a new entry in `app/data/siteUpdates.ts` before checks or pushing. Do this for major changes, minor changes, and pushes containing both. Describe the actual user-facing changes in clear words users understand. Choose the next version from the release scope: for a major update, or a mixed update that includes a major change, bump the middle version number, reset the last number to 0, and set `type: "major"`; for a minor update or fixes only, bump the last version number and set `type: "minor"`. Keep one entry for a mixed push and give it a new matching ID and version. This keeps the auto-update popup and Updates tab current.
2. **Bring Turnstile back (Re-enable protection)**: Turnstile was disabled temporarily for local testing. Always re-enable and enforce it (`disableCaptcha = false` in `AuthPanel.tsx` and `ForgotPanel.tsx`, `NEXT_PUBLIC_DISABLE_CAPTCHA=false`) before any push. Never push with Turnstile bypassed.
3. **Visual Parity Check with Deployed Version**: When instructed to push, verify first that UI and layout look consistent with the deployed version (no visual regressions, unintended styling changes, or layout breaks compared to production) before executing push.
4. `npm run security:secrets` (must pass with 0 leaks)
5. `npx tsc --noEmit` (clean typecheck)
6. `npm test` (`next build` + all tests passing)

## Execution & Output Rules
- **No autonomous browser testing or verification:** Do NOT run browser automation, test scripts, or verification suites unless explicitly instructed with commands like "test this", "verify", or "run tests".
- **No visual artifacts/screenshots:** Do NOT capture, render, or attach screenshots, screen recordings, or visual previews unless explicitly asked.
- **No Git or Push or Security Checks without command:** Do NOT run git commands (commit, push, log, diff, stash, etc.), do NOT push to remote, and do NOT run security checks unless user explicitly instructs to push or check.

## Shared Agent Handoff
- Read `AGENT_HANDOFF.md` at session start after this file.
- Update `AGENT_HANDOFF.md` before switching agents or ending with unfinished or unpushed work.
- Keep it concise and current. Never store secrets, tokens, credentials, environment values, or private user data.

## Communication Style
- **Default Mode**: Always communicate in ultra-compressed caveman mode (`/caveman ultra`). Cut filler, pleasantries, articles, and unnecessary words. Keep all technical substance, exact code symbols, and accuracy 100% intact.

## Clarifications & Recommendations Policy
- **Ask When Unsure**: If requirements, designs, or implementations are ambiguous, underspecified, or uncertain, ask questions before building.
- **Suggest Recommendations**: Proactively propose recommended ideas or alternatives to the user's idea with clear trade-offs.
- **Precision Over Assumptions**: Clarify upfront to ensure concise, flaw-free implementation aligned with user intent.
