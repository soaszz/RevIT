import { assertPreserved } from "../scripts/phase3n/assert-preserved.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import type { ReviewerBook, ReviewerQuestion } from "../app/content/reviewerContent";
import type * as Verification from "../app/lib/server/answerVerification";
import type * as Handler from "../app/lib/server/gradingHandler";
import { isQuestionAnswerCorrect, encodeMatchingAnswers } from "../app/lib/matchingQuestion";
import { MATCHING_QUESTION_IDS } from "../app/lib/matchingAttemptPersistence";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
// Execute real server modules; replace only framework poison/session boundaries.
function loadServer(overrides: Record<string, unknown> = {}) {
  const cache = new Map<string, { exports: unknown }>();
  function load(path: string): unknown {
    if (cache.has(path)) return cache.get(path)!.exports;
    const localRequire = createRequire(path);
    const loaded = { exports: {} };
    cache.set(path, loaded);
    const requireModule = (name: string): unknown => {
      if (name === "server-only") return {};
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.startsWith(".")) {
        const target = resolve(dirname(path), name);
        if (existsSync(`${target}.ts`)) return load(`${target}.ts`);
      }
      return localRequire(name);
    };
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
    }).outputText;
    new Function("require", "module", "exports", code)(requireModule, loaded, loaded.exports);
    return loaded.exports;
  }
  return { verification: () => load(resolve(root, "app/lib/server/answerVerification.ts")) as typeof Verification,
    handler: () => load(resolve(root, "app/lib/server/gradingHandler.ts")) as typeof Handler };
}

const datasets = (["Harr", "Ciulla", "Rodak", "Strasinger"] as const).map(book => ({ book,
  questions: (JSON.parse(read(`app/content/${book === "Harr" ? "reviewer" : book.toLowerCase()}Content.json`)) as { questions: ReviewerQuestion[] }).questions,
}));
const ordinary = datasets.flatMap(b => b.questions).find(q => !q.matching)!;
const matching = datasets.flatMap(b => b.questions).filter(q => q.matching);
const request = (q: ReviewerQuestion, response: unknown) => ({ questionId: q.id, response });
const correctResponse = (q: ReviewerQuestion) => q.matching
  ? { kind: "matching", selections: [...q.matching.answerKey] }
  : { kind: "single_choice", choiceIndex: q.correctAnswer };
const service = loadServer().verification;

test("canonical registry covers all banks once, preserves source, and rejects unknown IDs", async () => {
  const api = service();
  const registry = api.createCanonicalRegistry(datasets);
  assert.equal(registry.size, 4441);
  const sparseMetadata = datasets[2].questions.find(q => q.id === "rodak-ch04-01")!;
  assert.deepEqual(registry.get(sparseMetadata.id)!.question, sparseMetadata, "Preserve existing absent metadata without invented fields");
  for (const bank of datasets) {
    for (const q of [bank.questions[0], bank.questions.at(-1)!]) {
      const entry = await api.getCanonicalQuestion(q.id);
      assert.equal(entry.book, bank.book);
      assert.equal(entry.choiceCount, q.choices.length);
      assert.deepEqual(entry.question.source, q.source);
      assert.equal(entry.questionType, q.matching ? "matching" : "single_choice");
      assert.match(entry.contentVersion, /^revit-grading-v1:[a-z]+:[a-f0-9]{64}$/);
      assert.equal(await api.getCanonicalQuestion(q.id), entry);
      assert.ok(Object.isFrozen(entry.question));
    }
  }
  const tableQuestion = datasets.flatMap(bank => bank.questions).find(q => q.choiceTable)!;
  assert.ok(tableQuestion);
  assert.equal((await api.gradeAnswer(request(tableQuestion, correctResponse(tableQuestion)))).isCorrect, true);
  await assert.rejects(api.getCanonicalQuestion("missing-id"), { code: "UNKNOWN_QUESTION" });
});

