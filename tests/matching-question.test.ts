import assert from "node:assert/strict";
import test from "node:test";
import rodak from "../app/content/rodakContent.json";
import type { ReviewerQuestion } from "../app/content/reviewerContent";
import { encodeMatchingAnswers, isQuestionAnswerCorrect } from "../app/lib/matchingQuestion";

const questions = rodak.questions as ReviewerQuestion[];

test("both matching items retain original count and official pairs", () => {
  assert.equal(questions.length, 491);
  const expected = [
    ["rodak-ch12-06", [2, 1, 0], "Impedance: C; RF: B; Optical scatter: A"],
    ["rodak-ch12-10", [1, 2, 3, 0], "Abbott CELL-DYN Sapphire, b; Siemens ADVIA 2120i, c; Sysmex XN-1000, d; Beckman Coulter UniCel DxH 800, a."],
  ] as const;
  for (const [id, answerKey, officialAnswer] of expected) {
    const question = questions.find((item) => item.id === id);
    assert.ok(question?.matching);
    assert.deepEqual(question.matching.answerKey, answerKey);
    assert.equal(question.officialAnswer, officialAnswer);
    assert.equal(question.matching.items.length, answerKey.length);
    assert.equal(question.choices.length, answerKey.length);
    const encoded = encodeMatchingAnswers([...answerKey], question.choices.length);
    assert.ok(encoded !== null);
    assert.equal(isQuestionAnswerCorrect(question, encoded), true);
    assert.equal(isQuestionAnswerCorrect(question, encoded + 1), false);
    assert.equal(isQuestionAnswerCorrect(question, null), false);
  }
});

test("matching answer encoding rejects incomplete and invalid selections", () => {
  assert.equal(encodeMatchingAnswers([], 3), null);
  assert.equal(encodeMatchingAnswers([-1, 1, 0], 3), null);
  assert.equal(encodeMatchingAnswers([3, 1, 0], 3), null);
  const sparse = new Array<number>(3);
  sparse[1] = 1;
  sparse[2] = 0;
  assert.equal(encodeMatchingAnswers(sparse, 3), null);
});

test("single-answer questions retain original scoring", () => {
  const question = questions.find((item) => item.id === "rodak-ch12-07");
  assert.ok(question);
  assert.equal(question.matching, undefined);
  assert.equal(isQuestionAnswerCorrect(question, question.correctAnswer), true);
  assert.equal(isQuestionAnswerCorrect(question, 0), false);
});
