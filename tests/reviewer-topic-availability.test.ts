import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import type { ReviewerBook, ReviewerQuestion } from "../app/content/reviewerContent";
import { buildFlashcardDeck } from "../app/lib/flashcards";
import { buildSubjectSections, filterSubjectsBySearch, BOC_MICROBIOLOGY_TOPIC_SUBJECTS, getCanonicalSubjectId, getSubjectDisplayName, getUnifiedSubjects } from "../app/lib/reviewerLibrary";
import type { PremiumReviewerPayload } from "../app/lib/premiumReviewerService";
import type * as Rodak from "../app/lib/server/rodakServerContent";
import type * as Entitlements from "../app/lib/entitlements";
import { ciullaTopicQuestionCounts } from "../app/content/ciullaMetadata";
import { rodakPreviewTopics, rodakTopicQuestionCounts } from "../app/content/rodakMetadata";
import { strasingerTopicQuestionCounts } from "../app/content/strasingerMetadata";
import { elsevierTopicQuestionCounts } from "../app/content/elsevierMetadata";
import { bocTopicQuestionCounts } from "../app/content/bocMetadata";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const raw = (name: string) => JSON.parse(read(`app/content/${name}Content.json`)) as PremiumReviewerPayload;

// Execute real server content and API code. Only framework/authentication boundaries
// are substituted; no account, database, network, or publication state is changed.
function serverRuntime(overrides: Record<string, unknown> = {}, mode = "development") {
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
      { env: { ...process.env, NODE_ENV: mode } });
    return loaded.exports;
  }
  return (path: string) => load(resolve(root, path));
}

