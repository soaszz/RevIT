import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { reviewerAssetUrl } from "../app/lib/reviewerAssetPaths";

const pins = JSON.parse(readFileSync("docs/private-reviewers/pins.json", "utf8"));
type Runtime = Record<string, any>; // Actual modules execute against narrowly controlled IO boundaries.
function runtime(options: Runtime = {}) {
  const state = { published: true, configured: true, user: true, plan: "pro", now: "2026-11-11T00:00:00Z",
    expires: "2026-12-11T00:00:00Z", rpcError: false, throws: false, tampered: false, missing: false, linked: false,
    authCalls: 0, rpcCalls: 0, sourceReads: 0, ...options };
  const cache = new Map<string, Runtime>();
  function load(path: string): Runtime {
    path = resolve(path); if (cache.has(path)) return cache.get(path)!;
    if (path.endsWith(".json")) return JSON.parse(readFileSync(path, "utf8"));
    const exports = {}; cache.set(path, exports);
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const native = createRequire(path);
    new Function("require", "exports", code)((name: string) => {
      if (name === "server-only") return {};
      if (name === "next/server") return { NextResponse: Response };
      if (name.endsWith("/entitlements")) return { isQuestionBankPublished: () => state.published };
      if (name.endsWith("/supabase/config")) return { isSupabaseConfigured: () => state.configured };
      if (name.endsWith("/supabase/server")) return { createClient: async () => {
        if (state.throws) throw Error("Synthetic unavailable authentication");
        return { auth: { getUser: async () => { state.authCalls++; return { data: { user: state.user ? { id: "synthetic-user" } : null }, error: null }; } },
          rpc: async (name: string) => { state.rpcCalls++; assert.equal(name, "get_my_entitlement"); return { data: [{ effective_plan: state.plan, server_now: state.now, pro_expires_at: state.expires }], error: state.rpcError ? {} : null }; } };
      } };
      if (name === "node:fs" && path.endsWith("privateReviewerSource.ts")) return {
        readFileSync: (p: string) => { state.sourceReads++; if (state.missing) throw Error("Missing pack"); return state.tampered ? Buffer.from("altered") : readFileSync(p); },
        lstatSync: () => ({ isSymbolicLink: () => state.linked }),
      };
      if (!name.startsWith(".")) return native(name);
      const target = resolve(dirname(path), name); return load(extname(target) ? target : target + ".ts");
    }, exports);
    return exports;
  }
  return { state, load };
}
for (const book of ["boc", "elsevier"]) {
  for (const [label, options, expected] of [
    ["unpublished", { published: false }, 404], ["anonymous", { user: false }, 401],
    ["Free", { plan: "free" }, 403], ["expired", { expires: "2026-11-10T00:00:00Z" }, 403],
    ["exact expiration boundary", { expires: "2026-11-11T00:00:00Z" }, 403],
    ["missing expiration", { expires: null }, 403], ["missing database time", { now: null }, 403],
    ["database failure", { rpcError: true }, 503], ["unavailable auth", { throws: true }, 503],
    ["unconfigured auth", { configured: false }, 503], ["active Pro", {}, 200],
  ] as const) test(`${book}: ${label} bank and direct asset authorization`, async () => {
    const r = runtime(options);
    const bank = r.load(`app/api/reviewer/${book}/route.ts`);
    const asset = pins.files.find((p: Runtime) => p.privatePath.startsWith(`runtime/assets/${book === "boc" ? "boc-7e" : "elsevier-1e"}/`));
    const image = r.load("app/api/reviewer/assets/[book]/[asset]/route.ts");
    for (const get of [() => bank.GET(), () => image.GET(new Request("https://local.invalid/api/reviewer/assets"), { params: Promise.resolve({ book, asset: asset.path.split("/").at(-1) }) })]) {
      const response: Response = await get(); assert.equal(response.status, expected);
      assert.match(response.headers.get("cache-control")!, /private.*no-store/);
      assert.equal(response.headers.get("cdn-cache-control"), "no-store");
      if (expected === 200) assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
    if (expected !== 200) assert.equal(r.state.sourceReads, 0, "No private bytes read before authorization");
    if (expected === 200) { assert.equal(r.state.authCalls, 2); assert.equal(r.state.rpcCalls, 2); }
    if (expected === 401) { assert.equal(r.state.authCalls, 2); assert.equal(r.state.rpcCalls, 0); }
    if (expected === 404 || !r.state.configured) assert.equal(r.state.authCalls, 0);
  });
}
test("all private content and 306 assets retain raw source hashes and are absent from public source", () => {
  assert.equal(pins.files.length, 311);
  for (const file of pins.files) {
    assert.equal(existsSync(file.path), false, file.path);
    const bytes = readFileSync(`.private-reviewers/${file.privatePath}`);
    assert.equal(bytes.length, file.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
});
test("private images use API namespace excluded by the unchanged service worker; four-book URLs stay unchanged", () => {
  for (const file of pins.files.filter((p: Runtime) => p.path.startsWith("public/"))) {
    const url = reviewerAssetUrl(file.path.slice(6)); assert.match(url, /^\/api\/reviewer\/assets\/(boc|elsevier)\//);
  }
  for (const book of ["harr", "ciulla", "rodak", "strasinger"]) {
    const url = `/reviewer-assets/${book}/example.png`; assert.equal(reviewerAssetUrl(url), url);
  }
  assert.match(readFileSync("public/sw.js", "utf8"), /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(readFileSync("app/components/QuestionStimulus.tsx", "utf8"), /unoptimized=\{reviewerAssetUrl\(stimulus.src\) !== stimulus.src\}/);
});
test("unknown, traversal and other-book asset names fail before auth or private IO", async () => {
  const r = runtime(); const image = r.load("app/api/reviewer/assets/[book]/[asset]/route.ts");
  for (const [book, asset] of [["boc", "../elsevier.json"], ["boc", "absent.png"], ["harr", "example.png"], ["elsevier", "%2e%2e.png"]]) {
    assert.equal((await image.GET(new Request("https://local.invalid"), { params: Promise.resolve({ book, asset }) })).status, 404);
  }
  assert.equal(r.state.authCalls, 0); assert.equal(r.state.sourceReads, 0);
});
for (const option of ["tampered", "missing", "linked"]) test(`private source ${option} fails closed`, async () => {
  const r = runtime({ [option]: true }); const route = r.load("app/api/reviewer/boc/route.ts");
  assert.equal((await route.GET()).status, 503);
});
test("authorized cached bank bytes do not bypass fresh entitlement verification for subsequent requests", async () => {
  const r = runtime(); const get = r.load("app/api/reviewer/boc/route.ts").GET;
  assert.equal((await get()).status, 200);
  r.state.expires = r.state.now; assert.equal((await get()).status, 403);
  r.state.user = false; assert.equal((await get()).status, 401);
  assert.equal(r.state.authCalls, 3); assert.equal(r.state.rpcCalls, 2);
});
