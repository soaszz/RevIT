import { NextResponse, type NextRequest } from "next/server";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

// Public infrastructure only. Application/API requests still receive maintenance responses.
function isMaintenanceAsset(path: string) {
  return ["/sw.js", "/manifest.webmanifest", "/robots.txt"].includes(path)
    || path.startsWith("/_next/static/") || path.startsWith("/_next/image")
    || path.startsWith("/maintenance-assets/");
}

export function maintenanceResponse(request: NextRequest, nonce: string): NextResponse | null {
  if (process.env.REVIT_MAINTENANCE_MODE !== "true") return null;
  if (isMaintenanceAsset(request.nextUrl.pathname)) return NextResponse.next();

  const headers = {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Retry-After": "300",
    "X-RevIT-Maintenance": "true",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": `default-src 'none'; img-src 'self'; font-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Scheduled maintenance. Please try again soon.", code: "MAINTENANCE" }, { status: 503, headers });
  }
  const eta = process.env.REVIT_MAINTENANCE_ETA?.trim();
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>RevIT | Scheduled maintenance</title><link rel="icon" href="/favicon.png"><link rel="preload" href="/maintenance-assets/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<script nonce="${nonce}">(function(){try{var t=localStorage.getItem('revit-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()</script>
<style nonce="${nonce}">
@font-face{font-family:'DM Sans';font-style:normal;font-weight:100 1000;font-display:swap;src:url('/maintenance-assets/dm-sans-latin.woff2') format('woff2')}
:root{color-scheme:light;--canvas:#f4f7f5;--text:#16372d;--muted:#52685f;--green:#13734f;--yellow:#8a6200;--line:#d8e4dc}
:root[data-theme=dark]{color-scheme:dark;--canvas:#071613;--text:#edf6ef;--muted:#a8bfb3;--green:#6ce0ad;--yellow:#f4cf5c;--line:#274137}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--canvas:#071613;--text:#edf6ef;--muted:#a8bfb3;--green:#6ce0ad;--yellow:#f4cf5c;--line:#274137}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100svh;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 24px env(safe-area-inset-bottom);overflow-wrap:anywhere}
header,main,footer{width:100%;max-width:1120px;margin-inline:auto}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:28px}.brand{width:clamp(144px,16vw,180px);flex-shrink:0}.brand img{display:block;width:100%;height:auto;object-fit:contain}button{border:0;background:none;color:var(--muted);font:inherit;min-width:44px;min-height:44px;cursor:pointer;display:grid;place-items:center;padding:10px}button:hover{color:var(--green)}:focus-visible{outline:3px solid var(--green);outline-offset:5px}svg{display:block;width:21px;height:21px;flex-shrink:0}.moon{display:none}[aria-pressed=true] .sun{display:none}[aria-pressed=true] .moon{display:block}
main{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:clamp(28px,5vw,76px);align-items:center;padding-block:24px 60px}.illustration{margin:0;min-width:0}.illustration img{display:block;width:100%;max-width:470px;height:auto;margin:auto;object-fit:contain}.message{min-width:0;max-width:560px}.eyebrow{display:flex;align-items:center;gap:10px;color:var(--green);font-size:12px;font-weight:750;letter-spacing:1.7px;text-transform:uppercase;margin:0 0 22px}.indicator{display:flex;gap:3px;align-items:end;height:15px}.indicator i{display:block;width:4px;background:var(--yellow)}.indicator i:nth-child(1){height:8px}.indicator i:nth-child(2){height:15px}.indicator i:nth-child(3){height:11px}
h1{font-size:clamp(32px,3.75vw,52px);line-height:1.12;letter-spacing:-1.8px;font-weight:750;margin:0 0 24px;text-wrap:balance}h1 span{color:var(--green)}.intro{font-size:18px;line-height:1.7;color:var(--muted);margin:0 0 25px;max-width:465px}.reassurance{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.65;margin:0;color:var(--text)}.reassurance svg{color:var(--green);width:19px;height:19px;margin-top:2px}.eta{color:var(--yellow);font-size:14px;font-weight:650;line-height:1.6;margin:20px 0 0}.contact{font-size:13px;line-height:1.8;color:var(--muted);margin:30px 0 0}.contact p{margin:0}.contact a{display:flex;align-items:center;gap:8px;width:fit-content;color:var(--green);text-underline-offset:4px;padding-block:8px;min-height:44px}.instagram{font-weight:650}.instagram svg{width:18px;height:18px}footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 20px;border-top:1px solid var(--line);padding-block:22px 26px;font-size:12px;line-height:1.6;color:var(--muted)}footer p{margin:0}
@media(max-width:768px){header{padding-block:16px}main{grid-template-columns:minmax(0,1fr);gap:25px;max-width:560px;padding-block:8px 35px}.illustration img{width:min(66vw,300px)}.message{text-align:center;max-width:none}.eyebrow,.reassurance{justify-content:center}.eyebrow{margin-bottom:15px}h1{font-size:clamp(30px,6vw,42px);letter-spacing:-1px;margin-bottom:18px}.intro{font-size:16px;line-height:1.65;margin:0 auto 20px}.reassurance{font-size:13px}.contact{margin-top:19px}.contact a{margin-inline:auto}footer{justify-content:center;text-align:center}}
@media(max-width:375px){body{padding-inline:20px}.illustration img{width:min(61vw,230px)}main{gap:20px}.reassurance{max-width:265px;margin:auto}header{padding-block:12px}.brand{width:144px}}
</style></head><body>
<header><div class="brand"><img src="/maintenance-assets/revit-logo.png" width="2172" height="724" alt="RevIT" decoding="async"></div><button id="theme" type="button" aria-label="Switch color theme" aria-pressed="false"><svg class="sun" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><svg class="moon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 15.4A8.5 8.5 0 0 1 8.6 4a8.5 8.5 0 1 0 11.4 11.4Z"/></svg></button></header>
<main><figure class="illustration"><img src="/maintenance-assets/revit-maintenance.png" width="1254" height="1254" alt="The official green RevIT mascot wearing a yellow hard hat and repairing a computer." fetchpriority="high"></figure><section class="message" aria-labelledby="heading"><p class="eyebrow"><span class="indicator" aria-hidden="true"><i></i><i></i><i></i></span>Scheduled maintenance</p><h1 id="heading">RevIT is getting<br>a little <span>tune-up!</span></h1><p class="intro">We're currently performing scheduled maintenance to improve your study experience. We'll be back soon!</p><p class="reassurance"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></svg><span>Your saved progress and study records remain protected.</span></p>${eta ? `<p class="eta">Estimated return: ${escapeHtml(eta)}</p>` : ""}<div class="contact"><p>Need to reach us?</p><a class="instagram" href="https://www.instagram.com/revithoroughly/" target="_blank" rel="noopener noreferrer"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg><span>Message us on Instagram</span></a><a href="mailto:revithoroughly@gmail.com">revithoroughly@gmail.com</a></div></section></main>
<footer><p>Let's Review It Thoroughly.</p><p>Thank you for your patience.</p></footer>
<script nonce="${nonce}">(function(){var b=document.getElementById('theme');function sync(){var dark=document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&matchMedia('(prefers-color-scheme: dark)').matches);b.setAttribute('aria-pressed',String(dark));b.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme')}sync();b.addEventListener('click',function(){var t=b.getAttribute('aria-pressed')==='true'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('revit-theme',t)}catch(e){}sync()})})()</script></body></html>`;
  return new NextResponse(request.method === "HEAD" ? null : body, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
