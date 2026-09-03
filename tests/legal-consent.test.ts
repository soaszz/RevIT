import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  hasCurrentLegalConsent,
} from "../app/lib/legal";

const currentConsent = {
  terms_accepted_at: "2026-09-03T08:00:00.000Z",
  terms_version: CURRENT_TERMS_VERSION,
  privacy_accepted_at: "2026-09-03T08:00:00.000Z",
  privacy_version: CURRENT_PRIVACY_VERSION,
};

test("current versions and timestamps satisfy the consent gate", () => {
  assert.equal(hasCurrentLegalConsent(currentConsent), true);
});

test("missing or null consent does not satisfy the consent gate", () => {
  assert.equal(hasCurrentLegalConsent(null), false);
  assert.equal(hasCurrentLegalConsent({ ...currentConsent, terms_accepted_at: null }), false);
  assert.equal(hasCurrentLegalConsent({ ...currentConsent, privacy_version: null }), false);
});

test("a future Terms or Privacy version reopens the consent gate", () => {
  assert.equal(hasCurrentLegalConsent({ ...currentConsent, terms_version: "2026-08-01" }), false);
  assert.equal(hasCurrentLegalConsent({ ...currentConsent, privacy_version: "2026-08-01" }), false);
});