const runtime = serverRuntime();
const rodak = runtime("app/lib/server/rodakServerContent.ts") as typeof Rodak;
const payloads = new Map<ReviewerBook, PremiumReviewerPayload>([
  ["Harr", runtime("app/content/reviewerContent.ts") as PremiumReviewerPayload],
  ...(["Ciulla", "Rodak", "Strasinger", "Elsevier", "BOC"] as const).map((book) => {
    const api = runtime(`app/lib/server/${book.toLowerCase()}ServerContent.ts`) as Record<string, () => PremiumReviewerPayload>;
    return [book, api[book === "BOC" ? "getBocServerPayload" : `get${book}ServerPayload`]()] as [ReviewerBook, PremiumReviewerPayload];
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
  ciullaTopicQuestionCounts, rodakTopicQuestionCounts, strasingerTopicQuestionCounts, elsevierTopicQuestionCounts, bocTopicQuestionCounts };
const mcqCounts = library("topicQuestionCounts", countContext) as Map<string, number>;
const cardCounts = flashcards("topicQuestionCounts", { useMemo, questions: countContext.questions, elsevierTopicQuestionCounts, bocTopicQuestionCounts }) as Map<string, number>;

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

test("every topic in all six books reconciles displayed, filterable and session-eligible MCQs/cards", (t) => {
  const entitlement = runtime("app/lib/entitlements.ts") as typeof Entitlements;
  const allSubjects = [...payloads.values()].flatMap(p => p.subjects);
  const allTopics = [...payloads.values()].flatMap(p => p.topics);
  const pro = { ...entitlement.FREE_ENTITLEMENT, effectivePlan: "pro" as const };
  const topicRows: Record<string, unknown>[] = [];
  const allIds = [...payloads.values()].flatMap(p => p.questions.map(q => q.id));
  assert.equal(new Set(allIds).size, allIds.length, "Globally unique source question IDs");
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
      assert.equal(subjects.filter(subject => subject.topicIds?.includes(topic.id)).length, 1, `${label}: exact single subject membership`);
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
  t.diagnostic(`SCAN_SUMMARY ${JSON.stringify({ sourceSubjects: allSubjects.length, displaySubjectsByBook: [...payloads.keys()].map(book => ({ book, subjects: getUnifiedSubjects(book, allSubjects, allTopics).length })), topics: allTopics.length, questions: allIds.length, emptyTopics: topicRows.filter(row => row.filterableQuestions === 0) })}`);
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

test("all original four-bank source/metadata/assets remain byte-identical", () => {
  const hashes = JSON.parse(read("docs/elsevier/existing-bank-baseline.json")) as Record<string, string>;
  for (const [path, hash] of Object.entries(hashes)) {
    assert.equal(createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"), hash, path);
  }
});

test("BOC keeps all source presentation fields in cards and blocks cloud writes", () => {
  const payload = payloads.get("BOC")!;
  const cards = buildFlashcardDeck(payload.questions, payload.topics.map(t => t.id));
  const gate = runtime("app/lib/cloudSyncGate.ts") as typeof import("../app/lib/cloudSyncGate");
  const adapter = runtime("app/lib/clientSessionAdapter.ts") as typeof import("../app/lib/clientSessionAdapter");
  assert.equal(cards.length, 2469);
  assert.equal(gate.isCloudSyncAllowedForBook("BOC"), false);
  for (const [index, q] of payload.questions.entries()) {
    const card = cards[index];
    assert.equal(card.answer, q.choices[q.correctAnswer], q.id);
    for (const key of ["prompt", "choices", "explanation", "stimulus", "questionSections", "rationaleSections",
      "rationaleImages", "promptAfterReferences", "sourceFormatting", "choiceTable", "choiceTables"] as const) {
      assert.deepEqual(card[key], q[key], `${q.id}/${key}`);
    }
    assert.equal(gate.isCloudSyncAllowedForQuestion(q.id, q.subjectId, q.topicId), false, q.id);
    assert.equal(adapter.isStrasingerSessionBlocked([q.id], true), true, q.id);
    assert.equal(adapter.isStrasingerSessionBlocked([q.topicId], true), true, q.topicId);
  }
});

test("BOC API requires authentication/Pro and stays unpublished in production", async () => {
  let signedIn = false, plan = "free", authCalls = 0;
  const overrides = {
    "next/server": { NextResponse: Response },
    "../../../lib/supabase/config": { isSupabaseConfigured: () => true },
    "../../../lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => { authCalls++; return { data: { user: signedIn ? { id: "synthetic-local" } : null }, error: null }; } },
      rpc: async () => ({ data: [{ effective_plan: plan }], error: null }),
    }) },
  };
  const load = serverRuntime(overrides);
  const { GET } = load("app/api/reviewer/boc/route.ts") as { GET: () => Promise<Response> };
  assert.equal((await GET()).status, 401);
  signedIn = true;
  assert.equal((await GET()).status, 403);
  plan = "pro";
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payloads.get("BOC"));
  assert.match(response.headers.get("Cache-Control")!, /private.*no-store/);
  const production = serverRuntime(overrides, "production");
  const entitlement = production("app/lib/entitlements.ts") as typeof Entitlements;
  assert.equal(entitlement.QUESTION_BANKS.boc.requiredPlan, "pro");
  assert.equal(entitlement.QUESTION_BANKS.boc.published, false);
  assert.equal(entitlement.isQuestionBankPublished("BOC"), false);
  const before = authCalls;
  assert.equal((await (production("app/api/reviewer/boc/route.ts") as { GET: () => Promise<Response> }).GET()).status, 404);
  assert.equal(authCalls, before);
});


test("BOC preserves source-index grading and local mistake/progress/weakness flows", () => {
  const payload = payloads.get("BOC")!;
  const matching = runtime("app/lib/matchingQuestion.ts") as typeof import("../app/lib/matchingQuestion");
  for (const q of payload.questions) {
    if (q.matching) {
      assert.equal(matching.isQuestionAnswerCorrect(q, matching.encodeMatchingAnswers(q.matching.answerKey, q.choices.length)), true, q.id);
    } else {
      for (let index = 0; index < q.choices.length; index++) assert.equal(matching.isQuestionAnswerCorrect(q, index), index === q.correctAnswer, q.id);
    }
    assert.equal(matching.isQuestionAnswerCorrect(q, null), false, q.id);
  }
  for (const nuMode of [false, true]) {
    const sections = buildSubjectSections(getUnifiedSubjects("BOC", payload.subjects, payload.topics), nuMode);
    assert.equal(payload.subjects.length, 8, "source subjects unchanged");
    assert.equal(sections.flatMap(section => section.subjects).length, 11, "three source-established display groups added without source edits");
    assert.equal(sections.flatMap(section => section.subjects.flatMap(subject => subject.topicIds)).length, 144);
  }
  const q = payload.questions[0];
  const topic = payload.topics.find(t => t.id === q.topicId)!;
  const subject = payload.subjects.find(s => s.id === q.subjectId)!;
  const attempt = { id: "local-boc-check", questionId: q.id, subjectId: q.subjectId, subjectName: subject.name,
    topicId: q.topicId, topicName: topic.name, subtopic: topic.name, difficulty: "Unspecified" as const,
    selectedAnswer: (q.correctAnswer + 1) % 4, correct: false, attemptNumber: 1, reviewMode: "reviewer" as const,
    sessionId: null, isAdaptiveRepeat: false, timestamp: "2026-10-27T00:00:00Z" };
  const analytics = runtime("app/lib/weaknessAnalytics.ts") as typeof import("../app/lib/weaknessAnalytics");
  const mastery = analytics.calculateTopicMastery([attempt], { topicId: topic.id, topicName: topic.name,
    subjectId: subject.id, subjectName: subject.name, book: "BOC" });
  assert.equal(mastery.book, "BOC"); assert.equal(mastery.totalAttempts, 1);
  assert.equal(analytics.repeatedlyWrongQuestions([attempt, { ...attempt, id: "local-boc-repeat", attemptNumber: 2 }])[0].questionId, q.id);
  assert.ok((app("progressSubjects", { useMemo, progressBook: "BOC", subjects: payload.subjects,
    topics: payload.topics, getUnifiedSubjects }) as unknown[]).length);
  assert.equal((app("progressTopics", { useMemo, progressBook: "BOC", topics: payload.topics }) as unknown[]).length, 144);
  let pool: string[] = [];
  const review = app("viewTopicMistakes", { questions: payload.questions, wrongQuestionIds: new Set([q.id]),
    setLibraryMode: () => {}, setSelectedTopicIds: () => {}, setWrongAnswersOnly: () => {},
    beginStrictSession: (ids: string[]) => { pool = ids; }, openView: () => {} }) as (topic: typeof mastery) => void;
  review(mastery); assert.deepEqual(pool, [q.id]);
  assert.equal((read("app/components/WeaknessDashboard.tsx").match(/option value="BOC"/g) ?? []).length, 2);
  assert.match(read("app/components/LeaderboardPage.tsx"), /setSelectedBook\("BOC"\)/);
});


test("canonical subject aliases group all six editions without changing source membership", () => {
  const subjects = [...payloads.values()].flatMap(p => p.subjects);
  const topics = [...payloads.values()].flatMap(p => p.topics);
  const original = structuredClone({ subjects, topics, questions: countContext.questions });
  const unified = getUnifiedSubjects("all", subjects, topics);
  assert.equal(new Set(unified.map(s => s.id)).size, unified.length);
  assert.equal(new Set(unified.map(s => s.name)).size, unified.length, "No parallel equivalent subject labels");
  const assignments = unified.flatMap(s => s.topicIds);
  assert.deepEqual([...assignments].sort(), topics.map(t => t.id).sort(), "Every source topic belongs to exactly one displayed subject");
  const expected = {
    "boc-chemistry": "clinical-chemistry", "boc-urinalysis-body-fluids": "aubf",
    "boc-blood-banking": "immunohematology", "boc-hematology": "hematology",
    "boc-immunology": "immunology", "boc-laboratory-operations": "laboratory-operations",
    "boc-hemostasis": "ciulla-hemostasis", "elsevier-laboratory-calculations": "ciulla-laboratory-calculations",
    "elsevier-molecular-diagnostics": "ciulla-molecular-diagnostics",
  };
  for (const [sourceId, canonicalId] of Object.entries(expected)) {
    assert.equal(getCanonicalSubjectId(sourceId), canonicalId);
    const source = subjects.find(s => s.id === sourceId)!;
    const group = unified.find(s => s.id === canonicalId)!;
    assert.ok(group.sourceSubjectIds.includes(sourceId));
    const single = getUnifiedSubjects(source.book!, subjects, topics).find(s => s.id === sourceId)!;
    assert.equal(single.name, group.name); assert.equal(single.category, source.category);
    assert.deepEqual(single.topicIds, source.topicIds);
  }
  for (const alias of ["AUBF", "Urinalysis and Other Body Fluids", "Clinical Biochemistry", "Clinical Biochemical Analysis"]) {
    assert.equal(filterSubjectsBySearch(unified, topics, alias).length, 1, alias);
  }
  for (const id of ["boc-microbiology", "elsevier-mycology-virology-parasitology", "ciulla-general-laboratory-principles", "elsevier-mock-examination"]) {
    assert.equal(getCanonicalSubjectId(id), id);
    const source = subjects.find(s => s.id === id)!;
    assert.deepEqual(unified.find(s => s.id === id)!.topicIds, source.topicIds.filter(topicId => getCanonicalSubjectId(id, topicId) === id));
  }
  assert.notEqual(getCanonicalSubjectId("ciulla-laboratory-management"), getCanonicalSubjectId("laboratory-operations"));
  assert.notEqual(getCanonicalSubjectId("ciulla-laboratory-calculations"), getCanonicalSubjectId("laboratory-operations"));
  for (const id of ["hematology-2-1", "rodak-ch35", "elsevier-ch04"]) {
    assert.equal(getCanonicalSubjectId(topics.find(t => t.id === id)!.subjectId), "hematology");
  }
  for (const id of ["laboratory-operations-1", "boc-ch07-iii-a"]) {
    assert.equal(getCanonicalSubjectId(topics.find(t => t.id === id)!.subjectId), "laboratory-operations");
  }
  assert.equal(getCanonicalSubjectId("unreviewed-biochemistry"), "unreviewed-biochemistry");
  assert.deepEqual({ subjects, topics, questions: countContext.questions }, original);
});

test("canonical labels preserve legacy progress, weakness filtering, and BOC per-book card categories", () => {
  const subject = payloads.get("BOC")!.subjects.find(s => s.id === "boc-blood-banking")!;
  const allSubjects = [...payloads.values()].flatMap(p => p.subjects);
  const allTopics = [...payloads.values()].flatMap(p => p.topics);
  const cardSubjects = flashcards("unifiedSubjects", { useMemo, subjects: allSubjects, topics: allTopics,
    selectedBook: "BOC", getUnifiedSubjects }) as import("../app/lib/reviewerLibrary").UnifiedSubject[];
  assert.equal(cardSubjects.find(s => s.id === "immunohematology")!.category, subject.category);
  assert.equal(flashcards("subjectName", { currentCard: { subjectId: "aubf" }, subjectById: new Map([["aubf", { name: "AUBF" }]]), getSubjectDisplayName }), "Clinical Microscopy");
  const attempts = [
    { subjectId: "aubf", subjectName: "AUBF", correct: true },
    { subjectId: "boc-urinalysis-body-fluids", subjectName: "Urinalysis & Body Fluids", correct: false },
  ];
  const before = structuredClone(attempts);
  const stats = app("progressSubjectStats", { useMemo, progressAttempts: attempts, getSubjectDisplayName,
    percent: (n: number, total: number) => Math.round(n / total * 100) }) as { name: string; attempts: number; correct: number; accuracy: number }[];
  assert.deepEqual(stats, [{ name: "Clinical Microscopy", attempts: 2, correct: 1, accuracy: 50 }]);
  assert.deepEqual(attempts, before);
  const weakness = applicationCode("app/components/WeaknessDashboard.tsx");
  const masteries = attempts.map((a, i) => ({ subjectId: a.subjectId, topicId: `existing-${i}`, subjectName: a.subjectName, status: "weak", mastery: 20, uniqueQuestions: 5 }));
  for (const subjectFilter of ["aubf", "boc-urinalysis-body-fluids"]) {
    assert.equal((weakness("filteredTopics", { useMemo, bookMasteries: masteries, subjectFilter,
      getCanonicalSubjectId, statusFilter: "all", search: "", sortMode: "weakest" }) as unknown[]).length, 2);
  }
  const analytics = runtime("app/lib/weaknessAnalytics.ts") as typeof import("../app/lib/weaknessAnalytics");
  const q = payloads.get("BOC")!.questions.find(q => q.subjectId === "boc-urinalysis-body-fluids")!;
  const legacy = { id: "legacy-normalization", questionId: q.id, subjectId: q.subjectId, subjectName: "Urinalysis & Body Fluids",
    topicId: q.topicId, topicName: "Original topic", subtopic: "Original", difficulty: "Unspecified" as const,
    selectedAnswer: 0, correct: false, attemptNumber: 1, reviewMode: "reviewer" as const, sessionId: "existing-session", isAdaptiveRepeat: false, timestamp: "2026-10-27T00:00:00Z" };
  const mastery = analytics.calculateTopicMastery([legacy]);
  assert.equal(mastery.subjectName, "Clinical Microscopy"); assert.equal(mastery.subjectId, legacy.subjectId);
  assert.equal(mastery.topicId, legacy.topicId); assert.equal(legacy.subjectName, "Urinalysis & Body Fluids");
});


test("BOC source-established discipline groups partition Microbiology exactly once in every library", () => {
  const subjects = [...payloads.values()].flatMap(p => p.subjects);
  const topics = [...payloads.values()].flatMap(p => p.topics);
  const boc = payloads.get("BOC")!;
  const original = structuredClone(boc);
  for (const book of ["all", "BOC"] as const) {
    const groups = getUnifiedSubjects(book, subjects, topics);
    const sourceTopics = boc.topics.filter(t => t.subjectId === "boc-microbiology");
    const expectedCounts = { bacteriology: 207, "mycology-and-virology": 60, parasitology: 44, "boc-microbiology": 75 };
    for (const [id, expected] of Object.entries(expectedCounts)) {
      const group = groups.find(s => s.id === id)!;
      assert.ok(group, id); assert.ok(group.sourceSubjectIds.includes("boc-microbiology"));
      const expectedTopics = sourceTopics.filter(t => getCanonicalSubjectId(t.subjectId, t.id) === id);
      assert.deepEqual(group.topicIds.filter(t => t.startsWith("boc-")), expectedTopics.map(t => t.id));
      const records = boc.questions.filter(q => group.topicIds.includes(q.topicId));
      assert.equal(records.length, expected, `${book}/${id}`);
      assert.equal(buildFlashcardDeck(boc.questions, group.topicIds).length, expected);
      if (id === "mycology-and-virology") {
        assert.deepEqual(expectedTopics.map(t => t.id), ["boc-ch06-iii-b", "boc-ch06-iii-d"]);
        assert.equal(records.filter(q => q.topicId === "boc-ch06-iii-b").length, 21);
        assert.equal(records.filter(q => q.topicId === "boc-ch06-iii-d").length, 39);
      }
      if (book === "BOC") assert.equal(group.category, boc.subjects.find(s => s.id === "boc-microbiology")!.category);
    }
    for (const topic of sourceTopics) assert.equal(groups.filter(s => s.topicIds.includes(topic.id)).length, 1, topic.id);
  }
  assert.equal(Object.keys(BOC_MICROBIOLOGY_TOPIC_SUBJECTS).length, 16);
  for (const topic of boc.topics.filter(t => t.subjectId === "boc-microbiology")) {
    const display = getSubjectDisplayName(topic.subjectId, "Microbiology", topic.id);
    if (topic.id.startsWith("boc-ch06-ii-")) assert.equal(display, "Bacteriology");
    else if (!BOC_MICROBIOLOGY_TOPIC_SUBJECTS[topic.id]) assert.equal(display, "Microbiology");
  }
  for (const sourceId of ["elsevier-mycology-virology-parasitology", "mycology-and-virology", "ciulla-mycology-and-virology"])
    assert.equal(getCanonicalSubjectId(sourceId), sourceId === "ciulla-mycology-and-virology" ? "mycology-and-virology" : sourceId);
  assert.deepEqual(boc, original);
});

test("legacy BOC progress and weakness filters resolve each approved topic group without rewriting attempts", () => {
  const boc = payloads.get("BOC")!;
  const ids = ["bacteriology", "mycology-and-virology", "parasitology", "boc-microbiology"];
  const attempts = ids.map((group, index) => {
    const q = boc.questions.find(q => q.subjectId === "boc-microbiology" && getCanonicalSubjectId(q.subjectId, q.topicId) === group)!;
    return { id: `existing-${index}`, questionId: q.id, subjectId: q.subjectId, subjectName: "Microbiology", topicId: q.topicId,
      topicName: "Original source topic", subtopic: "Original", difficulty: "Unspecified" as const, selectedAnswer: 0, correct: false,
      attemptNumber: 1, reviewMode: "reviewer" as const, sessionId: "existing-session", isAdaptiveRepeat: false, timestamp: "2026-10-28T00:00:00Z" };
  });
  const before = structuredClone(attempts);
  const stats = app("progressSubjectStats", { useMemo, progressAttempts: attempts, getSubjectDisplayName,
    percent: (n: number, total: number) => Math.round(n / total * 100) }) as { name: string; attempts: number }[];
  assert.deepEqual(stats.map(s => s.name), ["Bacteriology", "Mycology and Virology", "Parasitology", "Microbiology"]);
  assert.ok(stats.every(s => s.attempts === 1));
  const analytics = runtime("app/lib/weaknessAnalytics.ts") as typeof import("../app/lib/weaknessAnalytics");
  const masteries = attempts.map(a => analytics.calculateTopicMastery([a]));
  const weakness = applicationCode("app/components/WeaknessDashboard.tsx");
  for (const subjectFilter of ids) {
    const filtered = weakness("filteredTopics", { useMemo, bookMasteries: masteries, subjectFilter,
      getCanonicalSubjectId, statusFilter: "all", search: "", sortMode: "weakest" }) as typeof masteries;
    assert.equal(filtered.length, 1); assert.equal(getCanonicalSubjectId(filtered[0].subjectId, filtered[0].topicId), subjectFilter);
    assert.equal(filtered[0].subjectId, "boc-microbiology");
  }
  assert.deepEqual(attempts, before);
});
