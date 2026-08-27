import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthState } from "../app/lib/authState";
import { chooseAdaptiveQuestion, reinforcementAfterAnswer } from "../app/lib/adaptiveQuestions";
import { isMissingQuestionReinforcementTableError } from "../app/lib/cloudService";
import { chatTitleFromFirstMessage } from "../app/lib/aiChatService";
import { normalizeAiMarkdown } from "../app/lib/aiMarkdown";
import { calculateExpression, formatCalculatorResult } from "../app/lib/scientificCalculator";
import { EMPTY_GRADES, type DailyActivity, type ExamSchedule, type GradeValues } from "../app/lib/domain";
import { calculateGrade, calculateGuidance, calculateNextAssessmentTarget } from "../app/lib/gradeCalculator";
import { buildMonthGrid, calculateStreak, dateKeyInTimeZone, intensityFor, upcomingExam } from "../app/lib/studyCalendar";

function grades(values: Partial<GradeValues>): GradeValues { return { ...EMPTY_GRADES, ...values }; }

test("AI chat titles are concise and useful without another model request", () => {
  assert.equal(chatTitleFromFirstMessage("Explain Gram staining"), "Gram staining explanation");
  assert.equal(chatTitleFromFirstMessage("  Compare   iron deficiency anemia and thalassemia?  "), "Compare iron deficiency anemia and thalassemia");
  assert.ok(chatTitleFromFirstMessage("Explain a very long laboratory medicine concept with many details about analytical specificity sensitivity and calibration curves for clinical chemistry analyzers").length <= 80);
  assert.equal(chatTitleFromFirstMessage("   "), "New chat");
});

test("AI Markdown normalizes common LaTeX delimiters while preserving code", () => {
  const legacy = String.raw`The formula is \(C_{Cr}\).\n\n\[C_{Cr} = \frac{U_{Cr} \times V}{P_{Cr} \times t}\]\n\nSymbol: (U_\text{Cr})`;
  const normalized = normalizeAiMarkdown(legacy);
  assert.match(normalized, /\$C_\{Cr\}\$/);
  assert.match(normalized, /\$\$\nC_\{Cr\} = \\frac/);
  assert.match(normalized, /\$U_\\text\{Cr\}\$/);
  assert.equal(normalizeAiMarkdown(String.raw`H\<sub>2\</sub>O`), "H<sub>2</sub>O");
  assert.equal(
    normalizeAiMarkdown(String.raw`$$C_{Cr}^{\text{CG}} = \frac{(140 - \text{age}) \times \text{weight (kg)} \times \kappaP_{Cr}}$$`),
    String.raw`$$C_{Cr}^{\text{CG}} = \frac{(140 - \text{age}) \times \text{weight (kg)} \times \kappa}{P_{Cr}}$$`,
  );
  const fencedCode = "```text\n\\[raw\\]\n```";
  assert.equal(normalizeAiMarkdown(fencedCode), fencedCode);
});

test("scientific calculator evaluates safely across core scientific operations", () => {
  assert.equal(calculateExpression("2+3×4"), 14);
  assert.equal(calculateExpression("(2+3)^2"), 25);
  assert.equal(calculateExpression("-2^2"), -4);
  assert.equal(calculateExpression("2^-2"), 0.25);
  assert.equal(calculateExpression("sqrt(81)+log(100)+ln(e)"), 12);
  assert.ok(Math.abs(calculateExpression("sin(30)", "deg") - 0.5) < 1e-12);
  assert.ok(Math.abs(calculateExpression("sin(π÷2)", "rad") - 1) < 1e-12);
  assert.equal(calculateExpression("5!+25%"), 120.25);
  assert.equal(calculateExpression("2×Ans", "deg", 7), 14);
  assert.equal(formatCalculatorResult(1 / 3), "0.333333333333");
  assert.throws(() => calculateExpression("1÷0"), /real-number range/);
  assert.throws(() => calculateExpression("sqrt(-1)"), /real-number range/);
});

test("grade boundaries: zero, exact 65, below 65, and 100", () => {
  assert.equal(calculateGrade(grades({ pre_test: 0, post_test: 0, comprehensive: 0, written_revalida: 0, oral_revalida: 0 })).earnedPoints, 0);
  const exact = calculateGrade(grades({ pre_test: 32.5, post_test: 45.5, comprehensive: 65, written_revalida: 65, oral_revalida: 65 }));
  assert.ok(Math.abs(exact.earnedPoints - 65) < 1e-9);
  assert.equal(calculateGuidance(grades({ pre_test: 32.49, post_test: 45.5, comprehensive: 65, written_revalida: 65, oral_revalida: 65 })).state, "Mathematically impossible");
  assert.equal(calculateGrade(grades({ pre_test: 50, post_test: 70, comprehensive: 100, written_revalida: 100, oral_revalida: 100 })).earnedPoints, 100);
});

test("blank assessments are not zero and normalized performance uses completed weight", () => {
  const summary = calculateGrade(grades({ pre_test: 40 }));
  assert.equal(summary.earnedPoints, 8);
  assert.equal(summary.completedWeight, 0.1);
  assert.equal(summary.normalizedPerformance, 80);
  assert.equal(summary.complete, false);
});

test("remaining-average and maximum-possible guidance are deterministic", () => {
  const guidance = calculateGuidance(grades({ pre_test: 50 }));
  assert.ok(Math.abs(guidance.requiredAverage - 61.11111111111111) < 1e-9);
  assert.equal(guidance.state, "On track");
  const impossible = calculateGuidance(grades({ pre_test: 0, post_test: 0, comprehensive: 0, written_revalida: 0 }));
  assert.ok(Math.abs(impossible.maxPossible - 15) < 1e-9);
  assert.equal(impossible.state, "Mathematically impossible");
  const secured = calculateGuidance(grades({ pre_test: 50, post_test: 70, comprehensive: 100, written_revalida: 34 }));
  assert.equal(secured.state, "Passing secured");
});

