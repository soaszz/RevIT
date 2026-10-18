import test from "node:test";
import assert from "node:assert/strict";

// Simulator replicating RevIT queue management, choice ordering, and skip mechanics
interface QuestionStub {
  id: string;
  book: string;
  type: "standard" | "matching" | "numerical";
  choices: string[];
  correctAnswer: number;
  disableShuffle?: boolean;
  matching?: { items: string[]; matches: string[] };
}

interface SessionState {
  poolIds: string[];
  targetCount: number;
  questionIds: string[];
  choiceOrders: Record<string, number[]>;
  skippedIds: string[];
  index: number;
  attempts: Array<{ id: string; questionId: string; correct: boolean }>;
  answerRevealed: boolean;
  strictWrongOnly: boolean;
}

function createSession(
  questions: QuestionStub[],
  targetCount: number,
  strictWrongOnly = false
): SessionState {
  const poolIds = questions.map((q) => q.id);
  const target = Math.min(targetCount, poolIds.length);
  const initialQuestionIds = poolIds.slice(0, target);
  const initialOrders: Record<string, number[]> = {};

  initialQuestionIds.forEach((qId, idx) => {
    const q = questions.find((item) => item.id === qId);
    const choiceCount = q?.choices?.length ?? 4;
    // deterministic non-trivial permutation for testing choice preservation
    const order = q?.disableShuffle || q?.matching
      ? Array.from({ length: choiceCount }, (_, i) => i)
      : Array.from({ length: choiceCount }, (_, i) => (i + 1) % choiceCount);
    initialOrders[`${idx}:${qId}`] = order;
    initialOrders[qId] = order;
  });

  return {
    poolIds,
    targetCount: initialQuestionIds.length,
    questionIds: initialQuestionIds,
    choiceOrders: initialOrders,
    skippedIds: [],
    index: 0,
    attempts: [],
    answerRevealed: false,
    strictWrongOnly,
  };
}

function canSkip(state: SessionState): boolean {
  const remainingInQueue = Math.max(0, state.questionIds.length - state.attempts.length);
  const hasUnseenAdaptive =
    !state.strictWrongOnly && state.targetCount > state.questionIds.length;
  const totalUnanswered = remainingInQueue + (hasUnseenAdaptive ? 1 : 0);
  return !state.answerRevealed && totalUnanswered > 1;
}

function skipCurrentQuestion(state: SessionState, _questions?: QuestionStub[]): boolean {
  if (!canSkip(state)) return false;

  const currentQId = state.questionIds[state.index];
  if (!state.skippedIds.includes(currentQId)) {
    state.skippedIds.push(currentQId);
  }

  const nextIds = [...state.questionIds];
  const [removed] = nextIds.splice(state.index, 1);
  nextIds.push(removed);

  const updatedOrders: Record<string, number[]> = { ...state.choiceOrders };
  nextIds.forEach((id, idx) => {
    const existing = updatedOrders[id] || updatedOrders[`${idx}:${id}`];
    if (existing) {
      updatedOrders[`${idx}:${id}`] = existing;
      updatedOrders[id] = existing;
    }
  });

  state.questionIds = nextIds;
  state.choiceOrders = updatedOrders;
  state.answerRevealed = false;
  return true;
}

function answerCurrentQuestion(
  state: SessionState,
  correct: boolean
): void {
  const currentQId = state.questionIds[state.index];
  state.attempts.push({
    id: `attempt-${state.attempts.length}`,
    questionId: currentQId,
    correct,
  });
  state.answerRevealed = true;
}

function nextQuestion(state: SessionState): void {
  if (state.index + 1 < state.questionIds.length) {
    state.index++;
    state.answerRevealed = false;
  }
}

test("Skip first question moves it to the end of the queue", () => {
  const mockQuestions: QuestionStub[] = [
    { id: "harr-q1", book: "Harr", type: "standard", choices: ["A", "B", "C", "D"], correctAnswer: 0 },
    { id: "ciulla-q2", book: "Ciulla", type: "standard", choices: ["A", "B", "C", "D"], correctAnswer: 1 },
    { id: "stras-q3", book: "Strasinger", type: "standard", choices: ["A", "B", "C", "D"], correctAnswer: 2 },
  ];

  const session = createSession(mockQuestions, 3);
  assert.equal(session.questionIds[session.index], "harr-q1");
  assert.equal(canSkip(session), true);

  const originalOrder = [...session.choiceOrders["harr-q1"]];

  const didSkip = skipCurrentQuestion(session, mockQuestions);
  assert.equal(didSkip, true);
  assert.deepEqual(session.questionIds, ["ciulla-q2", "stras-q3", "harr-q1"]);
  assert.equal(session.questionIds[session.index], "ciulla-q2");
  assert.equal(session.attempts.length, 0); // No attempt or score reduction
  assert.deepEqual(session.skippedIds, ["harr-q1"]);

  // Choice order preserved at end of queue
  assert.deepEqual(session.choiceOrders[`2:harr-q1`], originalOrder);
  assert.deepEqual(session.choiceOrders["harr-q1"], originalOrder);
});

