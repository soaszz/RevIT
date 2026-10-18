// IDs only: keep premium question content and answer keys on the server.
// Regression tests keep this list and the SQL allowlist aligned with the datasets.
export const MATCHING_QUESTION_IDS = [
  "rodak-ch12-06",
  "rodak-ch12-10",
  "strasinger7-ch01-q032",
  "strasinger7-ch04-q018",
  "strasinger7-ch06-q010",
  "strasinger7-ch06-q031",
  "strasinger7-ch07-q047",
  "strasinger7-ch07-q048",
  "strasinger7-ch07-q049",
  "strasinger7-ch07-q050",
  "strasinger7-ch09-q016",
  "strasinger7-ch09-q027",
  "strasinger7-ch10-q007",
  "strasinger7-ch12-q005",
  "strasinger7-ch13-q007",
  "strasinger7-ch15-q008",
] as const;

const matchingIds = new Set<string>(MATCHING_QUESTION_IDS);

export function normalizeCloudSelectedAnswer(questionId: string, selectedAnswer: number | null): number | null {
  return matchingIds.has(questionId) ? null : selectedAnswer;
}
