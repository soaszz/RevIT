import "server-only";
import { createClient } from "../supabase/server";
import { canAccessQuestionBank, FREE_ENTITLEMENT, QUESTION_BANKS } from "../entitlements";
import { AnswerVerificationError, getCanonicalQuestion, gradeAnswer, parseGradingRequest } from "./answerVerification";
import type { GradingResult } from "./answerVerification";

type HandlerResult = { status: number; body: GradingResult | { error: string; code: string } };
const failure = (status: number, code: string, error: string): HandlerResult => ({ status, body: { error, code } });

// Isolated foundation only: no route, current-flow caller, persistence, or rewards.
export async function handleGradingRequest(input: unknown): Promise<HandlerResult> {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return failure(401, "AUTH_REQUIRED", "Authentication required.");

    const request = parseGradingRequest(input);
    const question = await getCanonicalQuestion(request.questionId);
    if (QUESTION_BANKS[question.book.toLowerCase() as Lowercase<typeof question.book>].requiredPlan === "pro") {
      const { data: rows, error: entitlementError } = await client.rpc("get_my_entitlement");
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (entitlementError || !row) return failure(503, "ENTITLEMENT_UNAVAILABLE", "Account entitlement is unavailable.");
      if (!canAccessQuestionBank(question.book, { ...FREE_ENTITLEMENT, effectivePlan: row.effective_plan === "pro" ? "pro" : "free" })) {
        return failure(403, "PRO_REQUIRED", "Active RevIT Pro subscription required.");
      }
    }
    return { status: 200, body: await gradeAnswer(request) };
  } catch (error) {
    if (error instanceof AnswerVerificationError) return failure(error.status, error.code, error.message);
    return failure(503, "GRADING_UNAVAILABLE", "Answer verification is unavailable.");
  }
}
