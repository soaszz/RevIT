# RevIT production security setup

The repository contains the application-side controls, but the operator must complete the deployment steps below before enabling live RevIT AI.

## 1. Apply the Supabase migrations

Apply every file in `supabase/migrations` in filename order. The final migration, `202609050008_ai_api_rate_limits.sql`, creates the persistent quota tables and two authenticated RPCs used by `/api/chat`.

The migration uses the existing Supabase Postgres project, so it does not add a vendor, package, or separate paid service. New and existing users default to the `free` tier. The database is the authoritative configuration source:

- Free: 5 successful requests per rolling minute and 20 per UTC day.
- Subscription: 15 successful requests per rolling minute and 100 per UTC day.

The route creates a short reservation before calling Groq. It finalizes the row only after Groq returns a non-empty answer and deletes the reservation after provider failure. Active reservations temporarily occupy capacity to stop concurrent bypasses, and stale reservations expire after two minutes.

There is no payment integration. A future trusted billing webhook may update `public.ai_entitlements` with the Supabase service role after verifying the payment provider signature. Never accept a tier from a browser request. Until then, leave `ai_entitlements` empty so every account remains free.

## 2. Configure Vercel environment variables

In the Vercel project settings, add these values separately for Production and any Preview environment that should be functional:

- `GROQ_API_KEY`: secret, server-only Groq key. Never prefix it with `NEXT_PUBLIC_`.
- `GROQ_MODEL`: optional server-only model override.
- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public Supabase publishable key. Do not use a service-role key here.
- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS origin, with no trailing slash.
- `VITE_TURNSTILE_SITE_KEY`: public Cloudflare Turnstile site key rendered by the server into the auth page.

Configure the Turnstile secret in Supabase Auth's CAPTCHA settings, not in the browser and not in this repository. Scope the Turnstile widget to the production and intended preview hostnames.

After changing a `NEXT_PUBLIC_` value, redeploy because Next.js embeds public values at build time. Keep `.env`, `.env.local`, `.env.production`, `.vercel`, private keys, and downloaded deployment settings out of Git. The repository intentionally commits only `.env.example` with blank values.

## 3. Deployment and provider controls

- Deploy through Vercel's HTTPS endpoint and attach only HTTPS custom domains. Vercel redirects platform-domain HTTP traffic to HTTPS; the application also sends HSTS in production.
- Restrict the Groq key to this application or project if the provider exposes scopes, set provider-side spend/usage alerts, and rotate it immediately if it is ever copied into Git, logs, a browser bundle, a screenshot, or a support ticket.
- Do not add `SUPABASE_SERVICE_ROLE_KEY` to the RevIT deployment unless a future server-only billing/admin endpoint actually requires it. Current runtime code does not need it.
- Keep production source maps private. `productionBrowserSourceMaps` is not enabled.

## 4. Post-deployment verification

Verify the following against the deployed HTTPS origin:

1. An unauthenticated JSON POST to `/api/chat` receives `401` when Supabase is configured.
2. A cross-origin browser POST receives `403` and no CORS allow-origin header.
3. A non-JSON, malformed, over-32-KiB, non-alternating, over-12-message, or over-16,000-character conversation is rejected before Groq is called.
4. Six rapid successful free-tier requests cause the sixth to receive `429`; the response has `Retry-After` and quota headers.
5. The twenty-first successful free-tier request in one UTC day receives `429`.
6. A simulated Groq failure removes its reservation and does not reduce completed quota.
7. Responses include CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, Permissions Policy, and production HSTS.
8. Turnstile, Supabase auth/data calls, avatars, local data/blob images, KaTeX, and all main routes still work under CSP.

Use the rollback file only for an intentional rollback. Removing the quota migration while `GROQ_API_KEY` remains configured makes live AI fail closed with a safe `503` response.
