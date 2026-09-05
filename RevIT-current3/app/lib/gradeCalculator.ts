import {
  GRADE_FIELDS,
  GUIDANCE_BOUNDARIES,
  PASSING_GRADE,
  type GradeField,
  type GradeValues,
} from "./domain";

export type GradeSummary = {
  earnedPoints: number;
  completedWeight: number;
  normalizedPerformance: number | null;
  maxPossible: number;
  complete: boolean;
};

export type GuidanceState =
  | "Comfortable"
  | "On track"
  | "Needs improvement"
  | "At risk"
  | "Passing secured"
  | "Mathematically impossible";

export function calculateGrade(values: GradeValues): GradeSummary {
  let earnedPoints = 0;
  let completedWeight = 0;

  for (const field of GRADE_FIELDS) {
    const score = values[field.key];
    if (score === null || Number.isNaN(score)) continue;
    const bounded = Math.min(field.max, Math.max(0, score));
    earnedPoints += (bounded / field.max) * 100 * field.weight;
    completedWeight += field.weight;
  }

  const remainingWeight = Math.max(0, 1 - completedWeight);
  return {
    earnedPoints,
    completedWeight,
    normalizedPerformance: completedWeight > 0 ? earnedPoints / completedWeight : null,
    maxPossible: earnedPoints + remainingWeight * 100,
    complete: completedWeight >= 0.999999,
  };
}

export function classifyGuidance(requiredAverage: number, summary: GradeSummary, target = PASSING_GRADE): GuidanceState {
  if (summary.earnedPoints >= target) return "Passing secured";
  if (summary.maxPossible < target) return "Mathematically impossible";
  if (requiredAverage <= GUIDANCE_BOUNDARIES.comfortable) return "Comfortable";
  if (requiredAverage <= GUIDANCE_BOUNDARIES.onTrack) return "On track";
  if (requiredAverage <= GUIDANCE_BOUNDARIES.needsImprovement) return "Needs improvement";
  return "At risk";
}

export function calculateGuidance(values: GradeValues, target = PASSING_GRADE) {
  const summary = calculateGrade(values);
  const remainingWeight = Math.max(0, 1 - summary.completedWeight);
  const requiredAverage = remainingWeight > 0 ? (target - summary.earnedPoints) / remainingWeight : Number.POSITIVE_INFINITY;
  return {
    ...summary,
    target,
    remainingWeight,
    requiredAverage,
    state: classifyGuidance(requiredAverage, summary, target),
  };
}

export function calculateNextAssessmentTarget(
  values: GradeValues,
  nextField: GradeField,
  target = PASSING_GRADE,
  laterAverage = 75,
) {
  const summary = calculateGrade(values);
  const field = GRADE_FIELDS.find((candidate) => candidate.key === nextField);
  if (!field || values[nextField] !== null) return null;

  const otherRemainingWeight = GRADE_FIELDS.reduce((weight, candidate) => (
    candidate.key !== nextField && values[candidate.key] === null ? weight + candidate.weight : weight
  ), 0);
  const requiredPercentage = (target - summary.earnedPoints - otherRemainingWeight * laterAverage) / field.weight;
  const requiredScore = (requiredPercentage / 100) * field.max;
  return {
    field,
    laterAverage,
    requiredPercentage,
    requiredScore,
    achievable: requiredPercentage <= 100,
    alreadyCovered: requiredPercentage <= 0,
    recommendedScore: Math.min(field.max, Math.max(0, Math.ceil(requiredScore + field.max * 0.05))),
  };
}

export function sanitizeGradeScore(value: string, max: number): number | null {
  if (value.trim() === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.min(max, Math.max(0, score));
}
