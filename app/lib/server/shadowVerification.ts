import "server-only";
import type { ReviewerBook, ReviewerQuestion } from "../../content/reviewerContent";
import { encodeMatchingAnswers, isQuestionAnswerCorrect } from "../matchingQuestion";
import { getCanonicalQuestion, gradeAnswer, type GradingRequest } from "./answerVerification";

export type ShadowVerificationSample = {
  questionId: string;
  response: GradingRequest["response"];
  shuffleMapping?: number[];
  displayedChoiceIndex?: number;
};

export type ShadowComparisonResult = {
  questionId: string;
  book: ReviewerBook;
  questionType: "single_choice" | "matching";
  contentVersion: string;
  localCorrect: boolean;
  serverCorrect: boolean;
  match: boolean;
  timedOut: boolean;
  reason?: string;
};

export type ShadowVerificationSummary = {
  totalEvaluated: number;
  matchedCount: number;
  mismatchCount: number;
  parityRate: number;
  mismatches: Array<{ questionId: string; reason: string }>;
  byBook: Record<string, { total: number; matched: number; mismatches: number }>;
  byType: Record<string, { total: number; matched: number; mismatches: number }>;
};

/**
 * Compares local grader (matchingQuestion.ts) and server canonical grader (answerVerification.ts)
 * for a single synthetic response.
 * Strictly avoids logging answer keys or user data.
 */
export async function compareShadowGrading(sample: ShadowVerificationSample): Promise<ShadowComparisonResult> {
  const canonical = await getCanonicalQuestion(sample.questionId);
  const question = canonical.question as ReviewerQuestion;

  const serverResult = await gradeAnswer({
    questionId: sample.questionId,
    response: sample.response,
  });

  let selectedAnswer: number | null = null;
  if (sample.response.kind === "single_choice") {
    if (sample.shuffleMapping && sample.displayedChoiceIndex !== undefined) {
      selectedAnswer = sample.shuffleMapping[sample.displayedChoiceIndex] ?? null;
    } else {
      selectedAnswer = sample.response.choiceIndex;
    }
  } else if (sample.response.kind === "matching") {
    selectedAnswer = encodeMatchingAnswers(sample.response.selections, question.choices.length);
  } else if (sample.response.kind === "timeout") {
    selectedAnswer = null;
  }

  const localCorrect = isQuestionAnswerCorrect(question, selectedAnswer);
  const serverCorrect = serverResult.isCorrect;
  const match = localCorrect === serverCorrect && serverResult.timedOut === (sample.response.kind === "timeout");

  let reason: string | undefined;
  if (!match) {
    reason = `Parity discrepancy: local=${localCorrect}, server=${serverCorrect}, timedOut=${serverResult.timedOut}`;
  }

  return {
    questionId: sample.questionId,
    book: canonical.book,
    questionType: canonical.questionType,
    contentVersion: canonical.contentVersion,
    localCorrect,
    serverCorrect,
    match,
    timedOut: serverResult.timedOut,
    reason,
  };
}

/**
 * Runs shadow verification across a batch of synthetic samples.
 * Aggregates results into a clean summary with 0 PII and 0 answer leakages.
 */
export async function runShadowVerification(
  samples: ShadowVerificationSample[]
): Promise<ShadowVerificationSummary> {
  const summary: ShadowVerificationSummary = {
    totalEvaluated: 0,
    matchedCount: 0,
    mismatchCount: 0,
    parityRate: 1.0,
    mismatches: [],
    byBook: {},
    byType: {},
  };

  for (const sample of samples) {
    const res = await compareShadowGrading(sample);
    summary.totalEvaluated += 1;

    // Track by book
    if (!summary.byBook[res.book]) {
      summary.byBook[res.book] = { total: 0, matched: 0, mismatches: 0 };
    }
    summary.byBook[res.book].total += 1;

    // Track by type
    if (!summary.byType[res.questionType]) {
      summary.byType[res.questionType] = { total: 0, matched: 0, mismatches: 0 };
    }
    summary.byType[res.questionType].total += 1;

    if (res.match) {
      summary.matchedCount += 1;
      summary.byBook[res.book].matched += 1;
      summary.byType[res.questionType].matched += 1;
    } else {
      summary.mismatchCount += 1;
      summary.byBook[res.book].mismatches += 1;
      summary.byType[res.questionType].mismatches += 1;
      summary.mismatches.push({
        questionId: res.questionId,
        reason: res.reason ?? "Unknown parity mismatch",
      });
    }
  }

  summary.parityRate = summary.totalEvaluated > 0 ? summary.matchedCount / summary.totalEvaluated : 1.0;
  return summary;
}
