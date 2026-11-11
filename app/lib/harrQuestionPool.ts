import legacy from "../content/reviewerContent.json";
import source from "../content/harrCoagulationSource.json";
import type { ReviewerQuestion } from "../content/reviewerContent";

export const HARR_COAGULATION_TOPIC = "hematology-2-1";
export const legacyCoagulationIds = new Set(legacy.questions.filter(q => q.topicId === HARR_COAGULATION_TOPIC).map(q => q.id));

const corrected = source.questions as ReviewerQuestion[];
export const sourceHarrQuestions = corrected;
const legacyQuestions = legacy.questions as ReviewerQuestion[];
if (legacyCoagulationIds.size !== 12 || corrected.length !== 25 || corrected.some(q => q.topicId !== HARR_COAGULATION_TOPIC || legacyQuestions.some(old => old.id === q.id))
  || new Set(corrected.map(q => q.id)).size !== corrected.length) throw new Error("Invalid Harr source replacement");

// Insert the source questions at the existing topic position. Keep every other
// record in its original order and retain legacy records for historical lookups.
export const activeHarrQuestions: ReviewerQuestion[] = [];
let inserted = false;
for (const question of legacyQuestions) {
  if (legacyCoagulationIds.has(question.id)) {
    if (!inserted) activeHarrQuestions.push(...corrected);
    inserted = true;
  } else activeHarrQuestions.push(question);
}
export const allHarrHistoryQuestions = [...legacyQuestions, ...corrected];
