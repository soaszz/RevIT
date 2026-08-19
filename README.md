# RevIT

A source-aware medtech reviewer with official bacteriology and hematology questions, topic-level progress, and an OpenAI-powered educational assistant.

## Included study content

- Bacteriology: 68 multiple-choice questions from the two supplied oral revalida reviewers.
- Hematology 1: 35 multiple-choice questions from the supplied master reviewer.
- Twelve configurable topics with PDF filename and page references retained for every official answer.
- Mixed-topic sessions, local autosave, topic-level scoring, strengths, needs-review guidance, and clearly separated AI explanations.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Add an OpenAI API key to `OPENAI_API_KEY`.
3. Optionally choose a model with `OPENAI_MODEL` (the default is `gpt-5.6-terra`).
4. Run `npm run dev`.

Without an API key, the chat runs in an explicitly labeled demo mode with a small built-in knowledge pack.

## Configure OpenAI on Vercel

1. Open the RevIT project in Vercel and go to **Settings > Environment Variables**.
2. Add `OPENAI_API_KEY` as a sensitive variable. Never prefix it with `NEXT_PUBLIC_`.
3. Add `OPENAI_MODEL` with the value `gpt-5.6-terra`.
4. Apply the variables to Production and any Preview/Development environments you use.
5. Save, then redeploy so the new values are included in a fresh deployment.

The OpenAI project attached to the key must have available API credits. Remove the old `GEMINI_API_KEY`, `GEMINI_MODEL`, and `GEMINI_FALLBACK_MODEL` variables after the OpenAI deployment works.

## Safety and scope

The assistant is designed for education. It does not diagnose, prescribe, select patient treatment, or replace clinical policy, manufacturer instructions for use, or professional judgment. Its server-side instruction layer focuses OpenAI on medtech education. For stronger domain reliability, add a curated retrieval layer with approved references and evaluate the assistant against representative medtech questions before public use.
