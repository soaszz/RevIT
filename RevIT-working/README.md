# RevIT

RevIT is a source-aware medtech reviewer with official bacteriology and hematology questions, Groq-powered educational explanations, Supabase accounts and cross-device study data, an activity calendar, exam scheduling, and deterministic grade planning.

## What is included

- 103 official reviewer MCQs across Bacteriology and Hematology 1, with source filename and page retained.
- Registration, separate sign-in after account creation, password recovery, remember-me/session-only behavior, protected routes, profile onboarding, avatar upload, password changes, other-device sign-out, and optional TOTP two-factor authentication.
- Row-level-secured cloud storage for profiles, grades, daily activity, idempotent activity events, exam schedules, and preferences.
- Monthly activity intensity, timezone-safe streaks, date details, independent exam markers, and an Up Next assessment.
- My Grades and a separate, non-persisting simulator using the exact 10/15/30/30/15 weights and a 65% passing mark.
- Transparent remaining-average, maximum-possible, and next-assessment guidance. AI never decides grades or passing status.
- Light/dark semantic PDF and AI badges, plus responsive desktop and mobile layouts.
- V1 XP, scalable levels, eight achievement definitions, one-time level-up notices, and responsive progression UI in the sidebar and Overview.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `GROQ_API_KEY` and optionally `GROQ_MODEL`.
3. Create a Supabase project and run the files in `supabase/migrations` in timestamp order in the SQL editor (or with the Supabase CLI). The V1 progression migration is `202608300003_level_achievements_v1.sql`.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Supabase **Project Settings > API**.
5. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` locally.
6. Run `npm install`, then `npm run dev`.

If Supabase variables are absent, RevIT deliberately keeps the existing reviewer in local mode. Existing `revit-attempts-v1`, selected topics, profile, theme, grades, schedule, and activity keys remain intact. When a user first connects an account, legacy attempts are copied into cloud activity idempotently; local data is not deleted.

## Supabase Auth checklist

In **Authentication > Providers > Email**:

- Keep email/password enabled.
- Turn **Confirm email** off if users should be able to sign in immediately after registering. When it is on, Supabase requires the confirmation link before the first sign-in.
- Set a password minimum of at least 8 characters and enable leaked-password protection when your plan supports it.
- Enable secure password change/current-password verification for the password-change flow.
- Configure custom SMTP for production; Supabase's trial sender is rate-limited.

In **Authentication > URL Configuration**:

- Set Site URL to the production `NEXT_PUBLIC_SITE_URL`.
- Add `http://localhost:3000/**`, your Vercel preview pattern, and production domain to Redirect URLs.

The signup screen calls Supabase `signUp`, signs out the temporary auto-created session, and returns the user to the Sign in tab. The app retains PKCE `code` and `token_hash` confirmation-link support at `/auth/callback` if email confirmation is enabled again later. TOTP MFA is optional and separate from signup.

## Vercel environment variables

Add these under **Project > Settings > Environment Variables**, for every environment you use, then redeploy:

- `GROQ_API_KEY` — server-only secret; never prefix it with `NEXT_PUBLIC_`.
- `GROQ_MODEL` — for example `openai/gpt-oss-120b`.
- `NEXT_PUBLIC_SUPABASE_URL` — safe project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — safe publishable key (the older anon key also works as `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- `NEXT_PUBLIC_SITE_URL` — full deployed origin, such as `https://your-project.vercel.app`.

Never add `SUPABASE_SERVICE_ROLE_KEY` to this application or expose it to the browser. RevIT uses only the publishable key plus RLS.

## Verify before deployment

Run:

```bash
npm run lint
npm test
```

`npm test` builds the production app and checks grade boundaries, blanks, required-score math, next-assessment assumptions, streak gaps, timezone boundaries, calendar events, auth states, and the original reviewer bank. A disposable-project RLS audit script is provided at `supabase/tests/rls_checks.sql`.

Manual release checks:

- Register, return to Sign in, log in, complete onboarding, sign out, sign in with and without Remember me, recover a password, and enroll/challenge/disable TOTP.
- Confirm a second account cannot read or mutate the first account's rows.
- Answer questions across a timezone/date boundary; confirm idempotent counts, current streak, calendar intensity, date details, and cross-device sync.
- Create, edit, and delete same-day assessments across multiple subjects; confirm Up Next and past visibility.
- Enter exact 0%, 65%, just-below-65%, and 100% grade cases; confirm blanks are not zero and simulated changes never alter My Grades.
- Check PDF/AI badges, focus states, forms, calendar, and grade tables in light/dark mode at desktop and 360px mobile width.
- Confirm Review Library, quiz scoring, source references, Progress, and Groq chat still work.
- Confirm correct answers, completed sessions, the first AI message, each active study day, and the first scheduled exam award XP only once per event; confirm all eight achievements unlock at their thresholds.

## Implementation assumptions

- User timezone defaults to the browser timezone in local mode and `Asia/Manila` for a newly created cloud preference, and can be changed directly in `user_preferences` until a dedicated timezone selector is added.
- The current streak remains active when the most recent meaningful study day is today or yesterday. A visit alone never counts.
- Calendar intensity combines answered questions, AI review count, and an accuracy bonus using centralized thresholds in `app/lib/domain.ts`.
- One assessment date exists per user, subject, and assessment type. Editing that pair updates it instead of creating a duplicate.
- The next-assessment calculator shows a minimum and a 5%-of-maximum recommended buffer, while clearly stating the assumed average for later blank assessments.
- Levels follow `25 × (level - 1) × (level + 2)`, which exactly produces 0, 100, 250, 450, and 700 XP for Levels 1–5 and continues to 1,000 XP for Level 6.

## Safety and scope

The assistant is for education. It does not diagnose, prescribe, select patient treatment, or replace clinical policy, manufacturer instructions for use, or professional judgment. Official supplied answers remain the scoring source of truth. Grade and streak outcomes are calculated locally from documented rules, not by the AI.
