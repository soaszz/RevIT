import { assertPreserved } from "../scripts/phase3n/assert-preserved.mjs";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import type * as Persistence from "../app/lib/server/trustedStudyPersistence";
import type * as Metadata from "../app/lib/server/studyQuestionMetadata";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const banks = ["reviewer", "ciulla", "rodak", "strasinger"].map(name => JSON.parse(read(`app/content/${name}Content.json`)));
const ordinary = banks[0].questions[0];
const rodakMatching = banks[2].questions.find((q: { matching?: unknown }) => q.matching);

function setup(plan = "pro", user: string | null = owner) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rows: Record<string, Record<string, unknown>[]> = { study_sessions: [], question_attempts: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) },
    rpc: async (name: string) => { assert.equal(name, "get_my_entitlement"); return { data: [{ effective_plan: plan }], error: null }; },
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      let ids: string[] | undefined;
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        in: (_key: string, value: string[]) => { ids = value; return query; },
        maybeSingle: async () => ({ data: rows[table].find(row => filters.every(([k, v]) => row[k] === v)) ?? null, error: null }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: rows[table].filter(row => filters.every(([k,v]) => row[k] === v) && (!ids || ids.includes(row.id as string))), error: null })),
      };
      return query;
    },
  };
  const cache = new Map<string, { exports: unknown }>();
  function load(path: string): unknown {
    if (cache.has(path)) return cache.get(path)!.exports;
    const loaded = { exports: {} }; cache.set(path, loaded);
    const requireModule = (name: string): unknown => {
      if (name === "server-only") return {};
      if (name === "../supabase/server") return { createClient: async () => client };
      if (name === "../admin/adminAuth") return { createAdminServiceClient: () => writer };
      if (name === "./trustedStudyGate") return { requireTrustedStudyWriter: async () => writer };
      const target = resolve(dirname(path), name);
      if (name.startsWith(".") && existsSync(`${target}.ts`)) return load(`${target}.ts`);
      return createRequire(path)(name);
    };
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function("require", "module", "exports", code)(requireModule, loaded, loaded.exports);
    return loaded.exports;
  }
  const api = load(resolve(root, "app/lib/server/trustedStudyPersistence.ts")) as typeof Persistence;
  const metadata = () => load(resolve(root, "app/lib/server/studyQuestionMetadata.ts")) as typeof Metadata;
  const writer: Persistence.TrustedStudyWriter = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "create_rewarded_study_session") {
      const row = { id: sessionId, user_id: owner, request_id: requestId, ...args.p_plan as object,
        request_digest: args.p_request_digest, completed_at: null, expires_at: "2099-01-01T00:00:00Z" };
      rows.study_sessions = [row]; return { data: row, error: null };
    }
    const attempts = args.p_attempts as Record<string, unknown>[];
    return { data: attempts.map(a => ({ id: a.id, question_id: a.question_id, session_id: sessionId,
      session_slot: a.session_slot, content_version: a.content_version, response_digest: a.response_digest,
      is_correct: a.is_correct, attempt_number: 1, verified_at: "2026-10-15T01:00:00Z", competitive_at: "2026-10-15T01:00:00Z" })), error: null };
  } };
  const create = (ids = [ordinary.id], mode = "wrong_answers") => ({ requestId, questionIds: ids, mode, targetCount: ids.length });
  async function batch(question = ordinary, response?: unknown) {
    await api.createStudySession(create([question.id]), writer);
    const pool = rows.study_sessions[0].question_pool as { question_id: string; content_version: string }[];
    return { sessionId, attempts: [{ id: attemptId, slot: 0, questionId: question.id, contentVersion: pool[0].content_version,
      response: response ?? (question.matching ? { kind: "matching", selections: question.matching.answerKey } : { kind: "single_choice", choiceIndex: question.correctAnswer }) }] };
  }
  return { api, metadata, calls, rows, writer, create, batch };
}

test("trusted adapter requires authenticated identity and rejects forged fields", async () => {
  const s = setup(); const input = await s.batch();
  for (const field of ["userId", "xp", "isCorrect", "book", "answeredAt", "completed"]) {
    await assert.rejects(s.api.commitStudyBatch({ ...input, [field]: true }, s.writer));
    await assert.rejects(s.api.commitStudyBatch({ ...input, attempts: [{ ...input.attempts[0], [field]: true }] }, s.writer));
  }
  assert.equal(s.calls.length, 1);
  const anonymous = setup("pro", null);
  await assert.rejects(anonymous.api.createStudySession(anonymous.create(), anonymous.writer), /AUTH_REQUIRED/);
  await assert.rejects(s.api.createStudySession({ ...s.create(), userId: owner }, s.writer));
});

