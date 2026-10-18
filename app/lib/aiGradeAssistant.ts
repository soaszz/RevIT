import {
  calculateCategorySummary,
  calculateUniversalGrade,
  nuSubjectToUniversalCategories,
  simulateUniversalTarget,
  type UniversalCategoryInput,
  type UniversalGradeSummary,
} from "./gradeCalculator";
import {
  GRADE_FIELDS,
  PASSING_GRADE,
  type CustomGradebook,
  type GradeRecord,
  type GradeSubject,
  type GradeValues,
} from "./domain";

export type AiAcademicPermissionState = {
  masterEnabled: boolean;
  gradesEnabled: boolean;
  progressEnabled: boolean;
  weaknessEnabled: boolean;
  plannerEnabled: boolean;
  reviewLibraryEnabled: boolean;
  consentGivenAt?: string;
};

export const DEFAULT_AI_ACADEMIC_PERMISSIONS: AiAcademicPermissionState = {
  masterEnabled: false,
  gradesEnabled: false,
  progressEnabled: false,
  weaknessEnabled: false,
  plannerEnabled: false,
  reviewLibraryEnabled: false,
};

export type DeterministicGradeResult = {
  subjectName: string;
  source: "custom_gradebook" | "mtap1_preset";
  passingGrade: number;
  targetGrade: number;
  currentEarnedPoints: number;
  completedWeight: number;
  currentAverage: number | null;
  remainingWeight: number;
  targetAssessmentName?: string;
  targetAssessmentWeight?: number;
  requiredScorePercentage?: number;
  maxAchievableGrade: number;
  status: "achievable" | "already_secured" | "impossible" | "needs_attention" | "insufficient_data";
  isWeightValid: boolean;
  totalConfiguredWeight: number;
  explanation: string;
  assumptions: string[];
  components: Array<{
    name: string;
    weight: number;
    score: number | null;
    maxScore?: number;
    contribution: number;
  }>;
};

export type VerifiedAcademicContext = {
  type: "grades";
  subject: string;
  targetGrade: number;
  currentAverage: number | null;
  requiredScore: number | null;
  status: string;
  summaryText: string;
};

const SUBJECT_SYNONYMS: Record<string, string[]> = {
  "Clinical Chemistry": ["clinical chemistry", "chem", "chemistry", "cc"],
  "Hematology": ["hematology", "hema", "heme"],
  "Microbiology": ["microbiology", "micro", "microbio", "bacteriology", "bacterio"],
  "Immunology & Serology": ["immunology", "serology", "is", "immuno"],
  "Immunohematology": ["immunohematology", "blood bank", "blood banking", "bb", "transfusion"],
  "Urinalysis & Other Body Fluids": ["urinalysis", "aubf", "body fluids", "urine"],
  "Parasitology": ["parasitology", "parasite", "para"],
  "Histopathology & MT Laws": ["histopathology", "histo", "histopath", "mt laws", "laws", "ethics"],
};

/**
 * Detects whether a user prompt asks about grades, passing scores, or exam requirements.
 */
export function detectGradeIntent(
  query: string,
  customGradebookNames: string[] = [],
): { isGradeQuery: boolean; detectedSubject?: string; targetGrade?: number } {
  const normalized = query.toLowerCase();

  const targetGrade = extractTargetGrade(normalized);

  const gradeKeywords = [
    "grade",
    "grades",
    "average",
    "score",
    "scores",
    "pass",
    "passing",
    "final",
    "finals",
    "prelim",
    "midterm",
    "target",
    "reach",
    "standing",
    "percentage",
    "what do i need",
    "how much do i need",
    "can i still pass",
    "will i pass",
  ];

  const hasGradeKeyword = gradeKeywords.some((keyword) => normalized.includes(keyword)) || targetGrade !== undefined;
  if (!hasGradeKeyword) {
    return { isGradeQuery: false };
  }

  // Check custom gradebook names first
  for (const name of customGradebookNames) {
    if (normalized.includes(name.toLowerCase())) {
      return {
        isGradeQuery: true,
        detectedSubject: name,
        targetGrade: extractTargetGrade(normalized),
      };
    }
  }

  // Check known MTAP subject synonyms
  for (const [officialName, synonyms] of Object.entries(SUBJECT_SYNONYMS)) {
    for (const synonym of synonyms) {
      const regex = new RegExp(`\\b${synonym}\\b`, "i");
      if (regex.test(normalized)) {
        return {
          isGradeQuery: true,
          detectedSubject: officialName,
          targetGrade: extractTargetGrade(normalized),
        };
      }
    }
  }

  return {
    isGradeQuery: true,
    targetGrade: extractTargetGrade(normalized),
  };
}

