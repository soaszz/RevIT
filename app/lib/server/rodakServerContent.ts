import "server-only";
import rodakRawContent from "../../content/rodakContent.json";
import type { ReviewerBook, ReviewerQuestion, Subject, Topic } from "../../content/reviewerContent";

type RawRodakPayload = {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};

const content = rodakRawContent as RawRodakPayload;

export const rodakSubjects: Subject[] = content.subjects.map((s) => ({
  ...s,
  book: "Rodak" as ReviewerBook,
}));

export const rodakTopics: Topic[] = content.topics.map((t) => ({
  ...t,
  book: "Rodak" as ReviewerBook,
}));

export const rodakQuestions: ReviewerQuestion[] = content.questions.map((q) => ({
  ...q,
  book: "Rodak" as ReviewerBook,
}));

export function getRodakServerPayload(): RawRodakPayload {
  return {
    subjects: rodakSubjects,
    topics: rodakTopics,
    questions: rodakQuestions,
  };
}
