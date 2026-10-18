import { assertPreserved } from "../scripts/phase3n/assert-preserved.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestionAttempt } from "../app/lib/domain";
import { MATCHING_QUESTION_IDS, normalizeCloudSelectedAnswer } from "../app/lib/matchingAttemptPersistence";
import { STRASINGER_CLOUD_SYNC_ENABLED } from "../app/lib/cloudSyncGate";
import { flushQuestionAttemptQueue, migrateLocalQuestionAttempts, queueQuestionAttempt, saveQuestionAttempt } from "../app/lib/cloudService";
import { computeAttemptStats } from "../app/lib/leaderboardService";
import { calculateTopicMastery, repeatedlyWrongQuestions } from "../app/lib/weaknessAnalytics";
import { reinforcementAfterAnswer } from "../app/lib/adaptiveQuestions";
import { isQuestionAnswerCorrect } from "../app/lib/matchingQuestion";
import type { ReviewerQuestion } from "../app/content/reviewerContent";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const matchingQuestions = ["reviewer", "ciulla", "rodak", "strasinger"].flatMap(name =>
  (JSON.parse(read(`app/content/${name}Content.json`)).questions as ReviewerQuestion[]).filter(q => q.matching));
const attempt = (questionId: string, selectedAnswer: number | null, correct = true): QuestionAttempt => ({
  id: "00000000-0000-4000-8000-000000000001", questionId, selectedAnswer, correct,
  subjectId: questionId.startsWith("rodak-") ? "rodak-hematology" : "strasinger-aubf",
  subjectName: "Synthetic", topicId: "synthetic-topic", topicName: "Synthetic", subtopic: "Synthetic",
  difficulty: "Medium", attemptNumber: 1, reviewMode: "wrong_answers",
  sessionId: "00000000-0000-4000-8000-000000000002", isAdaptiveRepeat: true,
  timestamp: "2026-10-15T00:00:00Z",
});
const ordinary = (selectedAnswer: number | null) => ({ ...attempt("clinical-chemistry-6-1-001", selectedAnswer), subjectId: "clinical-chemistry" });

function fakeDatabase() {
  const calls: Record<string, unknown>[] = [];
  const records = new Map<string, Record<string, unknown>>();
  let nextError: string | null = null;
  let omitResponse = false;
  const client = { rpc: async (name: string, input: Record<string, unknown>) => {
    assert.equal(name, "record_question_attempt");
    calls.push(input);
    if (nextError) { const message = nextError; nextError = null; return { data: null, error: { message } }; }
    if (omitResponse) { omitResponse = false; return { data: null, error: null }; }
    // Model stable-ID acknowledgments, not PostgreSQL validation or RLS.
    if (!records.has(input.p_id as string)) records.set(input.p_id as string, {
      id: input.p_id, question_id: input.p_question_id, selected_answer: input.p_selected_answer,
      is_correct: input.p_is_correct, user_id: "synthetic-user", subject_id: input.p_subject_id,
      subject_name: input.p_subject_name, topic_id: input.p_topic_id, topic_name: input.p_topic_name,
      subtopic: input.p_subtopic, difficulty: input.p_difficulty, attempt_number: 1,
      review_mode: input.p_review_mode, session_id: input.p_session_id,
      is_adaptive_repeat: input.p_is_adaptive_repeat, answered_at: input.p_answered_at,
    });
    return { data: records.get(input.p_id as string), error: null };
  } } as unknown as SupabaseClient;
  return { client, calls, records, fail: () => { nextError = "Synthetic network failure"; }, noRow: () => { omitResponse = true; } };
}

function localStorageFixture() {
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  return { storage, restore: () => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  } };
}

test("exact 16-ID allowlist matches canonical matching structures and Phase 3E evidence", () => {
  const actual = matchingQuestions.map(q => q.id).sort();
  assert.equal(matchingQuestions.filter(q => q.book === "Rodak").length, 2);
  assert.equal(matchingQuestions.filter(q => q.book === "Strasinger").length, 14);
  assert.deepEqual([...MATCHING_QUESTION_IDS].sort(), actual);
  assert.equal(new Set(MATCHING_QUESTION_IDS).size, 16);
  for (const q of matchingQuestions) {
    assert.ok(q.matching!.items.length > 0);
    assert.equal(q.matching!.items.length, q.matching!.answerKey.length);
    assert.ok(q.matching!.answerKey.every(n => Number.isInteger(n) && n >= 0 && n < q.choices.length));
  }
  const recordedIds = JSON.parse(read("docs/phase3g/matching-question-ids.json")).ids;
  assert.deepEqual(actual, recordedIds);
});

