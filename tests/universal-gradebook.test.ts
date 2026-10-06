import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCategorySummary,
  calculateUniversalGrade,
  simulateUniversalTarget,
  simulateUniversalWhatIf,
  nuSubjectToUniversalCategories,
  calculateGrade,
} from "../app/lib/gradeCalculator";
import type { CustomGradeCategory, GradeValues } from "../app/lib/domain";

test("Universal Gradebook: category point aggregation sum(scores)/sum(maxScores)", () => {
  const category: CustomGradeCategory = {
    id: "cat-1",
    gradebookId: "book-1",
    name: "Quizzes",
    weight: 20,
    position: 0,
    assessments: [
      { id: "a1", categoryId: "cat-1", name: "Quiz 1", score: 18, maxScore: 20, position: 0 },
      { id: "a2", categoryId: "cat-1", name: "Quiz 2", score: 42, maxScore: 50, position: 1 },
      { id: "a3", categoryId: "cat-1", name: "Quiz 3", score: 27, maxScore: 30, position: 2 },
    ],
  };

  const summary = calculateCategorySummary(category);
  assert.equal(summary.totalEarned, 87);
  assert.equal(summary.totalPossible, 100);
  assert.equal(summary.percentage, 87.0);
  assert.equal(summary.contribution, 17.4); // 87% of 20%
  assert.equal(summary.hasData, true);
  assert.equal(summary.assessmentCount, 3);
  assert.equal(summary.completedCount, 3);
});

test("Universal Gradebook: missing assessments are treated as not yet graded, not failed (0%)", () => {
  const category: CustomGradeCategory = {
    id: "cat-1",
    gradebookId: "book-1",
    name: "Quizzes",
    weight: 20,
    position: 0,
    assessments: [
      { id: "a1", categoryId: "cat-1", name: "Quiz 1", score: 18, maxScore: 20, position: 0 },
      { id: "a2", categoryId: "cat-1", name: "Quiz 2", score: null, maxScore: 50, position: 1 }, // unentered
    ],
  };

  const summary = calculateCategorySummary(category);
  // Only scored assessment counted for current performance: 18 / 20 = 90%
  assert.equal(summary.totalEarned, 18);
  assert.equal(summary.totalPossible, 20);
  assert.equal(summary.percentage, 90.0);
  assert.equal(summary.contribution, 18.0); // 90% of 20%
  assert.equal(summary.hasData, true);
  assert.equal(summary.assessmentCount, 2);
  assert.equal(summary.completedCount, 1);
});

test("Universal Gradebook: category weight validation", () => {
  // Case A: Exactly 100%
  const validCategories: CustomGradeCategory[] = [
    { id: "c1", gradebookId: "b1", name: "Quizzes", weight: 20, position: 0, assessments: [] },
    { id: "c2", gradebookId: "b1", name: "Lab", weight: 20, position: 1, assessments: [] },
    { id: "c3", gradebookId: "b1", name: "Midterm", weight: 25, position: 2, assessments: [] },
    { id: "c4", gradebookId: "b1", name: "Final", weight: 35, position: 3, assessments: [] },
  ];
  const validRes = calculateUniversalGrade(validCategories, 75);
  assert.equal(validRes.isWeightValid, true);
  assert.equal(validRes.totalConfiguredWeight, 100);
  assert.equal(validRes.weightRemaining, 0);

  // Case B: Incomplete (85%)
  const incompleteCategories: CustomGradeCategory[] = [
    { id: "c1", gradebookId: "b1", name: "Quizzes", weight: 20, position: 0, assessments: [] },
    { id: "c2", gradebookId: "b1", name: "Lab", weight: 20, position: 1, assessments: [] },
    { id: "c3", gradebookId: "b1", name: "Midterm", weight: 25, position: 2, assessments: [] },
    { id: "c4", gradebookId: "b1", name: "Final", weight: 20, position: 3, assessments: [] },
  ];
  const incompleteRes = calculateUniversalGrade(incompleteCategories, 75);
  assert.equal(incompleteRes.isWeightValid, false);
  assert.equal(incompleteRes.totalConfiguredWeight, 85);
  assert.equal(incompleteRes.weightRemaining, 15);
  assert.equal(incompleteRes.complete, false);

  // Case C: Over 100% (105%)
  const overCategories: CustomGradeCategory[] = [
    { id: "c1", gradebookId: "b1", name: "Quizzes", weight: 30, position: 0, assessments: [] },
    { id: "c2", gradebookId: "b1", name: "Lab", weight: 20, position: 1, assessments: [] },
    { id: "c3", gradebookId: "b1", name: "Midterm", weight: 25, position: 2, assessments: [] },
    { id: "c4", gradebookId: "b1", name: "Final", weight: 30, position: 3, assessments: [] },
  ];
  const overRes = calculateUniversalGrade(overCategories, 75);
  assert.equal(overRes.isWeightValid, false);
  assert.equal(overRes.totalConfiguredWeight, 105);
  assert.equal(overRes.weightRemaining, -5);
  assert.equal(overRes.complete, false);
});

