import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FREE_ENTITLEMENT, type SubscriptionEntitlement } from "../app/lib/entitlements";
import { proExpiryEventId, proExpirySeenKey, verifiedProExpiration } from "../app/lib/proExpiryNotice";

const expiredAt = "2026-11-01T00:00:00.000Z";
const checkedAt = "2026-11-02T00:00:00.000Z";

function entitlement(overrides: Partial<SubscriptionEntitlement> = {}): SubscriptionEntitlement {
  return {
    storedPlan: "pro",
    effectivePlan: "free",
    proStartedAt: "2026-10-01T00:00:00.000Z",
    proExpiresAt: expiredAt,
    serverNow: checkedAt,
    ...overrides,
  };
}

test("verified expiration requires verified access and server-confirmed past expiry", () => {
  assert.equal(verifiedProExpiration(entitlement(), true), expiredAt);
  assert.equal(verifiedProExpiration(entitlement(), false), null, "loading or failed verification");
  assert.equal(verifiedProExpiration(null, true), null, "no entitlement");
  assert.equal(verifiedProExpiration(FREE_ENTITLEMENT, true), null, "never Pro");

  assert.equal(verifiedProExpiration(entitlement({ effectivePlan: "pro" }), true), null, "active Pro");
  assert.equal(verifiedProExpiration(entitlement({ storedPlan: "free" }), true), null, "revoked or never granted");
  assert.equal(verifiedProExpiration(entitlement({ proExpiresAt: "2026-12-01T00:00:00.000Z" }), true), null, "future expiry");
  assert.equal(verifiedProExpiration(entitlement({ proExpiresAt: null }), true), null, "missing expiry");
  assert.equal(verifiedProExpiration(entitlement({ serverNow: null }), true), null, "unverified server clock");
  assert.equal(verifiedProExpiration(entitlement({ proExpiresAt: "not-a-date" }), true), null, "unparseable expiry");
  assert.equal(verifiedProExpiration(entitlement({ serverNow: "not-a-date" }), true), null, "unparseable server clock");
});

test("expiration event identity is account-scoped, stable and does not persist the raw instant", () => {
  const id = proExpiryEventId(expiredAt);
  assert.equal(id, proExpiryEventId(expiredAt));
  assert.match(id, /^[0-9a-z]+$/);
  assert.equal(id.includes("2026"), false);
  assert.notEqual(id, proExpiryEventId("2026-12-01T00:00:00.000Z"));
  assert.equal(proExpirySeenKey("user-a"), "revit_pro_expiry_notice_user-a");
  assert.notEqual(proExpirySeenKey("user-a"), proExpirySeenKey("user-b"));
});

test("notice UI reuses the shared dialog, published catalog and canonical subscribe link", () => {
  const component = readFileSync("app/components/ProExpiredNotice.tsx", "utf8");
  assert.match(component, /from "\.\/PlanAnnouncementModal\.module\.css"/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /aria-labelledby=/);
  assert.match(component, /e\.key === "Escape"|event\.key === "Escape"/);
  assert.match(component, /PUBLIC_REVIEWERS\.proNames/);
  assert.match(component, /PUBLIC_REVIEWERS\.proBooks\.length/);
  assert.match(component, /AI_LIMITS\.pro\.dailyRequests/);
  assert.match(component, /href=\{PRO_CONTACT_URL\}/);
  assert.match(component, /target="_blank"/);
  assert.match(component, /rel="noopener noreferrer"/);
  assert.doesNotMatch(component, /supabase|fetch\(|\.rpc\(|auth\./i, "no network or account access");
  assert.doesNotMatch(component, /border-radius:\s*99px|borderRadius:\s*99/, "no pill styling");
  assert.doesNotMatch(component, /localStorage\.setItem|profiles\.|pro_expires_at\s*=/, "no persistence or writes");
});
