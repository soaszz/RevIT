import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authPanel = readFileSync("app/auth/AuthPanel.tsx", "utf8");
const callback = readFileSync("app/auth/callback/route.ts", "utf8");
const oauthComplete = readFileSync("app/auth/oauth-complete/OAuthCompleteClient.tsx", "utf8");
const accountSettings = readFileSync("app/components/AccountSettings.tsx", "utf8");
const foundation = readFileSync("supabase/migrations/202608200001_revit_cloud_foundation.sql", "utf8");
const googleAuthSources = [authPanel, callback, oauthComplete, accountSettings].join("\n");

test("Google is the only added social provider", () => {
  assert.match(authPanel, /signInWithOAuth\(\{[\s\S]*provider: "google"/);
  assert.match(accountSettings, /linkIdentity\(\{[\s\S]*provider: "google"/);
  assert.doesNotMatch(googleAuthSources, /provider:\s*["'](?:apple|facebook)["']/i);
  assert.doesNotMatch(googleAuthSources, /Continue with (?:Apple|Facebook)|Connect (?:Apple|Facebook)/i);
});

test("recent Google method is stored only after callback and session verification", () => {
  assert.doesNotMatch(authPanel, /setItem\(LAST_SIGN_IN_METHOD_KEY,\s*"google"\)/);
  assert.match(oauthComplete, /auth\.getUser\(\)/);
  assert.match(oauthComplete, /identity\.provider === "google"/);
  assert.match(oauthComplete, /setItem\(LAST_SIGN_IN_METHOD_KEY,\s*"google"\)/);
  assert.match(callback, /httpOnly:\s*true/);
});

test("OAuth callback restricts redirects and separates login from linking", () => {
  assert.match(callback, /startsWith\("\/"\) && !value\.startsWith\("\/\/"\)/);
  assert.match(callback, /flow === "google"/);
  assert.match(callback, /flow === "link-google"/);
  assert.match(callback, /google_linked/);
  assert.match(callback, /hasGoogleIdentity/);
});

test("existing RevIT ownership remains keyed to the Supabase auth UUID", () => {
  assert.match(foundation, /profiles \(\s*[\s\S]*id uuid primary key references auth\.users\(id\)/);
  assert.match(foundation, /on conflict \(id\) do nothing/);
  assert.match(foundation, /auth\.uid\(\)\) = id/);
  assert.doesNotMatch(accountSettings, /\.from\(["']profiles["']\)[\s\S]*linkIdentity/);
});