import type { ReviewerBook } from "../content/reviewerContent";

export type SubscriptionPlan = "free" | "pro";

export type SubscriptionEntitlement = {
  storedPlan: SubscriptionPlan;
  effectivePlan: SubscriptionPlan;
  proStartedAt: string | null;
  proExpiresAt: string | null;
  serverNow: string | null;
};

export type SubscriptionFeature =
  | "advancedProgress"
  | "weaknessAnalytics"
  | "advancedRecommendations";

export const FREE_ENTITLEMENT: SubscriptionEntitlement = Object.freeze({
  storedPlan: "free",
  effectivePlan: "free",
  proStartedAt: null,
  proExpiresAt: null,
  serverNow: null,
});

export const QUESTION_BANKS: Readonly<Record<Lowercase<ReviewerBook>, {
  id: Lowercase<ReviewerBook>;
  label: ReviewerBook;
  requiredPlan: SubscriptionPlan;
  published?: boolean;
}>> = Object.freeze({
  harr: { id: "harr", label: "Harr", requiredPlan: "free" },
  ciulla: { id: "ciulla", label: "Ciulla", requiredPlan: "pro" },
  rodak: { id: "rodak", label: "Rodak", requiredPlan: "pro" },
  strasinger: { id: "strasinger", label: "Strasinger", requiredPlan: "pro" },
  boc: { id: "boc", label: "BOC", requiredPlan: "pro", published: false },
  elsevier: { id: "elsevier", label: "Elsevier", requiredPlan: "pro", published: false },
});

export const AI_LIMITS: Readonly<Record<SubscriptionPlan, {
  minuteRequests: number;
  dailyRequests: number;
}>> = Object.freeze({
  free: { minuteRequests: 2, dailyRequests: 3 },
  pro: { minuteRequests: 5, dailyRequests: 15 },
});

export function getEffectivePlan(entitlement: SubscriptionEntitlement | null | undefined): SubscriptionPlan {
  return entitlement?.effectivePlan === "pro" ? "pro" : "free";
}

export function isProActive(entitlement: SubscriptionEntitlement | null | undefined) {
  return getEffectivePlan(entitlement) === "pro";
}

export function canAccessFeature(feature: SubscriptionFeature, entitlement: SubscriptionEntitlement | null | undefined) {
  void feature;
  return isProActive(entitlement);
}

export function canAccessQuestionBank(book: ReviewerBook, entitlement: SubscriptionEntitlement | null | undefined) {
  const bank = QUESTION_BANKS[book.toLowerCase() as Lowercase<ReviewerBook>];
  return isQuestionBankPublished(book) && (bank.requiredPlan === "free" || isProActive(entitlement));
}

export function isQuestionBankPublished(book: ReviewerBook) {
  const bank = QUESTION_BANKS[book.toLowerCase() as Lowercase<ReviewerBook>];
  const localPreview = (book === "Elsevier" || book === "BOC") && process.env.NODE_ENV === "development";
  return Boolean(bank) && (bank.published !== false || localPreview);
}

export function getAiLimits(entitlement: SubscriptionEntitlement | null | undefined) {
  return AI_LIMITS[getEffectivePlan(entitlement)];
}
