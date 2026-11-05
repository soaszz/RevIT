import ts from "typescript";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { maintenanceResponse } from "../app/lib/maintenance";

const routingRequire = createRequire(import.meta.url);
routingRequire("next/dist/server/node-environment-baseline");
const { unstable_doesMiddlewareMatch: unstable_doesProxyMatch } = routingRequire("next/experimental/testing/server");

test("only the exact maintenance font bypasses app-session routing in every auth and maintenance state", async () => {
  function loadSource(path: string, overrides: Record<string, unknown>) {
    const exports: Record<string, any> = {};
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("require", "exports", code)((name: string) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      throw new Error(`Unexpected routing dependency: ${name}`);
    }, exports);
    return exports;
  }
  const font = "/maintenance-assets/dm-sans-latin.woff2";
  const protectedPaths = ["/overview", "/admin", "/library", "/fonts/other.woff2", "/maintenance-assets/other.woff2", `${font}/extra`, `${font}.bak`, "/maintenance-assets/dm-sans-latinXwoff2"];
  const before = process.env.REVIT_MAINTENANCE_MODE;
  try {
    for (const flag of ["false", "true"]) for (const auth of ["logged-out", "signed-in", "unavailable"]) {
      process.env.REVIT_MAINTENANCE_MODE = flag;
      let claimsCalls = 0;
      const session = loadSource("app/lib/supabase/proxy.ts", {
        "@supabase/ssr": { createServerClient: () => ({ auth: { getClaims: async () => {
          claimsCalls++;
          if (auth === "unavailable") throw new Error("Synthetic auth unavailable");
          return { data: { claims: auth === "signed-in" ? { sub: "synthetic-user" } : null }, error: null };
        } } }) },
        "next/server": { NextResponse },
        "./config": { isSupabaseConfigured: () => true, supabaseConfig: () => ({ url: "https://not-used.invalid", key: "synthetic-placeholder" }), supabaseCookieOptions: () => ({}) },
        "./retryAuth": { retryAuthRequest: (fn: () => Promise<unknown>) => fn(), isTransientAuthError: () => false },
      });
      const entry = loadSource("proxy.ts", {
        "./app/lib/securityHeaders": { contentSecurityPolicy: () => "synthetic-policy" },
        "./app/lib/supabase/proxy": session,
        "./app/lib/maintenance": { maintenanceResponse },
      });
      const matches = (path: string) => unstable_doesProxyMatch({ config: entry.config, nextConfig: {}, url: `https://revit.example${path}` });
      for (const path of [font, `${font}?font_probe=1`]) {
        assert.equal(matches(path), false, path);
        const response = matches(path) ? await entry.proxy(new NextRequest(`https://revit.example${path}`)) : NextResponse.next();
        assert.equal(response.headers.get("x-middleware-next"), "1");
        assert.equal(response.headers.get("location"), null);
      }
      assert.equal(claimsCalls, 0, "Static font must not invoke app-session auth");
      for (const path of protectedPaths) {
        assert.equal(matches(path), true, path);
        const response = await entry.proxy(new NextRequest(`https://revit.example${path}`));
        if (flag === "true" && path.startsWith("/maintenance-assets/")) {
          // Preserve the existing maintenance-ON infrastructure allowlist.
          assert.equal(response.headers.get("x-middleware-next"), "1", path);
        } else if (flag === "true") {
          assert.equal(response.status, 503, path);
          assert.equal(response.headers.get("x-revit-maintenance"), "true");
        } else if (auth === "signed-in") {
          assert.equal(response.headers.get("x-middleware-next"), "1", path);
          assert.equal(response.headers.get("content-security-policy"), "synthetic-policy");
        } else {
          assert.equal(response.status, 307, path);
          const target = new URL(response.headers.get("location"));
          assert.equal(target.pathname, "/auth");
          assert.equal(target.searchParams.get("next"), path);
          assert.equal(response.headers.get("content-security-policy"), "synthetic-policy");
        }
      }
    }
    assert.equal(createHash("sha256").update(readFileSync(`public${font}`)).digest("hex"), "468d56b6b25b05b70190b6c233d773f6f1770e8579827ce022a57f03fa8002fb");
  } finally {
    if (before === undefined) delete process.env.REVIT_MAINTENANCE_MODE;
    else process.env.REVIT_MAINTENANCE_MODE = before;
  }
});

