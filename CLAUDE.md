@AGENTS.md

Read `AGENT_HANDOFF.md` at session start. Update it before switching agents or ending with unfinished or unpushed work. Never store secrets or private user data there.

# RevIT Project Memory & Guidelines

## 1. README.md & Public Documentation Policy
- **Never put private, internal, or technical implementation info in `README.md`**.
- `README.md` must only showcase the site's core product features from the learner's perspective.
- Keep developer notes, architecture details, and internal changelogs in `changelog-private.md` (which is git-ignored).

## 2. Privacy & Telemetry Rules
- **Online Presence**: Real-time counter (`app/lib/useOnlinePresence.ts`) uses lightweight client-side diurnal estimate with zero database/websocket connections to prevent log ingestion overload.
- **Zero PII**: Never broadcast `userId`, emails, or database identifiers.

## 3. UX & Architectural Conventions
- **Sound Effects**: Default ON permanently. Do not add sound toggles to session preference modals.
- **Review Library**: Subjects use accordion expand/collapse; only major subjects show initially, and topics stay open until the user closes them.
- **Flashcards**: Choices appear horizontally below questions on the front, remain selectable, and reveal answers on flip.
- **Leaderboard Privacy**: Opt-in toggle lives only in the top filter control card (`controlCard`). Do not add duplicate buttons below the position card.

## 4. Pre-Push Verification Checklist
Before pushing to remote:
1. `npm run security:secrets` (must pass with 0 leaks)
2. `npx tsc --noEmit` (clean typecheck)
3. `npm test` (`next build` + all tests passing)

## Execution & Output Rules
- **No autonomous browser testing or verification:** Do NOT run browser automation, test scripts, or verification suites unless explicitly instructed with commands like "test this", "verify", or "run tests".
- **No visual artifacts/screenshots:** Do NOT capture, render, or attach screenshots, screen recordings, or visual previews unless explicitly asked.
