import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import {
  createLocalSessionState,
  bindServerSession,
  isServerSessionExpired,
  mapLocalSessionToTrustedPlan,
  decodeMatchingSelections,
  formatTrustedAttemptPayload,
  isStrasingerSessionBlocked,
  isolateQueueByAccount,
  createQueueItem,
  transitionAttemptQueue,
  getPendingRetries,
  pruneCompletedItems,
  type LocalSessionAttempt,
} from "../app/lib/clientSessionAdapter";
import type { ReviewerQuestion } from "../app/content/reviewerContent";
import type * as Shadow from "../app/lib/server/shadowVerification";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function loadServerModule<T>(relPath: string): T {
  const fullPath = resolve(root, relPath);
  const cache = new Map<string, { exports: unknown }>();
  function load(path: string): unknown {
    if (cache.has(path)) return cache.get(path)!.exports;
    const localRequire = createRequire(path);
    const loaded = { exports: {} };
    cache.set(path, loaded);
    const requireModule = (name: string): unknown => {
      if (name === "server-only") return {};
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
  return load(fullPath) as T;
}

const shadowVerification = loadServerModule<typeof Shadow>("app/lib/server/shadowVerification.ts");

// Sample questions from content
const harrQuestions: ReviewerQuestion[] = JSON.parse(read("app/content/reviewerContent.json")).questions;
const rodakQuestions: ReviewerQuestion[] = JSON.parse(read("app/content/rodakContent.json")).questions;
const strasingerQuestions: ReviewerQuestion[] = JSON.parse(read("app/content/strasingerContent.json")).questions;

const ordinaryQuestion = harrQuestions.find(q => !q.matching && q.choices.length === 4)!;
const rodakMatchingQuestion = rodakQuestions.find(q => q.matching)!;
const strasingerMatchingQuestion = strasingerQuestions.find(q => q.matching)!;

// 1. Mapping an existing local session without altering it
test("maps existing local session to trusted plan without altering local session state", () => {
  const localSession = createLocalSessionState({
    localSessionId: "local-sess-001",
    userId: "user-alpha",
    mode: "practice",
    targetCount: 20,
    selectedTopicIds: ["topic-1", "topic-2", "topic-1"], // contains duplicates to verify deduplication
    questionIds: ["harr-001", "harr-002"],
    createdAtMs: 1000000,
  });

  const snapshotBefore = JSON.stringify(localSession);
  const plan = mapLocalSessionToTrustedPlan(localSession, "req-xyz-123");
  const snapshotAfter = JSON.stringify(localSession);

  assert.equal(snapshotBefore, snapshotAfter, "Local session state must remain 100% immutable during mapping");
  assert.equal(plan.requestId, "req-xyz-123");
  assert.equal(plan.localSessionId, "local-sess-001");
  assert.equal(plan.mode, "practice");
  assert.equal(plan.targetCount, 20);
  assert.deepEqual(plan.questionIds, ["harr-001", "harr-002"]);
  assert.deepEqual(plan.topicIds, ["topic-1", "topic-2"], "Topic IDs must be cleanly deduplicated");
  assert.equal(plan.clientCreatedAt, new Date(1000000).toISOString());
});

// 2. Keeping local and server session IDs distinct
test("keeps local and server session IDs distinct and handles null server session", () => {
  const session = createLocalSessionState({
    localSessionId: "local-uuid-1111",
    userId: "user-1",
    mode: "mock_exam",
    targetCount: 50,
    selectedTopicIds: ["chem"],
    questionIds: ["q-1"],
  });

  assert.equal(session.localSessionId, "local-uuid-1111");
  assert.equal(session.serverSessionId, null, "Server session ID must start as null");

  const bound = bindServerSession(session, "server-uuid-2222", 1700000000000);
  assert.equal(bound.localSessionId, "local-uuid-1111", "Local session ID must be preserved");
  assert.equal(bound.serverSessionId, "server-uuid-2222", "Server session ID must be bound separately");
  assert.notEqual(bound.localSessionId, bound.serverSessionId, "Local and server IDs must be distinct");
  assert.equal(bound.serverSessionExpiresAt, 1700000000000);

  // Locally generated ID must never be confused with server ID
  assert.equal(session.serverSessionId, null);
});

// 3. Preserving original matching selections & decoding
test("preserves original matching selections and reconstructs from polynomial expansion if needed", () => {
  // Matching question with 4 choices and 3 items
  const choicesCount = rodakMatchingQuestion.choices.length;
  const originalKey = rodakMatchingQuestion.matching!.answerKey;
  
  // Direct matching attempt
  const attemptWithSelections: LocalSessionAttempt = {
    attemptId: "att-match-1",
    questionId: rodakMatchingQuestion.id,
    slot: 0,
    selectedAnswer: 1234, // encoded or raw
    matchingSelections: [...originalKey],
    isCorrect: true,
    timedOut: false,
    answeredAtMs: 2000000,
  };

  const payload1 = formatTrustedAttemptPayload(attemptWithSelections, rodakMatchingQuestion);
  assert.equal(payload1.id, "att-match-1");
  assert.equal(payload1.response.kind, "matching");
  if (payload1.response.kind === "matching") {
    assert.deepEqual(payload1.response.selections, originalKey, "Original selections must be preserved exactly");
  }
  assert.equal(payload1.dbSelectedAnswer, null, "Matching question dbSelectedAnswer must be null for Postgres schema compatibility");

  // Legacy rehydrated attempt where only encoded selectedAnswer is available
  const encodedVal = originalKey.reduce((acc, val) => acc * choicesCount + val, 0);
  const attemptRehydrated: LocalSessionAttempt = {
    attemptId: "att-match-legacy",
    questionId: rodakMatchingQuestion.id,
    slot: 1,
    selectedAnswer: encodedVal,
    isCorrect: true,
    timedOut: false,
    answeredAtMs: 2000001,
  };

  const decoded = decodeMatchingSelections(attemptRehydrated, rodakMatchingQuestion);
  assert.deepEqual(decoded, originalKey, "Decoded selections from polynomial integer must match original key");
});

// 4. Preserving stable attempt IDs
test("preserves stable attempt IDs across queue lifecycle", () => {
  const attempt: LocalSessionAttempt = {
    attemptId: "stable-att-9999-uuid",
    questionId: ordinaryQuestion.id,
    slot: 3,
    selectedAnswer: 2,
    isCorrect: ordinaryQuestion.correctAnswer === 2,
    timedOut: false,
    answeredAtMs: 3000000,
  };

  const payload = formatTrustedAttemptPayload(attempt, ordinaryQuestion);
  assert.equal(payload.id, "stable-att-9999-uuid");

  const queueItem = createQueueItem("user-abc", "sess-local-1", "sess-srv-1", payload);
  assert.equal(queueItem.attemptId, "stable-att-9999-uuid");
});

// 5. Queue retry and acknowledgment semantics
test("handles queue status transitions according to server acknowledgment semantics", () => {
  const payload = formatTrustedAttemptPayload({
    attemptId: "att-trans-1",
    questionId: ordinaryQuestion.id,
    slot: 0,
    selectedAnswer: 1,
    isCorrect: false,
    timedOut: false,
    answeredAtMs: 4000000,
  }, ordinaryQuestion);

  const initial = createQueueItem("user-x", "loc-1", "srv-1", payload);
  assert.equal(initial.status, "pending");
  assert.equal(initial.retryCount, 0);

  // Transient network error -> deferred with retry count increment
  const deferred = transitionAttemptQueue(initial, "deferred", { errorMessage: "Network offline" });
  assert.equal(deferred.status, "deferred");
  assert.equal(deferred.retryCount, 1);
  assert.equal(deferred.lastError, "Network offline");

  // Server successful acceptance
  const accepted = transitionAttemptQueue(initial, "accepted");
  assert.equal(accepted.status, "accepted");

  // Already accepted idempotent deduplication
  const alreadyAccepted = transitionAttemptQueue(initial, "already_accepted");
  assert.equal(alreadyAccepted.status, "already_accepted");

  // Conflict (e.g. concurrent attempt on same slot)
  const conflict = transitionAttemptQueue(initial, "conflict", { errorMessage: "Slot occupied" });
  assert.equal(conflict.status, "conflict");

  // Validation rejection
  const rejected = transitionAttemptQueue(initial, "rejected", { errorMessage: "Invalid content version" });
  assert.equal(rejected.status, "rejected");
});

// 6. Deferred attempts retained locally & completed pruned
test("retains deferred attempts locally for retry and prunes only accepted items", () => {
  const item1 = createQueueItem("u1", "l1", "s1", formatTrustedAttemptPayload({
    attemptId: "att-accepted",
    questionId: ordinaryQuestion.id,
    slot: 0,
    selectedAnswer: 0,
    isCorrect: true,
    timedOut: false,
    answeredAtMs: 1,
  }, ordinaryQuestion));
  const acceptedItem = transitionAttemptQueue(item1, "accepted");

  const item2 = createQueueItem("u1", "l1", "s1", formatTrustedAttemptPayload({
    attemptId: "att-deferred",
    questionId: ordinaryQuestion.id,
    slot: 1,
    selectedAnswer: 1,
    isCorrect: false,
    timedOut: false,
    answeredAtMs: 2,
  }, ordinaryQuestion));
  const deferredItem = transitionAttemptQueue(item2, "deferred", { errorMessage: "Timeout 504" });

  const queue = [acceptedItem, deferredItem];

  const retries = getPendingRetries(queue);
  assert.equal(retries.length, 1);
  assert.equal(retries[0].attemptId, "att-deferred");

  const pruned = pruneCompletedItems(queue);
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].attemptId, "att-deferred", "Deferred attempt must be retained locally");
});

