import type { ReviewMode } from "./domain";
import { STRASINGER_CLOUD_SYNC_ENABLED } from "./cloudSyncGate";
import type { ReviewerQuestion } from "../content/reviewerContent";

export type LocalStudySessionState = {
  localSessionId: string;
  serverSessionId: string | null;
  serverSessionExpiresAt: string | number | null;
  userId?: string | null;
  mode: ReviewMode | string;
  questionIds: string[];
  targetCount: number;
  selectedTopicIds?: string[];
  createdAt: string;
};

export type LocalSessionAttempt = {
  id?: string;
  attemptId?: string;
  slot?: number;
  questionId: string;
  selectedAnswer: number | null;
  matchingSelections?: number[];
  correct?: boolean;
  isCorrect?: boolean;
  didTimeOut?: boolean;
  timedOut?: boolean;
  timestamp?: string;
  answeredAtMs?: number;
  contentVersion?: string;
  [key: string]: unknown;
};

export type TrustedSessionPlanRequest = {
  requestId: string;
  localSessionId: string;
  questionIds: string[];
  topicIds?: string[];
  mode: string;
  targetCount: number;
  clientCreatedAt?: string;
};

export type TrustedAttemptResponse =
  | { kind: "single_choice"; choiceIndex: number }
  | { kind: "matching"; selections: number[] }
  | { kind: "timeout" };

export type TrustedBatchAttemptPayload = {
  id: string;
  slot: number;
  questionId: string;
  contentVersion: string;
  response: TrustedAttemptResponse;
  dbSelectedAnswer?: number | null;
};

export type TrustedBatchCommitRequest = {
  sessionId: string;
  attempts: TrustedBatchAttemptPayload[];
};

export type QueueTransitionStatus =
  | "pending"
  | "accepted"
  | "already_accepted"
  | "rejected"
  | "conflict"
  | "deferred";

export type QueueTransitionItem = {
  id: string;
  attemptId: string;
  userId: string;
  localSessionId: string;
  serverSessionId: string | null;
  slot: number;
  questionId: string;
  contentVersion: string;
  response: TrustedAttemptResponse;
  localSelectedAnswer: number | null;
  matchingSelections?: number[];
  status: QueueTransitionStatus;
  retryCount: number;
  lastAttemptAt?: string;
  lastError?: string;
  error?: string;
  verifiedAt?: string;
};

export type CreateLocalSessionInput = {
  localSessionId: string;
  userId?: string | null;
  mode?: ReviewMode | string;
  questionIds?: string[];
  targetCount?: number;
  selectedTopicIds?: string[];
  createdAt?: string;
  createdAtMs?: number;
};

export function createLocalSessionState(
  idOrConfig: string | CreateLocalSessionInput,
  modeArg?: ReviewMode | string,
  questionIdsArg?: string[],
  targetCountArg?: number,
  createdAtArg?: string,
): LocalStudySessionState {
  if (typeof idOrConfig === "object" && idOrConfig !== null) {
    const qIds = idOrConfig.questionIds ?? [];
    return {
      localSessionId: idOrConfig.localSessionId,
      serverSessionId: null,
      serverSessionExpiresAt: null,
      userId: idOrConfig.userId ?? null,
      mode: idOrConfig.mode ?? "reviewer",
      questionIds: [...qIds],
      targetCount: idOrConfig.targetCount ?? qIds.length,
      selectedTopicIds: idOrConfig.selectedTopicIds ? [...idOrConfig.selectedTopicIds] : undefined,
      createdAt: idOrConfig.createdAt ?? (idOrConfig.createdAtMs ? new Date(idOrConfig.createdAtMs).toISOString() : new Date().toISOString()),
    };
  }

  const qIds = questionIdsArg ?? [];
  return {
    localSessionId: idOrConfig,
    serverSessionId: null,
    serverSessionExpiresAt: null,
    userId: null,
    mode: modeArg ?? "reviewer",
    questionIds: [...qIds],
    targetCount: targetCountArg ?? qIds.length,
    createdAt: createdAtArg ?? new Date().toISOString(),
  };
}

export function bindServerSession(
  localState: LocalStudySessionState,
  serverSessionId: string,
  expiresAt: string | number,
): LocalStudySessionState {
  return {
    ...localState,
    serverSessionId,
    serverSessionExpiresAt: expiresAt,
  };
}

export function isServerSessionExpired(
  state: LocalStudySessionState,
  nowMs = Date.now(),
): boolean {
  if (state.serverSessionExpiresAt === null || state.serverSessionExpiresAt === undefined) return false;
  const expiry = typeof state.serverSessionExpiresAt === "number"
    ? state.serverSessionExpiresAt
    : new Date(state.serverSessionExpiresAt).getTime();
  return !Number.isFinite(expiry) || expiry <= nowMs;
}

