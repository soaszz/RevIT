import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_GRADES, GRADE_FIELDS } from "../app/lib/domain";
import { gradeSimulationPreview } from "../app/lib/gradeSimulationPreview";
import { nuSubjectToUniversalCategories, simulateUniversalTarget, simulateUniversalWhatIf, type UniversalCategoryInput } from "../app/lib/gradeCalculator";

function immutable<T>(value: T): T {
  if (value && typeof value === "object") { for (const v of Object.values(value)) immutable(v); Object.freeze(value); }
  return value;
}

test("empty scores: 85 percent of a 10 percent category is 8.5 weighted points, not a final forecast", () => {
  const categories = immutable(nuSubjectToUniversalCategories({ ...EMPTY_GRADES }));
  const preview = gradeSimulationPreview(categories, "pre_test", 85, 65)!;
  assert.equal(preview.hypotheticalContribution, 8.5);
  assert.equal(preview.projectedEarnedPoints, 8.5);
  assert.equal(preview.recorded.completedWeight, 0);
  assert.equal(preview.canProjectFinal, false);
  assert.equal(preview.missingCategories.length, 4);
});

test("partial scores remain actual data; hypothetical replacement and all ladder values retain original formulas", () => {
  const categories = immutable(nuSubjectToUniversalCategories({ ...EMPTY_GRADES, pre_test: 50, post_test: 70 }));
  const bytes = JSON.stringify(categories), preview = gradeSimulationPreview(categories, "pre_test", 85, 65)!;
  assert.equal(preview.recorded.earnedPoints, 25);
  assert.equal(preview.projectedEarnedPoints, 23.5);
  assert.equal(preview.canProjectFinal, false);
  for (const score of [0, 65, 70, 75, 80, 85, 90, 95, 100]) {
    const current = gradeSimulationPreview(categories, "pre_test", score, 65)!;
    const original = simulateUniversalWhatIf(categories, "pre_test", score, 65)!;
    assert.equal(current.projectedEarnedPoints, original.projectedEarnedPoints);
    assert.deepEqual(current.ladder, original.ladder);
  }
  assert.equal(JSON.stringify(categories), bytes);
});

test("complete other categories permit a true overall scenario and never double-count the replaced category", () => {
  const values = Object.fromEntries(GRADE_FIELDS.map(f => [f.key, f.max])) as typeof EMPTY_GRADES;
  const categories = immutable(nuSubjectToUniversalCategories(values));
  const preview = gradeSimulationPreview(categories, "pre_test", 85, 65)!;
  assert.equal(preview.canProjectFinal, true);
  assert.equal(preview.recorded.earnedPoints, 100);
  assert.equal(preview.projectedEarnedPoints, 98.5);
  assert.deepEqual(preview.missingCategories, []);
  assert.equal(values.pre_test, 50);
});

test("partially entered custom categories and invalid total weights cannot be called complete projections", () => {
  const categories: UniversalCategoryInput[] = [
    { id: "target", name: "Final", weight: 50, assessments: [] },
    { id: "other", name: "Quizzes", weight: 50, assessments: [{ id: "a", name: "One", score: 80, maxScore: 100 }, { id: "b", name: "Two", score: null, maxScore: 100 }] },
  ];
  const preview = gradeSimulationPreview(immutable(categories), "target", 80, 75)!;
  assert.equal(preview.canProjectFinal, false);
  assert.deepEqual(preview.missingCategories, ["Quizzes"]);
  const badWeight = categories.map(c => ({ ...c, weight: 45, assessments: [{ id: c.id, name: c.name, score: 80, maxScore: 100 }] }));
  assert.equal(gradeSimulationPreview(badWeight, "target", 80, 75)!.canProjectFinal, false);
  assert.equal(gradeSimulationPreview(categories, "missing", 80, 75), null);
});

test("target thresholds retain exact original values, including impossible and already-recorded replacements", () => {
  const empty = immutable(nuSubjectToUniversalCategories({ ...EMPTY_GRADES }));
  const impossible = simulateUniversalTarget(empty, "pre_test", 95, 75)!;
  assert.equal(impossible.requiredPercentage, 275);
  assert.equal(impossible.achievable, false);
  assert.equal(impossible.laterAverage, 75);
  const full = immutable(nuSubjectToUniversalCategories({ pre_test: 50, post_test: 70, comprehensive: 100, written_revalida: 100, oral_revalida: 100 }));
  assert.equal(simulateUniversalTarget(full, "pre_test", 95, 75)!.requiredPercentage, 50);
});
