import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "../supabase/server";
import { requireTrustedStudyWriter } from "./trustedStudyGate";
import { getCanonicalQuestion, gradeAnswer, parseGradingRequest } from "./answerVerification";
import { getStudyQuestionMetadata } from "./studyQuestionMetadata";

export interface TrustedStudyWriter {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export type CreateStudySessionInput = { requestId: string; questionIds: string[]; mode: string; targetCount: number; resumeOnly?: true; [key: string]: unknown };
export type CommitStudyBatchInput = { sessionId: string; attempts: { id: string; slot: number; questionId: string; contentVersion: string; response: unknown; [key: string]: unknown }[]; [key: string]: unknown };
type Session = { id: string; user_id: string; expires_at: string; completed_at: string | null;
  question_pool: { question_id: string; content_version: string }[]; mode: string; target_count: number };
type Acknowledgment = { id: string; question_id: string; session_id: string; session_slot: number; content_version: string;
  response_digest: string; is_correct: boolean; attempt_number: number; verified_at: string; competitive_at: string | null;
  status: "accepted" | "already_accepted" };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Reflect.ownKeys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function authenticated() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) throw new Error("AUTH_REQUIRED");
  return { client, owner: data.user.id };
}
async function authorize(questions: Awaited<ReturnType<typeof getCanonicalQuestion>>[], client: Awaited<ReturnType<typeof createClient>>) {
  if (questions.some(q => q.book === "Strasinger")) throw new Error("STRASINGER_DISABLED");
  if (questions.some(q => q.book !== "Harr")) {
    const { data, error } = await client.rpc("get_my_entitlement");
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) throw new Error("ENTITLEMENT_UNAVAILABLE");
    if (row.effective_plan !== "pro") throw new Error("PRO_REQUIRED");
  }
}
function databaseError(error: unknown): never {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "23505" || code === "42501") throw new Error("ATTEMPT_CONFLICT");
  if (code === "PT503") throw new Error("TRUSTED_STUDY_DISABLED");
  if (code === "55000") throw new Error("SESSION_EXPIRED");
  throw new Error("PERSISTENCE_UNAVAILABLE");
}

export async function createStudySession(input: CreateStudySessionInput, writer?: TrustedStudyWriter): Promise<Session> {
  const keys = input?.resumeOnly === true ? ["requestId", "questionIds", "mode", "targetCount", "resumeOnly"]
    : ["requestId", "questionIds", "mode", "targetCount"];
  if (!exact(input, keys)) throw new Error("INVALID_SESSION_INPUT");
  if (!uuid(input.requestId)
    || !Array.isArray(input.questionIds) || !input.questionIds.length || input.questionIds.length > 4441
    || input.questionIds.some(id => typeof id !== "string") || new Set(input.questionIds).size !== input.questionIds.length
    || !["reviewer", "adaptive", "wrong_answers", "weakness_focus", "pre_test", "post_test", "oral_review"].includes(input.mode)
    || !Number.isSafeInteger(input.targetCount) || input.targetCount < 1 || input.targetCount > input.questionIds.length) throw new Error("INVALID_SESSION_INPUT");
  const { client, owner } = await authenticated();
  const questions = await Promise.all(input.questionIds.map(getCanonicalQuestion));
  await authorize(questions, client);
  const plan = { mode: input.mode, target_count: input.targetCount,
    question_pool: questions.map(q => ({ question_id: q.question.id, content_version: q.contentVersion })) };
  const { data, error } = input.resumeOnly
    ? await client.from("study_sessions").select().eq("request_id", input.requestId).eq("user_id", owner).maybeSingle()
    : await (writer ?? await requireTrustedStudyWriter()).rpc("create_rewarded_study_session", { p_owner: owner, p_request_id: input.requestId,
      p_plan: plan, p_request_digest: digest({ requestId: input.requestId, questionIds: input.questionIds, mode: input.mode, targetCount: input.targetCount }) });
  if (error) databaseError(error);
  if (!data && input.resumeOnly) throw new Error("SESSION_UNAVAILABLE");
  const session = data as Session | null;
  if (!session || !uuid(session.id) || session.user_id !== owner || !Number.isFinite(Date.parse(session.expires_at))
    || session.mode !== plan.mode || session.target_count !== plan.target_count
    || !Array.isArray(session.question_pool) || session.question_pool.length !== plan.question_pool.length
    || !session.question_pool.every((q, index) => q.question_id === plan.question_pool[index].question_id
      && q.content_version === plan.question_pool[index].content_version)) throw new Error("SESSION_CONFLICT");
  if (Date.parse(session.expires_at) <= Date.now()) throw new Error("SESSION_EXPIRED");
  if (session.completed_at) throw new Error("SESSION_UNAVAILABLE");
  return session;
}

