import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import type { ReviewerBook, ReviewerQuestion } from "../app/content/reviewerContent";
import { buildFlashcardDeck } from "../app/lib/flashcards";
import { getUnifiedSubjects } from "../app/lib/reviewerLibrary";
import type { PremiumReviewerPayload } from "../app/lib/premiumReviewerService";
import type * as Rodak from "../app/lib/server/rodakServerContent";
import type * as Entitlements from "../app/lib/entitlements";
import { ciullaTopicQuestionCounts } from "../app/content/ciullaMetadata";
import { rodakPreviewTopics, rodakTopicQuestionCounts } from "../app/content/rodakMetadata";
import { strasingerTopicQuestionCounts } from "../app/content/strasingerMetadata";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const raw = (name: string) => JSON.parse(read(`app/content/${name}Content.json`)) as PremiumReviewerPayload;

// Execute real server content and API code. Only framework/authentication boundaries
// are substituted; no account, database, network, or publication state is changed.
function serverRuntime(overrides: Record<string, unknown> = {}) {
  const cache = new Map<string, { exports: unknown }>();
  function load(path: string): unknown {
    if (cache.has(path)) return cache.get(path)!.exports;
    const loaded = { exports: {} };
    cache.set(path, loaded);
    const requireModule = (name: string): unknown => {
      if (name === "server-only") return {};
      if (Object.hasOwn(overrides, name)) return overrides[name];
      const target = resolve(dirname(path), name);
      if (name.startsWith(".") && existsSync(`${target}.ts`)) return load(`${target}.ts`);
      return createRequire(path)(name);
    };
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", "process", code)(requireModule, loaded, loaded.exports,
      { env: { ...process.env, NODE_ENV: "development" } });
    return loaded.exports;
  }
  return (path: string) => load(resolve(root, path));
}

const runtime = serverRuntime();
const rodak = runtime("app/lib/server/rodakServerContent.ts") as typeof Rodak;
const payloads = new Map<ReviewerBook, PremiumReviewerPayload>([
  ["Harr", runtime("app/content/reviewerContent.ts") as PremiumReviewerPayload],
  ...(["Ciulla", "Rodak", "Strasinger"] as const).map((book) => {
    const api = runtime(`app/lib/server/${book.toLowerCase()}ServerContent.ts`) as Record<string, () => PremiumReviewerPayload>;
    return [book, api[`get${book}ServerPayload`]()] as [ReviewerBook, PremiumReviewerPayload];
  }),
]);

