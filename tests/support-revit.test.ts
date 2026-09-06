import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

const projectFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("the low-priority library card is replaced by a frog-backed Support RevIT action", () => {
  const app = projectFile("app/RevITApp.tsx");
  assert.doesNotMatch(app, /<p>Official library<\/p>/);
  assert.match(app, /className="sidebar-support" href="\/support"/);
  assert.match(app, /sidebar-support-frog[\s\S]*\/revit-frog\.png/);
  assert.match(app, /<option value="support">Support RevIT \(optional\)<\/option>/);
});

test("Support RevIT is informational and does not create payment or entitlement behavior", () => {
  const supportPage = projectFile("app/support/page.tsx");
  const supportQr = projectFile("app/support/SupportQr.tsx");
  assert.match(supportPage, /RevIT is currently free to use/);
  assert.match(supportPage, /does not unlock additional features, increase limits, create a subscription/);
  assert.match(supportPage, /does not record who contributes/);
  assert.match(supportPage, /<strong>InstaPay<\/strong>/);
  assert.match(supportPage, /not affiliated with, sponsored by, or endorsed by InstaPay/);
  assert.match(supportQr, /\/support-revit-qr\.png/);
  assert.match(supportQr, /width=\{1900\}[\s\S]*height=\{1896\}/);
  assert.doesNotMatch(`${supportPage}\n${supportQr}`, /fetch\(|<form|supabase|webhook/i);
});

test("support changes update legal versions without adding payment migrations", () => {
  const legal = projectFile("app/lib/legal.ts");
  const terms = projectFile("app/terms/page.tsx");
  const privacy = projectFile("app/privacy/page.tsx");
  assert.match(legal, /CURRENT_TERMS_VERSION = "2026-09-06"/);
  assert.match(legal, /CURRENT_PRIVACY_VERSION = "2026-09-06"/);
  assert.match(terms, /title: "Voluntary Support"/);
  assert.match(terms, /do not purchase premium functionality/);
  assert.match(privacy, /title: "Voluntary Support and External Payments"/);
  const migrations = readdirSync(join(process.cwd(), "supabase/migrations"));
  assert.equal(migrations.some((name) => /(payment|donation|supporter|contribution)/i.test(name)), false);
});
