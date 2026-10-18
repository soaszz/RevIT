import type { ReviewerQuestion } from "../content/reviewerContent";
import { bindServerSession, createLocalSessionState, createQueueItem, formatTrustedAttemptPayload,
  getPendingRetries, isolateQueueByAccount, isStrasingerSessionBlocked,
  mapLocalSessionToTrustedPlan, pruneCompletedItems, transitionAttemptQueue,
  type CreateLocalSessionInput, type LocalSessionAttempt, type LocalStudySessionState, type QueueTransitionItem } from "./clientSessionAdapter";

type Session = LocalStudySessionState & { versions: Record<string, string>; nextSlot: number; slotLimit: number; issue: boolean; attemptSlots?: Record<string, number>;
  completion?: "pending" | "accepted" | "conflict" | "rejected" };
type State = { sessions: Record<string, Session>; queue: QueueTransitionItem[] };
type Options = { enabled: boolean; userId: string; currentUserId: () => string | null;
  storage: Pick<Storage, "getItem" | "setItem">; fetch: typeof fetch; online?: () => boolean;
  locks?: Pick<LockManager, "request"> };

// Separate storage leaves existing history, session restoration and legacy queues intact.
export function createTrustedStudyClient(options: Options) {
  const key = `revit-trusted-study-v1:${options.userId}`;
  let disposed = false;
  let account: string | null = options.userId;
  let pending = Promise.resolve();
  const active = () => !disposed && options.enabled && account === options.userId && options.currentUserId() === options.userId;
  const read = (): State => {
    const value = options.storage.getItem(key);
    return value ? JSON.parse(value) : { sessions: {}, queue: [] };
  };
  const write = (state: State) => { if (active()) options.storage.setItem(key, JSON.stringify(state)); };
  // Every tab uses the same owner lock, including mutations made while a request is in flight.
  const exclusive = (operation: () => void | Promise<void>) => {
    if (!active()) return Promise.resolve();
    const locks = options.locks ?? globalThis.navigator?.locks;
    // Unsupported browsers retain personal history; never race the shared trusted queue.
    if (typeof window !== "undefined" && !locks) return Promise.resolve();
    const run = async () => { if (active()) await operation(); };
    pending = pending.then(async () => {
      if (locks) await locks.request(key, run); else await run();
    }).catch(() => {
      // Preserve unreadable/unwritable state for explicit recovery.
    });
    return pending;
  };
  async function post(path: string, body: unknown) {
    if (!active()) throw new Error("ACCOUNT_CHANGED");
    const response = await options.fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-RevIT-Account": options.userId }, body: JSON.stringify(body) });
    if (!active()) throw new Error("ACCOUNT_CHANGED");
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 409 ? "conflict" : [400, 401, 403, 410, 422].includes(response.status) ? "rejected" : "deferred");
    return data;
  }
  async function drain() {
    if (!active() || options.online?.() === false) return;
    for (const localId of Object.keys(read().sessions)) {
      if (!active()) return;
      let session = read().sessions[localId];
      if (session.userId !== options.userId || isStrasingerSessionBlocked(session.questionIds, false)) continue;
      if (!session.serverSessionId) {
        if (!session.issue) continue; // Unissued offline/restored sessions remain personal study.
        const plan = mapLocalSessionToTrustedPlan(session, session.localSessionId);
        try {
          const resumeOnly = read().queue.some(item => item.localSessionId === localId);
          const result = await post("/api/study/sessions", { requestId: plan.requestId, questionIds: plan.questionIds, mode: plan.mode, targetCount: plan.targetCount,
            ...(resumeOnly ? { resumeOnly: true } : {}) });
          if (typeof result.id !== "string" || result.userId !== options.userId || !Number.isFinite(Date.parse(result.expiresAt))
            || !Array.isArray(result.questionPool) || result.questionPool.length !== session.questionIds.length
            || result.nextSlot !== 0 || result.slotLimit !== 10000) throw new Error("deferred");
          const versions: Record<string, string> = {};
          for (const q of result.questionPool) {
            if (!session.questionIds.includes(q.question_id) || typeof q.content_version !== "string" || Object.hasOwn(versions, q.question_id)) throw new Error("deferred");
            versions[q.question_id] = q.content_version;
          }
          const state = read();
          session = { ...bindServerSession(state.sessions[localId], result.id, result.expiresAt), versions,
            nextSlot: state.sessions[localId].nextSlot, slotLimit: result.slotLimit, issue: false, attemptSlots: state.sessions[localId].attemptSlots };
          state.sessions[localId] = session;
          state.queue = state.queue.map(item => item.localSessionId === localId && !item.serverSessionId
            ? { ...item, serverSessionId: session.serverSessionId, contentVersion: versions[item.questionId] } : item);
          write(state);
        } catch (error) {
          if (error instanceof Error && ["conflict", "rejected"].includes(error.message)) {
            const state = read(); state.sessions[localId].issue = false; write(state);
          }
          continue;
        }
      }
      // The server permits exact durable retries after expiry, but rejects fresh expired work.
      while (active()) {
        const batch = getPendingRetries(isolateQueueByAccount(read().queue, options.userId))
          .filter(item => item.serverSessionId === session.serverSessionId).sort((a, b) => a.slot - b.slot).slice(0, 50);
        if (!batch.length) break;
        try {
          const result = await post("/api/study/attempts", { sessionId: session.serverSessionId,
            attempts: batch.map(item => ({ id: item.id, slot: item.slot, questionId: item.questionId, contentVersion: item.contentVersion, response: item.response })) });
          const acks = result.acknowledgments;
          if (!Array.isArray(acks) || acks.length !== batch.length || new Set(acks.map(a => a?.id)).size !== batch.length
            || !batch.every(item => acks.some(a => a.id === item.id && ["accepted", "already_accepted"].includes(a.status)
              && a.sessionId === item.serverSessionId && a.slot === item.slot && a.questionId === item.questionId
              && a.contentVersion === item.contentVersion && Number.isFinite(Date.parse(a.verified_at))))) throw new Error("deferred");
          const state = read();
          state.queue = pruneCompletedItems(transitionAttemptQueue(state.queue, acks)); write(state);
        } catch (error) {
          if (!active()) return;
          const status = error instanceof Error && ["conflict", "rejected"].includes(error.message) ? error.message as "conflict" | "rejected" : "deferred";
          const state = read(); const ids = new Set(batch.map(item => item.id));
          state.queue = state.queue.map(item => ids.has(item.id) ? transitionAttemptQueue(item, status, { errorMessage: status }) : item);
          write(state); break;
        }
      }
      session = read().sessions[localId];
      if (session.completion === "pending" && !read().queue.some(item => item.localSessionId === localId)) {
        const attemptIds = Object.entries(session.attemptSlots ?? {}).sort((a, b) => a[1] - b[1]).map(([id]) => id);
        try {
          const receipt = await post("/api/study/completion", { sessionId: session.serverSessionId, attemptIds });
          if (receipt.contract !== 1 || receipt.sessionId !== session.serverSessionId
            || !Number.isFinite(Date.parse(receipt.completedAt)) || JSON.stringify(receipt.attemptIds) !== JSON.stringify(attemptIds)) throw new Error("deferred");
          const state = read(); state.sessions[localId].completion = "accepted"; write(state);
        } catch (error) {
          if (!active()) return;
          if (error instanceof Error && ["conflict", "rejected"].includes(error.message)) {
            const state = read(); state.sessions[localId].completion = error.message as "conflict" | "rejected"; write(state);
          }
        }
      }
    }
  }
  const flush = () => exclusive(drain);
  return {
    startSession(input: CreateLocalSessionInput) {
      if (!active() || isStrasingerSessionBlocked(input.questionIds ?? [], false)) return Promise.resolve();
      return exclusive(async () => {
        const state = read();
        if (!state.sessions[input.localSessionId]) state.sessions[input.localSessionId] = { ...createLocalSessionState({ ...input, userId: options.userId }),
          versions: {}, nextSlot: 0, slotLimit: 10000, issue: options.online?.() !== false, attemptSlots: {} };
        write(state);
        await drain();
      });
    },
    recordAttempt(localSessionId: string, attempt: LocalSessionAttempt, question: ReviewerQuestion) {
      if (!active() || isStrasingerSessionBlocked([question.id], false)) return;
      return exclusive(() => {
        const state = read(); const session = state.sessions[localSessionId];
        if (!session || session.completion || session.userId !== options.userId || !attempt.id || Object.hasOwn(session.attemptSlots ?? {}, attempt.id)
          || state.queue.some(item => item.id === attempt.id)) return;
        // Slots are the sequential range authorized by the server manifest; Skip never calls this method.
        if (session.nextSlot >= session.slotLimit || !session.questionIds.includes(question.id)) return;
        const local = { ...attempt, slot: session.nextSlot, contentVersion: session.versions[question.id] ?? "pending" };
        const payload = formatTrustedAttemptPayload(local, { isMatching: !!question.matching,
          itemCount: question.matching?.items.length, optionCount: question.choices.length, contentVersion: local.contentVersion });
        const item = createQueueItem(options.userId, localSessionId, session.serverSessionId, payload);
        item.localSelectedAnswer = attempt.selectedAnswer;
        if (payload.response.kind === "matching") item.matchingSelections = [...payload.response.selections];
        state.queue.push(item);
        session.attemptSlots = { ...session.attemptSlots, [attempt.id]: session.nextSlot };
        session.nextSlot++; write(state);
      });
    },
    completeSession(localSessionId: string) {
      return exclusive(async () => {
        const state = read(); const session = state.sessions[localSessionId];
        if (!session || session.completion || !session.nextSlot) return;
        session.completion = "pending"; write(state); await drain();
      });
    },
    flush,
    setAccount(userId: string | null) { account = userId; },
    dispose() { disposed = true; },
  };
}