function extractTargetGrade(normalizedText: string): number | undefined {
  // Looks for patterns like "to get 80", "target 85", "need 75%", "aim for 90"
  const match = normalizedText.match(/(?:target|get|reach|aim for|at least|score of)\s*(\d{2}(?:\.\d+)?)\s*%?/i);
  if (match) {
    const val = Number.parseFloat(match[1]);
    if (Number.isFinite(val) && val >= 50 && val <= 100) return val;
  }
  return undefined;
}

/**
 * Deterministically computes required final score or remaining assessment score.
 */
export function computeDeterministicGradeGuidance(params: {
  querySubject?: string;
  grades: GradeRecord[];
  customGradebooks: CustomGradebook[];
  requestedTarget?: number;
}): DeterministicGradeResult | null {
  const { querySubject, grades, customGradebooks, requestedTarget } = params;

  // 1. Try finding in custom gradebooks
  let matchingCustom: CustomGradebook | undefined;
  if (querySubject) {
    matchingCustom = customGradebooks.find(
      (b) =>
        b.name.toLowerCase() === querySubject.toLowerCase() ||
        (b.subjectCode && b.subjectCode.toLowerCase() === querySubject.toLowerCase()),
    );
  }
  if (!matchingCustom && customGradebooks.length === 1 && !querySubject) {
    matchingCustom = customGradebooks[0];
  }

  if (matchingCustom) {
    return analyzeCustomGradebook(matchingCustom, requestedTarget);
  }

  // 2. Try finding in MTAP 1 predefined grade records
  let matchingRecord: GradeRecord | undefined;
  if (querySubject) {
    matchingRecord = grades.find((r) => r.subject.toLowerCase() === querySubject.toLowerCase());
  }
  if (!matchingRecord && grades.length === 1 && !querySubject) {
    matchingRecord = grades[0];
  }

  if (matchingRecord) {
    return analyzeMtapRecord(matchingRecord, requestedTarget);
  }

  // If subject specified but not found, return null so caller knows no data was found
  return null;
}

