import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import type * as Routes from "../app/lib/server/trustedStudyRoutes";
import type * as Client from "../app/lib/trustedStudyClient";

const root = resolve(import.meta.dirname, "..");
const owner = "11111111-1111-4111-8111-111111111111";
const localId = "22222222-2222-4222-8222-222222222222";
const serverId = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444";
const bank = (name: string) => JSON.parse(readFileSync(resolve(root, `app/content/${name}Content.json`), "utf8"));
const ordinary = bank("reviewer").questions[0];
const matching = bank("rodak").questions.find((q: { matching?: unknown }) => q.matching);

function load<T>(file: string, overrides: Record<string, unknown> = {}): T {
  const cache = new Map<string, { exports: unknown }>();
  function run(path: string): unknown {
    if (cache.has(path)) return cache.get(path)!.exports;
    const loaded = { exports: {} }; cache.set(path, loaded);
    const requireModule = (name: string): unknown => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === "server-only") return {};
      const target = resolve(dirname(path), name);
      if (name.startsWith(".") && existsSync(`${target}.ts`)) return run(`${target}.ts`);
      return createRequire(path)(name);
    };
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function("require", "module", "exports", code)(requireModule, loaded, loaded.exports);
    return loaded.exports;
  }
  return run(resolve(root, file)) as T;
}

