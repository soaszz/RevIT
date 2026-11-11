import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import profile from "../docs/reviewer-release/configuration.json";

type Module = Record<string, any>;
function fixture(flag?: string, access: { user?: boolean; plan?: string; expires?: string } = {}) {
  const env: Record<string, string | undefined> = { NODE_ENV: "production", NEXT_PUBLIC_REVIEWER_COMPATIBILITY_ENABLED: flag };
  const cache = new Map<string, Module>(); let userCalls = 0, entitlementCalls = 0;
  function load(file: string): Module {
    file = resolve(file); if (cache.has(file)) return cache.get(file)!;
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
    const exports = {}; cache.set(file, exports); const native = createRequire(file);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function("require", "exports", "process", code)((name: string) => {
      if (name === "server-only") return {};
      if (name === "next/server") return { NextResponse: Response };
      if (name.endsWith("/supabase/config")) return { isSupabaseConfigured: () => true };
      if (name.endsWith("/supabase/server")) return { createClient: async () => ({
        auth: { getUser: async () => { userCalls++; return { data: { user: access.user === false ? null : { id: "synthetic-release-profile" } }, error: null }; } },
        rpc: async (name: string) => { assert.equal(name, "get_my_entitlement"); entitlementCalls++; return { data: [{ effective_plan: access.plan || "pro", server_now: "2026-11-11T00:00:00Z", pro_expires_at: access.expires || "2026-12-11T00:00:00Z" }], error: null }; },
      }) };
      if (!name.startsWith(".")) return native(name);
      const target = resolve(dirname(file), name); return load(extname(target) ? target : target + ".ts");
    }, exports, { env, cwd: () => process.cwd() });
    return exports;
  }
  return { load, env, calls: () => ({ user: userCalls, entitlement: entitlementCalls }) };
}