test("Universal Gradebook: Current Performance vs Earned Points and Max Possible", () => {
  const categories: CustomGradeCategory[] = [
    {
      id: "c1",
      gradebookId: "b1",
      name: "Quizzes",
      weight: 20,
      position: 0,
      assessments: [{ id: "a1", categoryId: "c1", name: "Quiz 1", score: 85, maxScore: 100, position: 0 }], // 85% * 20 = 17 pts
    },
    {
      id: "c2",
      gradebookId: "b1",
      name: "Lab",
      weight: 20,
      position: 1,
      assessments: [{ id: "a2", categoryId: "c2", name: "Lab 1", score: 90, maxScore: 100, position: 0 }], // 90% * 20 = 18 pts
    },
    {
      id: "c3",
      gradebookId: "b1",
      name: "Midterm",
      weight: 25,
      position: 2,
      assessments: [{ id: "a3", categoryId: "c3", name: "Midterm Exam", score: 78, maxScore: 100, position: 0 }], // 78% * 25 = 19.5 pts
    },
    {
      id: "c4",
      gradebookId: "b1",
      name: "Final",
      weight: 35,
      position: 3,
      assessments: [], // No assessments yet
    },
  ];

  const res = calculateUniversalGrade(categories, 75);
  assert.equal(res.isWeightValid, true);

  // Points earned so far = 17 + 18 + 19.5 = 54.5 pts
  assert.equal(res.earnedPoints, 54.5);

  // Weight recorded so far = 20 + 20 + 25 = 65%
  assert.equal(res.completedWeight, 65);

  // Current performance (grade so far out of completed weight) = (54.5 / 65) * 100 = 83.846%
  assert.ok(Math.abs((res.currentPerformance ?? 0) - 83.85) < 0.05);

  // Max possible final grade = 54.5 + 35 = 89.5%
  assert.equal(res.maxPossible, 89.5);
  assert.equal(res.status, "On track");
});

test("Universal Grade Simulator: Target Score calculation", () => {
  const categories: CustomGradeCategory[] = [
    {
      id: "c1",
      gradebookId: "b1",
      name: "Quizzes",
      weight: 20,
      position: 0,
      assessments: [{ id: "a1", categoryId: "c1", name: "Q1", score: 80, maxScore: 100, position: 0 }], // 16 pts
    },
    {
      id: "c2",
      gradebookId: "b1",
      name: "Midterm",
      weight: 40,
      position: 1,
      assessments: [{ id: "a2", categoryId: "c2", name: "MT", score: 70, maxScore: 100, position: 0 }], // 28 pts
    },
    {
      id: "c3",
      gradebookId: "b1",
      name: "Final Exam",
      weight: 40,
      position: 2,
      assessments: [], // Target category
    },
  ];

  // Secured so far: 16 + 28 = 44 pts.
  // Target: 75%. Points needed: 75 - 44 = 31 pts out of 40% weight.
  // Required percentage: (31 / 40) * 100 = 77.5%.
  const sim = simulateUniversalTarget(categories, "c3", 75);
  assert.ok(sim);
  assert.equal(sim.alreadySecured, false);
  assert.equal(sim.achievable, true);
  assert.equal(sim.requiredPercentage, 77.5);
});

