import assert from "node:assert/strict";
import test from "node:test";
import { questions, topics } from "../app/content/reviewerContent";
import {
  buildFlashcardDeck,
  resolveFlashcardAnswer,
  shuffleFlashcards,
  toFlashcard,
} from "../app/lib/flashcards";

test("flashcards resolve the indexed answer as clean text", () => {
  assert.equal(resolveFlashcardAnswer({
    choices: ["A. First", "B. Streptococcus pneumoniae", "C. Third", "D. Fourth"],
    correctAnswer: 1,
    officialAnswer: "B. Streptococcus pneumoniae",
  }), "Streptococcus pneumoniae");

  assert.equal(resolveFlashcardAnswer({
    choices: ["A. castellanii", "Other", "Other", "Other"],
    correctAnswer: 0,
    officialAnswer: "A. castellanii",
  }), "A. castellanii");
});

test("flashcard presentation data cannot expose choices or source metadata", () => {
  const card = toFlashcard(questions[0]);
  assert.deepEqual(Object.keys(card).sort(), [
    "answer",
    "explanation",
    "id",
    "prompt",
    "subjectId",
    "topicId",
  ]);
  assert.equal(card.answer, questions[0].choices[questions[0].correctAnswer]);
  assert.ok(!("choices" in card));
  assert.ok(!("source" in card));
});

test("one, multiple, and all topic selections produce the correct card counts", () => {
  const firstTopicId = topics[0].id;
  const secondTopicId = topics[1].id;
  const firstTopicCount = questions.filter((question) => question.topicId === firstTopicId).length;
  const secondTopicCount = questions.filter((question) => question.topicId === secondTopicId).length;

  assert.equal(buildFlashcardDeck(questions, [firstTopicId]).length, firstTopicCount);
  assert.equal(buildFlashcardDeck(questions, [firstTopicId, secondTopicId]).length, firstTopicCount + secondTopicCount);
  assert.equal(buildFlashcardDeck(questions, topics.map((topic) => topic.id)).length, questions.length);
  assert.equal(buildFlashcardDeck(questions, []).length, 0);
});

test("shuffle changes only temporary order and does not mutate the input", () => {
  const original = ["a", "b", "c", "d"];
  const shuffled = shuffleFlashcards(original, () => 0);
  assert.deepEqual(original, ["a", "b", "c", "d"]);
  assert.deepEqual(shuffled, ["b", "c", "d", "a"]);
  assert.deepEqual([...shuffled].sort(), [...original].sort());
});