test("canonical grading, attribution, digest and matching NULL are server derived", async () => {
  for (const q of [ordinary, banks[1].questions[0], rodakMatching]) {
    const s = setup(); const input = await s.batch(q);
    const ack = await s.api.commitStudyBatch(input, s.writer);
    assert.equal(ack[0].is_correct, true);
    const payload = (s.calls.at(-1)!.args.p_attempts as Record<string, unknown>[])[0];
    assert.equal(s.calls.at(-1)!.args.p_owner, owner);
    assert.equal(payload.selected_answer, q.matching ? null : q.correctAnswer);
    assert.equal(payload.subject_id, q.subjectId);
    assert.match(payload.response_digest as string, /^[a-f0-9]{64}$/);
    assert.ok(!Object.hasOwn(payload, "xp"));
    assert.deepEqual(input.attempts[0].response, q.matching ? { kind: "matching", selections: q.matching.answerKey } : { kind: "single_choice", choiceIndex: q.correctAnswer });
  }
});

test("unknown IDs, invalid matching, skip, duplicates and unsupported versions fail before writes", async () => {
  const s = setup(); const input = await s.batch(rodakMatching);
  await assert.rejects(s.api.createStudySession(s.create(["unknown"]), s.writer));
  for (const response of [{ kind: "skip" }, { kind: "matching", selections: [] }, { kind: "matching", selections: [823542] }, { kind: "single_choice", choiceIndex: 0 }]) {
    await assert.rejects(s.api.commitStudyBatch({ ...input, attempts: [{ ...input.attempts[0], response }] }, s.writer));
  }
  await assert.rejects(s.api.commitStudyBatch({ ...input, attempts: [input.attempts[0], input.attempts[0]] }, s.writer));
  await assert.rejects(s.api.commitStudyBatch({ ...input, attempts: [input.attempts[0], { ...input.attempts[0], id: requestId }] }, s.writer));
  await assert.rejects(s.api.commitStudyBatch({ ...input, attempts: [{ ...input.attempts[0], contentVersion: "old" }] }, s.writer));
  assert.equal(s.calls.length, 1);
});

test("Free cannot create Pro sessions; Strasinger is blocked even for Pro", async () => {
  const free = setup("free");
  await free.api.createStudySession(free.create(), free.writer);
  for (const bank of banks.slice(1)) await assert.rejects(free.api.createStudySession(free.create([bank.questions[0].id]), free.writer));
  const pro = setup();
  await assert.rejects(pro.api.createStudySession(pro.create([banks[3].questions[0].id]), pro.writer), /STRASINGER_DISABLED/);
});

test("expired Pro, expired session, account switching and missing ownership retain pending work", async () => {
  const s = setup("free");
  const input = await s.batch();
  s.rows.study_sessions[0].expires_at = "2000-01-01T00:00:00Z";
  await assert.rejects(s.api.commitStudyBatch(input, s.writer), /SESSION_EXPIRED/);
  s.rows.study_sessions[0].user_id = requestId;
  await assert.rejects(s.api.commitStudyBatch(input, s.writer), /SESSION_UNAVAILABLE/);
  assert.equal(s.calls.length, 1);
  assert.equal(input.attempts.length, 1);
});

test("durable identical retry returns original acknowledgment; legacy and changed responses conflict", async () => {
  const s = setup(); const input = await s.batch();
  const [ack] = await s.api.commitStudyBatch(input, s.writer);
  s.rows.question_attempts = [{ ...ack, user_id: owner }];
  s.rows.study_sessions[0].expires_at = "2000-01-01T00:00:00Z";
  const retried = await s.api.commitStudyBatch(input, s.writer);
  assert.equal(retried[0].status, "already_accepted");
  assert.equal(ack.status, "accepted");
  assert.equal(retried[0].id, ack.id);
  assert.equal(retried[0].response_digest, ack.response_digest);
  assert.equal(retried[0].verified_at, ack.verified_at);
  assert.equal(s.calls.length, 2);
  await assert.rejects(s.api.commitStudyBatch({ ...input, attempts: [{ ...input.attempts[0], response: { kind: "timeout" } }] }, s.writer), /ATTEMPT_CONFLICT/);
  s.rows.question_attempts[0].verified_at = null;
  await assert.rejects(s.api.commitStudyBatch(input, s.writer), /ATTEMPT_CONFLICT/);
});

test("missing/false acknowledgment and database conflicts are never reported as durable success", async () => {
  const s = setup(); const input = await s.batch();
  for (const data of [null, false, [], [{}]]) await assert.rejects(s.api.commitStudyBatch(input, { rpc: async () => ({ data, error: null }) }), /ACK_UNAVAILABLE/);
  await assert.rejects(s.api.commitStudyBatch(input, { rpc: async () => ({ data: null, error: { code: "23505" } }) }), /ATTEMPT_CONFLICT/);
});

