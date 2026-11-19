import type { Topic, ReviewerBook } from "../content/reviewerContent";
import type { UnifiedSubject } from "./reviewerLibrary";
import { isQuestionBankPublished } from "./entitlements";

/** Public-safe published catalog only. Catalog visibility never grants question access. */
export function getQuestionBankSummary(subjects: readonly UnifiedSubject[], topics: readonly Topic[], topicCounts: Readonly<Record<string, number>>) {
  const published = new Map(topics.filter((topic) => isQuestionBankPublished(topic.book ?? "Harr") && (topicCounts[topic.id] ?? 0) > 0).map((topic) => [topic.id, topic]));
  const total = [...published.keys()].reduce((sum, id) => sum + topicCounts[id], 0);
  const rows = subjects.flatMap((subject) => {
    const matches = [...published.values()].filter((topic) => subject.topicIds ? subject.topicIds.includes(topic.id) : subject.sourceSubjectIds.includes(topic.subjectId));
    const questionCount = matches.reduce((sum, topic) => sum + topicCounts[topic.id], 0);
    if (!questionCount) return [];
    const books = [...new Set(matches.map((topic): ReviewerBook => topic.book ?? "Harr"))];
    return [{ subject, questionCount, books }];
  });
  return { total, rows };
}
