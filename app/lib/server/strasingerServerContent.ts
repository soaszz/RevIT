import "server-only";
import strasingerRawContent from "../../content/strasingerContent.json";
import type { ReviewerBook, ReviewerQuestion, Subject, Topic } from "../../content/reviewerContent";

type RawStrasingerPayload = {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};

const content = strasingerRawContent as RawStrasingerPayload;

export const strasingerSubjects: Subject[] = content.subjects.map((s) => ({
  ...s,
  book: "Strasinger" as ReviewerBook,
}));

export const strasingerTopics: Topic[] = content.topics.map((t) => ({
  ...t,
  book: "Strasinger" as ReviewerBook,
}));

export const strasingerQuestions: ReviewerQuestion[] = content.questions.map((q) => ({
  ...q,
  book: "Strasinger" as ReviewerBook,
}));

export function getStrasingerServerPayload(): RawStrasingerPayload {
  return {
    subjects: strasingerSubjects,
    topics: strasingerTopics,
    questions: strasingerQuestions,
  };
}