function analyzeCustomGradebook(
  gradebook: CustomGradebook,
  requestedTarget?: number,
): DeterministicGradeResult {
  const passingGrade = gradebook.passingGrade || PASSING_GRADE;
  const targetGrade = requestedTarget ?? passingGrade;
  const categories = gradebook.categories as UniversalCategoryInput[];

  const summary: UniversalGradeSummary = calculateUniversalGrade(categories, targetGrade);

  // Identify uncompleted category with the largest weight or last category (usually Finals)
  const uncompletedCats = categories.filter((cat) => {
    const catSum = calculateCategorySummary(cat);
    return !catSum.hasData;
  });

  const targetCategory =
    uncompletedCats.find((c) => /final/i.test(c.name)) ??
    uncompletedCats[uncompletedCats.length - 1] ??
    categories[categories.length - 1];

  let simResult = null;
  if (targetCategory) {
    simResult = simulateUniversalTarget(categories, targetCategory.id, targetGrade, 75);
  }

  const components = categories.map((cat) => {
    const catSum = calculateCategorySummary(cat);
    return {
      name: cat.name,
      weight: cat.weight,
      score: catSum.percentage,
      contribution: catSum.contribution,
    };
  });

  const remainingWeight = Math.max(0, 100 - summary.completedWeight);
  const assumptions: string[] = [];

  if (!summary.isWeightValid) {
    assumptions.push(
      `Gradebook category weights total ${summary.totalConfiguredWeight}% instead of 100%. Calculations use configured weights.`,
    );
  }

  let status: DeterministicGradeResult["status"] = "insufficient_data";
  let explanation = "";

  if (summary.completedWeight === 0) {
    status = "insufficient_data";
    explanation = `No scores have been recorded yet for ${gradebook.name}. Enter prelim, quiz, or midterm scores to calculate requirements.`;
  } else if (summary.earnedPoints >= targetGrade) {
    status = "already_secured";
    explanation = `Target of ${targetGrade}% is already secured with ${summary.earnedPoints.toFixed(1)} earned points across recorded categories.`;
  } else if (summary.isWeightValid && summary.maxPossible < targetGrade) {
    status = "impossible";
    explanation = `Target of ${targetGrade}% is mathematically impossible under current weights. The maximum achievable final grade is ${summary.maxPossible.toFixed(1)}%.`;
  } else if (simResult && simResult.achievable) {
    status = "achievable";
    explanation = `Based on recorded scores, you need at least ${simResult.requiredPercentage.toFixed(1)}% on ${simResult.targetCategoryName} (${simResult.targetCategoryWeight}% weight) to reach a final grade of ${targetGrade}%.`;
  } else {
    status = "needs_attention";
    explanation = `Current performance is ${summary.currentPerformance ? summary.currentPerformance.toFixed(1) : 0}% with ${remainingWeight}% weight remaining. Aim high on remaining assessments to pass.`;
  }

  return {
    subjectName: gradebook.name,
    source: "custom_gradebook",
    passingGrade,
    targetGrade,
    currentEarnedPoints: summary.earnedPoints,
    completedWeight: summary.completedWeight,
    currentAverage: summary.currentPerformance,
    remainingWeight,
    targetAssessmentName: targetCategory?.name,
    targetAssessmentWeight: targetCategory?.weight,
    requiredScorePercentage: simResult?.requiredPercentage,
    maxAchievableGrade: summary.maxPossible,
    status,
    isWeightValid: summary.isWeightValid,
    totalConfiguredWeight: summary.totalConfiguredWeight,
    explanation,
    assumptions,
    components,
  };
}

function analyzeMtapRecord(
  record: GradeRecord,
  requestedTarget?: number,
): DeterministicGradeResult {
  const passingGrade = PASSING_GRADE;
  const targetGrade = requestedTarget ?? passingGrade;
  const categories = nuSubjectToUniversalCategories(record);

  const summary = calculateUniversalGrade(categories, targetGrade);

  // MTAP 1 final assessment field is oral_revalida or comprehensive
  const finalCategory = categories.find((c) => c.id === "oral_revalida") ?? categories[categories.length - 1];
  const simResult = finalCategory
    ? simulateUniversalTarget(categories, finalCategory.id, targetGrade, 75)
    : null;

  const components = GRADE_FIELDS.map((field) => {
    const raw = record[field.key];
    const percentage = raw !== null && field.max > 0 ? (raw / field.max) * 100 : null;
    const contribution = percentage !== null ? (percentage / 100) * (field.weight * 100) : 0;
    return {
      name: field.label,
      weight: field.weight * 100,
      score: raw,
      maxScore: field.max,
      contribution,
    };
  });

  const remainingWeight = Math.max(0, 100 - summary.completedWeight);
  const assumptions: string[] = [
    "MTAP 1 standard grading rules applied (weights: Pre-Test 10%, Post-Test 15%, Comprehensive Exam 25%, Written Revalida 25%, Oral Revalida 25%).",
  ];

  let status: DeterministicGradeResult["status"] = "insufficient_data";
  let explanation = "";

  if (summary.completedWeight === 0) {
    status = "insufficient_data";
    explanation = `No scores are recorded yet for ${record.subject}.`;
  } else if (summary.earnedPoints >= targetGrade) {
    status = "already_secured";
    explanation = `Passing target of ${targetGrade}% is already secured with ${summary.earnedPoints.toFixed(1)} earned points.`;
  } else if (summary.maxPossible < targetGrade) {
    status = "impossible";
    explanation = `Target of ${targetGrade}% is mathematically impossible with remaining assessments. Max possible grade is ${summary.maxPossible.toFixed(1)}%.`;
  } else if (simResult && simResult.achievable) {
    status = "achievable";
    explanation = `Based on your recorded grades, you need at least ${simResult.requiredPercentage.toFixed(1)}% on ${simResult.targetCategoryName} (${simResult.targetCategoryWeight}% weight) to achieve an overall grade of ${targetGrade}%.`;
  } else {
    status = "needs_attention";
    explanation = `Current performance is ${summary.currentPerformance ? summary.currentPerformance.toFixed(1) : 0}%. Aim for highest possible scores on remaining assessments.`;
  }

  return {
    subjectName: record.subject,
    source: "mtap1_preset",
    passingGrade,
    targetGrade,
    currentEarnedPoints: summary.earnedPoints,
    completedWeight: summary.completedWeight,
    currentAverage: summary.currentPerformance,
    remainingWeight,
    targetAssessmentName: finalCategory?.name,
    targetAssessmentWeight: finalCategory?.weight,
    requiredScorePercentage: simResult?.requiredPercentage,
    maxAchievableGrade: summary.maxPossible,
    status,
    isWeightValid: true,
    totalConfiguredWeight: 100,
    explanation,
    assumptions,
    components,
  };
}