test("registry rejects duplicate, malformed and ambiguous definitions without key leakage", () => {
  const api = service();
  const bank = (q: unknown[]) => [{ book: "Harr" as ReviewerBook, questions: q }];
  const invalid = [
    { ...ordinary, id: "" }, { ...ordinary, choices: [] }, { ...ordinary, choices: ["valid", null] },
    { ...ordinary, correctAnswer: -1 }, { ...ordinary, correctAnswer: 999 },
    { ...ordinary, correctAnswer: 0.5 }, { ...ordinary, correctAnswer: "0" },
    { ...ordinary, subjectId: "" }, { ...ordinary, topicId: "" },
    { ...ordinary, source: null }, { ...ordinary, book: "Ciulla" },
    { ...ordinary, matching: { items: ["item"], answerKey: [] } },
    { ...ordinary, matching: { items: ["item"], answerKey: [999] } },
    { ...ordinary, matching: { items: ["item"], answerKey: [0] }, choiceTable: { columns: ["x"], rows: [["x"]] } },
    { ...ordinary, choiceTable: { columns: ["x"], rows: [["x"]] } },
  ];
  for (const q of invalid) assert.throws(() => api.createCanonicalRegistry(bank([q])), { code: "CONTENT_UNAVAILABLE", message: "Question content is unavailable." });
  assert.throws(() => api.createCanonicalRegistry(bank([ordinary, ordinary])), { code: "CONTENT_UNAVAILABLE" });
  assert.throws(() => api.createCanonicalRegistry([
    { book: "Harr", questions: [ordinary] }, { book: "Ciulla", questions: [ordinary] },
  ]), { code: "CONTENT_UNAVAILABLE" });
});

test("content versions are stable for identical content and change with grading keys", () => {
  const api = service();
  const make = (q: unknown) => api.createCanonicalRegistry([{ book: "Harr", questions: [q] }]).get(ordinary.id)!;
  const first = make(ordinary);
  assert.equal(make(JSON.parse(JSON.stringify(ordinary))).contentVersion, first.contentVersion);
  assert.equal(make(Object.fromEntries(Object.entries(ordinary).reverse())).contentVersion, first.contentVersion);
  assert.notEqual(make({ ...ordinary, correctAnswer: (ordinary.correctAnswer + 1) % ordinary.choices.length }).contentVersion, first.contentVersion);
  assert.throws(() => { (first.question.choices as string[])[0] = "mutated"; }, TypeError);
});

test("ordinary grading uses canonical indexes for two through seven choices", async () => {
  const api = service();
  for (const count of [2, 3, 4, 5, 6, 7]) {
    const q = datasets.flatMap(b => b.questions).find(q => !q.matching && q.choices.length === count);
    if (!q) continue; // Six/seven-choice records may all be matching.
    const good = await api.gradeAnswer(request(q, correctResponse(q)));
    assert.equal(good.isCorrect, true);
    assert.equal((await api.gradeAnswer(request(q, { kind: "single_choice", choiceIndex: (q.correctAnswer + 1) % count }))).isCorrect, false);
    assert.equal(good.timedOut, false);
  }
  for (const count of [2, 3, 4]) assert.ok(datasets.some(b => b.questions.some(q => !q.matching && q.choices.length === count)));
  const displayedOrder = [3, 2, 1, 0];
  const position = displayedOrder.indexOf(ordinary.correctAnswer);
  assert.equal((await api.gradeAnswer(request(ordinary, { kind: "single_choice", choiceIndex: displayedOrder[position] }))).isCorrect, true);
  assert.notEqual(position, ordinary.correctAnswer);
  assert.equal((await api.gradeAnswer(request(ordinary, { kind: "single_choice", choiceIndex: position }))).isCorrect, false);
});

test("ordinary grading rejects malformed indexes and unknown IDs", async () => {
  const api = service();
  for (const value of [-1, ordinary.choices.length, 0.5, "0", true, false, null, NaN, Infinity, {}, []]) {
    await assert.rejects(api.gradeAnswer(request(ordinary, { kind: "single_choice", choiceIndex: value })), { code: "INVALID_RESPONSE" });
  }
  await assert.rejects(api.gradeAnswer({ questionId: "unknown", response: { kind: "timeout" } }), { code: "UNKNOWN_QUESTION" });
});

