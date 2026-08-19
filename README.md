# MedReview

An adaptive reviewer dashboard with a medtech-focused educational assistant.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Add an OpenAI API key to `OPENAI_API_KEY`.
3. Optionally add a vector store containing approved medtech references to `OPENAI_VECTOR_STORE_ID`.
4. Run `npm install` and then `npm run dev`.

Without an API key, the chat runs in an explicitly labeled demo mode with a small built-in knowledge pack.

## Deploy on Vercel

1. Import the GitHub repository into Vercel. Vercel will detect Next.js automatically.
2. Add `OPENAI_API_KEY` in **Project Settings → Environment Variables**.
3. Optionally add `OPENAI_MODEL` and `OPENAI_VECTOR_STORE_ID` from `.env.example`.
4. Deploy. Future pushes to the production branch create production deployments, while other branches create previews.

The application uses the standard `next dev`, `next build`, and `next start` commands. Node.js 22 is pinned in `package.json` for consistent local and hosted builds.

## Safety and scope

The assistant is designed for education. It does not diagnose, prescribe, select patient treatment, or replace clinical policy, manufacturer instructions for use, or professional judgment. For stronger domain reliability, connect a curated study library and evaluate the assistant against representative medtech questions before public use.
