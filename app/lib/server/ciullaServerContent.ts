import "server-only";
import ciullaRawContent from "../../content/ciullaContent.json";
import type { ReviewerBook, ReviewerQuestion, Subject, Topic } from "../../content/reviewerContent";

type RawCiullaPayload = {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};

const content = ciullaRawContent as RawCiullaPayload;

export const ciullaSubjects: Subject[] = content.subjects.map((s) => ({
  ...s,
  book: "Ciulla" as ReviewerBook,
}));

export const ciullaTopics: Topic[] = content.topics.map((t) => ({
  ...t,
  book: "Ciulla" as ReviewerBook,
}));

export const ciullaQuestions: ReviewerQuestion[] = content.questions.map((q) => ({
  ...q,
  book: "Ciulla" as ReviewerBook,
}));

export function getCiullaServerPayload(): RawCiullaPayload {
  return {
    subjects: ciullaSubjects,
    topics: ciullaTopics,
    questions: ciullaQuestions,
  };
}
