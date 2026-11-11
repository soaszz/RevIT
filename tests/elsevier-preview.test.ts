import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import type * as Entitlements from "../app/lib/entitlements";

function entitlementRuntime(mode?: string): typeof Entitlements {
  const code = ts.transpileModule(readFileSync("app/lib/entitlements.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "process", code)(exports, { env: { NODE_ENV: mode } });
  return exports as typeof Entitlements;
}

test("development preview exposes Elsevier only to Pro without publishing the book", () => {
  const api = entitlementRuntime("development");
  assert.equal(api.QUESTION_BANKS.elsevier.published, false);
  assert.equal(api.QUESTION_BANKS.elsevier.requiredPlan, "pro");
  assert.equal(api.isQuestionBankPublished("Elsevier"), true);
  assert.equal(api.canAccessQuestionBank("Elsevier", api.FREE_ENTITLEMENT), false);
  assert.equal(api.canAccessQuestionBank("Elsevier", { ...api.FREE_ENTITLEMENT, effectivePlan: "pro" }), true);
});

test("production, test and unspecified runtimes retain publication and entitlement protections", () => {
  for (const mode of ["production", "test", undefined]) {
    const api = entitlementRuntime(mode);
    assert.equal(api.isQuestionBankPublished("Elsevier"), false, mode);
    assert.equal(api.canAccessQuestionBank("Elsevier", { ...api.FREE_ENTITLEMENT, effectivePlan: "pro" }), false, mode);
    assert.equal(api.canAccessQuestionBank("Harr", api.FREE_ENTITLEMENT), true);
    for (const book of ["Ciulla", "Rodak", "Strasinger"] as const) {
      assert.equal(api.canAccessQuestionBank(book, api.FREE_ENTITLEMENT), false);
      assert.equal(api.canAccessQuestionBank(book, { ...api.FREE_ENTITLEMENT, effectivePlan: "pro" }), true);
    }
  }
});

test("actual Elsevier API stays private in production and requires authenticated Pro in development", async () => {
  const code = ts.transpileModule(readFileSync("app/api/reviewer/elsevier/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const mode of ["production", "development"]) {
    let signedIn = false, plan = "free", authCalls = 0, payloadReads = 0;
    const modules: Record<string, unknown> = {
      "server-only": {}, "next/server": { NextResponse: Response },
      "../../../lib/entitlements": entitlementRuntime(mode),
      "../../../lib/supabase/config": { isSupabaseConfigured: () => true },
      "../../../lib/supabase/server": { createClient: async () => ({
        auth: { getUser: async () => { authCalls++; return { data: { user: signedIn ? { id: "synthetic-preview" } : null }, error: null }; } },
        rpc: async () => ({ data: [{ effective_plan: plan, server_now: "2026-11-11T00:00:00Z", pro_expires_at: "2026-12-11T00:00:00Z" }], error: null }),
      }) },
      "../../../lib/server/elsevierServerContent": { getElsevierServerPayload: () => { payloadReads++; return { questions: [{ id: "synthetic-preview-question" }] }; } },
    };
    const accessExports: Record<string, unknown> = {};
    const accessCode = ts.transpileModule(readFileSync("app/lib/server/privateReviewerAccess.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("require", "exports", accessCode)((name: string) => {
      const mapped = name.startsWith("../") ? "../../../lib/" + name.slice(3) : name;
      assert.ok(Object.hasOwn(modules, mapped), mapped); return modules[mapped];
    }, accessExports);
    modules["../../../lib/server/privateReviewerAccess"] = accessExports;
    const exports: { GET?: () => Promise<Response> } = {};
    new Function("require", "exports", code)((name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; }, exports);
    const get = exports.GET!;
    if (mode === "production") {
      signedIn = true; plan = "pro";
      assert.equal((await get()).status, 404); assert.equal(authCalls, 0); assert.equal(payloadReads, 0);
    } else {
      assert.equal((await get()).status, 401);
      signedIn = true; assert.equal((await get()).status, 403); assert.equal(payloadReads, 0);
      plan = "pro"; const response = await get();
      assert.equal(response.status, 200); assert.equal(payloadReads, 1);
      assert.match(response.headers.get("Cache-Control")!, /private.*no-store/);
    }
  }
});