export async function commitStudyBatch(input: CommitStudyBatchInput, writer?: TrustedStudyWriter): Promise<Acknowledgment[]> {
  if (!exact(input, ["sessionId", "attempts"]) || !uuid(input.sessionId) || !Array.isArray(input.attempts)
    || !input.attempts.length || input.attempts.length > 50) throw new Error("INVALID_ATTEMPT_INPUT");
  const ids = new Set<string>(), slots = new Set<number>();
  const parsed = input.attempts.map(a => {
    if (!exact(a, ["id", "slot", "questionId", "contentVersion", "response"]) || !uuid(a.id) || ids.has(a.id)
      || !Number.isSafeInteger(a.slot) || a.slot < 0 || a.slot >= 10000 || slots.has(a.slot)
      || typeof a.contentVersion !== "string") throw new Error("INVALID_ATTEMPT_INPUT");
    ids.add(a.id); slots.add(a.slot);
    return { ...a, response: parseGradingRequest({ questionId: a.questionId, response: a.response }).response };
  });
  const { client, owner } = await authenticated();
  const canonical = await Promise.all(parsed.map(a => getCanonicalQuestion(a.questionId)));
  await authorize(canonical, client);
  const { data: session, error: sessionError } = await client.from("study_sessions").select().eq("id", input.sessionId).eq("user_id", owner).maybeSingle();
  if (sessionError || !session || session.user_id !== owner) throw new Error("SESSION_UNAVAILABLE");
  const pool = new Map((session.question_pool as Session["question_pool"]).map(q => [q.question_id, q.content_version]));
  // Read all existing IDs once. RLS plus explicit ownership checks protect retries.
  const { data: existingRows, error: readError } = await client.from("question_attempts").select().in("id", parsed.map(a => a.id)).eq("user_id", owner);
  if (readError || !Array.isArray(existingRows)) throw new Error("PERSISTENCE_UNAVAILABLE");
  const existing = new Map(existingRows.map(row => [row.id, row]));
  for (const a of parsed) {
    const row = existing.get(a.id);
    if (row && (row.user_id !== owner || !row.verified_at || row.session_id !== input.sessionId || row.session_slot !== a.slot
      || row.question_id !== a.questionId || row.content_version !== a.contentVersion || row.response_digest !== digest(a.response))) throw new Error("ATTEMPT_CONFLICT");
    if (pool.get(a.questionId) !== a.contentVersion) throw new Error(row ? "ATTEMPT_CONFLICT" : "UNSUPPORTED_VERSION");
  }
  if (existing.size === parsed.length) return parsed.map(a => ({ ...existing.get(a.id), status: "already_accepted" })) as Acknowledgment[];
  if (!Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= Date.now()) throw new Error("SESSION_EXPIRED");
  if (session.completed_at) throw new Error("SESSION_UNAVAILABLE");
  const { data: sessionRows, error: slotError } = await client.from("question_attempts").select("session_slot")
    .eq("session_id", input.sessionId).eq("user_id", owner);
  if (slotError || !Array.isArray(sessionRows)) throw new Error("PERSISTENCE_UNAVAILABLE");
  let nextSlot = sessionRows.reduce((next, row) => Number.isSafeInteger(row.session_slot) ? Math.max(next, row.session_slot + 1) : next, 0);
  for (const a of parsed.filter(a => !existing.has(a.id)).sort((a, b) => a.slot - b.slot)) {
    if (a.slot !== nextSlot++) throw new Error("ATTEMPT_CONFLICT");
  }
  const payload = await Promise.all(parsed.map(async (a, index) => {
    const q = canonical[index];
    if (q.contentVersion !== a.contentVersion) throw new Error("UNSUPPORTED_VERSION");
    const grading = await gradeAnswer({ questionId: a.questionId, response: a.response });
    const metadata = await getStudyQuestionMetadata(a.questionId);
    return { id: a.id, session_slot: a.slot, question_id: a.questionId, content_version: a.contentVersion,
      response_digest: digest(a.response), selected_answer: a.response.kind === "single_choice" ? a.response.choiceIndex : null,
      is_correct: grading.isCorrect, subject_id: metadata.subject_id, subject_name: metadata.subject_name ?? "Uncategorized",
      topic_id: metadata.topic_id, topic_name: metadata.topic_name ?? "Uncategorized", subtopic: metadata.subtopic ?? "Uncategorized",
      difficulty: metadata.difficulty ?? "Unspecified", book: metadata.book };
  }));
  const privileged = writer ?? await requireTrustedStudyWriter();
  const { data, error } = await privileged.rpc("commit_rewarded_study_batch", { p_owner: owner, p_session_id: input.sessionId, p_attempts: payload });
  if (error) databaseError(error);
  if (!Array.isArray(data) || data.length !== parsed.length || new Set(data.map(row => row?.id)).size !== parsed.length) throw new Error("ACK_UNAVAILABLE");
  return parsed.map(a => {
    const row = data.find(row => row?.id === a.id);
    if (!row || row.question_id !== a.questionId || row.session_id !== input.sessionId || row.session_slot !== a.slot
      || row.content_version !== a.contentVersion || row.response_digest !== digest(a.response) || typeof row.is_correct !== "boolean"
      || typeof row.verified_at !== "string" || !Number.isFinite(Date.parse(row.verified_at))) throw new Error("ACK_UNAVAILABLE");
    return { id: row.id, question_id: row.question_id, session_id: row.session_id, session_slot: row.session_slot,
      content_version: row.content_version, response_digest: row.response_digest, is_correct: row.is_correct,
      attempt_number: row.attempt_number, verified_at: row.verified_at, competitive_at: row.competitive_at,
      status: existing.has(a.id) ? "already_accepted" : "accepted" };
  });
}

