import type { ReviewerQuestion } from "../content/reviewerContent";
import type { QuestionAttempt, QuestionDifficulty } from "./domain";

export const MASTERY_MINIMUM_UNIQUE_QUESTIONS = 5;
export const RECENT_UNIQUE_WINDOW = 20;
export const RETENTION_DELAY_DAYS = 3;

const METRIC_WEIGHTS = {
  recentUnique: 0.5,
  firstAttempt: 0.25,
  difficultyAdjusted: 0.15,
  retention: 0.1,
} as const;

const DIFFICULTY_WEIGHTS: Record<Exclude<QuestionDifficulty, "Unspecified">, number> = {
  Easy: 0.85,
  Medium: 1,
  Hard: 1.15,
};

export type MasteryStatus = "weak" | "developing" | "strong" | "insufficient";
export type TrendDirection = "up" | "down" | "stable" | "insufficient";

export type MasteryTrend = {
  direction: TrendDirection;
  delta: number | null;
  currentAccuracy: number | null;
  previousAccuracy: number | null;
};

export type TopicMastery = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  mastery: number | null;
  status: MasteryStatus;
  uniqueQuestions: number;
  totalAttempts: number;
  recentUniqueAccuracy: number | null;
  firstAttemptAccuracy: number | null;
  difficultyAdjustedAccuracy: number | null;
  retentionAccuracy: number | null;
  retentionQuestions: number;
  lastReviewedAt: string | null;
  trend: MasteryTrend;
};

export type AccuracyHistoryPoint = {
  label: string;
  accuracy: number;
  questions: number;
};

export type MissedSubtopic = { name: string; incorrectAttempts: number; uniqueQuestions: number };
export type RepeatedWrongQuestion = { questionId: string; incorrectAttempts: number; lastAttemptAt: string };
export type DifficultyPerformance = { difficulty: QuestionDifficulty; accuracy: number; questions: number };

