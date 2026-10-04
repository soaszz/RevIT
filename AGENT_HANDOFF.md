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

Reduce database growth and leaderboard load while keeping current user data and UI behavior.

## Current Status

- Database scaling implementation and migration pushed to origin/main (v1.9.1).
- Database scaling migration (`202610040016_database_scaling.sql`) applied live to Supabase.
- `pg_cron` enabled in live Supabase; `revit-ai-request-usage-cleanup` scheduled hourly.
- Email/password authentication remains.
- Google is the only added social provider.
- Added database indexes, cleanup RPC, and combined Top 10 leaderboard RPC without RLS changes.
- Supabase and Google Cloud dashboard setup is still required.
- Live OAuth account testing is still required after provider setup.
- Earlier login panel spacing/shadow fixes remain in the working tree.
- Onboarding final step and collapsed sidebar branding now use the new 3D RevIT smiling frog mascot.
- Implemented uniform neumorphic alphabet avatars across dark and light modes.
- AI chats load 50 at a time and messages 100 at a time with Load older controls.
- Cloud activity loads newest 1,000 days; reinforcement rows load in pages up to 10,000.

## Main Changes

- Added Continue with Google to login and signup.
- Google sign-in and linking always request the Google account picker.
- Added PKCE callback handling for Google login and manual identity linking.
- Added verified callback completion before storing revit:lastSignInMethod.
- Added Recently used above the Google button.
- Added Account Settings sign-in methods sourced from Supabase identities.
- Added Connect Google through auth.linkIdentity.
- Reopens Security settings after successful or failed linking.
- Added focused Google auth regression tests.
- Did not add identity unlinking because final-method lockout safety was not established.
- Leaderboards show Top 10 and load the list plus current-user position through one RPC.
- AI request usage cleanup can run hourly through pg_cron.

## Important Paths

- app/auth/AuthPanel.tsx
- app/auth/callback/route.ts
- app/auth/oauth-complete/page.tsx
- app/auth/oauth-complete/OAuthCompleteClient.tsx
- app/components/AccountSettings.tsx
- app/RevITApp.tsx
- app/globals.css
- tests/google-auth.test.ts
- app/lib/leaderboardService.ts
- app/lib/aiChatService.ts
- app/components/LeaderboardPage.tsx
- app/lib/cloudService.ts
- supabase/migrations/202610040016_database_scaling.sql

## Validation

- npx tsc --noEmit: passed.
- Google auth tests: 4 passed.
- Reviewer regression tests: 16 passed.
- Workspace secret pattern scan: passed; official script and full history scan were sandbox-blocked.
- npm run build: code/CSS parse passed, then failed because Google Fonts network access is blocked.
- npm run lint: passed cleanly (0 errors, 0 warnings).
- next dev: sandbox blocked Next child-process spawn with EPERM.
- Turnstile is currently bypassed in AuthPanel.tsx; restore before any push per repository rules.

## Next Actions

1. Configure Google Auth Platform and Supabase Google provider, URL allowlist, and manual linking.
2. Run safe live tests for existing, linked, new, and Pro accounts.
3. Re-enable Turnstile before push.
4. Rerun secrets, typecheck, and full test suite in an environment with Git child-process and Google Fonts network access.
5. Add Updates tab entry before push.
