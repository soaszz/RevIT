import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { loadCloudSnapshot } from "../app/lib/cloudService";

const warningText = "Using the user object as returned from supabase.auth.getSession()";
const verifiedId = "11111111-1111-4111-8111-111111111111";
const cookieId = "22222222-2222-4222-8222-222222222222";
const jwt = (aal = "aal1") => [
  { alg: "HS256", typ: "JWT" },
  { sub: verifiedId, exp: Math.floor(Date.now() / 1000) + 3600, aal, amr: [] },
].map(part => Buffer.from(JSON.stringify(part)).toString("base64url")).concat("c3ludGhldGlj").join(".");

function authFixture(options: { factors?: boolean; cookieFactors?: boolean; aal?: string; missing?: boolean; rejected?: boolean; unconfirmed?: boolean } = {}) {
  const accessToken = jwt(options.aal);
  const factor = { id: "synthetic-factor", factor_type: "totp", status: "verified" };
  const user = { id: verifiedId, email: "synthetic@example.invalid", user_metadata: { username: "verified-user" },
    email_confirmed_at: options.unconfirmed ? null : "2026-01-01T00:00:00Z", factors: options.factors ? [factor] : [] } as unknown as User;
  const session = { access_token: accessToken, refresh_token: "synthetic-refresh-token", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer",
    user: { ...user, id: cookieId, user_metadata: { username: "cookie-user" }, factors: options.cookieFactors ? [factor] : [] } };
  const cookies = options.missing ? [] : [{ name: "sb-unit-test-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` }];
  let userRequests = 0;
  const client = createServerClient("https://unit-test.supabase.co", "synthetic-public-key", {
    cookies: { getAll: () => cookies, setAll: () => {} },
    global: { fetch: async (input, init) => {
      assert.equal(String(input), "https://unit-test.supabase.co/auth/v1/user", "No real network request is allowed");
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${accessToken}`);
      userRequests++;
      // Reproduce the original parallel getUser/MFA race deterministically.
      await new Promise(resolve => setTimeout(resolve, 5));
      return options.rejected
        ? Response.json({ message: "Invalid JWT", code: "bad_jwt" }, { status: 401 })
        : Response.json(user);
    } },
  });
  return { client, user, accessToken, userRequests: () => userRequests };
}

function loadModule(path: string, overrides: Record<string, unknown>, environment: Record<string, string> = {}) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const require = createRequire(import.meta.url);
  new Function("require", "exports", "process", code)((name: string) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(overrides, name)) return overrides[name];
    return require(name);
  }, exports, { env: environment });
  return exports;
}

function home(client: ReturnType<typeof authFixture>["client"]) {
  const retry = loadModule("app/lib/supabase/retryAuth.ts", {
    "../withTimeout": { withTimeout: <T>(promise: Promise<T>) => promise },
  });
  const exports = loadModule("app/page.tsx", {
    "./RevITApp": { default: () => null, __esModule: true },
    "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
    "./lib/supabase/config": { isSupabaseConfigured: () => true },
    "./lib/supabase/server": { createClient: async () => client },
    "./lib/supabase/retryAuth": retry,
    "./lib/server/trustedStudyGate": { trustedStudyTransportEnabled: () => false },
  });
  return exports.default as () => Promise<{ props: { initialUser: { id: string; username: string }; cloudEnabled: boolean } }>;
}

test("installed SDK reproduces the original implicit MFA session.user warning and stale factor decision", async (t) => {
  const fixture = authFixture({ factors: true, cookieFactors: false });
  const warnings = t.mock.method(console, "warn", () => {});
  const [, assurance] = await Promise.all([fixture.client.auth.getUser(), fixture.client.auth.mfa.getAuthenticatorAssuranceLevel()]);
  assert.equal(assurance.data?.nextLevel, "aal1", "Old SDK path trusts absent factors in stored session.user");
  assert.equal(warnings.mock.calls.filter(call => String(call.arguments[0]).includes(warningText)).length, 1);
});

test("shared server page verifies identity and MFA factors with zero warnings on repeated library renders", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  for (let render = 0; render < 5; render++) {
    // Simulate each new SSR client: authenticated user differs from cookie user.
    const fixture = authFixture();
    const result = await home(fixture.client)();
    assert.equal(result.props.initialUser.id, verifiedId);
    assert.equal(result.props.initialUser.username, "verified-user");
    assert.equal(result.props.cloudEnabled, true);
    assert.ok(fixture.userRequests() >= 1);
  }
  assert.equal(warnings.mock.calls.length, 0);
});

test("server MFA cannot be bypassed by deleting factors from the stored session user", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  const fixture = authFixture({ factors: true, cookieFactors: false });
  await assert.rejects(home(fixture.client), /REDIRECT:\/auth\/mfa\?next=\/overview/);
  assert.equal(warnings.mock.calls.length, 0);
});

test("forged cookie factors do not force MFA, while verified aal2 access remains accepted", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  for (const options of [{ cookieFactors: true }, { factors: true, aal: "aal2" }]) {
    const result = await home(authFixture(options).client)();
    assert.equal(result.props.initialUser.id, verifiedId);
  }
  assert.equal(warnings.mock.calls.length, 0);
});

test("missing, rejected and unconfirmed authentication stays protected without session.user warnings", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  for (const [options, destination] of [
    [{ missing: true }, "/auth"],
    [{ rejected: true }, "/auth"],
    [{ unconfirmed: true }, "/auth/verify"],
  ] as const) {
    await assert.rejects(home(authFixture(options).client), (error: Error) => error.message === `REDIRECT:${destination}`);
  }
  assert.equal(warnings.mock.calls.length, 0);
});

test("admin allowlist trusts getUser identity exclusively, never cookie/event identity", async () => {
  let verifiedUser: { id: string } | null = null;
  const api = loadModule("app/lib/admin/adminAuth.ts", {
    "../supabase/server": { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user: verifiedUser }, error: null }),
      getSession: () => { throw new Error("Admin authorization must never read session identity"); },
    } }) },
  }, { REVIT_ADMIN_USER_IDS: verifiedId }) as { verifyAdminSession: () => Promise<{ authenticated: boolean; authorized: boolean }> };
  assert.deepEqual(await api.verifyAdminSession().then(({ authenticated, authorized }) => ({ authenticated, authorized })), { authenticated: false, authorized: false });
  verifiedUser = { id: cookieId };
  assert.equal((await api.verifyAdminSession()).authorized, false);
  verifiedUser = { id: verifiedId };
  assert.equal((await api.verifyAdminSession()).authorized, true);
});

test("retained client getSession checks token lifecycle only; effective Free/Pro comes from the authenticated RPC", async () => {
  for (const effectivePlan of ["free", "pro"] as const) {
    const session = { access_token: "synthetic-client-token", get user(): never {
      throw new Error("Client snapshot must not read session.user for identity or entitlement");
    } };
    const client = {
      auth: { getSession: async () => ({ data: { session }, error: null }) },
      from: () => {
        const builder: Record<string, unknown> = {};
        for (const method of ["select", "eq", "is", "order", "limit", "range"]) builder[method] = () => builder;
        builder.maybeSingle = async () => ({ data: null, error: null });
        builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
        return builder;
      },
      rpc: async (name: string) => {
        assert.equal(name, "get_my_entitlement");
        return { data: [{ stored_plan: "pro", effective_plan: effectivePlan,
          pro_expires_at: effectivePlan === "free" ? "2026-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
          server_now: "2026-10-20T07:00:00Z" }], error: null };
      },
    };
    const snapshot = await loadCloudSnapshot(client as never, verifiedId);
    assert.equal(snapshot.entitlement.effectivePlan, effectivePlan);
  }
});