test("normalization covers 21, 108, 22875, values above smallint, small matching codes, and NULL", () => {
  for (const id of MATCHING_QUESTION_IDS) {
    for (const value of [0, 1, 3, 21, 108, 22875, 32768, 823542, null]) {
      assert.equal(normalizeCloudSelectedAnswer(id, value), null);
    }
  }
  for (const id of ["clinical-chemistry-6-1-001", "ciulla-cc-1", "rodak-ch12-07", "strasinger7-ch01-q001", "unknown", "rodak-ch12-06-extra"]) {
    for (const value of [0, 3, null, 21]) assert.equal(normalizeCloudSelectedAnswer(id, value), value);
  }
});

test("ordinary 0 and 3 pass through; direct Rodak payloads preserve correctness, stable IDs and metadata", async () => {
  for (const local of [ordinary(0), ordinary(3), ...[true, false].flatMap(correct => [attempt("rodak-ch12-06", 21, correct), attempt("rodak-ch12-10", 108, correct)])]) {
    const before = JSON.stringify(local);
    const db = fakeDatabase();
    const returned = await saveQuestionAttempt(db.client, local);
    const sent = db.calls[0];
    assert.equal(sent.p_selected_answer, local.questionId.startsWith("rodak-") ? null : local.selectedAnswer);
    assert.equal(sent.p_is_correct, local.correct);
    for (const [cloud, key] of Object.entries({ p_id: "id", p_question_id: "questionId", p_subject_id: "subjectId", p_subject_name: "subjectName", p_topic_id: "topicId", p_topic_name: "topicName", p_subtopic: "subtopic", p_difficulty: "difficulty", p_review_mode: "reviewMode", p_session_id: "sessionId", p_is_adaptive_repeat: "isAdaptiveRepeat", p_answered_at: "timestamp" })) {
      assert.equal(sent[cloud], local[key as keyof QuestionAttempt]);
    }
    assert.equal(returned.correct, local.correct);
    assert.equal(JSON.stringify(local), before, "Sending must not mutate encoded local history");
  }
});

