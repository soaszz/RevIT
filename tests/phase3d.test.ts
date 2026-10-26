import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestionAttempt } from "../app/lib/domain";
import { computeAttemptStats, isStrasingerAttempt } from "../app/lib/leaderboardService";
import { STRASINGER_CLOUD_SYNC_ENABLED } from "../app/lib/cloudSyncGate";
import {
  flushQuestionAttemptQueue, flushQuestionReinforcementQueue,
  migrateLocalActivity, migrateLocalQuestionAttempts,
  queueQuestionAttempt, queueQuestionReinforcement,
  saveQuestionAttempt, saveQuestionReinforcement,
} from "../app/lib/cloudService";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const attempt = (questionId: string, subjectId = "uncategorized"): QuestionAttempt => ({
  id: questionId, questionId, subjectId, topicId: "uncategorized",
  topicName: "Synthetic", subjectName: "Synthetic", subtopic: "Synthetic",
  difficulty: "Easy", selectedAnswer: 0, correct: true, attemptNumber: 1,
  reviewMode: "reviewer", sessionId: "synthetic-session", isAdaptiveRepeat: false,
  timestamp: "2026-10-14T00:00:00Z",
});

test("Strasinger IDs without subject metadata never enter Harr leaderboard stats", () => {
  const attempts = [attempt("strasinger7-ch01-q001"), attempt("strasinger7-ch17-q016"),
    attempt("strasinger-ch01-q001"), attempt("clinical-chemistry-6-1-001")];
  for (const row of attempts.slice(0, 3)) assert.equal(isStrasingerAttempt(row), true);
  assert.equal(computeAttemptStats(attempts, { book: "Harr", period: "all_time", metric: "questions" }).answeredCount, 1);
  assert.equal(computeAttemptStats(attempts, { book: "Strasinger", period: "all_time", metric: "questions" }).answeredCount, 3);
});

