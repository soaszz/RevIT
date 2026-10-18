import assert from "node:assert/strict";
import test from "node:test";
import strasingerContent from "../app/content/strasingerContent.json";
import { strasingerPreviewTopics } from "../app/content/strasingerMetadata";
import type { ReviewerQuestion } from "../app/content/reviewerContent";
import { encodeMatchingAnswers, isQuestionAnswerCorrect, parseMatchingChoice } from "../app/lib/matchingQuestion";

const questions = strasingerContent.questions as ReviewerQuestion[];
const topics = strasingerContent.topics;

test("strasinger dataset integrity: exactly 467 questions across 17 topics", () => {
  assert.equal(questions.length, 467);
  assert.equal(topics.length, 17);
  assert.equal(strasingerPreviewTopics.length, 17);
  
  // All topics must NOT have "Chapter" prefixes in visible names
  for (const topic of topics) {
    assert.match(topic.name, /^[A-Z]/);
    assert.doesNotMatch(topic.name, /^Chapter\s+\d+:/i);
  }
  for (const topic of strasingerPreviewTopics) {
    assert.match(topic.name, /^[A-Z]/);
    assert.doesNotMatch(topic.name, /^Chapter\s+\d+:/i);
  }
});

test("answer banner resolution across all shuffled permutations", () => {
  // Helper simulating RevIT answer banner logic
  function resolveAnswerBanner(
    question: ReviewerQuestion,
    choiceOrder: number[]
  ) {
    const displayedIndex = choiceOrder.indexOf(question.correctAnswer);
    const displayedLetter = displayedIndex >= 0 ? String.fromCharCode(65 + displayedIndex) : "";
    const rawChoiceText = question.choices?.[question.correctAnswer] ?? question.officialAnswer;
    const answerText = rawChoiceText.replace(/^[A-Za-z]\.\s+/, "");
    return `${displayedLetter ? `${displayedLetter}. ` : ""}${answerText}`;
  }

  // 1. Ch 7: Increased transitional cells -> Both A and B (original D shuffled to B / index 1)
  const qTrans = questions.find((q) => q.prompt.includes("transitional cells are indicative of"));
  assert.ok(qTrans);
  const bannerTrans = resolveAnswerBanner(qTrans, [0, qTrans.correctAnswer, 1, 2]);
  assert.equal(bannerTrans, "B. Both A and B");

  // 2. Ch 17: Protein present in vaginal secretions -> Fetal fibronectin (original D shuffled to C / index 2)
  const qFibro = questions.find((q) => q.prompt.includes("risk for preterm delivery"));
  assert.ok(qFibro);
  const bannerFibro = resolveAnswerBanner(qFibro, [0, 1, qFibro.correctAnswer, 2]);
  assert.equal(bannerFibro, "C. Fetal fibronectin");

  // 3. Ch 16: Fecal test that requires a 3-day specimen -> Quantitative fecal fat testing (original D shuffled to A / index 0)
  const qFecal = questions.find((q) => q.prompt.includes("requires a 3-day specimen"));
  assert.ok(qFecal);
  const bannerFecal = resolveAnswerBanner(qFecal, [qFecal.correctAnswer, 0, 1, 2]);
  assert.equal(bannerFecal, "A. Quantitative fecal fat testing");

  // 4. Ch 1: Accidental exposure to bloodborne pathogen -> Report to a supervisor (original A shuffled to D / index 3)
  const qSafety = questions.find((q) => q.prompt.includes("exposed to a possible bloodborne pathogen"));
  assert.ok(qSafety);
  const bannerSafety = resolveAnswerBanner(qSafety, [1, 2, 3, qSafety.correctAnswer]);
  assert.equal(bannerSafety, "D. Report to a supervisor");

  // 5. Ch 6: Which of the following is not tested on the Multistix Pro -> Urobilinogen (original A shuffled to C / index 2)
  const qMulti = questions.find((q) => q.prompt.includes("not tested on the Multistix Pro"));
  assert.ok(qMulti);
  const bannerMulti = resolveAnswerBanner(qMulti, [1, 2, qMulti.correctAnswer, 3]);
  assert.equal(bannerMulti, "C. Urobilinogen");

  // Verify across all 467 single-choice questions that banner text always matches correct choice
  for (const q of questions) {
    if (q.matching) continue;
    // Test 4 permutations
    for (let targetDisplay = 0; targetDisplay < q.choices.length; targetDisplay++) {
      const order = Array.from({ length: q.choices.length }, (_, i) => i);
      // swap targetDisplay with correctAnswer
      const curPos = order.indexOf(q.correctAnswer);
      order[curPos] = order[targetDisplay];
      order[targetDisplay] = q.correctAnswer;
      const expectedLetter = String.fromCharCode(65 + targetDisplay);
      const expectedText = q.choices[q.correctAnswer].replace(/^[A-Za-z]\.\s+/, "");
      const banner = resolveAnswerBanner(q, order);
      assert.equal(banner, `${expectedLetter}. ${expectedText}`);
    }
  }
});