export function mapLocalSessionToTrustedPlan(
  state: LocalStudySessionState,
  requestId = crypto.randomUUID(),
): TrustedSessionPlanRequest {
  const uniqueTopics = state.selectedTopicIds
    ? Array.from(new Set(state.selectedTopicIds))
    : undefined;

  return {
    requestId,
    localSessionId: state.localSessionId,
    questionIds: [...state.questionIds],
    topicIds: uniqueTopics,
    mode: String(state.mode),
    targetCount: state.targetCount,
    clientCreatedAt: state.createdAt,
  };
}

export function decodeMatchingSelections(
  encodedOrAttempt: number | LocalSessionAttempt,
  itemCountOrQuestion: number | ReviewerQuestion,
  optionCountArg?: number,
): number[] {
  if (typeof encodedOrAttempt === "object" && encodedOrAttempt !== null) {
    if (Array.isArray(encodedOrAttempt.matchingSelections) && encodedOrAttempt.matchingSelections.length > 0) {
      return [...encodedOrAttempt.matchingSelections];
    }
    const q = itemCountOrQuestion as ReviewerQuestion;
    const encoded = encodedOrAttempt.selectedAnswer;
    if (typeof encoded !== "number" || !q.matching) return [];
    return decodeMatchingSelections(encoded, q.matching.items.length, q.choices.length);
  }

  const encoded = encodedOrAttempt;
  const itemCount = itemCountOrQuestion as number;
  const optionCount = optionCountArg ?? 4;

  if (!Number.isSafeInteger(encoded) || encoded < 0 || optionCount < 2 || itemCount <= 0) {
    return [];
  }
  const selections = new Array<number>(itemCount);
  let remaining = encoded;
  for (let i = itemCount - 1; i >= 0; i--) {
    selections[i] = remaining % optionCount;
    remaining = Math.floor(remaining / optionCount);
  }
  return selections;
}

export function formatTrustedAttemptPayload(
  attempt: LocalSessionAttempt,
  questionOrOptions?: ReviewerQuestion | {
    isMatching?: boolean;
    itemCount?: number;
    optionCount?: number;
    contentVersion?: string;
  },
): TrustedBatchAttemptPayload {
  let isMatching = false;
  let itemCount: number | undefined;
  let optionCount: number | undefined;
  let contentVersion = "v1";

  if (questionOrOptions) {
    if ("choices" in questionOrOptions) {
      const q = questionOrOptions as ReviewerQuestion;
      isMatching = Boolean(q.matching);
      itemCount = q.matching?.items.length;
      optionCount = q.choices.length;
      contentVersion = (q as unknown as { contentVersion?: string }).contentVersion ?? "v1";
    } else {
      isMatching = Boolean(questionOrOptions.isMatching);
      itemCount = questionOrOptions.itemCount;
      optionCount = questionOrOptions.optionCount;
      contentVersion = questionOrOptions.contentVersion ?? "v1";
    }
  }

  const stableId = (attempt.id ?? attempt.attemptId) || crypto.randomUUID();
  const slot = attempt.slot ?? 0;
  const isTimeout = Boolean(attempt.didTimeOut || attempt.timedOut || attempt.selectedAnswer === null);

  let response: TrustedAttemptResponse;
  let dbSelectedAnswer: number | null = null;

  if (isTimeout) {
    response = { kind: "timeout" };
    dbSelectedAnswer = null;
  } else if (isMatching) {
    let selections: number[];
    if (Array.isArray(attempt.matchingSelections) && attempt.matchingSelections.length > 0) {
      selections = [...attempt.matchingSelections];
    } else if (typeof attempt.selectedAnswer === "number" && itemCount && optionCount) {
      selections = decodeMatchingSelections(attempt.selectedAnswer, itemCount, optionCount);
    } else {
      selections = [];
    }
    response = { kind: "matching", selections };
    dbSelectedAnswer = null; // matching selections do not fit integer check constraint <= 3
  } else {
    const choiceIdx = attempt.selectedAnswer ?? 0;
    response = {
      kind: "single_choice",
      choiceIndex: choiceIdx,
    };
    dbSelectedAnswer = choiceIdx;
  }

  return {
    id: stableId,
    slot,
    questionId: attempt.questionId,
    contentVersion,
    response,
    dbSelectedAnswer,
  };
}

export function isStrasingerSessionBlocked(
  questionOrTopicIds: string[],
  syncEnabled = STRASINGER_CLOUD_SYNC_ENABLED,
): boolean {
  if (syncEnabled) return false;
  return questionOrTopicIds.some((id) => {
    const lower = id.toLowerCase();
    return lower.startsWith("strasinger") || lower.includes("strasinger");
  });
}

export function isolateQueueByAccount(
  queue: QueueTransitionItem[],
  currentUserId: string | null,
): QueueTransitionItem[] {
  if (!currentUserId) return [];
  return queue.filter((item) => item.userId === currentUserId);
}