function routeFixture(enabled = false, config = true, plan = "pro", signedIn = true) {
  let writes = 0; let reads = 0;
  const rows: Record<string, unknown[]> = { question_attempts: [], study_sessions: [] };
  const auth = { auth: { getUser: async () => { reads++; return { data: { user: signedIn ? { id: owner } : null }, error: null }; } },
    rpc: async () => ({ data: [{ effective_plan: plan }], error: null }),
    from: (table: string) => {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const filtered = () => (rows[table] as Record<string, unknown>[]).filter(row => filters.every(fn => fn(row)));
      const query = { select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        maybeSingle: async () => ({ data: filtered()[0] ?? null, error: null }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: filtered(), error: null })) };
      return query;
    } };
  const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { reads++; return { data: { enabled: config }, error: null }; } }) }) }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      writes++;
      if (name === "create_rewarded_study_session") {
        const row = { id: serverId, user_id: owner, request_id: args.p_request_id, expires_at: "2099-01-01T00:00:00Z", completed_at: null, ...args.p_plan as object };
        const plan = args.p_plan as { question_pool: { question_id: string; content_version: string }[] };
        Object.assign(row, { question_pool: plan.question_pool.map(q => ({ content_version: q.content_version, question_id: q.question_id })) });
        rows.study_sessions = [row]; return { data: row, error: null };
      }
      if (name === "complete_verified_study_session") {
        return { data: { sessionId: args.p_session_id, completedAt: "2026-10-17T00:00:00Z", attemptIds: args.p_attempt_ids,
          attemptCount: (args.p_attempt_ids as string[]).length, correctCount: 1, totalXp: 60, level: 1, xpAwarded: 20, unlocked: [], contract: 1 }, error: null };
      }
      const attempts = args.p_attempts as Record<string, unknown>[];
      assert.ok(attempts.every(a => !Object.hasOwn(a, "xp")));
      const data = attempts.map(a => ({ ...a, id: a.id, user_id: owner, session_id: serverId,
        attempt_number: 1, verified_at: "2026-10-16T01:00:00Z", competitive_at: "2026-10-16T01:00:00Z" }));
      rows.question_attempts = data; return { data, error: null };
    } };
  const routes = load<typeof Routes>("app/lib/server/trustedStudyRoutes.ts", {
    "./trustedStudyGate": { trustedStudyTransportEnabled: () => enabled, requireTrustedStudyWriter: async () => { if (!config) throw Error("TRUSTED_STUDY_DISABLED"); return admin; } },
    "../supabase/server": { createClient: async () => auth },
    "../admin/adminAuth": { createAdminServiceClient: () => { throw Error("UNEXPECTED_PRIVILEGED_CLIENT"); } },
  });
  const post = (operation: "session" | "attempts" | "completion", body: unknown, account = owner) => routes.handleTrustedStudyRequest(new Request(`http://localhost/api/study/${operation}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost", "X-RevIT-Account": account }, body: JSON.stringify(body),
  }), operation);
  return { post, handle: routes.handleTrustedStudyRequest, rows, counts: () => ({ reads, writes }), setPlan: (value: string) => { plan = value; } };
}

test("disabled routes perform zero authentication, configuration or persistence requests", async () => {
  const s = routeFixture();
  for (const op of ["session", "attempts", "completion"] as const) assert.equal((await s.post(op, {})).status, 503);
  assert.deepEqual(s.counts(), { reads: 0, writes: 0 });
});

test("server gate defaults off, requires database configuration, and errors fail closed", async () => {
  const gate = load<{ trustedStudyTransportEnabled(): boolean }>("app/lib/server/trustedStudyGate.ts", {
    "../admin/adminAuth": { createAdminServiceClient: () => { throw Error("NO_NETWORK"); } },
  });
  const before = process.env.REVIT_TRUSTED_STUDY_ENABLED;
  try {
    delete process.env.REVIT_TRUSTED_STUDY_ENABLED; assert.equal(gate.trustedStudyTransportEnabled(), false);
    process.env.REVIT_TRUSTED_STUDY_ENABLED = "false"; assert.equal(gate.trustedStudyTransportEnabled(), false);
  } finally { if (before === undefined) delete process.env.REVIT_TRUSTED_STUDY_ENABLED; else process.env.REVIT_TRUSTED_STUDY_ENABLED = before; }
  const disabled = routeFixture(true, false);
  assert.equal((await disabled.post("session", { requestId: localId, questionIds: [ordinary.id], mode: "adaptive", targetCount: 1 })).status, 503);
  assert.equal(disabled.counts().writes, 0);
});

test("real database gate rejects missing rows, query errors and unavailable configuration without writes", async () => {
  const saved = process.env.REVIT_TRUSTED_STUDY_ENABLED;
  try {
    process.env.REVIT_TRUSTED_STUDY_ENABLED = "true";
    for (const result of [{ data: null, error: null }, { data: { enabled: false }, error: null }, { data: { enabled: true }, error: {} }]) {
      const gate = load<{ requireTrustedStudyWriter(): Promise<unknown> }>("app/lib/server/trustedStudyGate.ts", {
        "../admin/adminAuth": { createAdminServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) },
      });
      await assert.rejects(gate.requireTrustedStudyWriter(), /TRUSTED_STUDY_DISABLED/);
    }
    const gate = load<{ requireTrustedStudyWriter(): Promise<unknown> }>("app/lib/server/trustedStudyGate.ts", {
      "../admin/adminAuth": { createAdminServiceClient: () => { throw Error("Missing configuration"); } },
    });
    await assert.rejects(gate.requireTrustedStudyWriter(), /TRUSTED_STUDY_DISABLED/);
  } finally { if (saved === undefined) delete process.env.REVIT_TRUSTED_STUDY_ENABLED; else process.env.REVIT_TRUSTED_STUDY_ENABLED = saved; }
});

test("routes authenticate, reject account switches and Pro access, and reject forged fields", async () => {
  assert.equal((await routeFixture(true, true, "pro", false).post("session", {})).status, 401);
  const s = routeFixture(true);
  const input = { requestId: localId, questionIds: [ordinary.id], mode: "adaptive", targetCount: 1 };
  assert.equal((await s.post("session", input, serverId)).status, 409);
  for (const field of ["userId", "isCorrect", "xp", "book", "answeredAt", "anything"]) assert.equal((await s.post("session", { ...input, [field]: true })).status, 400);
  const free = routeFixture(true, true, "free");
  assert.equal((await free.post("session", { ...input, questionIds: [matching.id] })).status, 403);
  for (const plan of ["pro", "free"]) assert.equal((await routeFixture(true, true, plan).post("session", { ...input, questionIds: [bank("strasinger").questions[0].id] })).status, 403);
  assert.equal(s.counts().writes, 0);
});

test("real server grader commits matching NULL, recognizes exact retries, rejects altered identity and response", async () => {
  const s = routeFixture(true);
  const created = await s.post("session", { requestId: localId, questionIds: [matching.id], mode: "wrong_answers", targetCount: 1 });
  assert.equal(created.status, 200);
  const session = await created.json();
  const input = { sessionId: serverId, attempts: [{ id, slot: 0, questionId: matching.id, contentVersion: session.questionPool[0].content_version,
    response: { kind: "matching", selections: matching.matching.answerKey } }] };
  const first = await s.post("attempts", input); assert.equal(first.status, 200);
  const result = await first.json(); assert.equal(result.acknowledgments[0].status, "accepted");
  assert.equal((s.rows.question_attempts[0] as Record<string, unknown>).selected_answer, null);
  const retry = await s.post("attempts", input); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).acknowledgments[0].status, "already_accepted");
  for (const patch of [{ questionId: ordinary.id }, { slot: 1 }, { contentVersion: "wrong" }, { response: { kind: "timeout" } }]) {
    assert.equal((await s.post("attempts", { ...input, attempts: [{ ...input.attempts[0], ...patch }] })).status, 409);
  }
});

test("commits recheck current Pro; expiry, unknown IDs, invalid mappings, oversized batches and foreign pools fail closed", async () => {
  const s = routeFixture(true);
  const session = await (await s.post("session", { requestId: localId, questionIds: [matching.id], mode: "adaptive", targetCount: 1 })).json();
  const attempt = { id, slot: 0, questionId: matching.id, contentVersion: session.questionPool[0].content_version, response: { kind: "matching", selections: matching.matching.answerKey } };
  s.setPlan("free"); assert.equal((await s.post("attempts", { sessionId: serverId, attempts: [attempt] })).status, 403);
  s.setPlan("pro");
  for (const patch of [{ response: { kind: "matching", selections: [] } }, { response: { kind: "matching", selections: [823542] } },
    { response: { ...attempt.response, isCorrect: true } }, { xp: 50 }, { slot: -1 }, { slot: 0.5 }, { questionId: "unknown-id" }]) {
    assert.equal((await s.post("attempts", { sessionId: serverId, attempts: [{ ...attempt, ...patch }] })).status, 400);
  }
  assert.equal((await s.post("attempts", { sessionId: serverId, attempts: [{ ...attempt, slot: 1 }] })).status, 409);
  assert.equal((await s.post("attempts", { sessionId: serverId, attempts: Array(51).fill(attempt) })).status, 400);
  const row = s.rows.study_sessions[0] as Record<string, unknown>;
  row.expires_at = "2000-01-01T00:00:00Z";
  assert.equal((await s.post("attempts", { sessionId: serverId, attempts: [attempt] })).status, 410);
  row.expires_at = "2099-01-01T00:00:00Z";
  assert.equal((await s.post("attempts", { sessionId: serverId, attempts: [{ ...attempt, questionId: ordinary.id }] })).status, 422);
  assert.equal(s.counts().writes, 1);
});

function clientFixture(enabled = true) {
  const values = new Map<string, string>(); let account: string | null = owner; let requests = 0;
  let completionNetwork = false;
  let behavior: "accepted" | "already_accepted" | "empty" | "conflict" | "network" = "accepted";
  const api = load<typeof Client>("app/lib/trustedStudyClient.ts");
  const options: Parameters<typeof api.createTrustedStudyClient>[0] = { enabled, userId: owner, currentUserId: () => account,
    storage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } },
    fetch: async (_url, options) => {
      requests++; const body = JSON.parse(options!.body as string);
      if (behavior === "network") throw Error("Network offline");
      if (body.requestId) return Response.json({ id: serverId, userId: owner, expiresAt: "2099-01-01T00:00:00Z", nextSlot: 0, slotLimit: 10000,
        questionPool: body.questionIds.map((question_id: string) => ({ question_id, content_version: "canonical-version" })) });
      if (body.attemptIds) {
        if (completionNetwork) throw Error("Lost completion acknowledgment");
        return Response.json({ sessionId: body.sessionId, completedAt: "2026-10-17T00:00:00Z", attemptIds: body.attemptIds, contract: 1 });
      }
      if (behavior === "conflict") return Response.json({ code: "ATTEMPT_CONFLICT" }, { status: 409 });
      return Response.json({ acknowledgments: behavior === "empty" ? [] : body.attempts.map((a: Record<string, unknown>) => ({ id: a.id, questionId: a.questionId,
        sessionId: body.sessionId, slot: a.slot, contentVersion: a.contentVersion, status: behavior, verified_at: "2026-10-16T01:00:00Z" })) });
    } };
  const client = api.createTrustedStudyClient(options);
  const start = () => client.startSession({ localSessionId: localId, mode: "adaptive", questionIds: [ordinary.id, matching.id], targetCount: 2 });
  const answer = (q = ordinary) => client.recordAttempt(localId, { id, questionId: q.id, selectedAnswer: q.matching ? 21 : q.correctAnswer,
    matchingSelections: q.matching?.answerKey }, q);
  const queue = () => JSON.parse(values.get(`revit-trusted-study-v1:${owner}`) ?? '{"queue":[]}').queue;
  return { client, values, start, answer, queue, restore: () => api.createTrustedStudyClient(options), requests: () => requests,
    setCompletionNetwork: (value: boolean) => { completionNetwork = value; },
    setBehavior: (v: typeof behavior) => { behavior = v; }, switchAccount: () => { account = serverId; } };
}

test("acknowledged stable IDs cannot be assigned a new slot after pruning or restoration", async () => {
  const s = clientFixture(); await s.start(); s.answer(); await s.client.flush();
  const requests = s.requests(); s.answer(); await s.client.flush();
  assert.equal(s.requests(), requests); assert.deepEqual(s.queue(), []);
  const restored = s.restore();
  restored.recordAttempt(localId, { id, questionId: ordinary.id, selectedAnswer: ordinary.correctAnswer }, ordinary);
  await restored.flush(); assert.equal(s.requests(), requests);
});

test("unissued answered sessions request restoration only and cannot be newly issued", async () => {
  const api = load<typeof Client>("app/lib/trustedStudyClient.ts"); const values = new Map<string, string>(); const requests: Record<string, unknown>[] = [];
  let failed = false;
  const client = api.createTrustedStudyClient({ enabled: true, userId: owner, currentUserId: () => owner,
    storage: { getItem: key => values.get(key) ?? null, setItem: (key,value) => { values.set(key,value); } },
    fetch: async (_url, options) => { const body = JSON.parse(options!.body as string); requests.push(body); if (!failed) { failed = true; throw Error("Lost connection before issuance"); }
      assert.equal(body.resumeOnly, true); return Response.json({ code: "SESSION_UNAVAILABLE" }, { status: 422 }); } });
  await client.startSession({ localSessionId: localId, questionIds: [ordinary.id], targetCount: 1, mode: "adaptive" });
  client.recordAttempt(localId, { id, questionId: ordinary.id, selectedAnswer: ordinary.correctAnswer }, ordinary);
  await client.flush(); assert.equal(requests.length, 2);
  const stored = JSON.parse(values.get(`revit-trusted-study-v1:${owner}`)!);
  assert.equal(stored.queue.length, 1); assert.equal(stored.sessions[localId].serverSessionId, null);
  await client.flush(); assert.equal(requests.length, 2);
});

test("resume-only session requests cannot create new database rows", async () => {
  const s = routeFixture(true);
  const body = { requestId: localId, questionIds: [ordinary.id], mode: "adaptive", targetCount: 1, resumeOnly: true };
  assert.equal((await s.post("session", body)).status, 422); assert.equal(s.counts().writes, 0);
  const issued = await s.post("session", { requestId: localId, questionIds: [ordinary.id], mode: "adaptive", targetCount: 1 });
  assert.equal(issued.status, 200);
  assert.equal((await s.post("session", body)).status, 200); assert.equal(s.counts().writes, 1);
});

test("trusted startup reads progression without invoking achievement or reward writers", async () => {
  const xp = load<{ loadCloudProgressionReadOnly(client: unknown, id: string): Promise<{ newlyUnlocked: unknown[] }> }>("app/lib/xpService.ts");
  const fake = { rpc: () => { throw Error("No reward RPC permitted"); }, from: (table: string) => {
    const result = { data: table === "user_progress" ? { total_xp: 42 } : [], count: 0, error: null };
    const query = { select: () => query, eq: () => query, order: () => query, like: () => query,
      maybeSingle: async () => result, then: (fn: (value: unknown) => unknown) => Promise.resolve(fn(result)) };
    return query;
  } };
  assert.deepEqual((await xp.loadCloudProgressionReadOnly(fake, owner)).newlyUnlocked, []);
  assert.match(readFileSync(resolve(root, "app/RevITApp.tsx"), "utf8"), /trustedStudy\s*\?\s*await loadCloudProgressionReadOnly/);
});

test("disabled client makes zero requests and writes no storage; local attempt remains unchanged", async () => {
  const s = clientFixture(false); const original = { id, selectedAnswer: 0 };
  await s.start(); s.answer(); await s.client.flush();
  assert.equal(s.requests(), 0); assert.equal(s.values.size, 0); assert.deepEqual(original, { id, selectedAnswer: 0 });
});

test("queue retains HTTP-success without acknowledgment, network failures and conflicts; only authoritative statuses prune", async () => {
  for (const behavior of ["empty", "network", "conflict", "accepted", "already_accepted"] as const) {
    const s = clientFixture(); await s.start(); s.answer(matching); s.setBehavior(behavior); await s.client.flush();
    assert.equal(s.queue().length, ["accepted", "already_accepted"].includes(behavior) ? 0 : 1);
    if (s.queue().length) { assert.deepEqual(s.queue()[0].response.selections, matching.matching.answerKey); assert.equal(s.queue()[0].localSelectedAnswer, 21); }
    if (behavior === "conflict") { const requests = s.requests(); await s.client.flush(); assert.equal(s.requests(), requests); }
  }
});

test("account switching prevents replay; expired bindings recover durable lost acknowledgments", async () => {
  const s = clientFixture(); await s.start(); await s.answer(); s.switchAccount(); await s.client.flush();
  assert.equal(s.requests(), 1); assert.equal(s.queue().length, 1);
  // Simulate a committed response whose acknowledgment was lost before local pruning.
  const recovery = clientFixture(); await recovery.start(); recovery.answer(); recovery.setBehavior("network"); await recovery.client.flush();
  const key = `revit-trusted-study-v1:${owner}`; const saved = JSON.parse(recovery.values.get(key)!);
  saved.sessions[localId].serverSessionExpiresAt = "2000-01-01T00:00:00Z"; recovery.values.set(key, JSON.stringify(saved));
  recovery.setBehavior("already_accepted"); await recovery.client.flush();
  assert.equal(recovery.requests(), 3); assert.deepEqual(recovery.queue(), []);
});

test("completed issuance cannot be rebound as a fresh session", async () => {
  const s = routeFixture(true);
  const body = { requestId: localId, questionIds: [ordinary.id], mode: "reviewer", targetCount: 1 };
  assert.equal((await s.post("session", body)).status, 200);
  (s.rows.study_sessions[0] as Record<string, unknown>).completed_at = "2026-10-16T00:00:00Z";
  assert.equal((await s.post("session", { ...body, resumeOnly: true })).status, 422);
});

test("route rejects wrong media types before auth and bounds actual body bytes independently of headers", async () => {
  const s = routeFixture(true);
  const request = (body: string, headers: Record<string, string> = {}) => new Request("http://localhost/api/study/attempts", {
    method: "POST", body, headers: { Origin: "http://localhost", "X-RevIT-Account": owner, "Content-Type": "application/json", ...headers },
  });
  assert.equal((await s.handle(request("{}", { "Content-Type": "application/jsonx" }), "attempts")).status, 400);
  assert.equal(s.counts().reads, 0);
  assert.equal((await s.handle(request("{}", { Origin: "http://other.example" }), "attempts")).status, 403);
  assert.equal((await s.handle(request("x".repeat(65537), { "Content-Length": "1" }), "attempts")).status, 413);
  assert.equal((await s.handle(request("{broken"), "attempts")).status, 400);
  assert.equal(s.counts().writes, 0);
});

test("server recovers expired exact retries without writes while fresh expired work is refused", async () => {
  const s = routeFixture(true);
  const session = await (await s.post("session", { requestId: localId, questionIds: [ordinary.id], mode: "reviewer", targetCount: 1 })).json();
  const attempt = { id, slot: 0, questionId: ordinary.id, contentVersion: session.questionPool[0].content_version,
    response: { kind: "single_choice", choiceIndex: ordinary.correctAnswer } };
  assert.equal((await s.post("attempts", { sessionId: serverId, attempts: [attempt] })).status, 200);
  (s.rows.study_sessions[0] as Record<string, unknown>).expires_at = "2000-01-01T00:00:00Z";
  const writes = s.counts().writes;
  assert.equal((await s.post("attempts", { sessionId: serverId, attempts: [attempt] })).status, 200);
  assert.equal((await s.post("attempts", { sessionId: serverId, attempts: [{ ...attempt, id: "66666666-6666-4666-8666-666666666666", slot: 1 }] })).status, 410);
  assert.equal(s.counts().writes, writes);
});

test("shared browser lock serializes controllers and retains answers queued during network flight", async () => {
  const s = clientFixture(); await s.start();
  const api = load<typeof Client>("app/lib/trustedStudyClient.ts");
  let tail = Promise.resolve(); let release!: () => void; let entered!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const locks = { request: (_name: string, callback: () => unknown) => {
    const operation = tail.then(callback); tail = operation.then(() => {}, () => {}); return operation;
  } } as unknown as Pick<LockManager, "request">;
  let flights = 0, maxFlights = 0;
  const options = { enabled: true, userId: owner, currentUserId: () => owner, locks,
    storage: { getItem: (k: string) => s.values.get(k) ?? null, setItem: (k: string, v: string) => { s.values.set(k, v); } },
    fetch: async (_url: unknown, init?: RequestInit) => {
      flights++; maxFlights = Math.max(maxFlights, flights); entered(); await blocked; flights--;
      const body = JSON.parse(init!.body as string);
      return Response.json({ acknowledgments: body.attempts.map((a: Record<string, unknown>) => ({ ...a,
        sessionId: serverId, status: "accepted", verified_at: "2026-10-16T01:00:00Z" })) });
    } };
  const a = api.createTrustedStudyClient(options), b = api.createTrustedStudyClient(options);
  a.recordAttempt(localId, { id, questionId: ordinary.id, selectedAnswer: 0 }, ordinary);
  const first = a.flush(); await enteredPromise;
  const secondId = "55555555-5555-4555-8555-555555555555";
  b.recordAttempt(localId, { id: secondId, questionId: ordinary.id, selectedAnswer: 1 }, ordinary);
  const second = b.flush(); release(); await Promise.all([first, second]);
  const state = JSON.parse(s.values.get(`revit-trusted-study-v1:${owner}`)!);
  assert.equal(maxFlights, 1); assert.equal(state.sessions[localId].attemptSlots[id], 0);
  assert.equal(state.sessions[localId].attemptSlots[secondId], 1); assert.deepEqual(state.queue, []);
});

test("browser without Web Locks retains personal history and emits no trusted requests or storage writes", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    const s = clientFixture(); await s.start(); s.answer(); await s.client.flush();
    assert.equal(s.requests(), 0); assert.equal(s.values.size, 0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else Reflect.deleteProperty(globalThis, "window");
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("late acknowledgments after an account switch cannot prune the original owner's queue", async () => {
  const s = clientFixture(); await s.start(); await s.answer();
  const api = load<typeof Client>("app/lib/trustedStudyClient.ts");
  let account = owner, entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const client = api.createTrustedStudyClient({ enabled: true, userId: owner, currentUserId: () => account,
    storage: { getItem: k => s.values.get(k) ?? null, setItem: (k, v) => { s.values.set(k, v); } },
    fetch: async () => { entered(); await blocked; return Response.json({ acknowledgments: [{ id, questionId: ordinary.id,
      sessionId: serverId, slot: 0, contentVersion: "canonical-version", status: "accepted", verified_at: "2026-10-16T00:00:00Z" }] }); } });
  const before = [...s.values]; const flight = client.flush(); await started;
  account = serverId; client.setAccount(serverId); release(); await flight;
  assert.deepEqual([...s.values], before); assert.equal(s.queue().length, 1);
});

test("new client restores owned binding and unchanged pending payload; Strasinger emits no requests", async () => {
  const s = clientFixture(); await s.start(); s.answer(matching); s.setBehavior("network"); await s.client.flush();
  const pending = s.queue()[0]; assert.equal(pending.id, id); assert.equal(pending.serverSessionId, serverId); assert.equal(pending.slot, 0);
  s.setBehavior("already_accepted"); await s.restore().flush(); assert.deepEqual(s.queue(), []);
  const blocked = clientFixture();
  await blocked.client.startSession({ localSessionId: localId, questionIds: [bank("strasinger").questions[0].id], mode: "adaptive", targetCount: 1 });
  await blocked.client.flush(); assert.equal(blocked.requests(), 0); assert.equal(blocked.values.size, 0);
});

test("browser transport imports no privileged modules; SQL deny grants and runtime gate remain separate", () => {
  const source = readFileSync(resolve(root, "app/lib/trustedStudyClient.ts"), "utf8");
  assert.doesNotMatch(source, /createAdminServiceClient|SUPABASE_SERVICE|answerVerification|\.rpc\(/);
  for (const file of ["202610150025_trusted_study_persistence.sql", "202610160026_trusted_persistence_idempotency_hardening.sql"]) {
    const sql = readFileSync(resolve(root, `supabase/migrations/${file}`), "utf8");
    assert.match(sql, /revoke all on function public.commit_verified_study_batch\(uuid, uuid, jsonb\) from public, anon, authenticated/);
  }
});

test("completion route uses cookie identity and immutable ordered IDs; forged reward inputs never reach writer", async () => {
  const s = routeFixture(true);
  await s.post("session", { requestId: localId, questionIds: [ordinary.id], mode: "wrong_answers", targetCount: 1 });
  const input = { sessionId: serverId, attemptIds: [id] };
  const result = await s.post("completion", input);
  assert.equal(result.status, 200); assert.equal((await result.json()).xpAwarded, 20);
  const writes = s.counts().writes;
  for (const bad of [{ ...input, xp: 999 }, { ...input, userId: owner }, { ...input, isCorrect: true }, { ...input, completedAt: "now" },
    { ...input, attemptIds: [] }, { ...input, attemptIds: [id,id] }, { ...input, attemptIds: [1] }, { ...input, sessionId: "bad" }]) {
    assert.equal((await s.post("completion", bad)).status, 400);
  }
  assert.equal(s.counts().writes, writes);
  assert.equal((await s.post("completion", input, localId)).status, 409);
  assert.equal((await routeFixture(true,true,"pro",false).post("completion",input)).status, 401);
  assert.equal((await s.post("completion",{ ...input, sessionId: localId })).status, 422);
});

test("completion rechecks Pro access and blocks Strasinger before any reward RPC", async () => {
  const s = routeFixture(true);
  await s.post("session",{requestId:localId,questionIds:[matching.id],mode:"wrong_answers",targetCount:1});
  s.setPlan("free");
  assert.equal((await s.post("completion",{sessionId:serverId,attemptIds:[id]})).status,403);
  assert.equal(s.counts().writes,1);
});

test("client drains attempts before completion, persists lost receipts, and never sends totals", async () => {
  const s = clientFixture(); await s.start(); await s.answer(); s.setCompletionNetwork(true);
  await s.client.completeSession(localId);
  assert.deepEqual(s.queue(),[]);
  const stored = () => JSON.parse(s.values.get(`revit-trusted-study-v1:${owner}`)!);
  assert.equal(stored().sessions[localId].completion,"pending");
  const requests = s.requests(); s.setCompletionNetwork(false); await s.restore().flush();
  assert.equal(stored().sessions[localId].completion,"accepted"); assert.equal(s.requests(),requests+1);
  await s.client.completeSession(localId); await s.client.flush(); assert.equal(s.requests(),requests+1);
});

test("blocked attempts cannot be skipped to complete; account changes cannot replay completion", async () => {
  const s = clientFixture(); await s.start(); await s.answer(); s.setBehavior("conflict");
  await s.client.completeSession(localId); const requests=s.requests();
  assert.equal(s.queue().length,1); await s.client.flush(); assert.equal(s.requests(),requests);
  s.switchAccount(); await s.client.completeSession(localId); await s.client.flush(); assert.equal(s.requests(),requests);
  const empty=clientFixture(); await empty.start(); const n=empty.requests(); await empty.client.completeSession(localId); assert.equal(empty.requests(),n);
});

const componentSource = readFileSync(resolve(root, "app/RevITApp.tsx"), "utf8");
const componentAst = ts.createSourceFile("app.tsx", componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function componentFunction(name: string) {
  let source = "";
  function visit(node: ts.Node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) source = node.getText(componentAst); ts.forEachChild(node, visit); }
  visit(componentAst); assert.ok(source); return source;
}
function execute(source: string, name: string, context: Record<string, unknown>, args: unknown[]) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(context), `${code}; return ${name};`)(...Object.values(context))(...args);
}

test("actual disabled completeQuestion retains feedback, reinforcement, local history and legacy cloud behavior", () => {
  const baseline = JSON.parse(readFileSync(resolve(root, "docs/phase3n/phase3n-j/disabled-study-baseline.json"), "utf8"));
  const scoring = load<typeof import("../app/lib/matchingQuestion")>("app/lib/matchingQuestion.ts");
  const reinforcement = load<typeof import("../app/lib/adaptiveQuestions")>("app/lib/adaptiveQuestions.ts");
  for (const question of [ordinary, matching]) for (const selectedAnswer of [null, 0, question.matching ? scoring.encodeMatchingAnswers(question.matching.answerKey, question.choices.length) : question.correctAnswer]) {
    function run(source: string) {
      const calls: unknown[] = []; const setters = Object.fromEntries(["setAttempts", "setSessionAttempts", "setReinforcementLevels", "setSelectedChoice", "setTimedOut", "setAnswerRevealed"].map(name => [name, (value: unknown) => {
        calls.push([name, typeof value === "function" ? value(name === "setReinforcementLevels" ? {} : []) : value]);
      }]));
      const event = (name: string) => (...values: unknown[]) => calls.push([name, ...values]);
      execute(source, "completeQuestion", { ...setters, currentQuestion: question, answerRevealed: false, answerLockedRef: { current: false }, attempts: [],
        topicById: new Map(), subjectById: new Map(), reinforcementLevels: {}, ...reinforcement, ...scoring, normalizedDifficulty: () => "Unspecified",
        crypto: { randomUUID: () => id }, Date: class { toISOString() { return "2026-10-16T00:00:00Z"; } }, sessionMode: "adaptive", sessionId: localId,
        trustedStudy: null, cloudEnabled: true, initialUser: { id: owner }, STRASINGER_CLOUD_SYNC_ENABLED: false,
        queueQuestionAttempt: event("queueQuestionAttempt"), queueQuestionReinforcement: event("queueQuestionReinforcement"), soundEffectsEnabled: true,
        playReviewSound: event("playReviewSound"), recordStudyEvent: event("recordStudyEvent"), XP_REWARDS: { CORRECT_QUESTION: 5 } }, [selectedAnswer, selectedAnswer === null]);
      return calls;
    }
    assert.deepEqual(run(componentFunction("completeQuestion")), run(baseline.functions.completeQuestion));
  }
});

test("actual Skip defers question without recording or sending an attempt; component JSX preserves only the approved Recommended Next button reorder", () => {
  const calls: string[] = []; let ids: string[] = [];
  const record = () => { throw Error("Skip must never persist attempts"); };
  execute(componentFunction("skipQuestion"), "skipQuestion", { currentQuestion: ordinary, answerRevealed: false, canSkipCurrentQuestion: true,
    sessionQuestionIds: [ordinary.id, "next"], sessionIndex: 0, sessionStrictWrongOnly: true, sessionDynamicTarget: 2,
    setSessionSkippedIds: (fn: (values: string[]) => string[]) => { assert.deepEqual(fn([]), [ordinary.id]); },
    setSessionChoiceOrders: (fn: (values: object) => object) => fn({}), setSessionQuestionIds: (values: string[]) => { ids = values; },
    setSelectedChoice: () => calls.push("choice"), setMatchingSelections: () => calls.push("matching"), setAnswerRevealed: () => {}, setTimedOut: () => {},
    answerLockedRef: { current: true }, queueQuestionAttempt: record, trustedStudy: { recordAttempt: record } }, []);
  assert.deepEqual(ids, ["next", ordinary.id]); assert.deepEqual(calls, ["choice", "matching"]);
  const currentSource = readFileSync(resolve(root, "app/RevITApp.tsx"), "utf8");
  const actionPattern = /(<div className="focus-actions">\s*)(<button className="secondary-button"[\s\S]*?<\/button>)(\s*)(<button className="primary-button" type="button" onClick=\{startRecommendedReview\}>[\s\S]*?<\/button>)/g;
  assert.equal([...currentSource.matchAll(actionPattern)].length, 1);
  const snapshotSource = currentSource.replace(actionPattern, "$1$4$3$2");
  const snapshotAst = ts.createSourceFile("app/RevITApp.tsx", snapshotSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const jsx: string[] = [];
  function visit(node: ts.Node) { if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) jsx.push(node.getText(snapshotAst)); ts.forEachChild(node, visit); }
  visit(snapshotAst);
  const baseline = JSON.parse(readFileSync(resolve(root, "docs/phase3n/phase3n-j/disabled-study-baseline.json"), "utf8"));
  assert.equal(createHash("sha256").update(JSON.stringify(jsx)).digest("hex"), baseline.jsxHash);
});
