import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { maintenanceResponse } from "../app/lib/maintenance";

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
