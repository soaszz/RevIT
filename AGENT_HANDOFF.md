# RevIT Agent Handoff

Shared working memory for Codex, Antigravity, Claude, and other repository agents.

## Required Workflow

1. Read this file after the repository instruction file at session start.
2. Update it before switching agents or ending work with unfinished or unpushed changes.
3. Replace stale status instead of building a long activity log.
4. Record only task state, changed paths, checks, blockers, and next actions.
5. Never store secrets, tokens, passwords, private user data, or environment values here.
6. Treat repository code and current tool output as authoritative when this file is stale.

## Current Objective

Release RevIT v1.8.0 with offline review access, automatic reconnect sync, Chrome installation support, resilient authentication, and account-specific saved sessions.

## Current Status

- Implementation complete in working tree.
- Updates tab contains `v1.8.0` dated October 3, 2026.
- Supabase schema, tables, RLS policies, Auth settings, and Edge Functions were not changed.
- Codex could not push because its sandbox lacked usable GitHub credentials.
- User plans to commit and push through Antigravity.

## Main Changes

- Added PWA manifest, service worker, install icons, and offline application shell.
- Added dismissible offline notice and in-page offline states for cloud-only features.
- Added local queues for attempts, reinforcement, and progression events.
- Added automatic reconnect sync with account-scoped, race-safe queue handling.
- Reduced reconnect backend reads and avoided retrying Supabase Auth status `555`.
- Added bounded authentication and initial cloud-load timeouts.
- Scoped saved review sessions to the active account.

## Important Paths

- `app/RevITApp.tsx`
- `app/lib/cloudService.ts`
- `app/lib/xpService.ts`
- `app/lib/supabase/retryAuth.ts`
- `app/lib/supabase/proxy.ts`
- `app/components/ConnectionStatusModal.tsx`
- `app/components/PwaRegistration.tsx`
- `app/offline/`
- `app/manifest.ts`
- `public/sw.js`
- `app/data/siteUpdates.ts`

## Validation

- `npm run security:secrets`: passed (0 leaks).
- `npx tsc --noEmit`: passed.
- `npm test`: passed (`next build` + all 81 tests passing).
- Turnstile active (`disableCaptcha = false`).

## Next Action

1. Pushed to remote `origin main`.