test("next-assessment target states its later-score assumption", () => {
  const result = calculateNextAssessmentTarget(grades({ pre_test: 40 }), "post_test", 65, 75);
  assert.ok(result);
  assert.equal(result?.laterAverage, 75);
  assert.ok(Math.abs((result?.requiredScore ?? 0) - 3.5) < 1e-9);
});

const activity = (date: string): DailyActivity => ({ activity_date: date, questions_answered: 1, correct_answers: 1, review_count: 0, subjects_studied: ["Bacteriology"] });

test("streaks preserve yesterday, stop at gaps, and calculate longest", () => {
  const result = calculateStreak([activity("2026-08-14"), activity("2026-08-16"), activity("2026-08-17"), activity("2026-08-18"), activity("2026-08-19")], "2026-08-20");
  assert.deepEqual(result, { current: 4, longest: 4, activeDays: 5 });
  assert.equal(calculateStreak([activity("2026-08-18")], "2026-08-20").current, 0);
});

test("timezone aggregation and month grid handle boundary dates", () => {
  assert.equal(dateKeyInTimeZone(new Date("2026-08-19T16:30:00Z"), "Asia/Manila"), "2026-08-20");
  assert.equal(dateKeyInTimeZone(new Date("2026-08-19T16:30:00Z"), "America/Los_Angeles"), "2026-08-19");
  const grid = buildMonthGrid(2026, 7);
  assert.equal(grid.length, 42);
  assert.ok(grid.some((day) => day.key === "2026-08-01" && day.inMonth));
  assert.equal(intensityFor(activity("2026-08-20")) > 0, true);
});

test("calendar supports multiple exams and chooses nearest future assessment", () => {
  const exams: ExamSchedule[] = [
    { id: "1", subject: "Hematology", assessment_type: "Pre-Test", scheduled_date: "2026-08-26", note: null },
    { id: "2", subject: "Bacteriology", assessment_type: "Oral Revalida", scheduled_date: "2026-08-26", note: null },
    { id: "3", subject: "AUBF", assessment_type: "Post-Test", scheduled_date: "2026-08-22", note: null },
  ];
  assert.equal(exams.filter((exam) => exam.scheduled_date === "2026-08-26").length, 2);
  assert.equal(upcomingExam(exams, "2026-08-20")?.id, "3");
});

test("adaptive reinforcement spaces retries and removes the boost after a correct answer", () => {
  const pool = ["a", "b", "c", "d", "e"];
  const reinforced = reinforcementAfterAnswer({}, "a", false);
  assert.equal(reinforced.a, 1);
  assert.equal(chooseAdaptiveQuestion(pool, reinforced, ["a"], () => 0), "b");
  assert.equal(chooseAdaptiveQuestion(pool, reinforced, ["a", "b"], () => 0), "c");
  assert.equal(chooseAdaptiveQuestion(pool, reinforced, ["a", "b", "c"], () => 0), "d");
  assert.equal(chooseAdaptiveQuestion(pool, reinforced, ["a", "b", "c", "d"], () => 0), "a");

  const normalized = reinforcementAfterAnswer(reinforced, "a", true);
  assert.equal(normalized.a, undefined);
  assert.equal(chooseAdaptiveQuestion(pool, normalized, ["a", "b", "c", "d"], () => 0), "e");
  assert.equal(reinforcementAfterAnswer(normalized, "a", false).a, 1);
});

test("adaptive selection stays inside the active pool and handles small pools", () => {
  assert.equal(chooseAdaptiveQuestion(["only"], { outside: 3, only: 2 }, ["only"], () => 0), "only");
  assert.equal(chooseAdaptiveQuestion(["a", "b"], { outside: 3 }, ["a"], () => 0), "b");
  assert.ok(["hema-1", "hema-2"].includes(chooseAdaptiveQuestion(["hema-1", "hema-2"], { "bacte-1": 3 }, [], () => 0.5) ?? ""));
});

test("mastered questions stay available but are selected less often", () => {
  const performance = { mastered: { correct: 3, wrong: 0 } };
  assert.equal(chooseAdaptiveQuestion(["mastered", "new"], {}, [], () => 0.3, performance), "new");
  assert.equal(chooseAdaptiveQuestion(["mastered", "new"], {}, [], () => 0, performance), "mastered");
});

test("a missing optional reinforcement table does not block core cloud data", () => {
  assert.equal(isMissingQuestionReinforcementTableError({ code: "PGRST205", message: "not in schema cache" }), true);
  assert.equal(isMissingQuestionReinforcementTableError({ code: "42P01", message: "undefined table" }), true);
  assert.equal(isMissingQuestionReinforcementTableError({ code: "42501", message: "permission denied" }), false);
});

test("auth routing distinguishes logged-out, unverified, onboarding, and ready", () => {
  assert.equal(resolveAuthState({ hasUser: false, emailConfirmed: false, onboardingComplete: false }), "logged-out");
  assert.equal(resolveAuthState({ hasUser: true, emailConfirmed: false, onboardingComplete: false }), "unverified");
  assert.equal(resolveAuthState({ hasUser: true, emailConfirmed: true, onboardingComplete: false }), "onboarding");
  assert.equal(resolveAuthState({ hasUser: true, emailConfirmed: true, onboardingComplete: true }), "ready");
});
