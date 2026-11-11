import type { SavedRecentSession } from "../components/ResumeSessionModal";
import type { ReviewerQuestion } from "../content/reviewerContent";
import { REVIEW_MODES } from "./domain";
import { canAccessQuestionBank, type SubscriptionEntitlement } from "./entitlements";
import { encodeMatchingAnswers } from "./matchingQuestion";
import { sessionMastery, upgradeMasteryQueue } from "./sessionMastery";

// Validate saved shape independently of asynchronously loaded premium questions.
export function parseRecentReviewSession(value: string): SavedRecentSession | null {
  try {
    const session = JSON.parse(value);
    const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0
      && value.every(id => typeof id === "string" && id.length > 0);
    if (!session || typeof session.id !== "string" || !session.id || !ids(session.questionIds)
      || !ids(session.poolIds) || !Number.isInteger(session.index) || session.index < 0
      || session.index >= session.questionIds.length || !Number.isInteger(session.targetCount) || session.targetCount <= 0
      || !session.questionIds.every((id: string) => session.poolIds.includes(id))
      || typeof session.strictWrongOnly !== "boolean" || !REVIEW_MODES.includes(session.sessionMode)
      || !Array.isArray(session.attempts) || !session.attempts.every((attempt: unknown) => attempt && typeof attempt === "object")
      || !session.choiceOrders || typeof session.choiceOrders !== "object" || Array.isArray(session.choiceOrders)
      || !Object.values(session.choiceOrders).every(order => Array.isArray(order) && order.every(Number.isInteger))
      || !Number.isFinite(Date.parse(session.pausedAt)) || typeof session.primaryTopicName !== "string"
      || typeof session.subjectName !== "string"
      || (session.selectedTopicIds !== undefined && (!Array.isArray(session.selectedTopicIds) || !session.selectedTopicIds.every((id: unknown) => typeof id === "string")))
      || (session.skippedIds !== undefined && (!Array.isArray(session.skippedIds) || !session.skippedIds.every((id: unknown) => typeof id === "string")))
      || (session.selectedChoice !== undefined && session.selectedChoice !== null && (!Number.isInteger(session.selectedChoice) || session.selectedChoice < 0))
      || (session.matchingSelections !== undefined && (!Array.isArray(session.matchingSelections) || !session.matchingSelections.every(Number.isInteger)))
      || [session.answerRevealed, session.timedOut, session.wrongAnswersOnly].some(value => value !== undefined && typeof value !== "boolean")
      || (session.masteryVersion !== undefined && session.masteryVersion !== 1)
      || (session.activeTimer !== undefined && (typeof session.activeTimer.enabled !== "boolean" || ![30, 60].includes(session.activeTimer.duration)))
      || (session.book !== undefined && !["Harr", "Ciulla", "Rodak", "Strasinger", "Elsevier", "BOC", "all"].includes(session.book))) return null;
    return session;
  } catch {
    return null;
  }
}

export function restoreRecentMasterySession(session: SavedRecentSession): SavedRecentSession {
  if (session.masteryVersion === 1) return session;
  const currentId = session.questionIds[session.index];
  const mastery = sessionMastery(session.questionIds, session.attempts);
  let questionIds: string[], index = session.index;
  // Existing publication snapshots already saved the revealed response. Keep
  // that view, including exact matching vectors, while repairing their retry tail.
  if (session.answerRevealed && session.attempts[session.index]?.questionId === currentId) {
    const prefix = session.questionIds.slice(0, session.index);
    const completed = [...new Set(session.questionIds.slice(session.index + 1)
      .filter(id => mastery.states.get(id)?.complete && id !== currentId && !prefix.includes(id)))];
    const pending = [...new Set(session.questionIds.slice(session.index + 1)
      .filter(id => !mastery.states.get(id)?.complete))];
    for (const [id, state] of mastery.states) if (!state.complete && !pending.includes(id)) pending.push(id);
    questionIds = [...prefix, ...completed, currentId, ...pending];
    index += completed.length;
  } else {
    questionIds = upgradeMasteryQueue(session.questionIds, session.index, session.attempts);
    while (index < questionIds.length && mastery.states.get(questionIds[index])?.complete) index++;
  }
  const sameQuestion = questionIds[index] === currentId;
  return { ...session, questionIds, index, masteryVersion: 1,
    selectedChoice: sameQuestion ? session.selectedChoice : null,
    matchingSelections: sameQuestion ? session.matchingSelections : [],
    answerRevealed: sameQuestion && session.answerRevealed === true,
    timedOut: sameQuestion && session.timedOut === true };
}

export function canResumeRecentReview(session: SavedRecentSession | null, questions: Map<string, ReviewerQuestion>, entitlement: SubscriptionEntitlement) {
  if (!session) return false;
  const current = questions.get(session.questionIds[session.index]);
  if (!current) return false;
  const limit = current.matching ? current.choices.length ** current.matching.items.length : current.choices.length;
  if (session.selectedChoice != null && (!Number.isSafeInteger(session.selectedChoice) || session.selectedChoice < 0 || session.selectedChoice >= limit)) return false;
  if (current.matching && session.selectedChoice != null && session.matchingSelections?.length !== current.matching.items.length) return false;
  if (current.matching && session.matchingSelections?.length) {
    if (session.matchingSelections.length !== current.matching.items.length
      || session.matchingSelections.some(i => !Number.isInteger(i) || i < -1 || i >= current.choices.length)) return false;
    if (session.selectedChoice != null && encodeMatchingAnswers(session.matchingSelections,current.choices.length) !== session.selectedChoice) return false;
  }
  if (session.questionIds.some((id, index) => {
    const order = session.choiceOrders[`${index}:${id}`] ?? session.choiceOrders[id];
    const question = questions.get(id);
    return order && (!question || order.length !== question.choices.length || new Set(order).size !== order.length
      || order.some(choice => choice < 0 || choice >= question.choices.length));
  })) return false;
  return [...session.poolIds, ...session.questionIds].every(id => {
    const question = questions.get(id);
    return question && canAccessQuestionBank(question.book ?? "Harr", entitlement);
  });
}
