import "server-only";
import { readPrivateReviewerSource } from "./privateReviewerSource";
const rawContent = JSON.parse(readPrivateReviewerSource("app/content/elsevierContent.json").toString("utf8"));
import type { ReviewerQuestion, Subject, Topic } from "../../content/reviewerContent";

export const elsevierSubjects = rawContent.subjects as Subject[];
export const elsevierTopics = rawContent.topics as Topic[];
export const elsevierQuestions = rawContent.questions as ReviewerQuestion[];

export function getElsevierServerPayload() {
  return { subjects: elsevierSubjects, topics: elsevierTopics, questions: elsevierQuestions };
}