test("Universal Grade Simulator: Impossible target handling", () => {
  const categories: CustomGradeCategory[] = [
    {
      id: "c1",
      gradebookId: "b1",
      name: "Coursework",
      weight: 60,
      position: 0,
      assessments: [{ id: "a1", categoryId: "c1", name: "Work", score: 50, maxScore: 100, position: 0 }], // 30 pts
    },
    {
      id: "c2",
      gradebookId: "b1",
      name: "Final Exam",
      weight: 40,
      position: 1,
      assessments: [],
    },
  ];

  // Secured so far: 30 pts. Max possible: 30 + 40 = 70%.
  // Target: 85%. Points needed: 55 pts out of 40% weight (137.5%).
  const sim = simulateUniversalTarget(categories, "c2", 85);
  assert.ok(sim);
  assert.equal(sim.achievable, false);
  assert.equal(sim.alreadySecured, false);
  assert.equal(sim.requiredPercentage, 137.5);
  assert.equal(sim.maxAchievable, 70);
  assert.match(sim.explanation, /is not reachable/);
});

test("Universal Grade Simulator: Already secured target handling", () => {
  const categories: CustomGradeCategory[] = [
    {
      id: "c1",
      gradebookId: "b1",
      name: "Coursework",
      weight: 70,
      position: 0,
      assessments: [{ id: "a1", categoryId: "c1", name: "Work", score: 90, maxScore: 100, position: 0 }], // 63 pts
    },
    {
      id: "c2",
      gradebookId: "b1",
      name: "Final Exam",
      weight: 30,
      position: 1,
      assessments: [],
    },
  ];

  // Secured so far: 63 pts.
  // Target: 60%. Already >= 60%.
  const sim = simulateUniversalTarget(categories, "c2", 60);
  assert.ok(sim);
  assert.equal(sim.alreadySecured, true);
  assert.equal(sim.achievable, true);
  assert.match(sim.explanation, /already secured/);
});

test("Universal Grade Simulator: What-If simulation with projection ladder", () => {
  const categories: CustomGradeCategory[] = [
    {
      id: "c1",
      gradebookId: "b1",
      name: "Midterm",
      weight: 50,
      position: 0,
      assessments: [{ id: "a1", categoryId: "c1", name: "Midterm", score: 80, maxScore: 100, position: 0 }], // 40 pts
    },
    {
      id: "c2",
      gradebookId: "b1",
      name: "Final",
      weight: 50,
      position: 1,
      assessments: [],
    },
  ];

  // If student scores 90% on Final (weight 50%):
  // Earned points = 40 + (0.90 * 50) = 85.0%
  const whatIf = simulateUniversalWhatIf(categories, "c2", 90, 75);
  assert.ok(whatIf);
  assert.equal(whatIf.hypotheticalPercentage, 90);
  assert.equal(whatIf.projectedEarnedPoints, 85.0);
  assert.equal(whatIf.isPassing, true);
  assert.equal(whatIf.ladder.length, 8); // [65, 70, 75, 80, 85, 90, 95, 100]

  const step70 = whatIf.ladder.find((s) => s.scorePercentage === 70);
  assert.ok(step70);
  assert.equal(step70?.projectedFinal, 75.0); // 40 + (0.70 * 50) = 75.0
  assert.equal(step70?.isPassing, true);
});

test("NU MOA MTAP 1: Adapter produces exact match with legacy calculateGrade", () => {
  const nuScores: GradeValues = {
    pre_test: 40,      // 40/50 = 80% * 10% = 8.0 pts
    post_test: 56,     // 56/70 = 80% * 15% = 12.0 pts
    oral_revalida: 80, // 80/100 = 80% * 25% = 20.0 pts
    written_revalida: 85, // 85/100 = 85% * 25% = 21.25 pts
    comprehensive: 90, // 90/100 = 90% * 25% = 22.5 pts
  };

  const legacyResult = calculateGrade(nuScores);

  // Convert via universal adapter
  const adapterCategories = nuSubjectToUniversalCategories(nuScores);
  const universalResult = calculateUniversalGrade(adapterCategories, 65);

  assert.equal(universalResult.isWeightValid, true);
  assert.equal(universalResult.totalConfiguredWeight, 100);
  // Total points earned: 8.0 + 12.0 + 20.0 + 21.25 + 22.5 = 83.75
  assert.equal(universalResult.earnedPoints, legacyResult.earnedPoints);
});
