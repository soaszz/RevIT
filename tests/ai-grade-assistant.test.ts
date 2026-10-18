import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDeterministicGradeGuidance,
  detectGradeIntent,
  buildVerifiedAcademicContext,
  DEFAULT_AI_ACADEMIC_PERMISSIONS,
  type AiAcademicPermissionState,
} from "../app/lib/aiGradeAssistant";
import type { CustomGradebook, GradeRecord } from "../app/lib/domain";

test("Intent Detection: identifies grade, passing, and score inquiries", () => {
  const customNames = ["Clinical Parasitology", "Advanced Chemistry"];

  const res1 = detectGradeIntent("What grade do I need in finals to pass Clinical Chemistry?", customNames);
  assert.equal(res1.isGradeQuery, true);
  assert.equal(res1.detectedSubject, "Clinical Chemistry");

  const res2 = detectGradeIntent("What is my current average in Hema?", customNames);
  assert.equal(res2.isGradeQuery, true);
  assert.equal(res2.detectedSubject, "Hematology");

  const res3 = detectGradeIntent("Can I still reach 85 in Advanced Chemistry?", customNames);
  assert.equal(res3.isGradeQuery, true);
  assert.equal(res3.detectedSubject, "Advanced Chemistry");
  assert.equal(res3.targetGrade, 85);

  const res4 = detectGradeIntent("Explain the principle of Gram staining in microbiology");
  assert.equal(res4.isGradeQuery, false);
});

test("Deterministic Calculation: MTAP 1 Pre-Test, Post-Test, and Comprehensive Exam", () => {
  // pre_test (10%, max 50): 40 -> 80% score -> 8.0 pts
  // post_test (15%, max 70): 56 -> 80% score -> 12.0 pts
  // comprehensive (25%, max 100): 80 -> 80% score -> 20.0 pts
  // written_revalida (25%, max 100): 80 -> 80% score -> 20.0 pts
  // oral_revalida (25%, max 100): null -> uncompleted
  const record: GradeRecord = {
    subject: "Clinical Chemistry",
    pre_test: 40,
    post_test: 56,
    comprehensive: 80,
    written_revalida: 80,
    oral_revalida: null,
  };
  // Earned points = 8.0 + 12.0 + 20.0 + 20.0 = 60.0 secured points over 75% completed weight
  // Target = 75%
  // Needed from Oral Revalida: (75 - 60.0) / 0.25 = 60.0%

  const guidance = computeDeterministicGradeGuidance({
    querySubject: "Clinical Chemistry",
    grades: [record],
    customGradebooks: [],
    requestedTarget: 75,
  });

  assert.ok(guidance);
  assert.equal(guidance.subjectName, "Clinical Chemistry");
  assert.equal(guidance.status, "achievable");
  assert.equal(guidance.completedWeight, 75);
  assert.equal(guidance.remainingWeight, 25);
  assert.equal(guidance.currentEarnedPoints, 60);
  assert.ok(guidance.requiredScorePercentage !== undefined);
  assert.equal(Math.round(guidance.requiredScorePercentage * 10) / 10, 60);
});

test("Deterministic Calculation: Custom Gradebook weighted category target simulation", () => {
  const customBook: CustomGradebook = {
    id: "cb-1",
    userId: "user-1",
    name: "Medical Parasitology",
    subjectCode: "MED-301",
    templateType: "custom",
    passingGrade: 75,
    position: 0,
    categories: [
      {
        id: "cat-quizzes",
        gradebookId: "cb-1",
        name: "Quizzes",
        weight: 30,
        position: 0,
        assessments: [
          { id: "q1", categoryId: "cat-quizzes", name: "Quiz 1", score: 80, maxScore: 100, position: 0 },
        ],
      },
      {
        id: "cat-midterm",
        gradebookId: "cb-1",
        name: "Midterm Exam",
        weight: 30,
        position: 1,
        assessments: [
          { id: "m1", categoryId: "cat-midterm", name: "Midterm", score: 85, maxScore: 100, position: 0 },
        ],
      },
      {
        id: "cat-finals",
        gradebookId: "cb-1",
        name: "Final Examination",
        weight: 40,
        position: 2,
        assessments: [
          { id: "f1", categoryId: "cat-finals", name: "Final Exam", score: null, maxScore: 100, position: 0 },
        ],
      },
    ],
  };

  // Quizzes: 80% * 30% = 24.0
  // Midterm: 85% * 30% = 25.5
  // Total earned: 49.5 points secured out of 60% completed weight
  // Target passing: 75%
  // Required in Finals: (75 - 49.5) / 0.40 = 25.5 / 0.40 = 63.75% -> 63.8%

  const guidance = computeDeterministicGradeGuidance({
    querySubject: "Medical Parasitology",
    grades: [],
    customGradebooks: [customBook],
    requestedTarget: 75,
  });

  assert.ok(guidance);
  assert.equal(guidance.status, "achievable");
  assert.equal(guidance.completedWeight, 60);
  assert.equal(guidance.remainingWeight, 40);
  assert.equal(guidance.currentEarnedPoints, 49.5);
  assert.ok(guidance.requiredScorePercentage !== undefined);
  assert.ok(Math.abs(guidance.requiredScorePercentage - 63.75) < 0.01);
});

