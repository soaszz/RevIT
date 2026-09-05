import test from "node:test";
import assert from "node:assert/strict";
import type { ReviewerQuestion } from "../app/content/reviewerContent";
import type { QuestionAttempt, QuestionDifficulty } from "../app/lib/domain";
import {
  buildWeakTopicQuestionPool,
  calculateTopicMastery,
  calculateTrend,
  classifyMastery,
} from "../app/lib/weaknessAnalytics";

function attempt(input: Partial<QuestionAttempt> & Pick<QuestionAttempt, "questionId" | "correct" | "timestamp">): QuestionAttempt {
  return {
    id: input.id ?? `${input.questionId}-${input.timestamp}`,
    questionId: input.questionId,
    subjectId: input.subjectId ?? "bacteriology",
    subjectName: input.subjectName ?? "Bacteriology",
    topicId: input.topicId ?? "gram-staining",
    topicName: input.topicName ?? "Gram staining",
    subtopic: input.subtopic ?? "Uncategorized",
    difficulty: input.difficulty ?? "Medium",
    selectedAnswer: input.selectedAnswer ?? 0,
    correct: input.correct,
    attemptNumber: input.attemptNumber ?? 1,
    reviewMode: input.reviewMode ?? "reviewer",
    sessionId: input.sessionId ?? null,
    isAdaptiveRepeat: input.isAdaptiveRepeat ?? false,
    timestamp: input.timestamp,
  };
}

function fiveAnswers(correctCount: number, difficulty: QuestionDifficulty = "Medium") {
  return Array.from({ length: 5 }, (_, index) => attempt({
    questionId: `q-${index + 1}`,
    correct: index < correctCount,
    difficulty,
    timestamp: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
  }));
}

test("no attempts and fewer than five unique questions stay insufficient", () => {
  const empty = calculateTopicMastery([]);
  assert.equal(empty.mastery, null);
  assert.equal(empty.status, "insufficient");
  const four = calculateTopicMastery(fiveAnswers(4).slice(0, 4));
  assert.equal(four.uniqueQuestions, 4);
  assert.equal(four.status, "insufficient");
});

test("exactly five unique questions unlock weak, developing, and strong classifications", () => {
  assert.equal(calculateTopicMastery(fiveAnswers(0)).status, "weak");
  assert.equal(calculateTopicMastery(fiveAnswers(3)).status, "developing");
  assert.equal(calculateTopicMastery(fiveAnswers(5)).status, "strong");
  assert.equal(classifyMastery(60, 5), "developing");
  assert.equal(classifyMastery(80, 5), "strong");
});

test("adaptive repeats do not inflate recent-unique or first-attempt accuracy", () => {
  const baseline = fiveAnswers(1);
  const repeats = Array.from({ length: 8 }, (_, index) => attempt({
    questionId: "q-1",
    correct: true,
    attemptNumber: index + 2,
    isAdaptiveRepeat: true,
    reviewMode: "adaptive",
    timestamp: `2026-08-${String(index + 7).padStart(2, "0")}T10:00:00.000Z`,
  }));
  const result = calculateTopicMastery([...baseline, ...repeats]);
  assert.equal(result.totalAttempts, 13);
  assert.equal(result.uniqueQuestions, 5);
  assert.equal(result.recentUniqueAccuracy, 20);
  assert.equal(result.firstAttemptAccuracy, 20);
});

test("immediate retries are excluded from retention but attempts after three days count", () => {
  const original = attempt({ questionId: "retained", correct: false, timestamp: "2026-08-01T00:00:00.000Z" });
  const immediate = attempt({ questionId: "retained", correct: true, attemptNumber: 2, timestamp: "2026-08-01T01:00:00.000Z" });
  assert.equal(calculateTopicMastery([original, immediate]).retentionAccuracy, null);
  const delayed = attempt({ questionId: "retained", correct: true, attemptNumber: 3, timestamp: "2026-08-04T00:00:00.000Z" });
  const retained = calculateTopicMastery([original, immediate, delayed]);
  assert.equal(retained.retentionAccuracy, 100);
  assert.equal(retained.retentionQuestions, 1);
});

