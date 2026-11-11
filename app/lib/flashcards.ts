import type { QuestionStimulus, ReviewerBook, ReviewerQuestion, SourceTextMarks } from "../content/reviewerContent";

export type Flashcard = {
  id: string;
  subjectId: string;
  topicId: string;
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
  book?: ReviewerBook;
  stimulus?: QuestionStimulus;
  rationaleImages?: QuestionStimulus[];
  rationaleSections?: ReviewerQuestion["rationaleSections"];
  promptAfterReferences?: string;
  questionSections?: ReviewerQuestion["questionSections"];
  choiceTable?: ReviewerQuestion["choiceTable"];
  choiceTables?: ReviewerQuestion["choiceTables"];
  answerTable?: Extract<QuestionStimulus, { kind: "table" }>;
  sourceFormatting?: ReviewerQuestion["sourceFormatting"];
  answerFormatting?: SourceTextMarks;
};

type FlashcardQuestion = Pick<
  ReviewerQuestion,
  "id" | "subjectId" | "topicId" | "prompt" | "choices" | "correctAnswer" | "officialAnswer" | "explanation" | "book" | "matching" | "stimulus" | "rationaleImages" | "rationaleSections" | "promptAfterReferences" | "questionSections" | "choiceTable" | "choiceTables" | "sourceFormatting"
>;

function cleanAnswerLabel(answer: string) {
  return answer.trim().replace(/^[A-D](?:[.):])\s+(?=[A-Z0-9([])/, "");
}

export function resolveFlashcardAnswer(
  question: Pick<ReviewerQuestion, "choices" | "correctAnswer" | "officialAnswer"> & Partial<Pick<ReviewerQuestion, "book" | "sourceFormatting" | "questionSections" | "choiceTables">>,
) {
  const indexedAnswer = question.choices[question.correctAnswer];
  if ((question.book === "Elsevier" || question.book === "BOC") || question.sourceFormatting || question.questionSections || question.choiceTables) return indexedAnswer ?? question.officialAnswer;
  return cleanAnswerLabel(indexedAnswer?.trim() || question.officialAnswer);
}

export function toFlashcard(question: FlashcardQuestion): Flashcard {
  return {
    id: question.id,
    subjectId: question.subjectId,
    topicId: question.topicId,
    prompt: question.matching
      ? `${question.prompt}\n${question.matching.items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : question.prompt,
    choices: question.choices,
    answer: resolveFlashcardAnswer(question),
    explanation: question.explanation,
    book: question.book,
    ...(question.questionSections ? { questionSections: question.questionSections } : {}),
    ...(question.choiceTables ? {
      choiceTables: question.choiceTables,
      answerTable: question.choiceTables[question.correctAnswer] ?? undefined,
    } : {}),
    ...(question.sourceFormatting ? {
      sourceFormatting: question.sourceFormatting,
      answerFormatting: question.sourceFormatting.choices?.[question.correctAnswer],
    } : {}),
    ...((question.book === "Elsevier" || question.book === "BOC") ? {
      stimulus: question.stimulus, rationaleImages: question.rationaleImages,
      rationaleSections: question.rationaleSections, promptAfterReferences: question.promptAfterReferences,
      choiceTable: question.choiceTable,
    } : {}),
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
