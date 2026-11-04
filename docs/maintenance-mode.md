# Local maintenance mode

`REVIT_MAINTENANCE_MODE=true` returns the standalone maintenance document from `proxy.ts` before authentication/session handling. All other values, including unset and `false`, use the existing application path. The flag is server-only; never give it a `NEXT_PUBLIC_` prefix.

The supplied `RevIT Maintenance.png` is copied unchanged to `/maintenance-assets/revit-maintenance.png`. The page uses the existing DM Sans Latin font, served locally, green/yellow accents and the existing `revit-theme` light/dark preference. Contact email comes from the existing Feedback modal. Existing cards and application layouts are untouched.

The supplied `revit text logo neu.png` is copied unchanged to `/maintenance-assets/revit-logo.png`; intrinsic 2172×724 dimensions and responsive automatic height preserve its 3:1 aspect ratio. It replaces only the header wordmark. The contact section also uses the exact existing official URL `https://www.instagram.com/revithoroughly/`, with a standalone Instagram icon and `target="_blank" rel="noopener noreferrer"`. The mascot is unchanged.

## Enable / disable

For a separately launched **local** server, set these in its process environment, without changing `.env.local`:

```powershell
$env:REVIT_MAINTENANCE_MODE = 'true'
# Optional, team-approved estimate, displayed as text; omit if unknown:
$env:REVIT_MAINTENANCE_ETA = '<approved approximate return window>'
npm run dev
```

Stop that local process, set `REVIT_MAINTENANCE_MODE=false` (or remove it), clear the optional ETA if desired, and restart. Process-environment changes require a server restart. A production host may require a new deployment to apply environment changes: that is a separate approved operation. No production setting or deployment is changed by this implementation.

For an isolated verification server, use a copied project directory, its own build output/port and an empty Supabase configuration. Never reuse production credentials to test this page. The verification harness under `scratch/maintenance-page/` uses that approach.

## Request and cache behavior

- Application documents, React Server Component requests and auth callbacks receive HTTP503 at their requested URL, without a redirect or Supabase query. API requests receive503 JSON with `code: MAINTENANCE`; no handler is invoked.
- Responses use browser/CDN `no-store` headers, an explicit maintenance marker and `noindex`. `Retry-After: 300` suggests when to retry, **not** an estimated completion time.
- Existing matcher exclusions preserve Next static/image assets and image files. The maintenance assets, service worker, manifest and robots file pass through without session work while enabled. Static assets contain no privileged maintenance flag.
- The maintenance document has no React hydration, auth client, analytics or service-worker registration. Its only scripts read the existing theme preference and handle the theme button. CSP forbids network connections from this document.
- The existing service worker's network-first navigation returns server503 responses directly, rather than falling back to cached normal pages. Previously cached offline shells remain available when the network fails; no cache or student storage is cleared.
- Next configuration redirects run before Proxy: existing aliases such as `/pro` may make their existing single redirect before reaching the503 page. There is no maintenance redirect chain or new loop.

## Not a writer fence

This is a user-facing routing gate, not database writer fencing. It cannot stop old open tabs, cached client navigation/back-forward pages, installed/offline PWAs, direct Supabase clients, Auth/Storage operations, privileged processes or background jobs. A server cannot revoke already-delivered browser content. Online requests reaching Proxy are gated; no claim of universal client cache invalidation is made.

Do not use this flag as proof of an all-writer pause or RPO0. Existing progress/queues are not modified. Database writer fencing and any production activation require separate approval. BOC/Elsevier publication, subscriptions, migrations and Supabase configuration are untouched.