test("disabled Strasinger sync covers direct writes, old queues, and local history migration", async () => {
  assert.equal(STRASINGER_CLOUD_SYNC_ENABLED, false);
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, input: Record<string, unknown>) => {
      calls.push({ name, input });
      return { error: null, data: { id: input.p_id, question_id: input.p_question_id } };
    },
    from: (name: string) => ({
      upsert: async (input: Record<string, unknown>) => {
        calls.push({ name, input }); return { error: null };
      },
      delete: () => ({ eq: () => ({ eq: async () => {
        calls.push({ name, input: {} }); return { error: null };
      } }) }),
    }),
  } as unknown as SupabaseClient;
  const blocked = [attempt("strasinger7-ch01-q001"), attempt("strasinger-ch01-q001"),
    attempt("legacy-question", "strasinger-aubf")];
  const allowed = [attempt("clinical-chemistry-6-1-001"), attempt("ciulla-cc-1"), attempt("rodak-ch02-01")];
  try {
    for (const row of blocked) {
      await assert.rejects(saveQuestionAttempt(client, row), /disabled/i);
      queueQuestionAttempt("synthetic-user", row);
    }
    await assert.rejects(saveQuestionReinforcement(client, "synthetic-user", blocked[0].questionId, 0), /disabled/i);
    queueQuestionReinforcement("synthetic-user", blocked[0].questionId, 2);
    assert.equal(storage.size, 0);
    assert.equal(calls.length, 0);

    // Queues created before the capability gate must retain blocked records.
    const attemptKey = "revit-question-attempt-queue-v1:synthetic-user";
    const reinforcementKey = "revit-question-reinforcement-queue-v1:synthetic-user";
    storage.set(attemptKey, JSON.stringify([...blocked, ...allowed]));
    storage.set(reinforcementKey, JSON.stringify({ [blocked[0].questionId]: 2, [allowed[0].questionId]: 1 }));
    assert.equal(await flushQuestionAttemptQueue(client, "synthetic-user"), 3);
    assert.deepEqual(JSON.parse(storage.get(attemptKey)!), blocked);
    assert.equal(await flushQuestionReinforcementQueue(client, "synthetic-user"), 1);
    assert.deepEqual(JSON.parse(storage.get(reinforcementKey)!), { [blocked[0].questionId]: 2 });
    const written = calls.filter(row => row.name === "record_question_attempt");
    assert.deepEqual(written.map(row => row.input.p_question_id), allowed.map(row => row.questionId));

    calls.length = 0;
    await migrateLocalQuestionAttempts(client, "synthetic-user", [...blocked, ...allowed]);
    await migrateLocalActivity(client, "synthetic-user", "Asia/Manila", [...blocked, ...allowed], () => "Synthetic");
    assert.equal(calls.length, 6);
    assert.equal(storage.has("revit-question-attempts-migrated-v1:synthetic-user"), false);
    assert.equal(storage.has("revit-cloud-migrated-v1:synthetic-user"), false);
    assert.ok(calls.every(row => !String(row.input.p_question_id ?? row.input.p_event_key).includes("strasinger")));

    storage.clear(); calls.length = 0;
    queueQuestionAttempt("synthetic-user", allowed[0]);
    queueQuestionAttempt("synthetic-user", allowed[0]);
    await flushQuestionAttemptQueue(client, "synthetic-user");
    assert.equal(calls.length, 1, "Stable attempt ID is queued once after restoration");
    await migrateLocalQuestionAttempts(client, "synthetic-user", allowed);
    assert.equal(storage.get("revit-question-attempts-migrated-v1:synthetic-user"), "complete");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("rollback restores all three local pre-migration definitions and retains helper restrictions", () => {
  const functions = (sql: string) => [...sql.matchAll(/create or replace function[\s\S]*?\$\$;/gi)].map(m => m[0]);
  const pre = functions(read("supabase/migrations/202610110022_rodak_book_edition_support.sql"));
  assert.equal(pre.length, 3);
  for (const dir of ["rollback", "rollbacks"]) {
    const sql = read(`supabase/${dir}/202610130023_strasinger_book_edition_support_rollback.sql`);
    assert.deepEqual(functions(sql), pre);
    assert.match(sql, /revoke all on function public\.leaderboard_metric_rows\(text, text, text, text\) from public, anon, authenticated;/);
    assert.doesNotMatch(sql, /grant execute on function public\.leaderboard_metric_rows|delete from|drop table|disable row level/i);
  }
});

test("migration preserves signatures and both prefixes; separate hardening revokes both overloads", () => {
  const sql = read("supabase/migrations/202610130023_strasinger_book_edition_support.sql");
  const pre = read("supabase/migrations/202610110022_rodak_book_edition_support.sql");
  const headers = (text: string) => [...text.matchAll(/create or replace function[\s\S]*?as \$\$/gi)].map(m => m[0]);
  assert.deepEqual(headers(sql), headers(pre));
  assert.match(sql, /p_question_id like 'strasinger7-%'/);
  assert.match(sql, /p_question_id like 'strasinger-%'/);
  assert.doesNotMatch(sql, /grant execute on function public\.leaderboard_metric_rows/);
  const hardening = read("supabase/migrations/202610150024_leaderboard_helper_privileges.sql");
  for (const signature of ["text, text, text", "text, text, text, text"]) {
    assert.ok(hardening.includes(`public.leaderboard_metric_rows(${signature}) from public, anon, authenticated;`));
  }
});

test("all 4441 question records, 47 repairs, 42 protections, and reviewer assets match entry hashes", () => {
  const baseline = JSON.parse(read("docs/phase3d/content-integrity.json"));
  const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
  let total = 0;
  let repaired = 0;
  for (const [path, value] of Object.entries(baseline.files)) {
    const before = value as { sha256: string; questions: number; disableShuffle: string[] };
    const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
    const release = JSON.parse(read("docs/release-v1.12.1/authorized-changes.json"));
    if (release[path]) {
      assert.equal(release[path].before, before.sha256, `${path}: release chain`);
      assert.equal(hash(bytes), release[path].after, path);
    } else assert.equal(hash(bytes), before.sha256, path);
    const data = JSON.parse(bytes.toString());
    assert.equal(data.questions.length, before.questions);
    const protectedIds = data.questions.filter((q: { disableShuffle?: boolean }) => q.disableShuffle).map((q: { id: string }) => q.id);
    assert.deepEqual(protectedIds, before.disableShuffle);
    if (path.includes("strasinger")) assert.equal(protectedIds.length, 42);
    else repaired += protectedIds.length;
    total += data.questions.length;
  }
  assert.equal(total, 4441);
  assert.equal(repaired, 47);
  const assets: string[][] = [];
  function walk(path: string) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, item.name);
      if (item.isDirectory()) walk(full);
      else assets.push([full.replaceAll("\\", "/"), hash(readFileSync(full))]);
    }
  }
  walk("public/reviewer-assets");
  assets.sort((a, b) => a[0].localeCompare(b[0]));
  assert.equal(assets.length, baseline.assetCount);
  assert.equal(hash(JSON.stringify(assets)), baseline.assetsSha256);
});

test("actual Strasinger GET handler fails closed and only returns content to server-authorized Pro", async () => {
  // Run the actual handler with mocked module boundaries; no live auth or network.
  const code = ts.transpileModule(read("app/api/reviewer/strasinger/route.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let configured = true;
  let signedIn = true;
  let plan = "free";
  let profileError = false;
  let payloadReads = 0;
  let authLookups = 0;
  const modules: Record<string, unknown> = {
    "server-only": {},
    "next/server": { NextResponse: Response },
    "../../../lib/supabase/config": { isSupabaseConfigured: () => configured },
    "../../../lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => {
        authLookups += 1;
        return { data: { user: signedIn ? { id: "synthetic-user" } : null }, error: null };
      } },
      rpc: async (name: string) => {
        assert.equal(name, "get_my_entitlement");
        return { data: [{ effective_plan: plan }], error: profileError ? {} : null };
      },
    }) },
    "../../../lib/server/strasingerServerContent": { getStrasingerServerPayload: () => {
      payloadReads += 1;
      return { questions: [{ id: "synthetic-question" }] };
    } },
  };
  const exports: { GET?: () => Promise<Response> } = {};
  new Function("require", "exports", code)((name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`);
    return modules[name];
  }, exports);
  const get = exports.GET!;
  configured = false; assert.equal((await get()).status, 503);
  assert.equal(authLookups, 0);
  configured = true; signedIn = false; assert.equal((await get()).status, 401);
  signedIn = true; assert.equal((await get()).status, 403);
  plan = "expired"; assert.equal((await get()).status, 403);
  plan = "pro"; profileError = true; assert.equal((await get()).status, 500);
  assert.equal(payloadReads, 0);
  profileError = false;
  const response = await get();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control")!, /private.*no-store/);
  assert.equal(payloadReads, 1);
});
