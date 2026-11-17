import legacy from "../content/reviewerContent.json";
import coagulation from "../content/harrCoagulationSource.json";
import hemostasis from "../content/harrHemostasisSource.json";
import type { ReviewerQuestion } from "../content/reviewerContent";

export const HARR_COAGULATION_TOPIC = "hematology-2-1";

// Source-verified Harr hemostasis topics that replace their legacy records at the
// same topic position. Legacy records stay available for historical lookups only.
export const HARR_SOURCE_COUNTS: Record<string, number> = {
  "hematology-2-1": 25,
  "hematology-2-2": 23,
  "hematology-2-3": 23,
  "hematology-2-4": 44,
  "hematology-2-5": 20,
};
export const HARR_SOURCE_TOPICS = Object.keys(HARR_SOURCE_COUNTS);

export const legacyCoagulationIds = new Set(legacy.questions.filter(q => q.topicId === HARR_COAGULATION_TOPIC).map(q => q.id));

const corrected = [...(coagulation.questions as ReviewerQuestion[]), ...(hemostasis.questions as ReviewerQuestion[])] as ReviewerQuestion[];
export const sourceHarrQuestions = corrected;
const legacyQuestions = legacy.questions as ReviewerQuestion[];

const replacedTopics = new Set(HARR_SOURCE_TOPICS);
if (legacyCoagulationIds.size !== 12
  || new Set(corrected.map(q => q.id)).size !== corrected.length
  || corrected.some(q => !replacedTopics.has(q.topicId) || legacyQuestions.some(old => old.id === q.id))
  || HARR_SOURCE_TOPICS.some(topic => corrected.filter(q => q.topicId === topic).length !== HARR_SOURCE_COUNTS[topic])) {
  throw new Error("Invalid Harr source replacement");
}

// Insert each topic's source questions at that topic's existing position, keeping
// every other record in its original order and retaining legacy records for
// historical lookups.
export const activeHarrQuestions: ReviewerQuestion[] = [];
const insertedTopics = new Set<string>();
for (const question of legacyQuestions) {
  if (question.topicId && replacedTopics.has(question.topicId)) {
    if (!insertedTopics.has(question.topicId)) {
      activeHarrQuestions.push(...corrected.filter(q => q.topicId === question.topicId));
      insertedTopics.add(question.topicId);
    }
  } else activeHarrQuestions.push(question);
}
export const allHarrHistoryQuestions = [...legacyQuestions, ...corrected];