test("exact release profile reuses existing flags, keeps maintenance OFF and validates its date", () => {
  assert.equal(profile.version, "v1.13.0");
  if (profile.releaseDate !== "Pending") {
    const bound = new Date(`${profile.releaseDate} 00:00:00 GMT+0800`);
    assert.ok(Number.isFinite(bound.getTime()), "Invalid release date");
    assert.equal(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", dateStyle: "long" }).format(bound), profile.releaseDate);
  }
  assert.deepEqual(profile.buildEnvironment, { NEXT_PUBLIC_REVIEWER_COMPATIBILITY_ENABLED: "true" });
  assert.deepEqual(profile.runtimeEnvironment, { REVIT_REVIEWER_COMPATIBILITY_ENABLED: "true", REVIT_MAINTENANCE_MODE: "false" });
  assert.equal(profile.publicationIsBuildTime, true); assert.equal(profile.defaultPublicationEnabled, false);
  assert.equal(profile.privateRuntimeFiles, 308); assert.equal(profile.privateVerificationFilesExcluded, 3);
});

for (const flag of [undefined, "false", "TRUE", "1", "true"]) test(`publication/compatibility agree for production flag ${flag ?? "UNSET"}`, () => {
  const r = fixture(flag), entitlement = r.load("app/lib/entitlements.ts"), gate = r.load("app/lib/cloudSyncGate.ts");
  const enabled = flag === "true"; const pro = { ...entitlement.FREE_ENTITLEMENT, effectivePlan: "pro" };
  assert.equal(gate.REVIEWER_COMPATIBILITY_ENABLED, enabled);
  for (const book of ["BOC", "Elsevier"]) {
    assert.equal(entitlement.QUESTION_BANKS[book.toLowerCase()].published, enabled);
    assert.equal(entitlement.QUESTION_BANKS[book.toLowerCase()].requiredPlan, "pro");
    assert.equal(entitlement.isQuestionBankPublished(book), enabled);
    assert.equal(entitlement.canAccessQuestionBank(book, entitlement.FREE_ENTITLEMENT), false);
    assert.equal(entitlement.canAccessQuestionBank(book, pro), enabled);
    assert.equal(gate.isCloudSyncAllowedForBook(book), enabled);
  }
  assert.equal(gate.STRASINGER_CLOUD_SYNC_ENABLED, false, "Do not activate the separate Strasinger cloud hold");
  assert.equal(entitlement.canAccessQuestionBank("Harr", entitlement.FREE_ENTITLEMENT), true);
  for (const book of ["Ciulla", "Rodak", "Strasinger"]) {
    assert.equal(entitlement.canAccessQuestionBank(book, pro), true);
    assert.equal(entitlement.canAccessQuestionBank(book, entitlement.FREE_ENTITLEMENT), false);
  }
  assert.deepEqual(r.calls(), { user: 0, entitlement: 0 });
});

test("publication is frozen at module initialization, not changed by a later runtime flag", () => {
  const r = fixture("true"), entitlement = r.load("app/lib/entitlements.ts");
  r.env.NEXT_PUBLIC_REVIEWER_COMPATIBILITY_ENABLED = "false";
  assert.equal(entitlement.isQuestionBankPublished("BOC"), true);
  assert.equal(entitlement.isQuestionBankPublished("Elsevier"), true);
});

for (const [name, access, status] of [
  ["anonymous", { user: false }, 401], ["Free", { plan: "free" }, 403],
  ["expired Pro", { expires: "2026-11-11T00:00:00Z" }, 403], ["active Pro", {}, 200],
] as const) test(`actual enabled publication profile: ${name} bank and image access`, async () => {
  const r = fixture("true", access);
  const pins = JSON.parse(readFileSync("docs/private-reviewers/pins.json", "utf8"));
  for (const book of ["boc", "elsevier"]) {
    const bank = r.load(`app/api/reviewer/${book}/route.ts`);
    const image = r.load("app/api/reviewer/assets/[book]/[asset]/route.ts");
    const source = pins.files.find((p: { path: string }) => p.path.startsWith(`public/reviewer-assets/${book === "boc" ? "boc-7e" : "elsevier-1e"}/`));
    const response: Response = await bank.GET(); assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    if (status === 200) assert.equal((await response.json()).questions.length, book === "boc" ? 2469 : 830);
    const asset: Response = await image.GET(new Request("https://local.invalid"), { params: Promise.resolve({ book, asset: source.path.split("/").at(-1) }) });
    assert.equal(asset.status, status); assert.match(asset.headers.get("cache-control")!, /private.*no-store/);
    if (status === 200) assert.equal(createHash("sha256").update(Buffer.from(await asset.arrayBuffer())).digest("hex"), source.sha256);
  }
  assert.deepEqual(r.calls(), { user: 4, entitlement: status === 401 ? 0 : 4 });
});

test("unpublished production profile denies both banks before session or database requests", async () => {
  const r = fixture();
  for (const book of ["boc", "elsevier"]) assert.equal((await r.load(`app/api/reviewer/${book}/route.ts`).GET()).status, 404);
  assert.deepEqual(r.calls(), { user: 0, entitlement: 0 });
});

test("enabled public counts/labels include six books without a Coming Soon claim or private payload", () => {
  const r = fixture("true"), counts = r.load("app/lib/server/publicReviewerCounts.ts").getPublicQuestionCounts();
  const books = r.load("app/lib/publicReviewerBooks.ts");
  assert.deepEqual(counts, { free: 1606, proOnly: 6147, total: 7753 });
  assert.equal(books.getUpcomingReviewerNames(), "");
  assert.deepEqual(books.getPublicReviewerBooks().books.map((b: { label: string }) => b.label), ["Harr", "Ciulla", "Rodak", "Strasinger", "BOC", "Elsevier"]);
  assert.deepEqual(r.calls(), { user: 0, entitlement: 0 });
});

test("production-enabled canonical registry preserves five-choice/matching grading and book identity", async () => {
  const r = fixture("true"), grading = r.load("app/lib/server/answerVerification.ts");
  const questions = JSON.parse(readFileSync(".private-reviewers/runtime/books/elsevier.json", "utf8")).questions;
  const fifth = questions.find((q: { choices: string[]; matching?: unknown }) => q.choices.length === 5 && !q.matching);
  const matching = questions.find((q: { matching?: unknown }) => q.matching);
  for (const q of [fifth, matching]) {
    const entry = await grading.getCanonicalQuestion(q.id); assert.equal(entry.book, "Elsevier");
    const response = q.matching ? { kind: "matching", selections: q.matching.answerKey } : { kind: "single_choice", choiceIndex: q.correctAnswer };
    const result = await grading.gradeAnswer({ questionId: q.id, response });
    assert.equal(result.isCorrect, true); assert.equal(result.book, "Elsevier");
  }
  assert.deepEqual(r.calls(), { user: 0, entitlement: 0 });
});

test("combined entry matches the reviewed profile and preserves historical Updates bytes/footer", () => {
  const r = fixture(), updates = r.load("app/data/siteUpdates.ts").SITE_UPDATES;
  assert.equal(updates[0].id, "update-v1-13-0"); assert.equal(updates[0].date, profile.releaseDate); assert.equal(updates[0].type, "major");
  for (const word of ["BOC", "Elsevier", "Harr", "two correct"]) assert.ok(JSON.stringify(updates[0]).includes(word));
  const source = readFileSync("app/data/siteUpdates.ts", "utf8");
  const reverse = source
    .replace(/  \{\r?\n    id: "update-v1-13-0",[\s\S]*?\r?\n  \},\r?\n/, "")
    .replace(/  \{\r?\n    id: "update-v1-12-6",[\s\S]*?\r?\n  \},\r?\n/, "");
  assert.notEqual(reverse, source);
  const ledger = JSON.parse(readFileSync("docs/reviewer-release/authorized-changes.json", "utf8"));
  assert.equal(createHash("sha256").update(reverse).digest("hex"), ledger["app/data/siteUpdates.ts"].before);
  assert.equal(updates[1].version, "v1.12.6"); assert.equal(updates[1].date, "November 12, 2026");
  assert.equal(updates[2].version, "v1.12.5"); assert.equal(updates[2].date, "November 10, 2026");
  assert.match(readFileSync("app/components/SiteUpdatesModal.tsx", "utf8"), /RevIT Platform \{SITE_UPDATES\[0\]\?\.version/);
});