test("PDF extraction hygiene: no word-splitting artifacts or contaminated choices", () => {
  const forbiddenHyphenPatterns = [
    "concentra- tion",
    "auto- mated",
    "speci- men",
    "detec- tion",
    "Micral- Test",
    "peri- ods",
    "interpre- tation",
    "con- dom",
    "ex- cess",
    "lipid- laden",
    "am- niotic",
  ];

  for (const q of questions) {
    for (const pat of forbiddenHyphenPatterns) {
      assert.equal(q.prompt.includes(pat), false, `Found artifact ${pat} in prompt of ${q.id}`);
      for (const c of q.choices) {
        assert.equal(c.includes(pat), false, `Found artifact ${pat} in choice of ${q.id}`);
      }
      assert.equal(q.explanation.includes(pat), false, `Found artifact ${pat} in explanation of ${q.id}`);
    }

    // Verify no contamination of end-of-chapter text
    for (const c of q.choices) {
      assert.equal(c.includes("Case Studies and Clinical Situations"), false, `Contamination in ${q.id}`);
      assert.equal(c.includes("L E A R N I N G O U T C O M E S"), false, `Contamination in ${q.id}`);
    }
  }

  // Ch 13 Q3 excess verification
  const qExcess = questions.find((q) => q.id === "strasinger7-ch13-q003");
  assert.ok(qExcess);
  assert.ok(qExcess.prompt.includes("slight excess of fluid is"));
});

test("matching and classification integrity: all 14 matching questions properly structured", () => {
  const matchingQuestions = questions.filter((q) => q.matching);
  assert.equal(matchingQuestions.length, 14);

  for (const q of matchingQuestions) {
    const m = q.matching!;
    assert.equal(m.items.length, m.answerKey.length);
    assert.ok(m.items.length > 0);
    assert.ok(q.choices.length > 0);

    // Each answer key must be a valid choice index
    for (const key of m.answerKey) {
      assert.ok(key >= 0 && key < q.choices.length, `Key ${key} invalid for ${q.id}`);
    }

    // Mathematical encoding and scoring
    const encoded = encodeMatchingAnswers([...m.answerKey], q.choices.length);
    assert.ok(encoded !== null);
    assert.equal(isQuestionAnswerCorrect(q, encoded), true);
    assert.equal(isQuestionAnswerCorrect(q, encoded! + 1), false);
    assert.equal(isQuestionAnswerCorrect(q, null), false);

    // Parse choices
    for (let i = 0; i < q.choices.length; i++) {
      const parsed = parseMatchingChoice(q.choices[i], i);
      assert.ok(parsed.label.length > 0);
      assert.ok(parsed.text.length > 0);
    }
  }

  // Specifically check Acetest/Clinitest (strasinger7-ch06-q031)
  const qAcetest = questions.find((q) => q.id === "strasinger7-ch06-q031");
  assert.ok(qAcetest?.matching);
  assert.equal(qAcetest.matching.items.length, 6);
  assert.equal(qAcetest.choices.length, 2);
  assert.deepEqual(qAcetest.matching.answerKey, [0, 1, 0, 1, 0, 1]);
  assert.equal(qAcetest.officialAnswer, "1, 2, 1, 2, 1, 2");
});

test("position-dependent shuffle protection: exactly 42 questions marked disableShuffle", () => {
  const disabled = questions.filter((q) => q.disableShuffle);
  assert.equal(disabled.length, 42);

  // Each must contain a positional phrase
  const posRegex = /\b(both\s+[a-d]\s+and\s+[a-d]|all\s+of\s+the\s+above|none\s+of\s+the\s+above|neither\s+[a-d]\s+nor\s+[a-d]|either\s+[a-d]\s+or\s+[a-d])\b/i;
  for (const q of disabled) {
    const hasPos = q.choices.some((c) => posRegex.test(c));
    assert.ok(hasPos, `Question ${q.id} marked disableShuffle without matching choice phrase`);
  }
});

test("all rationales verified and non-empty across all 467 questions", () => {
  for (const q of questions) {
    assert.ok(q.explanation && q.explanation.length > 20, `Empty rationale in ${q.id}`);
    assert.ok(q.source && q.source.page > 0, `Missing source page in ${q.id}`);
    assert.equal(q.book, "Strasinger");
  }
});
