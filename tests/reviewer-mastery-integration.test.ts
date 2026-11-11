import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
const elsevier = JSON.parse(readFileSync(".private-reviewers/runtime/books/elsevier.json", "utf8"));
import type { ReviewerQuestion } from "../app/content/reviewerContent";
import type { SavedRecentSession } from "../app/components/ResumeSessionModal";
import { encodeMatchingAnswers, isQuestionAnswerCorrect } from "../app/lib/matchingQuestion";
import { queueAfterAnswer, sessionMastery, firstSessionAnswers } from "../app/lib/sessionMastery";
import { parseRecentReviewSession, restoreRecentMasterySession, canResumeRecentReview } from "../app/lib/recentReviewSession";
import { FREE_ENTITLEMENT } from "../app/lib/entitlements";

const questions = elsevier.questions as ReviewerQuestion[];
function saved(q: ReviewerQuestion): SavedRecentSession {
  return { id: "synthetic-combined-review", poolIds: [q.id], targetCount: 1,
    questionIds: [q.id], choiceOrders: { [q.id]: q.choices.map((_, i) => i) }, strictWrongOnly: false,
    sessionMode: "reviewer", index: 0, attempts: [], selectedChoice: null, matchingSelections: [],
    answerRevealed: false, timedOut: false, activeTimer: { enabled: false, duration: 60 }, pausedAt: "2026-11-10T00:00:00Z",
    primaryTopicName: q.topicId, subjectName: q.subjectId, book: "Elsevier", masteryVersion: 1 };
}

test("every authentic matching/fifth-choice response retains two-correct mastery across reload", () => {
  const formats = questions.filter(q => q.matching || q.choices.length === 5);
  assert.equal(formats.filter(q => q.matching).length, 5);
  assert.equal(formats.filter(q => !q.matching).length, 9);
  for (const q of formats) {
    let session = saved(q);
    const right = q.matching ? encodeMatchingAnswers(q.matching.answerKey, q.choices.length) : q.correctAnswer;
    assert.notEqual(right, null); assert.equal(typeof right, "number");
    const wrong = q.matching ? encodeMatchingAnswers(q.matching.answerKey.map((a, i) => i ? a : (a + 1) % q.choices.length), q.choices.length) : (right! + 1) % q.choices.length;
    for (const [index, selectedAnswer] of [wrong, right, wrong, right, right].entries()) {
      const correct = isQuestionAnswerCorrect(q, selectedAnswer);
      session.index = index;
      session.attempts.push({ questionId: q.id, selectedAnswer, correct } as never);
      session.questionIds = queueAfterAnswer(session.questionIds, index, session.attempts);
      session.selectedChoice = selectedAnswer; session.answerRevealed = true;
      if (q.matching) session.matchingSelections = selectedAnswer === right ? [...q.matching.answerKey] : q.matching.answerKey.map((a, i) => i ? a : (a + 1) % q.choices.length);
      const parsed = parseRecentReviewSession(JSON.stringify(session)); assert.ok(parsed, q.id);
      const restored = restoreRecentMasterySession(parsed);
      assert.deepEqual(restored, session, q.id);
      assert.equal(sessionMastery(restored.questionIds, restored.attempts).done, index === 4);
      assert.equal(sessionMastery(restored.questionIds, restored.attempts).states.get(q.id)?.streak, [0, 1, 0, 1, 2][index]);
      assert.equal(firstSessionAnswers(restored.attempts).length, 1);
      session = restored;
    }
  }
});

test("legacy revealed matching answer is retained while its missing retry tail is repaired", () => {
  const q = questions.find(q => q.matching && q.matching.items.length === 4)!;
  const answer = encodeMatchingAnswers(q.matching!.answerKey, q.choices.length);
  for (const results of [[false], [false, true], [true]]) {
    const session = saved(q); delete session.masteryVersion;
    session.attempts = results.map(correct => ({ questionId: q.id, correct, selectedAnswer: answer })) as never;
    session.questionIds = results.map(() => q.id); session.index = results.length - 1;
    session.selectedChoice = answer; session.matchingSelections = [...q.matching!.answerKey]; session.answerRevealed = true;
    const restored = restoreRecentMasterySession(session);
    assert.equal(restored.questionIds[restored.index], q.id);
    assert.equal(restored.selectedChoice, answer); assert.deepEqual(restored.matchingSelections, q.matching!.answerKey);
    assert.deepEqual(restored.attempts, session.attempts); assert.equal(restored.answerRevealed, true);
    assert.equal(restored.questionIds.length, results[0] ? 1 : results.length + 1);
    assert.equal(sessionMastery(restored.questionIds, restored.attempts).done, results[0]);
  }
});

test("publication, entitlement, and exact matching-vector bounds survive restoration", () => {
  const q = questions.find(q => q.matching && q.matching.items.length === 4)!;
  const session = saved(q); session.selectedChoice = encodeMatchingAnswers(q.matching!.answerKey, q.choices.length);
  session.matchingSelections = [...q.matching!.answerKey];
  const pro = { ...FREE_ENTITLEMENT, effectivePlan: "pro" as const };
  assert.equal(canResumeRecentReview(session, new Map([[q.id, q]]), pro), false, "Unpublished remains unavailable to Pro");
  const existing = { ...q, book: "Rodak" as const }; const map = new Map([[q.id, existing]]);
  assert.equal(canResumeRecentReview(session, map, pro), true, "Valid encoded matching answers exceed an ordinary choice index");
  assert.equal(canResumeRecentReview(session, map, FREE_ENTITLEMENT), false);
  assert.equal(canResumeRecentReview(session, map, { ...pro, effectivePlan: "free" }), false);
  assert.equal(canResumeRecentReview({ ...session, selectedChoice: q.choices.length ** q.matching!.items.length }, map, pro), false);
  assert.equal(canResumeRecentReview({ ...session, matchingSelections: [0] }, map, pro), false);
  assert.equal(canResumeRecentReview({ ...session, selectedChoice: 0 }, map, pro), false);
  assert.equal(canResumeRecentReview(session, new Map(), pro), false);
});