export type CompletionReceipt = { sessionId: string; completedAt: string; attemptIds: string[];
  attemptCount: number; correctCount: number; totalXp: number; level: number; xpAwarded: number; unlocked: string[]; contract: 1 };
export async function completeStudySession(input: { sessionId: string; attemptIds: string[] }, writer?: TrustedStudyWriter): Promise<CompletionReceipt> {
  if (!exact(input, ["sessionId", "attemptIds"]) || !uuid(input.sessionId) || !Array.isArray(input.attemptIds)
    || input.attemptIds.length < 1 || input.attemptIds.length > 10000 || input.attemptIds.some(id => !uuid(id))
    || new Set(input.attemptIds).size !== input.attemptIds.length) throw new Error("INVALID_COMPLETION_INPUT");
  const { client, owner } = await authenticated();
  const { data: session, error: readError } = await client.from("study_sessions").select().eq("id", input.sessionId).eq("user_id", owner).maybeSingle();
  if (readError || !session || session.user_id !== owner || !Array.isArray(session.question_pool)) throw new Error("SESSION_UNAVAILABLE");
  // Recheck current access; completion eligibility and every reward remain database-owned.
  const questions = await Promise.all((session.question_pool as Session["question_pool"]).map(q => getCanonicalQuestion(q.question_id)));
  await authorize(questions, client);
  if (questions.some((q, index) => q.contentVersion !== session.question_pool[index].content_version)) throw new Error("UNSUPPORTED_VERSION");
  const { data, error } = await (writer ?? await requireTrustedStudyWriter()).rpc("complete_verified_study_session", {
    p_owner: owner, p_session_id: input.sessionId, p_attempt_ids: input.attemptIds,
  });
  if (error) { if ((error as { code?: string }).code === "22023") throw new Error("INVALID_COMPLETION_INPUT"); databaseError(error); }
  const receipt = data as CompletionReceipt | null;
  if (!receipt || receipt.contract !== 1 || receipt.sessionId !== input.sessionId
    || !Number.isFinite(Date.parse(receipt.completedAt)) || !Array.isArray(receipt.attemptIds)
    || JSON.stringify(receipt.attemptIds) !== JSON.stringify(input.attemptIds) || receipt.attemptCount !== input.attemptIds.length
    || !Number.isSafeInteger(receipt.correctCount) || receipt.correctCount < 0 || receipt.correctCount > receipt.attemptCount
    || !Number.isSafeInteger(receipt.totalXp) || receipt.totalXp < 0 || !Number.isSafeInteger(receipt.level) || receipt.level < 1
    || !Number.isSafeInteger(receipt.xpAwarded) || receipt.xpAwarded < 0 || !Array.isArray(receipt.unlocked)
    || receipt.unlocked.some(id => !uuid(id))) throw new Error("ACK_UNAVAILABLE");
  return receipt;
}