test("Skip middle question navigates to next and defers middle question", () => {
  const mockQuestions: QuestionStub[] = [
    { id: "rodak-q1", book: "Rodak", type: "standard", choices: ["A", "B", "C", "D"], correctAnswer: 0 },
    { id: "ciulla-q2", book: "Ciulla", type: "standard", choices: ["A", "B", "C", "D"], correctAnswer: 1 },
    { id: "stras-q3", book: "Strasinger", type: "standard", choices: ["A", "B", "C", "D"], correctAnswer: 2 },
    { id: "harr-q4", book: "Harr", type: "standard", choices: ["A", "B", "C", "D"], correctAnswer: 3 },
  ];

  const session = createSession(mockQuestions, 4);
  // Answer first question
  answerCurrentQuestion(session, true);
  nextQuestion(session);

  assert.equal(session.index, 1);
  assert.equal(session.questionIds[session.index], "ciulla-q2");

  // Skip middle question
  const didSkip = skipCurrentQuestion(session, mockQuestions);
  assert.equal(didSkip, true);
  assert.deepEqual(session.questionIds, ["rodak-q1", "stras-q3", "harr-q4", "ciulla-q2"]);
  assert.equal(session.questionIds[session.index], "stras-q3");
  assert.equal(session.attempts.length, 1); // Only 1 attempt recorded
});

test("Cannot skip final remaining unanswered question (prevents infinite skip loop)", () => {
  const mockQuestions: QuestionStub[] = [
    { id: "q1", book: "Harr", type: "standard", choices: ["A", "B"], correctAnswer: 0 },
    { id: "q2", book: "Ciulla", type: "standard", choices: ["A", "B"], correctAnswer: 1 },
  ];

  const session = createSession(mockQuestions, 2);
  // Answer Q1
  answerCurrentQuestion(session, true);
  nextQuestion(session);

  assert.equal(session.index, 1);
  assert.equal(session.questionIds[session.index], "q2");
  // Only 1 unanswered question remaining
  assert.equal(canSkip(session), false);

  const didSkip = skipCurrentQuestion(session, mockQuestions);
  assert.equal(didSkip, false);
  assert.equal(session.questionIds[session.index], "q2"); // Remains available to answer or exit
});

test("Repeated skipping rotates through unanswered questions until answered", () => {
  const mockQuestions: QuestionStub[] = [
    { id: "q1", book: "Harr", type: "standard", choices: ["A", "B"], correctAnswer: 0 },
    { id: "q2", book: "Ciulla", type: "standard", choices: ["A", "B"], correctAnswer: 1 },
    { id: "q3", book: "Strasinger", type: "standard", choices: ["A", "B"], correctAnswer: 0 },
  ];

  const session = createSession(mockQuestions, 3);
  // Skip q1 -> [q2, q3, q1]
  skipCurrentQuestion(session, mockQuestions);
  assert.equal(session.questionIds[session.index], "q2");

  // Skip q2 -> [q3, q1, q2]
  skipCurrentQuestion(session, mockQuestions);
  assert.equal(session.questionIds[session.index], "q3");

  // Skip q3 -> [q1, q2, q3]
  skipCurrentQuestion(session, mockQuestions);
  assert.equal(session.questionIds[session.index], "q1");

  // Answer q1
  answerCurrentQuestion(session, true);
  nextQuestion(session);
  assert.equal(session.index, 1);
  assert.equal(session.questionIds[session.index], "q2");

  // Answer q2
  answerCurrentQuestion(session, true);
  nextQuestion(session);
  assert.equal(session.index, 2);
  assert.equal(session.questionIds[session.index], "q3");

  // Only q3 remains, cannot skip anymore
  assert.equal(canSkip(session), false);
  answerCurrentQuestion(session, true);
  assert.equal(session.attempts.length, 3);
});

test("Matching and classification questions retain structure and zero shuffle", () => {
  const matchingQ: QuestionStub = {
    id: "stras-matching-1",
    book: "Strasinger",
    type: "matching",
    choices: ["Option A", "Option B", "Option C"],
    correctAnswer: 0,
    disableShuffle: true,
    matching: {
      items: ["Item 1", "Item 2"],
      matches: ["Option A", "Option B"],
    },
  };
  const standardQ: QuestionStub = {
    id: "harr-std-1",
    book: "Harr",
    type: "standard",
    choices: ["A", "B", "C", "D"],
    correctAnswer: 1,
  };

  const session = createSession([matchingQ, standardQ], 2);
  assert.deepEqual(session.choiceOrders["stras-matching-1"], [0, 1, 2]);

  // Skip matching question
  skipCurrentQuestion(session, [matchingQ, standardQ]);
  assert.equal(session.questionIds[session.index], "harr-std-1");

  // Answering standardQ moves to matchingQ at end
  answerCurrentQuestion(session, true);
  nextQuestion(session);
  assert.equal(session.questionIds[session.index], "stras-matching-1");

  // Matching order remains strictly unshuffled
  assert.deepEqual(session.choiceOrders[`1:stras-matching-1`], [0, 1, 2]);
  assert.deepEqual(session.choiceOrders["stras-matching-1"], [0, 1, 2]);
});
