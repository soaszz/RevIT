import { calculateCategorySummary, calculateUniversalGrade, simulateUniversalWhatIf, type UniversalCategoryInput } from "./gradeCalculator";

// Presentation metadata only. Existing calculation results and saved categories are never changed.
export function gradeSimulationPreview(categories: UniversalCategoryInput[], targetId: string, percentage: number, passingGrade: number) {
  const scenario = simulateUniversalWhatIf(categories, targetId, percentage, passingGrade);
  if (!scenario) return null;
  const recorded = calculateUniversalGrade(categories, passingGrade);
  const missingCategories = categories.filter(category => {
    if (category.id === targetId || category.weight <= 0) return false;
    const summary = calculateCategorySummary(category);
    return !summary.hasData || summary.completedCount < summary.assessmentCount;
  }).map(category => category.name);
  return { ...scenario, recorded, missingCategories,
    canProjectFinal: recorded.isWeightValid && missingCategories.length === 0 };
}