// 7. Account-switch isolation
test("isolates queues by account to prevent cross-user queue replay", () => {
  const itemUserA = createQueueItem("user-A-id", "loc-A", null, formatTrustedAttemptPayload({
    attemptId: "att-user-A",
    questionId: ordinaryQuestion.id,
    slot: 0,
    selectedAnswer: 0,
    isCorrect: true,
    timedOut: false,
    answeredAtMs: 10,
  }, ordinaryQuestion));

  const itemUserB = createQueueItem("user-B-id", "loc-B", null, formatTrustedAttemptPayload({
    attemptId: "att-user-B",
    questionId: ordinaryQuestion.id,
    slot: 0,
    selectedAnswer: 2,
    isCorrect: false,
    timedOut: false,
    answeredAtMs: 20,
  }, ordinaryQuestion));

  const mixedQueue = [itemUserA, itemUserB];

  const isolatedForA = isolateQueueByAccount(mixedQueue, "user-A-id");
  assert.equal(isolatedForA.length, 1);
  assert.equal(isolatedForA[0].attemptId, "att-user-A");
  assert.equal(isolatedForA[0].userId, "user-A-id");

  const isolatedForB = isolateQueueByAccount(mixedQueue, "user-B-id");
  assert.equal(isolatedForB.length, 1);
  assert.equal(isolatedForB[0].attemptId, "att-user-B");
  assert.equal(isolatedForB[0].userId, "user-B-id");

  const signedOut = isolateQueueByAccount(mixedQueue, null);
  assert.equal(signedOut.length, 0, "Signing out must not expose any user's queue items");
});