test("Calculation Edge Case: Mathematically impossible target (> 100% required)", () => {
  const customBook: CustomGradebook = {
    id: "cb-2",
    userId: "user-1",
    name: "Biochemistry",
    subjectCode: "BIO-101",
    templateType: "custom",
    passingGrade: 75,
    position: 0,
    categories: [
      {
        id: "c1",
        gradebookId: "cb-2",
        name: "Prelim",
        weight: 40,
        position: 0,
        assessments: [
          { id: "a1", categoryId: "c1", name: "Prelim", score: 30, maxScore: 100, position: 0 }, // 30% * 40% = 12 points
        ],
      },
      {
        id: "c2",
        gradebookId: "cb-2",
        name: "Midterm",
        weight: 30,
        position: 1,
        assessments: [
          { id: "a2", categoryId: "c2", name: "Midterm", score: 20, maxScore: 100, position: 0 }, // 20% * 30% = 6 points
        ],
      },
      {
        id: "c3",
        gradebookId: "cb-2",
        name: "Finals",
        weight: 30,
        position: 2,
        assessments: [
          { id: "a3", categoryId: "c3", name: "Finals", score: null, maxScore: 100, position: 0 },
        ],
      },
    ],
  };

  // Earned points: 12 + 6 = 18 points.
  // Remaining weight: 30%.
  // Max possible grade if finals is 100%: 18 + 30 = 48%.
  // Passing grade: 75%. 48% < 75% -> Mathematically impossible!

  const guidance = computeDeterministicGradeGuidance({
    querySubject: "Biochemistry",
    grades: [],
    customGradebooks: [customBook],
    requestedTarget: 75,
  });

  assert.ok(guidance);
  assert.equal(guidance.status, "impossible");
  assert.equal(guidance.maxAchievableGrade, 48);
  assert.match(guidance.explanation, /impossible/i);
});

test("Calculation Edge Case: Target already secured (0% required in remaining assessment)", () => {
  const customBook: CustomGradebook = {
    id: "cb-3",
    userId: "user-1",
    name: "Immunology",
    subjectCode: "IMM-201",
    templateType: "custom",
    passingGrade: 75,
    position: 0,
    categories: [
      {
        id: "c1",
        gradebookId: "cb-3",
        name: "Lectures & Quizzes",
        weight: 60,
        position: 0,
        assessments: [
          { id: "a1", categoryId: "c1", name: "Exam", score: 95, maxScore: 100, position: 0 }, // 95% * 60% = 57.0
        ],
      },
      {
        id: "c2",
        gradebookId: "cb-3",
        name: "Midterm",
        weight: 20,
        position: 1,
        assessments: [
          { id: "a2", categoryId: "c2", name: "Midterm", score: 95, maxScore: 100, position: 0 }, // 95% * 20% = 19.0
        ],
      },
      {
        id: "c3",
        gradebookId: "cb-3",
        name: "Final Exam",
        weight: 20,
        position: 2,
        assessments: [
          { id: "a3", categoryId: "c3", name: "Finals", score: null, maxScore: 100, position: 0 },
        ],
      },
    ],
  };

  // Earned points: 57.0 + 19.0 = 76.0 points.
  // 76.0 >= 75.0 passing grade! Passing already secured even if student scores 0 in finals.

  const guidance = computeDeterministicGradeGuidance({
    querySubject: "Immunology",
    grades: [],
    customGradebooks: [customBook],
    requestedTarget: 75,
  });

  assert.ok(guidance);
  assert.equal(guidance.status, "already_secured");
  assert.match(guidance.explanation, /already secured/i);
});