test("completion validates authoritative receipt and rejects fabricated/missing acknowledgments", async () => {
  const s=setup(); await s.batch();
  const input={sessionId,attemptIds:[attemptId]};
  const receipt={sessionId,attemptIds:[attemptId],completedAt:"2026-10-17T00:00:00Z",attemptCount:1,correctCount:1,totalXp:60,level:1,xpAwarded:20,unlocked:[],contract:1};
  let calls=0;
  const writer={rpc:async(name:string,args:Record<string,unknown>)=>{
    calls++; assert.equal(name,"complete_verified_study_session"); assert.equal(args.p_owner,owner);
    assert.deepEqual(Object.keys(args).sort(),["p_attempt_ids","p_owner","p_session_id"]);
    return {data:receipt,error:null};
  }};
  assert.deepEqual(await s.api.completeStudySession(input,writer),receipt);
  for(const patch of [{xp:99},{userId:owner},{attemptIds:[]},{attemptIds:[attemptId,attemptId]}]) await assert.rejects(s.api.completeStudySession({...input,...patch},writer),/INVALID_COMPLETION_INPUT/);
  assert.equal(calls,1);
  for(const data of [null,{}, {...receipt,totalXp:-1},{...receipt,correctCount:2},{...receipt,attemptIds:[owner]},{...receipt,completedAt:"bad"},{...receipt,unlocked:["bad"]}]) {
    await assert.rejects(s.api.completeStudySession(input,{rpc:async()=>({data,error:null})}),/ACK_UNAVAILABLE/);
  }
  for(const [code,message] of [["23505","ATTEMPT_CONFLICT"],["PT503","TRUSTED_STUDY_DISABLED"],["22023","INVALID_COMPLETION_INPUT"],["55000","SESSION_EXPIRED"]]) {
    await assert.rejects(s.api.completeStudySession(input,{rpc:async()=>({data:null,error:{code}})}),new RegExp(message));
  }
});

test("Rodak adapter resolves all 34 exact chapter mappings without source invention", async () => {
  const s = setup(); const missing = banks[2].questions.filter((q: { subjectId?: string }) => !q.subjectId);
  assert.equal(missing.length, 34);
  for (const q of missing) {
    const value = await s.metadata().getStudyQuestionMetadata(q.id);
    assert.equal(value.subject_id, "rodak-hematology");
    assert.equal(value.topic_id, `rodak-ch${String(q.chapter).padStart(2, "0")}`);
    assert.equal(Object.hasOwn(value, "source"), false);
    assert.equal(Object.hasOwn(q, "subjectId"), false);
  }
});

test("fallback writer defaults to createAdminServiceClient on server and executes service-role rpc", async () => {
  const s = setup();
  // Call createStudySession without writer argument
  const session = await s.api.createStudySession(s.create());
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].name, "create_rewarded_study_session");
  assert.equal(s.calls[0].args.p_owner, owner);
  assert.equal((session as Record<string, unknown>).user_id, owner);

  // Call commitStudyBatch without writer argument
  const pool = s.rows.study_sessions[0].question_pool as { question_id: string; content_version: string }[];
  const input = {
    sessionId,
    attempts: [{
      id: attemptId,
      slot: 0,
      questionId: ordinary.id,
      contentVersion: pool[0].content_version,
      response: { kind: "single_choice", choiceIndex: ordinary.correctAnswer },
    }],
  };
  const ack = await s.api.commitStudyBatch(input);
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].name, "commit_rewarded_study_batch");
  assert.equal(s.calls[1].args.p_owner, owner);
  assert.equal(ack[0].is_correct, true);
});

test("migration and rollback fail closed and preserve prior files (static checks only)", () => {
  const sql = read("supabase/migrations/202610150025_trusted_study_persistence.sql");
  const rollback = read("supabase/rollbacks/202610150025_trusted_study_persistence_rollback.sql");
  assert.match(sql, /enabled boolean not null default false/);
  assert.match(sql, /unique.*session_id, session_slot/i);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /current_user not in \('service_role', 'postgres'\)/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /grant execute.*to service_role/);
  assert.doesNotMatch(sql, /execute\s+format\s*\(/i);
  assert.doesNotMatch(rollback, /drop\s+(table|column)|delete\s+from|grant\s+execute/i);

  const sql26 = read("supabase/migrations/202610160026_trusted_persistence_idempotency_hardening.sql");
  const rollback26 = read("supabase/rollbacks/202610160026_trusted_persistence_idempotency_hardening_rollback.sql");
  assert.match(sql26, /on conflict \(id\) do nothing/i);
  assert.match(sql26, /for share/i);
  assert.match(sql26, /v_attempt\.user_id <> p_owner or v_attempt\.session_id <> p_session_id/i);
  assert.match(sql26, /v_attempt\.response_digest is distinct from v_item_digest/i);
  assert.match(sql26, /v_attempt\.question_id is distinct from v_item_qid/i);
  assert.match(sql26, /v_attempt\.session_slot is distinct from v_item_slot/i);
  assert.match(sql26, /v_attempt\.selected_answer is distinct from v_item_answer/i);
  assert.match(sql26, /v_attempt\.is_correct is distinct from v_item_correct/i);
  assert.match(sql26, /current_user not in \('service_role', 'postgres'\)/);
  assert.match(rollback26, /Trusted study persistence is disabled/);
  assert.doesNotMatch(rollback26, /do update/i);

  const baseline = JSON.parse(read("docs/phase3i-b/baseline.json"));
  for (const [path, hash] of Object.entries(baseline.files)) assertPreserved(path, hash);
});
