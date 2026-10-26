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
    questions: rodakQuestions.map((question) => {
      if (question.subjectId && question.topicId) return question;
      // Some source records provide only a chapter. Resolve runtime identifiers
      // without changing the source records used by canonical answer grading.
      const { chapter } = question as ReviewerQuestion & { chapter?: number };
      const topicId = question.topicId || `rodak-ch${String(chapter).padStart(2, "0")}`;
      const topic = rodakTopics.find((candidate) => candidate.id === topicId);
      if (!topic || (question.subjectId && question.subjectId !== topic.subjectId)) {
        throw new Error(`Unresolved Rodak topic for ${question.id}`);
      }
      return { ...question, subjectId: topic.subjectId, topicId: topic.id };
    }),
  };
}