export function createQueueItem(
  userId: string,
  localSessionId: string,
  serverSessionId: string | null,
  payloadOrAttempt: TrustedBatchAttemptPayload | LocalSessionAttempt,
  questionOrOptions?: ReviewerQuestion | {
    isMatching?: boolean;
    itemCount?: number;
    optionCount?: number;
    contentVersion?: string;
  },
): QueueTransitionItem {
  let payload: TrustedBatchAttemptPayload;
  let localSelectedAnswer: number | null = null;
  let matchingSelections: number[] | undefined;

  if ("response" in payloadOrAttempt && "id" in payloadOrAttempt) {
    payload = payloadOrAttempt as TrustedBatchAttemptPayload;
    if (payload.response.kind === "single_choice") {
      localSelectedAnswer = payload.response.choiceIndex;
    } else if (payload.response.kind === "matching") {
      matchingSelections = [...payload.response.selections];
    }
  } else {
    const att = payloadOrAttempt as LocalSessionAttempt;
    payload = formatTrustedAttemptPayload(att, questionOrOptions);
    localSelectedAnswer = att.selectedAnswer;
    matchingSelections = att.matchingSelections ? [...att.matchingSelections] : undefined;
  }

  return {
    id: payload.id,
    attemptId: payload.id,
    userId,
    localSessionId,
    serverSessionId,
    slot: payload.slot,
    questionId: payload.questionId,
    contentVersion: payload.contentVersion,
    response: payload.response,
    localSelectedAnswer,
    matchingSelections,
    status: "pending",
    retryCount: 0,
  };
}

// Overload for single item transition
export function transitionAttemptQueue(
  item: QueueTransitionItem,
  status: QueueTransitionStatus,
  details?: { errorMessage?: string },
): QueueTransitionItem;

// Overload for batch transition
export function transitionAttemptQueue(
  queue: QueueTransitionItem[],
  acknowledgments: Array<{ id: string; verified_at?: string; [key: string]: unknown }>,
  errors?: Array<{ id: string; status: "rejected" | "conflict" | "deferred"; message: string }>,
): QueueTransitionItem[];

export function transitionAttemptQueue(
  itemOrQueue: QueueTransitionItem | QueueTransitionItem[],
  arg2: QueueTransitionStatus | Array<{ id: string; verified_at?: string; [key: string]: unknown }>,
  arg3?: { errorMessage?: string } | Array<{ id: string; status: "rejected" | "conflict" | "deferred"; message: string }>,
): QueueTransitionItem | QueueTransitionItem[] {
  if (Array.isArray(itemOrQueue)) {
    const queue = itemOrQueue;
    const acks = (arg2 as Array<{ id: string; verified_at?: string; status?: string }>) || [];
    const errors = (arg3 as Array<{ id: string; status: "rejected" | "conflict" | "deferred"; message: string }>) || [];
    const ackMap = new Map(acks.filter(a => (a.status === "accepted" || a.status === "already_accepted")
      && typeof a.verified_at === "string" && Number.isFinite(Date.parse(a.verified_at))).map((a) => [a.id, a]));
    const errorMap = new Map(errors.map((e) => [e.id, e]));

    return queue.map((item) => {
      if (item.status === "accepted" || item.status === "already_accepted") {
        return item;
      }
      const ack = ackMap.get(item.id);
      if (ack) {
        return {
          ...item,
          status: ack.status as "accepted" | "already_accepted",
          verifiedAt: ack.verified_at,
          lastError: undefined,
          error: undefined,
        };
      }
      const err = errorMap.get(item.id);
      if (err) {
        return {
          ...item,
          status: err.status,
          retryCount: item.retryCount + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: err.message,
          error: err.message,
        };
      }
      return item;
    });
  }

  // Single item transition
  const item = itemOrQueue;
  const newStatus = arg2 as QueueTransitionStatus;
  const details = arg3 as { errorMessage?: string } | undefined;

  return {
    ...item,
    status: newStatus,
    retryCount: newStatus === "deferred" ? item.retryCount + 1 : item.retryCount,
    lastAttemptAt: new Date().toISOString(),
    lastError: details?.errorMessage,
    error: details?.errorMessage,
    verifiedAt: (newStatus === "accepted" || newStatus === "already_accepted") ? new Date().toISOString() : item.verifiedAt,
  };
}

export function getPendingRetries(
  queue: QueueTransitionItem[],
  maxRetries = 5,
): QueueTransitionItem[] {
  return queue.filter(
    (item) =>
      (item.status === "pending" || item.status === "deferred") &&
      item.retryCount <= maxRetries,
  );
}

export function pruneCompletedItems(queue: QueueTransitionItem[]): QueueTransitionItem[] {
  return queue.filter(
    (item) => item.status !== "accepted" && item.status !== "already_accepted",
  );
}
