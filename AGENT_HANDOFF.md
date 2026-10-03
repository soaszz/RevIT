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

Ship the follow-up mobile PWA fixes: faster installation, consistent `RevIT` app naming, mobile metadata, and removal of the cloud migration warning shown inside the installed app.

## Current Status

- Follow-up implementation complete in working tree but not pushed.
- Previous `v1.8.0` release is already on `origin/main`.
- Supabase schema, tables, RLS policies, Auth settings, and Edge Functions were not changed.
- User may switch to Antigravity for review and push.

## Main Changes

- Changed installed app name to exactly `RevIT`.
- Added Apple/mobile web-app metadata and a proper 180px touch icon.
- Reduced blocking service-worker installation to the manifest and required icons.
- Moved full offline-shell chunk caching to background warm-up after activation.
- Removed duplicate resource re-downloads and eager reviewer-image precaching.
- Removed the visible cloud migration failure banner; local history remains preserved and migration can retry later.
- Stopped auth timeout retries from overlapping an already-running refresh request.
- Stopped offline queue flushes after the first transient failure to avoid repeated Supabase errors during outages.
- Removed unreliable Supabase writes during `beforeunload`; queued data remains safely stored for the next sync.
- Prevented theme changes from calling Supabase while the connection is offline.

## Important Paths

- `app/RevITApp.tsx`
- `app/lib/cloudService.ts`
- `app/lib/xpService.ts`
- `app/lib/supabase/retryAuth.ts`
- `app/components/PwaRegistration.tsx`
- `app/manifest.ts`
- `app/layout.tsx`
- `public/sw.js`
- `public/revit-180.png`

## Validation

- `npm run security:secrets`: passed (0 leaks).
- `npx tsc --noEmit`: passed.
- `npm test`: passed (`next build` + all 81 tests passing).
- Turnstile active (`disableCaptcha = false`).
- Updates tab entry: `v1.8.1` added.

## Next Action

1. Pushed to remote `origin main`.

