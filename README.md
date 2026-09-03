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
- V1 XP, scalable levels, eight achievement definitions, one-time level-up notices, and responsive progression UI in the sidebar and Home.
- Optional V1 global and subject leaderboards for Questions, Accuracy, and Study XP with Daily/Weekly/All-Time periods, private current-user progress, and database-side anti-farming rules.

## Supabase migrations

Run every file in `supabase/migrations` in timestamp order using the Supabase SQL Editor or CLI. V1 progression is defined in `202608300005_level_achievements_v1.sql`; it creates and seeds the progression tables, enables RLS, and extends the existing idempotent activity writer without modifying the database until you run it.

Leaderboards are defined in `202609030006_leaderboards_v1.sql`. Apply it only after the five earlier migrations. The complete beginner-friendly setup, verification, security, query-testing, and rollback guide is in `docs/leaderboards-v1-supabase-setup.md`.

Versioned Terms of Service and Privacy Policy consent is defined in `202609030007_legal_consent_versioning.sql`. Apply it after the leaderboard migration. The exact SQL Editor steps, column and RLS details, verification scenarios, security test, future-version test, and rollback warning are in `docs/legal-consent-supabase-setup.md`.

Levels follow `25 × (level - 1) × (level + 2)`, producing the requested 0, 100, 250, 450, and 700 XP thresholds for Levels 1–5 and 1,000 XP for Level 6.

## Safety and scope

The assistant is for education. It does not diagnose, prescribe, select patient treatment, or replace clinical policy, manufacturer instructions for use, or professional judgment. Official supplied answers remain the scoring source of truth. Grade and streak outcomes are calculated locally from documented rules, not by the AI.
