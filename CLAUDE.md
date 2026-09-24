@AGENTS.md

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

## 4. Pre-Push Verification Checklist
Before pushing to remote:
1. `npm run security:secrets` (must pass with 0 leaks)
2. `npx tsc --noEmit` (clean typecheck)
3. `npm test` (`next build` + all tests passing)