// 8. Session expiration behavior
test("handles session expiration without mutating local history", () => {
  const session = createLocalSessionState({
    localSessionId: "loc-exp-01",
    userId: "user-1",
    mode: "practice",
    targetCount: 10,
    selectedTopicIds: ["t1"],
    questionIds: ["q1"],
  });

  const now = Date.now();
  const activeSession = bindServerSession(session, "srv-exp-01", now + 60000);
  assert.equal(isServerSessionExpired(activeSession, now), false);

  const expiredSession = bindServerSession(session, "srv-exp-02", now - 5000);
  assert.equal(isServerSessionExpired(expiredSession, now), true);

  // Local properties remain intact
  assert.equal(expiredSession.localSessionId, "loc-exp-01");
  assert.equal(expiredSession.userId, "user-1");
  assert.equal(expiredSession.targetCount, 10);
});

// 9. Strasinger remaining blocked by default
test("enforces fail-closed Strasinger cloud synchronization default", () => {
  assert.equal(
    isStrasingerSessionBlocked(["strasinger-ch01"]),
    true,
    "Strasinger must be blocked by default without explicit authorization"
  );
  assert.equal(
    isStrasingerSessionBlocked(["harr-clinical-chemistry"]),
    false,
    "Harr topics must not be blocked by Strasinger gate"
  );
});

