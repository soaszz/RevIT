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

/* ==========================================================================
   Universal Grade Engine (Version 1)
   Supports Weighted-Percentage Grading for Any School + Built-in Presets
   ========================================================================== */

export type UniversalCategoryAssessment = {
  id?: string;
  name?: string;
  score: number | null;
  maxScore: number;
};

export type UniversalCategoryInput = {
  id: string;
  name: string;
  weight: number; // percentage (e.g. 20 for 20%)
  position?: number;
  assessments: UniversalCategoryAssessment[];
};

export type UniversalCategorySummary = {
  id: string;
  name: string;
  weight: number;
  totalEarned: number;
  totalPossible: number;
  percentage: number | null;
  contribution: number;
  hasData: boolean;
  assessmentCount: number;
  completedCount: number;
};

export type UniversalGradeSummary = {
  totalConfiguredWeight: number;
  isWeightValid: boolean;
  weightRemaining: number; // 0 if valid, >0 if remaining, <0 if over
  earnedPoints: number; // secured so far towards 100%
  completedWeight: number; // sum of weights with recorded data
  currentPerformance: number | null; // normalized performance on completed work (0-100%)
  maxPossible: number; // max achievable final grade
  complete: boolean; // all categories have data and weight is 100%
  passingGrade: number;
  status: "Passing secured" | "On track" | "Needs attention" | "Mathematically impossible" | "Insufficient data";
  categorySummaries: UniversalCategorySummary[];
};

/**
 * Calculates category grade by aggregating points within the category:
 * sum(scores) / sum(maxScores)
 */
export function calculateCategorySummary(category: UniversalCategoryInput): UniversalCategorySummary {
  let totalEarned = 0;
  let totalPossible = 0;
  let completedCount = 0;

  for (const assessment of category.assessments) {
    if (assessment.score !== null && !Number.isNaN(assessment.score) && assessment.maxScore > 0) {
      const boundedScore = Math.max(0, Math.min(assessment.maxScore, assessment.score));
      totalEarned += boundedScore;
      totalPossible += assessment.maxScore;
      completedCount++;
    }
  }

  const hasData = completedCount > 0 && totalPossible > 0;
  const percentage = hasData ? (totalEarned / totalPossible) * 100 : null;
  const contribution = percentage !== null ? (percentage / 100) * category.weight : 0;

  return {
    id: category.id,
    name: category.name,
    weight: category.weight,
    totalEarned,
    totalPossible,
    percentage,
    contribution,
    hasData,
    assessmentCount: category.assessments.length,
    completedCount,
  };
}

/**
 * Universal Grade Engine for weighted-percentage subjects.
 * Calculates category performance, overall earned points, and projected status.
 */
export function calculateUniversalGrade(
  categories: UniversalCategoryInput[],
  passingGrade = 75,
): UniversalGradeSummary {
  const categorySummaries = categories.map(calculateCategorySummary);
  const totalConfiguredWeight = categories.reduce((sum, cat) => sum + cat.weight, 0);
  const isWeightValid = Math.abs(totalConfiguredWeight - 100) < 0.05;
  const weightRemaining = 100 - totalConfiguredWeight;

  let earnedPoints = 0;
  let completedWeight = 0;
  let allCategoriesHaveData = categorySummaries.length > 0;

  for (const summary of categorySummaries) {
    if (summary.hasData) {
      earnedPoints += summary.contribution;
      completedWeight += summary.weight;
    } else {
      allCategoriesHaveData = false;
    }
  }

  const currentPerformance = completedWeight > 0 ? (earnedPoints / completedWeight) * 100 : null;
  const uncompletedWeight = Math.max(0, 100 - completedWeight);
  const maxPossible = Math.min(100, earnedPoints + uncompletedWeight);
  const complete = isWeightValid && allCategoriesHaveData && Math.abs(completedWeight - 100) < 0.05;

  let status: UniversalGradeSummary["status"] = "Insufficient data";
  if (completedWeight === 0) {
    status = "Insufficient data";
  } else if (earnedPoints >= passingGrade) {
    status = "Passing secured";
  } else if (isWeightValid && maxPossible < passingGrade) {
    status = "Mathematically impossible";
  } else {
    const requiredAverage = uncompletedWeight > 0
      ? ((passingGrade - earnedPoints) / uncompletedWeight) * 100
      : Number.POSITIVE_INFINITY;
    if (requiredAverage <= passingGrade) {
      status = "On track";
    } else if (requiredAverage <= 100) {
      status = "Needs attention";
    } else {
      status = "Mathematically impossible";
    }
  }

  return {
    totalConfiguredWeight,
    isWeightValid,
    weightRemaining,
    earnedPoints,
    completedWeight,
    currentPerformance,
    maxPossible,
    complete,
    passingGrade,
    status,
    categorySummaries,
  };
}

/**
 * Target simulator: calculates the score needed on a remaining category to reach a target final grade.
 */
