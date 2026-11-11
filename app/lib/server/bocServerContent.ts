import "server-only";
import { readPrivateReviewerSource } from "./privateReviewerSource";
const rawContent = JSON.parse(readPrivateReviewerSource("app/content/bocContent.json").toString("utf8"));
import type { ReviewerQuestion, Subject, Topic } from "../../content/reviewerContent";

export const bocSubjects = rawContent.subjects as Subject[];
export const bocTopics = rawContent.topics as Topic[];
export const bocQuestions = rawContent.questions as ReviewerQuestion[];

export function getBocServerPayload() {
  return { subjects: bocSubjects, topics: bocTopics, questions: bocQuestions };
}
