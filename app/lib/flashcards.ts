import type { ReviewerQuestion } from "../content/reviewerContent";

export type Flashcard = {
  id: string;
  subjectId: string;
  topicId: string;
  prompt: string;
  answer: string;
  explanation: string;
};

type FlashcardQuestion = Pick<
  ReviewerQuestion,
  "id" | "subjectId" | "topicId" | "prompt" | "choices" | "correctAnswer" | "officialAnswer" | "explanation"
>;

function cleanAnswerLabel(answer: string) {
  return answer.trim().replace(/^[A-D](?:[.):])\s+(?=[A-Z0-9([])/, "");
}

export function resolveFlashcardAnswer(
  question: Pick<ReviewerQuestion, "choices" | "correctAnswer" | "officialAnswer">,
) {
  const indexedAnswer = question.choices[question.correctAnswer];
  return cleanAnswerLabel(indexedAnswer?.trim() || question.officialAnswer);
}

export function toFlashcard(question: FlashcardQuestion): Flashcard {
  return {
    id: question.id,
    subjectId: question.subjectId,
    topicId: question.topicId,
    prompt: question.prompt,
    answer: resolveFlashcardAnswer(question),
    explanation: question.explanation,
  };
}

export function buildFlashcardDeck(
  questions: readonly FlashcardQuestion[],
  selectedTopicIds: readonly string[],
) {
  const selectedTopics = new Set(selectedTopicIds);
  return questions
    .filter((question) => selectedTopics.has(question.topicId))
    .map(toFlashcard);
}

export function shuffleFlashcards<T>(items: readonly T[], random: () => number = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