export function simulateUniversalTarget(
  categories: UniversalCategoryInput[],
  targetCategoryId: string,
  targetGrade: number,
  laterAverage = 75,
) {
  const summary = calculateUniversalGrade(categories, targetGrade);
  const targetCategory = categories.find((c) => c.id === targetCategoryId);
  if (!targetCategory || targetCategory.weight <= 0) return null;

  const targetSummary = summary.categorySummaries.find((c) => c.id === targetCategoryId);
  const targetCategoryWeight = targetCategory.weight;

  // Other completed categories contribute their earned points
  const otherEarnedPoints = summary.categorySummaries.reduce((sum, c) => {
    return c.id !== targetCategoryId && c.hasData ? sum + c.contribution : sum;
  }, 0);

  // Other uncompleted categories assume laterAverage
  const otherUncompletedWeight = summary.categorySummaries.reduce((sum, c) => {
    return c.id !== targetCategoryId && !c.hasData ? sum + c.weight : sum;
  }, 0);

  const otherAssumedContribution = (otherUncompletedWeight * laterAverage) / 100;
  const neededFromTarget = targetGrade - otherEarnedPoints - otherAssumedContribution;
  const requiredPercentage = (neededFromTarget / targetCategoryWeight) * 100;

  // Check mathematical limits
  const maxAchievable = otherEarnedPoints + targetCategoryWeight + otherUncompletedWeight;
  const alreadySecured = summary.earnedPoints >= targetGrade;
  const achievable = requiredPercentage <= 100 && maxAchievable >= targetGrade;

  let explanation = "";
  if (alreadySecured) {
    explanation = `You have already secured at least a ${targetGrade}% final grade based on recorded grades.`;
  } else if (!achievable) {
    explanation = `Target of ${targetGrade}% is not reachable. Maximum achievable final grade with remaining work is ${maxAchievable.toFixed(1)}%.`;
  } else if (requiredPercentage <= 0) {
    explanation = `Target of ${targetGrade}% is already reachable even with 0% on ${targetCategory.name} (assuming ${laterAverage}% on other remaining work).`;
  } else {
    explanation = `You need ${requiredPercentage.toFixed(1)}% on ${targetCategory.name} (assuming ${laterAverage}% on other remaining assessments) to reach ${targetGrade}%.`;
  }

  return {
    targetCategoryId,
    targetCategoryName: targetCategory.name,
    targetCategoryWeight,
    targetGrade,
    laterAverage,
    requiredPercentage,
    achievable,
    alreadySecured,
    maxAchievable,
    explanation,
  };
}

/**
 * What-If simulator: calculates projected final grade given a hypothetical score on a category.
 */
export function simulateUniversalWhatIf(
  categories: UniversalCategoryInput[],
  targetCategoryId: string,
  hypotheticalPercentage: number,
  passingGrade = 75,
) {
  const boundedPercentage = Math.max(0, Math.min(100, hypotheticalPercentage));
  const targetCategory = categories.find((c) => c.id === targetCategoryId);
  if (!targetCategory) return null;

  // Other completed categories contribute their current points
  const otherEarnedPoints = categories.reduce((sum, cat) => {
    if (cat.id === targetCategoryId) return sum;
    const catSum = calculateCategorySummary(cat);
    return sum + catSum.contribution;
  }, 0);

  const hypotheticalContribution = (boundedPercentage / 100) * targetCategory.weight;
  const projectedEarnedPoints = otherEarnedPoints + hypotheticalContribution;

  // Generate quick comparison ladder
  const ladderSteps = [65, 70, 75, 80, 85, 90, 95, 100];
  const ladder = ladderSteps.map((step) => {
    const stepContribution = (step / 100) * targetCategory.weight;
    const finalGrade = otherEarnedPoints + stepContribution;
    return {
      scorePercentage: step,
      projectedFinal: finalGrade,
      isPassing: finalGrade >= passingGrade,
    };
  });

  return {
    targetCategoryId,
    targetCategoryName: targetCategory.name,
    targetCategoryWeight: targetCategory.weight,
    hypotheticalPercentage: boundedPercentage,
    hypotheticalContribution,
    projectedEarnedPoints,
    isPassing: projectedEarnedPoints >= passingGrade,
    ladder,
  };
}

/**
 * Adapter converting NU MOA MTAP 1 GradeRecord values to UniversalCategoryInput[]
 * Enables NU MOA MTAP 1 subjects to use the exact same calculation & simulation engine.
 */
export function nuSubjectToUniversalCategories(values: GradeValues): UniversalCategoryInput[] {
  return GRADE_FIELDS.map((field) => ({
    id: field.key,
    name: field.label,
    weight: field.weight * 100, // convert 0.1 -> 10%
    assessments: [
      {
        id: `${field.key}-assessment`,
        name: field.label,
        score: values[field.key],
        maxScore: field.max,
      },
    ],
  }));
}