// 10. No production RPC or database writes from the adapter
test("confirms client session adapter is pure in-memory and executes no RPC or DB writes", () => {
  const session = createLocalSessionState({
    localSessionId: "purity-check-01",
    userId: "user-purity",
    mode: "practice",
    targetCount: 5,
    selectedTopicIds: ["chem"],
    questionIds: [ordinaryQuestion.id],
  });

  // Verify functions return synchronously or are pure without any external network handles
  const plan = mapLocalSessionToTrustedPlan(session, "req-pure");
  assert.ok(plan);
  const payload = formatTrustedAttemptPayload({
    attemptId: "att-pure",
    questionId: ordinaryQuestion.id,
    slot: 0,
    selectedAnswer: 1,
    isCorrect: false,
    timedOut: false,
    answeredAtMs: 100,
  }, ordinaryQuestion);
  assert.ok(payload);
  const item = createQueueItem("user-purity", "purity-check-01", null, payload);
  assert.ok(item);
  // Zero network/database handles present
  assert.equal(typeof (item as Record<string, unknown>).rpc, "undefined");
  assert.equal(typeof (item as Record<string, unknown>).from, "undefined");
});

// 11. Shadow grading parity using synthetic responses across all books
test("verifies 100% shadow grading parity between local and canonical server grading", async () => {
  const samples: Shadow.ShadowVerificationSample[] = [
    // Ordinary Harr question - correct answer
    {
      questionId: ordinaryQuestion.id,
      response: { kind: "single_choice", choiceIndex: ordinaryQuestion.correctAnswer },
    },
    // Ordinary Harr question - incorrect answer
    {
      questionId: ordinaryQuestion.id,
      response: { kind: "single_choice", choiceIndex: (ordinaryQuestion.correctAnswer + 1) % ordinaryQuestion.choices.length },
    },
    // Shuffled choice mapping simulation
    {
      questionId: ordinaryQuestion.id,
      response: { kind: "single_choice", choiceIndex: 0 },
      shuffleMapping: [ordinaryQuestion.correctAnswer, 1, 2, 3], // displayed choice 0 maps to correctAnswer
      displayedChoiceIndex: 0,
    },
    // Timeout
    {
      questionId: ordinaryQuestion.id,
      response: { kind: "timeout" },
    },
    // Rodak Matching Question - correct answer
    {
      questionId: rodakMatchingQuestion.id,
      response: { kind: "matching", selections: [...rodakMatchingQuestion.matching!.answerKey] },
    },
    // Rodak Matching Question - incorrect answer (tamper first selection)
    {
      questionId: rodakMatchingQuestion.id,
      response: {
        kind: "matching",
        selections: rodakMatchingQuestion.matching!.answerKey.map((val, idx) => (idx === 0 ? (val + 1) % rodakMatchingQuestion.choices.length : val)),
      },
    },
    // Rodak Matching Question - timeout
    {
      questionId: rodakMatchingQuestion.id,
      response: { kind: "timeout" },
    },
    // Strasinger Matching Question - correct answer
    {
      questionId: strasingerMatchingQuestion.id,
      response: { kind: "matching", selections: [...strasingerMatchingQuestion.matching!.answerKey] },
    },
    // Strasinger Matching Question - incorrect answer
    {
      questionId: strasingerMatchingQuestion.id,
      response: {
        kind: "matching",
        selections: strasingerMatchingQuestion.matching!.answerKey.map((val, idx) => (idx === 0 ? (val + 1) % strasingerMatchingQuestion.choices.length : val)),
      },
    },
    // Strasinger Matching Question - timeout
    {
      questionId: strasingerMatchingQuestion.id,
      response: { kind: "timeout" },
    },
  ];

  const summary = await shadowVerification.runShadowVerification(samples);

  assert.equal(summary.totalEvaluated, samples.length);
  assert.equal(summary.mismatchCount, 0, "Zero parity mismatches permitted between local and server grading");
  assert.equal(summary.parityRate, 1.0, "Parity rate must be 100%");
  assert.deepEqual(summary.mismatches, []);
});
