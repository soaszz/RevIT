import "server-only";
import type { ReviewerBook, ReviewerQuestion } from "../../content/reviewerContent";
import { getCanonicalQuestion } from "./answerVerification";

export type StudyQuestionMetadata = {
  subject_id: string;
  subject_name?: string;
  topic_id: string;
  topic_name?: string;
  subtopic?: string;
  difficulty?: string;
  book: ReviewerBook;
  source?: ReviewerQuestion["source"];
};

export async function getStudyQuestionMetadata(questionId: string): Promise<StudyQuestionMetadata> {
  const entry = await getCanonicalQuestion(questionId);
  const q = entry.question as Record<string, unknown>;

  let subjectId = typeof q.subjectId === "string" ? q.subjectId : undefined;
  let topicId = typeof q.topicId === "string" ? q.topicId : undefined;
  const book = entry.book;

  // Authoritative Rodak chapter mappings for all 34 untagged records
  if (book === "Rodak" && !subjectId && typeof q.chapter === "number") {
    subjectId = "rodak-hematology";
    topicId = `rodak-ch${String(q.chapter).padStart(2, "0")}`;
  }

  const result: StudyQuestionMetadata = {
    subject_id: subjectId || "uncategorized",
    topic_id: topicId || "uncategorized",
    book,
  };

  if (typeof q.subjectName === "string") result.subject_name = q.subjectName;
  if (typeof q.topicName === "string") result.topic_name = q.topicName;
  if (typeof q.subtopic === "string") result.subtopic = q.subtopic;
  if (typeof q.difficulty === "string") result.difficulty = q.difficulty;
  if (q.source !== undefined) {
    result.source = q.source as ReviewerQuestion["source"];
  }

  return result;
}