test("all 16 matching IDs grade exact sequences with unchanged local scorer parity", async () => {
  const api = service();
  assert.deepEqual(matching.map(q => q.id).sort(), [...MATCHING_QUESTION_IDS].sort());
  for (const q of matching) {
    const correct = [...q.matching!.answerKey];
    const wrong = [...correct]; wrong[0] = (wrong[0] + 1) % q.choices.length;
    for (const [selections, expected] of [[correct, true], [wrong, false]] as const) {
      const result = await api.gradeAnswer(request(q, { kind: "matching", selections }));
      assert.equal(result.isCorrect, expected);
      assert.equal(result.questionType, "matching");
      assert.equal(isQuestionAnswerCorrect(q, encodeMatchingAnswers([...selections], q.choices.length)), expected);
      assert.deepEqual(Object.keys(result).sort(), ["book", "contentVersion", "isCorrect", "questionId", "questionType", "timedOut"].sort());
    }
    const rotated = [...correct.slice(1), correct[0]];
    if (rotated.some((n, i) => n !== correct[i])) assert.equal((await api.gradeAnswer(request(q, { kind: "matching", selections: rotated }))).isCorrect, false);
  }
});

test("matching rejects missing, extra, sparse, noninteger and encoded answers", async () => {
  const api = service();
  for (const q of matching) {
    const key = q.matching!.answerKey;
    const sparse = [...key]; delete sparse[0];
    for (const selections of [key.slice(1), [...key, 0], sparse, [undefined, ...key.slice(1)],
      [-1, ...key.slice(1)], [q.choices.length, ...key.slice(1)], [0.5, ...key.slice(1)],
      ["0", ...key.slice(1)], [true, ...key.slice(1)], null, 823542, encodeMatchingAnswers(key, q.choices.length)]) {
      await assert.rejects(api.gradeAnswer(request(q, { kind: "matching", selections })), { code: "INVALID_RESPONSE" });
    }
    await assert.rejects(api.gradeAnswer(request(q, { kind: "single_choice", choiceIndex: 0 })), { code: "INVALID_RESPONSE" });
  }
  await assert.rejects(api.gradeAnswer(request(ordinary, { kind: "matching", selections: [0] })), { code: "INVALID_RESPONSE" });
});

test("strict request union rejects mixed variants and smuggled grading/security fields", async () => {
  const api = service();
  const fields = { isCorrect: true, correctAnswer: 0, answerKey: [0], xp: 999, userId: "forged", entitlement: "pro", book: "Harr", topicId: "fake", questionType: "matching", difficulty: "Easy", answeredAt: "yesterday", reinforcementLevel: 0 };
  for (const [name, value] of Object.entries(fields)) {
    await assert.rejects(api.gradeAnswer({ ...request(ordinary, correctResponse(ordinary)), [name]: value }), { code: "INVALID_RESPONSE" });
    await assert.rejects(api.gradeAnswer(request(ordinary, { ...correctResponse(ordinary), [name]: value })), { code: "INVALID_RESPONSE" });
  }
  for (const response of [{ kind: "single_choice", choiceIndex: 0, selections: [0] },
    { kind: "timeout", choiceIndex: 0 }, { kind: "matching", selections: [0], choiceIndex: 0 }, {}, null, []]) {
    await assert.rejects(api.gradeAnswer(request(ordinary, response)), { code: "INVALID_RESPONSE" });
  }
  for (const input of [null, [], {}, { questionId: 123, response: { kind: "timeout" } }, { questionId: "x".repeat(241), response: { kind: "timeout" } }]) {
    await assert.rejects(api.gradeAnswer(input), { code: "INVALID_RESPONSE" });
  }
});

test("explicit timeouts are incorrect for both canonical response types", async () => {
  for (const q of [ordinary, ...matching]) {
    const result = await service().gradeAnswer(request(q, { kind: "timeout" }));
    assert.equal(result.isCorrect, false); assert.equal(result.timedOut, true);
  }
});