/**
 * Builds the secure, data-minimized context summary to send to RevIT AI.
 * Returns null if permissions disabled or no relevant data found.
 */
export function buildVerifiedAcademicContext(params: {
  permissions: AiAcademicPermissionState;
  userQuery: string;
  grades: GradeRecord[];
  customGradebooks: CustomGradebook[];
}): VerifiedAcademicContext | null {
  // Enforce explicit opt-in permissions
  if (!params.permissions.masterEnabled || !params.permissions.gradesEnabled) {
    return null;
  }

  const customNames = params.customGradebooks.map((b) => b.name);
  const intent = detectGradeIntent(params.userQuery, customNames);
  if (!intent.isGradeQuery) {
    return null;
  }

  const guidance = computeDeterministicGradeGuidance({
    querySubject: intent.detectedSubject,
    grades: params.grades,
    customGradebooks: params.customGradebooks,
    requestedTarget: intent.targetGrade,
  });

  if (!guidance) {
    // If no specific subject matched, return a general high-level summary of available subjects
    const available = [
      ...params.customGradebooks.map((b) => b.name),
      ...params.grades.filter((g) => Object.values(g).some((v) => typeof v === "number" && v > 0)).map((g) => g.subject),
    ];

    if (available.length === 0) return null;

    return {
      type: "grades",
      subject: "All Subjects",
      targetGrade: PASSING_GRADE,
      currentAverage: null,
      requiredScore: null,
      status: "multiple_subjects",
      summaryText: `Student has active gradebook subjects: ${available.join(", ")}. If the student asks about a specific subject, prompt them to name it.`,
    };
  }

  const componentSummary = guidance.components
    .map((c) => `${c.name} (${c.weight}% weight): ${c.score !== null ? `${c.score.toFixed(1)}%` : "Not yet taken"}`)
    .join("; ");

  const summaryText = [
    `Subject: ${guidance.subjectName}`,
    `Passing Standard: ${guidance.passingGrade}% | Target: ${guidance.targetGrade}%`,
    `Current Progress: ${guidance.completedWeight}% completed with ${guidance.currentEarnedPoints.toFixed(1)} secured points (${guidance.currentAverage !== null ? `${guidance.currentAverage.toFixed(1)}% current average` : "N/A"}).`,
    `Components: ${componentSummary}`,
    guidance.targetAssessmentName && guidance.requiredScorePercentage !== undefined
      ? `Required on ${guidance.targetAssessmentName} (${guidance.targetAssessmentWeight}% weight): ${guidance.requiredScorePercentage.toFixed(1)}%`
      : null,
    `Maximum achievable final grade: ${guidance.maxAchievableGrade.toFixed(1)}%`,
    `Deterministic Status: ${guidance.status}`,
    `Deterministic Calculation: ${guidance.explanation}`,
    guidance.assumptions.length > 0 ? `Assumptions: ${guidance.assumptions.join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    type: "grades",
    subject: guidance.subjectName,
    targetGrade: guidance.targetGrade,
    currentAverage: guidance.currentAverage,
    requiredScore: guidance.requiredScorePercentage ?? null,
    status: guidance.status,
    summaryText,
  };
}