// Extract the actual count/selection/session functions instead of reproducing
// their implementation in the assertions. No UI mounting or styling changes.
function applicationCode(file: string) {
  const source = read(file);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = new Map<string, ts.Node>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer) nodes.set(node.name.getText(ast), node.initializer);
    if (ts.isFunctionDeclaration(node) && node.name) nodes.set(node.name.text, node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const compiled = new Map<string, (...args: unknown[]) => unknown>();
  return (name: string, context: Record<string, unknown>): unknown => {
    if (!compiled.has(name)) {
      const node = nodes.get(name);
      assert.ok(node, `${file}: missing actual ${name}`);
      const code = ts.transpileModule(`const result = (${node.getText(ast)});`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText;
      compiled.set(name, new Function(...Object.keys(context), `${code}; return result;`) as (...args: unknown[]) => unknown);
    }
    return compiled.get(name)!(...Object.values(context));
  };
}
const library = applicationCode("app/components/ReviewLibrary.tsx");
const app = applicationCode("app/RevITApp.tsx");
const flashcards = applicationCode("app/components/Flashcards.tsx");
const useMemo = (callback: () => unknown) => callback();
const countContext = { useMemo, questions: [...payloads.values()].flatMap(p => p.questions),
  ciullaTopicQuestionCounts, rodakTopicQuestionCounts, strasingerTopicQuestionCounts };
const mcqCounts = library("topicQuestionCounts", countContext) as Map<string, number>;
const cardCounts = flashcards("topicQuestionCounts", { useMemo, questions: countContext.questions }) as Map<string, number>;

function select(topicIds: string[], questions = countContext.questions) {
  const selectedQuestions = app("selectedQuestions", { useMemo, questions, selectedTopicIds: topicIds }) as ReviewerQuestion[];
  return app("sessionQuestions", { useMemo, wrongAnswersOnly: false, selectedQuestions, wrongQuestionIds: new Set() }) as ReviewerQuestion[];
}

function startMcq(sessionQuestions: ReviewerQuestion[], sessionSize: string = "all", wrongAnswersOnly = false) {
  let started: { poolIds: string[]; targetCount: number; mode: string } | undefined;
  const start = app("startSession", { sessionQuestions, sessionSize, wrongAnswersOnly, timerEnabled: false, timerDuration: 60,
    beginAdaptiveSession: (poolIds: string[], targetCount: number, mode: string) => { started = { poolIds, targetCount, mode }; },
    beginStrictSession: (poolIds: string[], mode: string, targetCount: number) => { started = { poolIds, targetCount, mode }; },
  }) as () => void;
  start();
  return started;
}

function startCards(questions: ReviewerQuestion[], selectedTopicIds: string[]) {
  let cards: ReturnType<typeof buildFlashcardDeck> = [];
  const start = flashcards("startReviewing", { questions, selectedTopicIds, buildFlashcardDeck,
    setDeck: (next: typeof cards) => { cards = next; }, setCardIndex: () => {}, setFlipped: () => {},
  }) as () => void;
  start();
  return cards;
}

test("every topic in all four published books reconciles displayed, filterable and session-eligible MCQs/cards", (t) => {
  const entitlement = runtime("app/lib/entitlements.ts") as typeof Entitlements;
  const allSubjects = [...payloads.values()].flatMap(p => p.subjects);
  const allTopics = [...payloads.values()].flatMap(p => p.topics);
  const pro = { ...entitlement.FREE_ENTITLEMENT, effectivePlan: "pro" as const };
  const topicRows: Record<string, unknown>[] = [];
  for (const [book, payload] of payloads) {
    assert.equal(entitlement.canAccessQuestionBank(book, pro), true, book);
    const subjects = getUnifiedSubjects(book, allSubjects, allTopics);
    const ids = payload.topics.map(topic => topic.id);
    assert.equal(new Set(ids).size, ids.length, `${book}: duplicate topic IDs`);
    for (const question of payload.questions) {
      const topic = payload.topics.find(topic => topic.id === question.topicId);
      assert.ok(topic, `${book}/${question.id}: unresolved canonical topic`);
      assert.equal(question.subjectId, topic.subjectId, question.id);
      assert.ok(payload.subjects.some(subject => subject.id === question.subjectId && subject.topicIds.includes(topic.id)), question.id);
      assert.equal(question.book, book, question.id);
    }
    for (const topic of payload.topics) {
      const label = `${book}/${topic.id}`;
      assert.ok(subjects.some(subject => subject.topicIds?.includes(topic.id)), `${label}: library topic missing`);
      const expected = payload.questions.filter(question => question.topicId === topic.id);
      const eligible = select([topic.id]);
      assert.equal(mcqCounts.get(topic.id) ?? 0, expected.length, `${label}: displayed MCQs`);
      assert.deepEqual(eligible.map(q => q.id), expected.map(q => q.id), `${label}: MCQ filter`);
      const session = startMcq(eligible);
      assert.equal(session?.targetCount ?? 0, expected.length, `${label}: MCQ session`);
      assert.deepEqual(session?.poolIds ?? [], expected.map(q => q.id), `${label}: MCQ session pool`);
      const filteredCards = buildFlashcardDeck(countContext.questions, [topic.id]);
      const sessionCards = startCards(countContext.questions, [topic.id]);
      assert.equal(cardCounts.get(topic.id) ?? 0, expected.length, `${label}: displayed cards`);
      assert.deepEqual(filteredCards.map(c => c.id), expected.map(q => q.id), `${label}: card filter`);
      assert.deepEqual(sessionCards, filteredCards, `${label}: card session`);
      topicRows.push({ book, subjectId: topic.subjectId, topicId: topic.id, topicName: topic.name,
        displayedQuestions: mcqCounts.get(topic.id) ?? 0, filterableQuestions: expected.length,
        sessionEligibleQuestions: session?.targetCount ?? 0, displayedCards: cardCounts.get(topic.id) ?? 0,
        filterableCards: filteredCards.length, sessionEligibleCards: sessionCards.length });
    }
    assert.equal(select(ids).length, payload.questions.length, `${book}: all-topic session`);
    assert.equal(startCards(countContext.questions, ids).length, payload.questions.length, `${book}: all-topic cards`);
    t.diagnostic(`${book}: ${payload.topics.length} topics, ${payload.questions.length} MCQs/cards reconciled`);
  }
  t.diagnostic(`TOPIC_RECONCILIATION ${JSON.stringify(topicRows)}`);
});

test("Rodak runtime adds only missing canonical identifiers; source/grading records remain unchanged", () => {
  const original = raw("rodak");
  assert.equal(original.questions.filter(q => !q.topicId && !q.subjectId).length, 34);
  const canonical = original.questions.map(q => ({ ...q, book: "Rodak" }));
  assert.deepEqual(rodak.rodakQuestions, canonical);
  const payload = rodak.getRodakServerPayload();
  assert.deepEqual(payload.topics, rodakPreviewTopics);
  for (let index = 0; index < original.questions.length; index++) {
    const before = canonical[index];
    const after = payload.questions[index];
    if (before.topicId && before.subjectId) assert.deepEqual(after, before);
    else {
      const { subjectId, topicId, ...source } = after;
      assert.deepEqual(source, before, before.id);
      assert.equal(subjectId, "rodak-hematology");
      assert.equal(topicId, `rodak-ch${String((before as ReviewerQuestion & { chapter: number }).chapter).padStart(2, "0")}`);
    }
  }
});

test("all three previously empty Rodak topics start MCQ/card sessions with their real source counts", () => {
  for (const [topicId, count] of [["rodak-ch04", 12], ["rodak-ch05", 10], ["rodak-ch06", 12]] as const) {
    const pool = select([topicId]);
    assert.equal(pool.length, count, topicId);
    assert.equal(startMcq(pool, "5")?.targetCount, 5, topicId);
    assert.equal(startMcq(pool, "100")?.targetCount, count, topicId);
    assert.equal(startCards(countContext.questions, [topicId]).length, count, topicId);
  }
  const pool = select(["rodak-ch04", "rodak-ch05", "rodak-ch06"]);
  assert.equal(startMcq(pool)?.targetCount, 34);
  assert.equal(startMcq(pool.slice(0, 2), "all", true)?.targetCount, 2);
});

test("mixed-book selections keep all intended records and unknown topics remain empty", () => {
  const selected = [...payloads.values()].map(p => p.topics[0].id).concat("rodak-ch04");
  const expected = countContext.questions.filter(q => selected.includes(q.topicId));
  assert.deepEqual(startMcq(select(selected))?.poolIds, expected.map(q => q.id));
  assert.deepEqual(startCards(countContext.questions, selected).map(c => c.id), expected.map(q => q.id));
  assert.equal(select(["unknown-topic"]).length, 0);
  assert.equal(startMcq([]), undefined);
  assert.deepEqual(startCards(countContext.questions, ["unknown-topic"]), []);
});

test("unresolvable sparse Rodak metadata fails instead of silently losing session content", () => {
  const original = raw("rodak");
  const sparse = original.questions.find(q => !q.topicId)!;
  for (const invalid of [
    { ...sparse, chapter: undefined },
    { ...sparse, chapter: 999 },
    { ...sparse, subjectId: "wrong-subject" },
    { ...sparse, topicId: "stale-topic-alias" },
  ]) {
    const load = serverRuntime({ "../../content/rodakContent.json": { ...original, questions: [invalid] } });
    const api = load("app/lib/server/rodakServerContent.ts") as typeof Rodak;
    assert.throws(() => api.getRodakServerPayload(), /Unresolved Rodak topic/);
  }
});

test("all Rodak runtime identifiers agree with existing trusted-study metadata", async () => {
  const api = runtime("app/lib/server/studyQuestionMetadata.ts") as typeof import("../app/lib/server/studyQuestionMetadata");
  for (const question of rodak.getRodakServerPayload().questions) {
    const metadata = await api.getStudyQuestionMetadata(question.id);
    assert.equal(metadata.subject_id, question.subjectId, question.id);
    assert.equal(metadata.topic_id, question.topicId, question.id);
    assert.equal(metadata.book, "Rodak");
  }
});

test("real Rodak API/client path retains authentication/Pro checks and returns filterable records", async () => {
  let signedIn = false, plan = "free";
  const load = serverRuntime({
    "next/server": { NextResponse: Response },
    "../../../lib/supabase/config": { isSupabaseConfigured: () => true },
    "../../../lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: signedIn ? { id: "synthetic-local" } : null }, error: null }) },
      rpc: async () => ({ data: [{ effective_plan: plan }], error: null }),
    }) },
  });
  const { GET } = load("app/api/reviewer/rodak/route.ts") as { GET: () => Promise<Response> };
  assert.equal((await GET()).status, 401);
  signedIn = true;
  assert.equal((await GET()).status, 403);
  plan = "pro";
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => { assert.equal(url, "/api/reviewer/rodak"); return GET(); };
    const client = load("app/lib/premiumReviewerService.ts") as typeof import("../app/lib/premiumReviewerService");
    const result = await client.fetchRodakReviewer();
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.equal(result.data.questions.length, 491);
    for (const topic of result.data.topics) {
      assert.equal(select([topic.id], result.data.questions).length, rodakTopicQuestionCounts[topic.id], topic.id);
      assert.equal(startCards(result.data.questions, [topic.id]).length, rodakTopicQuestionCounts[topic.id], topic.id);
    }
    assert.match((await GET()).headers.get("Cache-Control")!, /private.*no-store/);
  } finally { globalThis.fetch = originalFetch; }
});