function authFixture(plan: "free" | "pro", options: { signedIn?: boolean; authError?: boolean; entitlementError?: boolean; throwAuth?: boolean } = {}) {
  const calls: string[] = [];
  const client = {
    auth: { getUser: async () => {
      calls.push("getUser");
      if (options.throwAuth) throw new Error("private-auth-detail");
      return { data: { user: options.signedIn === false ? null : { id: "trusted-user" } }, error: options.authError ? { message: "private-auth-detail" } : null };
    } },
    rpc: async (name: string) => {
      calls.push(name); assert.equal(name, "get_my_entitlement", "Only the read-only entitlement RPC is allowed");
      return { data: [{ effective_plan: plan }], error: options.entitlementError ? { message: "private-entitlement-detail" } : null };
    },
    from: () => { throw new Error("Database table access is forbidden"); },
  };
  const handler = loadServer({ "../supabase/server": { createClient: async () => client } }).handler();
  return { handler, calls };
}

test("isolated authenticated handler permits Harr Free and premium books only for server-verified Pro", async () => {
  for (const bank of datasets) {
    const q = bank.questions.find(q => !q.matching)!;
    for (const plan of ["free", "pro"] as const) {
      const { handler, calls } = authFixture(plan);
      const result = await handler.handleGradingRequest(request(q, correctResponse(q)));
      assert.equal(result.status, bank.book === "Harr" || plan === "pro" ? 200 : 403);
      assert.ok(calls.includes("getUser"));
      assert.ok(calls.every(name => ["getUser", "get_my_entitlement"].includes(name)));
      if (result.status === 200) assert.equal((result.body as { isCorrect: boolean }).isCorrect, true);
      else assert.deepEqual(result.body, { error: "Active RevIT Pro subscription required.", code: "PRO_REQUIRED" });
    }
  }
});

test("handler denies unauthenticated/errors/forgery and never returns private errors or answer keys", async () => {
  for (const options of [{ signedIn: false }, { authError: true }, { throwAuth: true }]) {
    const { handler, calls } = authFixture("pro", options);
    const result = await handler.handleGradingRequest(request(matching[0], correctResponse(matching[0])));
    assert.ok([401, 503].includes(result.status));
    assert.deepEqual(calls, ["getUser"]);
    assert.doesNotMatch(JSON.stringify(result), /private-|answerKey|correctAnswer|selections|explanation/);
  }
  const denied = authFixture("free").handler;
  const unknown = await denied.handleGradingRequest({ questionId: "unknown", response: { kind: "timeout" } });
  assert.equal(unknown.status, 404);
  assert.equal((await denied.handleGradingRequest({ ...request(matching[0], correctResponse(matching[0])), entitlement: "pro" })).status, 400);
  const unavailable = await authFixture("pro", { entitlementError: true }).handler.handleGradingRequest(request(matching[0], correctResponse(matching[0])));
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(JSON.stringify(unavailable), /private-|answerKey|correctAnswer/);
});

test("grading stays server-only; integration routes stay gated; source and content stay protected", () => {
  for (const path of ["app/lib/server/answerVerification.ts", "app/lib/server/gradingHandler.ts"]) {
    const source = read(path);
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(source, /cloudService|xpService|service_role|SERVICE_ROLE|console\.|client\.(?:from|insert|upsert|update|delete)\(/);
  }
  assert.match(read("app/api/study/attempts/route.ts"), /handleTrustedStudyRequest/);
  assert.match(read("app/lib/server/trustedStudyRoutes.ts"), /if \(!trustedStudyTransportEnabled\(\)\)/);
  const preserved = JSON.parse(read("docs/phase3i-a/preserved-files.json")) as Record<string, string>;
  for (const [path, expected] of Object.entries(preserved)) {
    assertPreserved(path, expected);
  }
  const integrity = JSON.parse(read("docs/phase3i-a/content-integrity.json")) as { assets: Record<string, string> };
  for (const [path, expected] of Object.entries(integrity.assets)) assert.equal(createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"), expected, `${path} changed`);
});
