import "server-only";
import { createClient } from "../supabase/server";
import { createAdminServiceClient } from "../admin/adminAuth";
import { canAccessQuestionBank, FREE_ENTITLEMENT, isQuestionBankPublished } from "../entitlements";
import { getCanonicalQuestion, parseGradingRequest } from "./answerVerification";
import { prepareReviewerResponse } from "../reviewerAttemptCompatibility";
import type { ReviewerQuestion } from "../../content/reviewerContent";

// Prepared adapter, intentionally not mounted or wired to any client until DB approval.
// No trusted-study config, session tables, credentials or migrations23–31 are required.
export async function saveCompatibleReviewerAttempt(input: unknown, expectedOwner?: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_INPUT");
  const value = input as Record<string, unknown>;
  const keys = ["id", "book", "questionId", "response", "reviewMode", "sessionId", "isAdaptiveRepeat", "answeredAt"];
  const uuid = (s: unknown) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
  if (Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value,k))
    || !uuid(value.id) || !(value.sessionId === null || uuid(value.sessionId))
    || typeof value.isAdaptiveRepeat !== "boolean" || typeof value.answeredAt !== "string"
    || !Number.isFinite(Date.parse(value.answeredAt))
    || !["reviewer","adaptive","wrong_answers","weakness_focus","pre_test","post_test","oral_review"].includes(String(value.reviewMode))
    || (value.book !== "BOC" && value.book !== "Elsevier")) throw new Error("INVALID_INPUT");
  if (!isQuestionBankPublished(value.book)) throw new Error("UNPUBLISHED");
  const client = await createClient();
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) throw new Error("AUTH_REQUIRED");
  if (expectedOwner !== undefined && auth.data.user.id !== expectedOwner) throw new Error("ACCOUNT_CHANGED");
  const entitlement = await client.rpc("get_my_entitlement");
  const row = Array.isArray(entitlement.data) ? entitlement.data[0] : entitlement.data;
  if (entitlement.error || !row || !canAccessQuestionBank(value.book,
    { ...FREE_ENTITLEMENT, effectivePlan: row.effective_plan === "pro" ? "pro" : "free" })) throw new Error("PRO_REQUIRED");
  const request = parseGradingRequest({ questionId: value.questionId, response: value.response });
  const canonical = await getCanonicalQuestion(request.questionId);
  if (canonical.book !== value.book) throw new Error("INVALID_BOOK");
  const q = canonical.question as ReviewerQuestion;
  const prepared = prepareReviewerResponse(q, value.book, request.response);
  const payload = value.book === "BOC"
    ? (await import("./bocServerContent")).getBocServerPayload()
    : (await import("./elsevierServerContent")).getElsevierServerPayload();
  const subject = payload.subjects.find(s => s.id === q.subjectId);
  const topic = payload.topics.find(t => t.id === q.topicId && t.subjectId === q.subjectId);
  if (!subject || !topic) throw new Error("CONTENT_UNAVAILABLE");
  const result = await createAdminServiceClient().rpc("record_compatible_reviewer_attempt", {
    p_owner: auth.data.user.id, p_id: value.id, p_book: canonical.book, p_question_id: q.id,
    p_metadata: { subject_id:q.subjectId, topic_id:q.topicId, subject_name:subject.name,
      topic_name:topic.name, subtopic:q.subtopic, difficulty:q.difficulty },
    p_response: prepared.response, p_choice_count:prepared.choiceCount, p_matching_items:prepared.matchingItems,
    p_is_correct:prepared.isCorrect, p_review_mode:value.reviewMode, p_session_id:value.sessionId,
    p_is_adaptive_repeat:value.isAdaptiveRepeat, p_answered_at:value.answeredAt,
  });
  if (result.error || !result.data) throw new Error("PERSISTENCE_UNAVAILABLE");
  return result.data;
}
