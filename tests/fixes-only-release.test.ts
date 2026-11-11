import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { QUESTION_BANKS } from "../app/lib/entitlements";
import { SITE_UPDATES } from "../app/data/siteUpdates";
import { currentReviewerCopy, renderPublicPricing, renderPublicPro } from "./helpers/publicPricing";
import { canAccessQuestionBank, FREE_ENTITLEMENT } from "../app/lib/entitlements";
import { activeHarrQuestions } from "../app/lib/harrQuestionPool";

const read = (path: string) => readFileSync(path, "utf8");

test("four published banks retain all 4,441 historical records; prepared editions remain inaccessible", () => {
  assert.deepEqual(Object.values(QUESTION_BANKS).filter(bank => bank.published !== false).map(bank => bank.label), ["Harr", "Ciulla", "Rodak", "Strasinger"]);
  for (const [name, count] of [["reviewer", 1593], ["ciulla", 1890], ["rodak", 491], ["strasinger", 467]] as const) {
    assert.equal(JSON.parse(read(`app/content/${name}Content.json`)).questions.length, count);
  }
  assert.equal(activeHarrQuestions.length, 1606);
  for (const book of ["BOC", "Elsevier"] as const) {
    const key = book.toLowerCase() as "boc" | "elsevier";
    assert.equal(QUESTION_BANKS[key].published, false);
    assert.equal(QUESTION_BANKS[key].requiredPlan, "pro");
    assert.equal(canAccessQuestionBank(book, FREE_ENTITLEMENT), false);
    assert.equal(canAccessQuestionBank(book, { ...FREE_ENTITLEMENT, effectivePlan: "pro" }), false);
    assert.match(read(`app/lib/server/${key}ServerContent.ts`), /^import "server-only"/);
    assert.match(read(`app/api/reviewer/${key}/route.ts`), /authorizePrivateReviewer/);
    assert.match(read("app/lib/server/privateReviewerAccess.ts"), /isQuestionBankPublished/);
    assert.match(read("app/lib/server/privateReviewerAccess.ts"), /privateReviewerError\(404\)/);
    assert.match(read("app/lib/server/privateReviewerAccess.ts"), /effective_plan !== "pro"/);
  }
  for (const path of ["app/RevITApp.tsx", "app/components/Flashcards.tsx", "app/lib/premiumReviewerService.ts"])
    assert.doesNotMatch(read(path), /import\s+[\s\S]*?\bfrom\s+["'][^"']*(?:boc|elsevier)Content\.json["']/);
  assert.equal(existsSync("app/components/SourceText.tsx"), true);
});

test("release and platform footer share v1.12.5; current plan copy names only published books", () => {
  assert.equal(SITE_UPDATES[0].version, "v1.12.5");
  assert.equal(SITE_UPDATES[1].version, "v1.12.4");
  assert.equal(SITE_UPDATES[0].type, "minor");
  assert.match(read("app/components/SiteUpdatesModal.tsx"), /RevIT Platform \{SITE_UPDATES\[0\]\?\.version/);
  const pricing = currentReviewerCopy(renderPublicPricing());
  for (const count of ["1,606", "2,848", "4,454"]) assert.ok(pricing.includes(count));
  assert.doesNotMatch(pricing, /999|1,884|2,883|Elsevier|BOC/);
  for (const path of ["app/auth/page.tsx", "app/components/Onboarding.tsx", "app/components/PlanAnnouncementModal.tsx", "app/components/ProActivationModal.tsx", "app/pro/page.tsx"]) {
    const source = path === "app/pro/page.tsx" ? currentReviewerCopy(renderPublicPro()) : read(path);
    if (path === "app/auth/page.tsx") {
      assert.match(source, /<ProPlanCards/);
      assert.match(source, /\["Future book editions", "Not included", "Included in Pro"\]/);
    } else {
      assert.match(source, /Access to newly added Pro reviewer books/);
    }
    assert.doesNotMatch(source, /Elsevier|BOC/);
  }
});
