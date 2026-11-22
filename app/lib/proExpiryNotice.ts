import type { SubscriptionEntitlement } from "./entitlements";

// A verified expiration needs three server facts: the account was stored as Pro, the server now
// reports Free access, and the recorded expiration is at or before the server's clock. Missing or
// unparseable facts stay unverified so the notice is never shown on a guess or a stale local state.
export function verifiedProExpiration(
  entitlement: SubscriptionEntitlement | null | undefined,
  accessReady: boolean,
): string | null {
  if (!accessReady || !entitlement) return null;
  if (entitlement.storedPlan !== "pro" || entitlement.effectivePlan !== "free") return null;
  if (!entitlement.proExpiresAt || !entitlement.serverNow) return null;
  const expiresAt = Date.parse(entitlement.proExpiresAt);
  const checkedAt = Date.parse(entitlement.serverNow);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(checkedAt) || expiresAt > checkedAt) return null;
  return entitlement.proExpiresAt;
}

export function proExpirySeenKey(userId: string) {
  return `revit_pro_expiry_notice_${userId}`;
}

// Event identity is the verified expiration instant, stored as a short non-reversible fingerprint so
// no subscription dates or account details are persisted. A later renewal that expires again
// produces a different instant and a fresh notice.
export function proExpiryEventId(expiresAt: string) {
  let hash = 5381;
  for (let index = 0; index < expiresAt.length; index += 1) {
    hash = ((hash * 33) ^ expiresAt.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}