function percentage(correct: number, total: number) {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

function sortedAttempts(attempts: QuestionAttempt[]) {
  return [...attempts].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function latestByQuestion(attempts: QuestionAttempt[]) {
  const latest = new Map<string, QuestionAttempt>();
  for (const attempt of sortedAttempts(attempts)) latest.set(attempt.questionId, attempt);
  return [...latest.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function firstByQuestion(attempts: QuestionAttempt[]) {
  const first = new Map<string, QuestionAttempt>();
  for (const attempt of sortedAttempts(attempts)) {
    if (!first.has(attempt.questionId)) first.set(attempt.questionId, attempt);
  }
  return [...first.values()];
}

function weightedMastery(metrics: Array<{ value: number | null; weight: number }>) {
  const available = metrics.filter((metric): metric is { value: number; weight: number } => metric.value !== null);
  const availableWeight = available.reduce((sum, metric) => sum + metric.weight, 0);
  if (!availableWeight) return null;
  return Math.round(available.reduce((sum, metric) => sum + metric.value * metric.weight, 0) / availableWeight);
}

export function classifyMastery(mastery: number | null, uniqueQuestions: number): MasteryStatus {
  if (mastery === null || uniqueQuestions < MASTERY_MINIMUM_UNIQUE_QUESTIONS) return "insufficient";
  if (mastery < 60) return "weak";
  if (mastery < 80) return "developing";
  return "strong";
}

/**
 * Compares two five-question windows built from the latest attempt for ten
 * different questions. Retries therefore cannot create a trend by themselves.
 */
export function calculateTrend(attempts: QuestionAttempt[]): MasteryTrend {
  const latestUnique = latestByQuestion(attempts);
  if (latestUnique.length < 10) {
    return { direction: "insufficient", delta: null, currentAccuracy: null, previousAccuracy: null };
  }
  const current = latestUnique.slice(0, 5);
  const previous = latestUnique.slice(5, 10);
  const currentAccuracy = percentage(current.filter((attempt) => attempt.correct).length, current.length)!;
  const previousAccuracy = percentage(previous.filter((attempt) => attempt.correct).length, previous.length)!;
  const delta = currentAccuracy - previousAccuracy;
  return {
    direction: Math.abs(delta) < 3 ? "stable" : delta > 0 ? "up" : "down",
    delta,
    currentAccuracy,
    previousAccuracy,
  };
}

export function calculateTopicMastery(attempts: QuestionAttempt[], metadata?: {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
}): TopicMastery {
  const ordered = sortedAttempts(attempts);
  const latestUnique = latestByQuestion(ordered).slice(0, RECENT_UNIQUE_WINDOW);
  const firstAttempts = firstByQuestion(ordered);
  const recentUniqueAccuracy = percentage(latestUnique.filter((attempt) => attempt.correct).length, latestUnique.length);
  const firstAttemptAccuracy = percentage(firstAttempts.filter((attempt) => attempt.correct).length, firstAttempts.length);

  const difficultyAttempts = latestUnique.filter((attempt) => attempt.difficulty !== "Unspecified");
  const difficultyWeightTotal = difficultyAttempts.reduce(
    (sum, attempt) => sum + DIFFICULTY_WEIGHTS[attempt.difficulty as Exclude<QuestionDifficulty, "Unspecified">],
    0,
  );
  const difficultyCorrectWeight = difficultyAttempts.reduce(
    (sum, attempt) => sum + (attempt.correct ? DIFFICULTY_WEIGHTS[attempt.difficulty as Exclude<QuestionDifficulty, "Unspecified">] : 0),
    0,
  );
  const difficultyAdjustedAccuracy = difficultyWeightTotal
    ? Math.round((difficultyCorrectWeight / difficultyWeightTotal) * 100)
    : null;

  const retentionAttempts: QuestionAttempt[] = [];
  const byQuestion = new Map<string, QuestionAttempt[]>();
  for (const attempt of ordered) {
    const current = byQuestion.get(attempt.questionId) ?? [];
    current.push(attempt);
    byQuestion.set(attempt.questionId, current);
  }
  for (const questionAttempts of byQuestion.values()) {
    const firstTime = new Date(questionAttempts[0].timestamp).getTime();
    const delayed = questionAttempts.filter((attempt) => (
      new Date(attempt.timestamp).getTime() - firstTime >= RETENTION_DELAY_DAYS * 24 * 60 * 60 * 1000
    ));
    if (delayed.length) retentionAttempts.push(delayed[delayed.length - 1]);
  }
  const retentionAccuracy = percentage(retentionAttempts.filter((attempt) => attempt.correct).length, retentionAttempts.length);

  const mastery = weightedMastery([
    { value: recentUniqueAccuracy, weight: METRIC_WEIGHTS.recentUnique },
    { value: firstAttemptAccuracy, weight: METRIC_WEIGHTS.firstAttempt },
    { value: difficultyAdjustedAccuracy, weight: METRIC_WEIGHTS.difficultyAdjusted },
    { value: retentionAccuracy, weight: METRIC_WEIGHTS.retention },
  ]);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const uniqueQuestions = byQuestion.size;

  return {
    topicId: metadata?.topicId ?? first?.topicId ?? "uncategorized",
    topicName: metadata?.topicName ?? first?.topicName ?? "Uncategorized",
    subjectId: metadata?.subjectId ?? first?.subjectId ?? "uncategorized",
    subjectName: metadata?.subjectName ?? first?.subjectName ?? "Uncategorized",
    mastery,
    status: classifyMastery(mastery, uniqueQuestions),
    uniqueQuestions,
    totalAttempts: ordered.length,
    recentUniqueAccuracy,
    firstAttemptAccuracy,
    difficultyAdjustedAccuracy,
    retentionAccuracy,
    retentionQuestions: retentionAttempts.length,
    lastReviewedAt: last?.timestamp ?? null,
    trend: calculateTrend(ordered),
  };
}

export function buildAccuracyHistory(attempts: QuestionAttempt[], weeks = 6): AccuracyHistoryPoint[] {
  const now = attempts.length
    ? Math.max(...attempts.map((attempt) => new Date(attempt.timestamp).getTime()))
    : Date.now();
  const result: AccuracyHistoryPoint[] = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const end = new Date(now - offset * 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const unique = latestByQuestion(attempts.filter((attempt) => {
      const value = new Date(attempt.timestamp).getTime();
      return value > start.getTime() && value <= end.getTime();
    }));
    result.push({
      label: end.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      accuracy: percentage(unique.filter((attempt) => attempt.correct).length, unique.length) ?? 0,
      questions: unique.length,
    });
  }
  return result;
}

export function mostMissedSubtopics(attempts: QuestionAttempt[]): MissedSubtopic[] {
  const groups = new Map<string, { incorrectAttempts: number; questions: Set<string> }>();
  for (const attempt of attempts.filter((item) => !item.correct)) {
    const name = attempt.subtopic || "Uncategorized";
    const current = groups.get(name) ?? { incorrectAttempts: 0, questions: new Set<string>() };
    current.incorrectAttempts += 1;
    current.questions.add(attempt.questionId);
    groups.set(name, current);
  }
  return [...groups.entries()].map(([name, value]) => ({
    name,
    incorrectAttempts: value.incorrectAttempts,
    uniqueQuestions: value.questions.size,
  })).sort((a, b) => b.incorrectAttempts - a.incorrectAttempts || a.name.localeCompare(b.name));
}

export function repeatedlyWrongQuestions(attempts: QuestionAttempt[]): RepeatedWrongQuestion[] {
  const groups = new Map<string, { count: number; last: string }>();
  for (const attempt of attempts.filter((item) => !item.correct)) {
    const current = groups.get(attempt.questionId) ?? { count: 0, last: attempt.timestamp };
    current.count += 1;
    if (attempt.timestamp > current.last) current.last = attempt.timestamp;
    groups.set(attempt.questionId, current);
  }
  return [...groups.entries()]
    .filter(([, value]) => value.count >= 2)
    .map(([questionId, value]) => ({ questionId, incorrectAttempts: value.count, lastAttemptAt: value.last }))
    .sort((a, b) => b.incorrectAttempts - a.incorrectAttempts || b.lastAttemptAt.localeCompare(a.lastAttemptAt));
}

export function performanceByDifficulty(attempts: QuestionAttempt[]): DifficultyPerformance[] {
  const latest = latestByQuestion(attempts);
  return (["Easy", "Medium", "Hard", "Unspecified"] as QuestionDifficulty[]).map((difficulty) => {
    const matching = latest.filter((attempt) => attempt.difficulty === difficulty);
    return {
      difficulty,
      accuracy: percentage(matching.filter((attempt) => attempt.correct).length, matching.length) ?? 0,
      questions: matching.length,
    };
  });
}

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }
  return copy;
}

/** Builds a ten-question pool: 6 target, 3 related, and 1 missed when available. */
export function buildWeakTopicQuestionPool(
  topicId: string,
  allQuestions: ReviewerQuestion[],
  attempts: QuestionAttempt[],
  random: () => number = Math.random,
) {
  const targetQuestion = allQuestions.find((question) => question.topicId === topicId);
  const subjectId = targetQuestion?.subjectId;
  const answered = new Set(attempts.map((attempt) => attempt.questionId));
  const latest = new Map<string, QuestionAttempt>();
  for (const attempt of sortedAttempts(attempts)) latest.set(attempt.questionId, attempt);
  const missed = new Set([...latest.values()].filter((attempt) => !attempt.correct).map((attempt) => attempt.questionId));
  const chosen: ReviewerQuestion[] = [];
  const chosenIds = new Set<string>();

  const take = (candidates: ReviewerQuestion[], count: number) => {
    const unused = shuffled(candidates.filter((question) => !answered.has(question.id)), random);
    const practiced = shuffled(candidates.filter((question) => answered.has(question.id)), random);
    for (const question of [...unused, ...practiced]) {
      if (chosen.length >= 10 || count <= 0) break;
      if (chosenIds.has(question.id)) continue;
      chosen.push(question);
      chosenIds.add(question.id);
      count -= 1;
    }
  };

  take(allQuestions.filter((question) => question.topicId === topicId), 6);
  take(allQuestions.filter((question) => question.subjectId === subjectId && question.topicId !== topicId), 3);
  take(allQuestions.filter((question) => missed.has(question.id)), 1);
  take(allQuestions.filter((question) => question.subjectId === subjectId), 10 - chosen.length);
  take(allQuestions, 10 - chosen.length);
  return chosen.map((question) => question.id);
}
