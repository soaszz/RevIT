import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canAccessFeature, FEATURES } from "../app/lib/features";
import {
  defaultUserPreferences,
  normalizeUserPreferences,
  withMtapFeaturePreference,
} from "../app/lib/userPreferences";

test("only the Grade Simulator currently requires MTAP access", () => {
  const standard = defaultUserPreferences("Asia/Manila");
  const controlled = Object.entries(FEATURES)
    .filter(([, access]) => access.requiresMtap)
    .map(([feature]) => feature);

  assert.deepEqual(controlled, ["gradeSimulator"]);
  assert.equal(canAccessFeature("gradeSimulator", standard), false);
  assert.equal(canAccessFeature("grades", standard), true);
  assert.equal(canAccessFeature("reviewLibrary", standard), true);
  assert.equal(canAccessFeature("revitAi", standard), true);
  assert.equal(canAccessFeature("achievements", standard), true);
  assert.equal(canAccessFeature("gradeSimulator", withMtapFeaturePreference(standard, true)), true);
});

test("legacy users default to standard RevIT and either choice completes onboarding", () => {
  const legacy = normalizeUserPreferences({
    timezone: "Asia/Manila",
    theme: "dark",
    leaderboard_opt_in: true,
  });
  assert.equal(legacy.mtap_features_enabled, false);
  assert.equal(legacy.mtap_onboarding_completed, false);

  const enabled = withMtapFeaturePreference(legacy, true);
  assert.equal(enabled.mtap_features_enabled, true);
  assert.equal(enabled.mtap_onboarding_completed, true);
  assert.equal(enabled.theme, "dark");
  assert.equal(enabled.leaderboard_opt_in, true);

  const disabled = withMtapFeaturePreference(enabled, false);
  assert.equal(disabled.mtap_features_enabled, false);
  assert.equal(disabled.mtap_onboarding_completed, true);
  assert.equal(enabled.mtap_features_enabled, true, "updates do not mutate the prior preference object");
});

test("onboarding, settings, access control, and private persistence are wired together", async () => {
  const [app, onboarding, settings, grades, cloud, migration, rlsChecks, privacy] = await Promise.all([
    readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MtapOnboarding.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MtapPreferenceControl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/GradesPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/cloudService.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202609060009_mtap_personalization.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/tests/rls_checks.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(onboarding, /Welcome to RevIT/);
  assert.match(onboarding, /Are you currently a National University student or studying at NU MOA, a 4th year Medical Technology student, and taking MTAP\?/);
  assert.match(onboarding, /Yes, enable MTAP features/);
  assert.match(onboarding, /No, continue with standard RevIT/);
  assert.match(app, /!preferences\.mtap_onboarding_completed/);
  assert.match(app, /withMtapFeaturePreference\(preferences, enabled\)/);

  assert.match(settings, /MTAP Features/);
  assert.match(settings, /Enable features designed for National University MTAP preparation\./);
  assert.match(settings, /role="switch"/);

  assert.match(app, /canAccessFeature\("gradeSimulator", preferences\)/);
  assert.match(app, /showSimulator=\{gradeSimulatorEnabled\}/);
  assert.match(grades, /showSimulator &&/);
  assert.match(grades, /Grade Simulator/);
  assert.match(grades, /Save all grades/);

  assert.match(cloud, /mtap_features_enabled,mtap_onboarding_completed/);
  assert.match(migration, /alter table public\.user_preferences/);
  assert.match(migration, /mtap_features_enabled boolean not null default false/);
  assert.match(migration, /mtap_onboarding_completed boolean not null default false/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.user_preferences from anon/);
  assert.doesNotMatch(migration, /create table/);
  assert.match(rlsChecks, /user two can see user one private preferences or MTAP choice/);
  assert.match(privacy, /MTAP choice is private/);
});