test("future Strasinger sender uses NULL with mocked capability; real cloud-sync flag remains disabled", async () => {
  assert.equal(STRASINGER_CLOUD_SYNC_ENABLED, false);
  const sourceRequire = createRequire(new URL("../app/lib/cloudService.ts", import.meta.url));
  const code = ts.transpileModule(read("app/lib/cloudService.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { saveQuestionAttempt?: typeof saveQuestionAttempt } = {};
  // Only the capability boundary is mocked. No environment flag or real network is enabled.
  new Function("require", "exports", code)((name: string) => name === "./cloudSyncGate"
    ? { isCloudSyncAllowedForQuestion: () => true } : sourceRequire(name), exports);
  for (const value of [22875, 823542]) for (const correct of [true, false]) {
    const db = fakeDatabase();
    const local = attempt("strasinger7-ch07-q049", value, correct);
    await exports.saveQuestionAttempt!(db.client, local);
    assert.equal(db.calls[0].p_selected_answer, null);
    assert.equal(db.calls[0].p_is_correct, correct);
    assert.equal(local.selectedAnswer, value);
    const gated = fakeDatabase();
    await assert.rejects(saveQuestionAttempt(gated.client, local), /disabled/i);
    assert.equal(gated.calls.length, 0);
  }
});

test("legacy matching queues survive failures and missing acknowledgments, then retry once successfully", async () => {
  const fixture = localStorageFixture();
  const db = fakeDatabase();
  const key = "revit-question-attempt-queue-v1:synthetic-user";
  const local = attempt("rodak-ch12-06", 21);
  try {
    queueQuestionAttempt("synthetic-user", local);
    queueQuestionAttempt("synthetic-user", JSON.parse(JSON.stringify(local)));
    const original = fixture.storage.get(key);
    db.fail();
    assert.equal(await flushQuestionAttemptQueue(db.client, "synthetic-user"), 1);
    assert.equal(fixture.storage.get(key), original);
    assert.equal(db.records.size, 0);
    db.noRow();
    assert.equal(await flushQuestionAttemptQueue(db.client, "synthetic-user"), 1);
    assert.equal(fixture.storage.get(key), original);
    assert.equal(await flushQuestionAttemptQueue(db.client, "synthetic-user"), 0);
    const acknowledgedCalls = db.calls.length;
    await flushQuestionAttemptQueue(db.client, "synthetic-user");
    assert.equal(db.calls.length, acknowledgedCalls);
    assert.equal(db.records.size, 1);
    assert.ok(db.calls.every(sent => sent.p_id === local.id && sent.p_selected_answer === null));
    assert.equal(local.selectedAnswer, 21);
  } finally { fixture.restore(); }
});

test("restored local history migrates through the same boundary and only marks acknowledged completion", async () => {
  const fixture = localStorageFixture();
  const db = fakeDatabase();
  const local = attempt("rodak-ch12-10", 108, false);
  const restored = JSON.parse(JSON.stringify([local]));
  const marker = "revit-question-attempts-migrated-v1:synthetic-user";
  try {
    db.fail();
    await migrateLocalQuestionAttempts(db.client, "synthetic-user", restored);
    assert.equal(fixture.storage.has(marker), false);
    assert.equal(restored[0].selectedAnswer, 108);
    await migrateLocalQuestionAttempts(db.client, "synthetic-user", restored);
    assert.equal(fixture.storage.get(marker), "complete");
    const calls = db.calls.length;
    await migrateLocalQuestionAttempts(db.client, "synthetic-user", restored);
    assert.equal(db.calls.length, calls);
    assert.equal(db.records.size, 1);
    assert.ok(db.calls.every(sent => sent.p_selected_answer === null && sent.p_is_correct === false));
  } finally { fixture.restore(); }
});

test("NULL cloud answers preserve analytics, leaderboard counts and mistake repetition without changing local scoring", () => {
  const local = [attempt("rodak-ch12-06", 21), { ...attempt("rodak-ch12-10", 109, false), id: "second" }];
  const cloud = local.map(row => ({ ...row, selectedAnswer: normalizeCloudSelectedAnswer(row.questionId, row.selectedAnswer) }));
  assert.deepEqual(calculateTopicMastery(cloud), calculateTopicMastery(local));
  assert.deepEqual(repeatedlyWrongQuestions(cloud), repeatedlyWrongQuestions(local));
  for (const metric of ["questions", "accuracy", "study_xp"] as const) {
    const scope = { book: "Rodak" as const, period: "all_time" as const, metric };
    assert.deepEqual(computeAttemptStats(cloud, scope), computeAttemptStats(local, scope));
  }
  const q = matchingQuestions.find(q => q.id === "rodak-ch12-06")!;
  assert.equal(isQuestionAnswerCorrect(q, local[0].selectedAnswer), true);
  assert.equal(isQuestionAnswerCorrect(q, 22), false);
  assert.deepEqual(reinforcementAfterAnswer({}, q.id, false), reinforcementAfterAnswer({}, cloud[0].questionId, false));
  assert.equal(local[0].selectedAnswer, 21);
});

test("RPC patch changes only the exact-ID validation condition and keeps pre-feature rollback and security hardening", () => {
  const sql = read("supabase/migrations/202610130023_strasinger_book_edition_support.sql");
  const beforeHash = read("docs/phase3g/rpc-baseline.sha256").trim();
  const guard = sql.match(/if p_selected_answer is null and p_is_correct and p_question_id not in \(([\s\S]*?)\) then/);
  assert.ok(guard);
  assert.deepEqual([...guard[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort(), [...MATCHING_QUESTION_IDS].sort());
  assert.equal(createHash("sha256").update(sql.replace(guard[0], "if p_selected_answer is null and p_is_correct then")).digest("hex"), beforeHash);
  const hashes: Record<string, string> = JSON.parse(read("docs/phase3g/preserved-files.json"));
  for (const [path, expected] of Object.entries(hashes)) {
    assertPreserved(path, expected);
  }
});

test("actual local merge keeps encoded responses over cloud NULL; skip source contains no attempt write", () => {
  const source = read("app/RevITApp.tsx");
  const merge = source.match(/function mergeAttempts\([\s\S]*?\n}/)![0];
  const js = ts.transpileModule(`${merge}\nexport { mergeAttempts };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { mergeAttempts?: (...sources: QuestionAttempt[][]) => QuestionAttempt[] } = {};
  new Function("exports", js)(exports);
  const local = attempt("rodak-ch12-06", 21);
  const cloud = { ...local, selectedAnswer: null };
  assert.equal(exports.mergeAttempts!([cloud], [local])[0].selectedAnswer, 21);
  assert.match(source, /mergeAttempts\(snapshot\.attempts, current\)/);
  const skip = source.slice(source.indexOf("  function skipQuestion()"), source.indexOf("  function openView(", source.indexOf("  function skipQuestion()")));
  assert.ok(skip.length > 0);
  assert.doesNotMatch(skip, /queueQuestionAttempt|saveQuestionAttempt|completeQuestion\(|setAttempts\(|recordStudyEvent\(/);
});