test("server maintenance gate, response contracts and exact supplied mascot", async () => {
  const before = process.env.REVIT_MAINTENANCE_MODE;
  const eta = process.env.REVIT_MAINTENANCE_ETA;
  const request = (path: string, method = "GET") => new NextRequest(`http://localhost:3220${path}`, { method });
  try {
    for (const flag of [undefined, "false", "TRUE", "1"]) {
      if (flag === undefined) delete process.env.REVIT_MAINTENANCE_MODE;
      else process.env.REVIT_MAINTENANCE_MODE = flag;
      assert.equal(maintenanceResponse(request("/overview"), "nonce"), null);
    }
    process.env.REVIT_MAINTENANCE_MODE = "true";
    delete process.env.REVIT_MAINTENANCE_ETA;
    for (const path of ["/", "/overview", "/auth", "/auth/callback?code=unused", "/offline", "/pricing", "/maintenance", "/library?_rsc=example"]) {
      const response = maintenanceResponse(request(path), "nonce")!;
      assert.equal(response.status, 503, path);
      assert.equal(response.headers.get("location"), null, path);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
      assert.equal(response.headers.get("x-revit-maintenance"), "true");
      const html = await response.text();
      assert.match(html, /Your saved progress and study records remain protected\./);
      assert.match(html, /revithoroughly@gmail\.com/);
      assert.match(html, /class="brand"><img src="\/maintenance-assets\/revit-logo\.png" width="2172" height="724" alt="RevIT"/);
      assert.match(html, /href="https:\/\/www\.instagram\.com\/revithoroughly\/" target="_blank" rel="noopener noreferrer"/);
      assert.match(html, /Message us on Instagram/);
      assert.doesNotMatch(html, /Estimated return:/);
      assert.doesNotMatch(html, /supabase|_next\/static|Analytics|fetch\(/i);
    }
    for (const method of ["GET", "POST", "PUT", "DELETE", "OPTIONS"]) {
      const response = maintenanceResponse(request("/api/study/attempts", method), "nonce")!;
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "MAINTENANCE");
    }
    for (const path of ["/sw.js", "/manifest.webmanifest", "/robots.txt", "/maintenance-assets/dm-sans-latin.woff2"]) {
      assert.equal(maintenanceResponse(request(path), "nonce")!.headers.get("x-middleware-next"), "1", path);
    }
    assert.equal(await maintenanceResponse(request("/overview", "HEAD"), "nonce")!.text(), "");
    process.env.REVIT_MAINTENANCE_ETA = '</p><script>alert("bad")</script>';
    const html = await maintenanceResponse(request("/"), "nonce")!.text();
    assert.match(html, /Estimated return: &lt;\/p&gt;&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
    // All text accents, including the optional ETA, must meet normal-text contrast.
    const luminance = (hex: string) => hex.match(/../g)!.map(x => parseInt(x, 16) / 255)
      .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    for (const block of html.match(/:root(?:\[data-theme=dark\])?\{[^}]+\}/g)!) {
      const colors = Object.fromEntries([...block.matchAll(/--([a-z]+):#([a-f0-9]{6})/g)].map(m => [m[1], m[2]]));
      for (const name of ["text", "muted", "green", "yellow"]) {
        const levels = [luminance(colors[name]), luminance(colors.canvas)].sort((a, b) => b - a);
        assert.ok((levels[0] + .05) / (levels[1] + .05) >= 4.5, `${name} contrast`);
      }
    }
    const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
    // SHA-256 of the supplied originals; source artwork need not ship with the application.
    assert.equal(digest("public/maintenance-assets/revit-maintenance.png"), "cf3fd93a94f00b0819b1b3f06b89e5cff97ac65af3a4ac99161fd8dff070097b");
    assert.equal(digest("public/maintenance-assets/revit-logo.png"), "9809733c1ebb2232c4b36e41432215f856e7a99227f153ac8c317ca360e30842");
  } finally {
    if (before === undefined) delete process.env.REVIT_MAINTENANCE_MODE; else process.env.REVIT_MAINTENANCE_MODE = before;
    if (eta === undefined) delete process.env.REVIT_MAINTENANCE_ETA; else process.env.REVIT_MAINTENANCE_ETA = eta;
  }
});
