import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { QUESTION_BANKS } from "../app/lib/entitlements";
import { SITE_UPDATES } from "../app/data/siteUpdates";

const read = (path: string) => readFileSync(path, "utf8");

test("release includes exactly four published banks and the canonical 4,441 questions", () => {
  assert.deepEqual(Object.values(QUESTION_BANKS).map(bank => bank.label), ["Harr", "Ciulla", "Rodak", "Strasinger"]);
  for (const [name, count] of [["reviewer", 1593], ["ciulla", 1890], ["rodak", 491], ["strasinger", 467]] as const) {
    assert.equal(JSON.parse(read(`app/content/${name}Content.json`)).questions.length, count);
  }
  for (const path of ["app/content", "app/api/reviewer", "app/lib/server", "public/reviewer-assets"]) {
    assert.ok(readdirSync(path).every(name => !/^(elsevier|boc)(?:[-.]|Content|Metadata|Source|Server|$)/i.test(name)), path);
  }
  assert.equal(existsSync("app/components/SourceText.tsx"), false);
  assert.doesNotMatch(read("app/content/reviewerContent.ts"), /Elsevier|BOC|questionSections|choiceTables|sourceFormatting/);
});

test("release and platform footer share v1.12.2; current plan copy names only published books", () => {
  assert.equal(SITE_UPDATES[0].version, "v1.12.2");
  assert.equal(SITE_UPDATES[0].type, "minor");
  assert.match(read("app/components/SiteUpdatesModal.tsx"), /RevIT Platform \{SITE_UPDATES\[0\]\?\.version/);
  const pricing = read("app/pricing/PricingContent.tsx");
  for (const count of ["1,593", "2,848", "4,441"]) assert.ok(pricing.includes(count));
  assert.doesNotMatch(pricing, /999|1,884|2,883|Elsevier|BOC/);
  for (const path of ["app/auth/page.tsx", "app/components/Onboarding.tsx", "app/components/PlanAnnouncementModal.tsx", "app/components/ProActivationModal.tsx", "app/pro/page.tsx"]) {
    const source = read(path);
    assert.match(source, /Access to newly added Pro reviewer books/);
    assert.doesNotMatch(source, /Elsevier|BOC/);
  }
});