test("Calculation Edge Case: Category weights do not total 100%", () => {
  const customBook: CustomGradebook = {
    id: "cb-4",
    userId: "user-1",
    name: "Histopathology",
    subjectCode: "HIS-101",
    templateType: "custom",
    passingGrade: 75,
    position: 0,
    categories: [
      {
        id: "c1",
        gradebookId: "cb-4",
        name: "Quizzes",
        weight: 30,
        position: 0,
        assessments: [{ id: "a1", categoryId: "c1", name: "Q1", score: 80, maxScore: 100, position: 0 }],
      },
      {
        id: "c2",
        gradebookId: "cb-4",
        name: "Midterm",
        weight: 40,
        position: 1,
        assessments: [{ id: "a2", categoryId: "c2", name: "M1", score: 75, maxScore: 100, position: 0 }],
      },
      // Total weights = 70%, not 100%
    ],
  };

  const guidance = computeDeterministicGradeGuidance({
    querySubject: "Histopathology",
    grades: [],
    customGradebooks: [customBook],
    requestedTarget: 75,
  });

  assert.ok(guidance);
  assert.equal(guidance.isWeightValid, false);
  assert.equal(guidance.totalConfiguredWeight, 70);
  assert.ok(guidance.assumptions.some((a) => a.includes("70% instead of 100%")));
});

test("Privacy & Permission Gating: disabled by default, returns null", () => {
  assert.equal(DEFAULT_AI_ACADEMIC_PERMISSIONS.masterEnabled, false);
  assert.equal(DEFAULT_AI_ACADEMIC_PERMISSIONS.gradesEnabled, false);

  const sampleRecord: GradeRecord = {
    subject: "Clinical Chemistry",
    pre_test: 40,
    post_test: 56,
    comprehensive: 80,
    written_revalida: 80,
    oral_revalida: null,
  };

  const context = buildVerifiedAcademicContext({
    permissions: DEFAULT_AI_ACADEMIC_PERMISSIONS,
    userQuery: "What grade do I need in finals to pass Clinical Chemistry?",
    grades: [sampleRecord],
    customGradebooks: [],
  });

  assert.equal(context, null, "Must return null when permissions are disabled");
});

test("Privacy & Permission Gating: returns minimal context only when opted in and relevant", () => {
  const activePermissions: AiAcademicPermissionState = {
    masterEnabled: true,
    gradesEnabled: true,
    progressEnabled: false,
    weaknessEnabled: false,
    plannerEnabled: false,
    reviewLibraryEnabled: false,
  };

  const sampleRecord: GradeRecord = {
    subject: "Clinical Chemistry",
    pre_test: 40,
    post_test: 56,
    comprehensive: 80,
    written_revalida: 80,
    oral_revalida: null,
  };

  // 1. Unrelated MedTech query -> should not attach grades
  const conceptContext = buildVerifiedAcademicContext({
    permissions: activePermissions,
    userQuery: "Explain the catalase test mechanism for staphylococci",
    grades: [sampleRecord],
    customGradebooks: [],
  });
  assert.equal(conceptContext, null, "Must not attach grades context to unrelated questions");

  // 2. Grade query -> constructs minimal verified context
  const gradeContext = buildVerifiedAcademicContext({
    permissions: activePermissions,
    userQuery: "What grade do I need to pass Clinical Chemistry?",
    grades: [sampleRecord],
    customGradebooks: [],
  });
  assert.ok(gradeContext);
  assert.equal(gradeContext.type, "grades");
  assert.equal(gradeContext.subject, "Clinical Chemistry");
  assert.ok(gradeContext.summaryText.includes("Subject: Clinical Chemistry"));
  assert.ok(gradeContext.summaryText.includes("Deterministic Calculation"));
  // Ensure no sensitive user IDs or raw database metadata exist in summary
  assert.doesNotMatch(gradeContext.summaryText, /user_id|supabase|service_role|token/i);
});