test("missing difficulty and retention data are excluded rather than scored as zero", () => {
  const result = calculateTopicMastery(fiveAnswers(5, "Unspecified"));
  assert.equal(result.difficultyAdjustedAccuracy, null);
  assert.equal(result.retentionAccuracy, null);
  assert.equal(result.mastery, 100);
  assert.equal(result.status, "strong");
});

test("mixed subjects remain separated by topic metadata", () => {
  const mixed = [
    ...fiveAnswers(5),
    ...fiveAnswers(0).map((item, index) => ({ ...item, id: `hema-${index}`, questionId: `hema-${index}`, subjectId: "hematology", subjectName: "Hematology", topicId: "anemia", topicName: "Anemia" })),
  ];
  const bacteriology = calculateTopicMastery(mixed.filter((item) => item.topicId === "gram-staining"));
  const hematology = calculateTopicMastery(mixed.filter((item) => item.topicId === "anemia"));
  assert.equal(bacteriology.status, "strong");
  assert.equal(hematology.status, "weak");
  assert.equal(hematology.subjectName, "Hematology");
});

test("trends require ten unique questions and ignore a dramatic single retry", () => {
  const nine = Array.from({ length: 9 }, (_, index) => attempt({ questionId: `trend-${index}`, correct: true, timestamp: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` }));
  assert.equal(calculateTrend(nine).direction, "insufficient");
  const ten = [...nine, attempt({ questionId: "trend-9", correct: false, timestamp: "2026-08-10T00:00:00.000Z" })];
  assert.equal(calculateTrend(ten).direction, "down");
  const retry = attempt({ questionId: "trend-9", correct: true, attemptNumber: 2, isAdaptiveRepeat: true, timestamp: "2026-08-11T00:00:00.000Z" });
  assert.equal(calculateTrend([...ten, retry]).currentAccuracy, 100);
});

test("existing untagged questions are safely reported as Uncategorized", () => {
  const result = calculateTopicMastery([attempt({ questionId: "legacy", correct: false, topicId: "uncategorized", topicName: "Uncategorized", subjectId: "uncategorized", subjectName: "Uncategorized", subtopic: "Uncategorized", difficulty: "Unspecified", timestamp: "2026-08-01T00:00:00.000Z" })]);
  assert.equal(result.topicName, "Uncategorized");
  assert.equal(result.subjectName, "Uncategorized");
  assert.equal(result.difficultyAdjustedAccuracy, null);
});

test("focused practice favors unused target, related, and previously missed questions", () => {
  const bank: ReviewerQuestion[] = Array.from({ length: 14 }, (_, index) => ({
    id: `bank-${index}`,
    subjectId: index < 12 ? "bacteriology" : "hematology",
    topicId: index < 7 ? "gram-staining" : index < 12 ? "culture-media" : "anemia",
    prompt: `Question ${index}`,
    choices: ["A", "B", "C", "D"],
    correctAnswer: 0,
    officialAnswer: "A",
    explanation: "Rationale",
    source: { fileName: "reviewer.pdf", page: 1, kind: "official" },
  }));
  const history = [attempt({ questionId: "bank-7", topicId: "culture-media", topicName: "Culture media", correct: false, timestamp: "2026-08-01T00:00:00.000Z" })];
  const pool = buildWeakTopicQuestionPool("gram-staining", bank, history, () => 0.5);
  assert.equal(pool.length, 10);
  assert.equal(new Set(pool).size, 10);
  assert.equal(pool.filter((id) => Number(id.split("-")[1]) < 7).length, 6);
  assert.ok(pool.includes("bank-7"));
  assert.equal(pool.some((id) => Number(id.split("-")[1]) >= 12), false);
});
