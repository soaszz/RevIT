import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AI_LIMITS, QUESTION_BANKS } from "../app/lib/entitlements";
import { getPublicReviewerBooks, getUpcomingReviewerNames } from "../app/lib/publicReviewerBooks";

const read = (path: string) => readFileSync(path, "utf8");

test("published Pro catalog follows the canonical registry flags", () => {
  const current = getPublicReviewerBooks();
  assert.equal(current.freeNames, "Harr");
  assert.deepEqual(current.books.map(book => book.id), ["harr", "ciulla", "rodak", "strasinger"]);
  assert.equal(current.proNames, "Ciulla, Rodak, Strasinger");
  assert.equal(getUpcomingReviewerNames(), "BOC Study Guide 7th Edition and Elsevier's MLS Examination Review");

  const allPublished = getPublicReviewerBooks({
    ...QUESTION_BANKS,
    boc: { ...QUESTION_BANKS.boc, published: true },
    elsevier: { ...QUESTION_BANKS.elsevier, published: true },
  });
  assert.equal(allPublished.proNames, "Ciulla, Rodak, Strasinger, BOC, Elsevier");
  assert.equal(allPublished.proBooks.length, 5);
  assert.equal(allPublished.freeNames, "Harr");
  assert.equal(getUpcomingReviewerNames({
    ...QUESTION_BANKS,
    boc: { ...QUESTION_BANKS.boc, published: true },
    elsevier: { ...QUESTION_BANKS.elsevier, published: true },
  }), "");

  const nonePublished = getPublicReviewerBooks({
    ...QUESTION_BANKS,
    boc: { ...QUESTION_BANKS.boc, published: false },
    elsevier: { ...QUESTION_BANKS.elsevier, published: false },
  });
  assert.equal(nonePublished.proNames, "Ciulla, Rodak, Strasinger");
  assert.doesNotMatch(JSON.stringify(nonePublished), /BOC|Elsevier/);
});

test("Pro activation messaging uses the canonical catalog and AI limits", () => {
  const modal = read("app/components/ProActivationModal.tsx");
  assert.match(modal, /PUBLIC_REVIEWERS\.proBooks\.length/);
  assert.match(modal, /PUBLIC_REVIEWERS\.proNames/);
  assert.match(modal, /PUBLIC_REVIEWERS\.freeNames/);
  assert.match(modal, /AI_LIMITS\.pro\.dailyRequests/);
  assert.match(modal, /Access to newly added Pro reviewer books/);
  assert.doesNotMatch(modal, /\b15 RevIT AI/);
  for (const name of ["Harr", "Ciulla", "Rodak", "Strasinger", "BOC", "Elsevier"]) {
    assert.doesNotMatch(modal, new RegExp(`>${name}<|"${name}"`), `no hardcoded ${name} book list`);
  }
  assert.equal(AI_LIMITS.pro.dailyRequests, 15);
});

test("Google completion keeps server-side identity verification and the shared loading identity", () => {
  const callback = read("app/auth/callback/route.ts");
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /identities\?\.some\(\(identity\) => identity\.provider === "google"\)/);
  assert.match(callback, /oauthFailure/);

  const complete = read("app/auth/oauth-complete/OAuthCompleteClient.tsx");
  assert.match(complete, /RevITLoadingScreen/);
  assert.match(complete, /status="Finishing Google sign-in/);
  assert.match(complete, /identity\.provider === "google"/);
  assert.match(complete, /oauth_error=google_session/);
  assert.match(complete, /SESSION_CHECK_TIMEOUT_MS/);
  assert.match(complete, /window\.location\.replace/);
  assert.doesNotMatch(complete, /signInWithOAuth|signOut|refreshSession/);
});

test("startup withholds the app until entitlement verification is ready", () => {
  const app = read("app/RevITApp.tsx");
  assert.match(app, /startupAccess\.status === "loading"\) return <RevITLoadingScreen/);
  assert.match(app, /const accessReady = startupAccess\.owner === accessOwner && startupAccess\.status === "ready"/);
  assert.match(app, /const proActive = accessReady && isProActive\(entitlement\)/);
  assert.equal((read("app/lib/cloudService.ts").match(/rpc\("get_my_entitlement"\)/g) ?? []).length, 1, "one entitlement request helper");
});
