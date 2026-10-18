import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import type * as Effects from "../app/lib/server/trustedStudyEffects";
import { ACHIEVEMENT_CATALOG, XP_REWARDS } from "../app/lib/xpConfig";
import * as xp from "../app/lib/xpConfig";
import * as reinforcement from "../app/lib/adaptiveQuestions";

const source = readFileSync(new URL("../app/lib/server/trustedStudyEffects.ts", import.meta.url), "utf8");
const loaded = { exports: {} };
const require = createRequire(import.meta.url);
new Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(
  (name: string) => name === "server-only" ? {} : name === "../xpConfig" ? xp : name === "../adaptiveQuestions" ? reinforcement : require(name), loaded, loaded.exports);
const effects = loaded.exports as typeof Effects;
const id = "11111111-1111-4111-8111-111111111111";

test("disconnected effects preserve reward amounts, reinforcement and receipt-date daily keys", () => {
  const attempt = { id, is_correct: false, verified_at: "2026-10-16T16:00:00Z" };
  for (const level of [0, 1, 2, 3]) {
    const wrong = effects.planTrustedAttemptEffects(attempt, level);
    assert.equal(wrong.answer.xp, 0); assert.equal(wrong.reinforcementLevel, Math.min(3, level + 1));
    const correct = effects.planTrustedAttemptEffects({ ...attempt, is_correct: true }, level);
    assert.equal(correct.answer.xp, XP_REWARDS.CORRECT_QUESTION); assert.equal(correct.reinforcementLevel, 0);
    assert.equal(correct.daily.eventKey, "xp:daily-streak:2026-10-17"); assert.equal(correct.daily.xp, XP_REWARDS.DAILY_STREAK);
    assert.deepEqual(correct, effects.planTrustedAttemptEffects({ ...attempt, is_correct: true }, level));
  }
  assert.throws(() => effects.planTrustedAttemptEffects({ ...attempt, verified_at: "invalid" }, 0), /INVALID_EFFECT_EVIDENCE/);
  assert.doesNotMatch(source, /\.rpc\(|\.from\(|fetch\(|createClient|total_xp\s*=/);
});

test("achievement candidates preserve catalog amounts and existing unlocks without paying inferred history", () => {
  const metrics = { questionsAnswered: 500, aiMessages: 5, streakDays: 14, examsCreated: 1, studySessions: 25 };
  const before = structuredClone(metrics);
  const candidates = effects.planTrustedAchievementUnlocks(metrics, []);
  assert.equal(candidates.length, ACHIEVEMENT_CATALOG.length);
  assert.deepEqual(candidates.map(a => a.xp), ACHIEVEMENT_CATALOG.map(a => a.xp_reward));
  assert.deepEqual(effects.planTrustedAchievementUnlocks(metrics, candidates.map(a => a.achievementId)), []);
  assert.deepEqual(metrics, before);
  assert.throws(() => effects.planTrustedAchievementUnlocks({ ...metrics, questionsAnswered: NaN }, []), /INVALID_EFFECT_EVIDENCE/);
});

test("coverage counts unique verified questions; skips/repeats cannot prove completion or enable awards", () => {
  const session = { id: "session", user_id: "owner", question_pool: ["q1", "q2"].map(question_id => ({ question_id, content_version: "version" })) };
  const row = (id: string, question_id: string, session_slot: number) => ({ id, question_id, session_slot, user_id: "owner", session_id: "session", content_version: "version", verified_at: "2026-10-16T00:00:00Z" });
  const repeated = effects.inspectTrustedCompletionCoverage(session, [row("a", "q1", 0), row("b", "q1", 1)]);
  assert.deepEqual(repeated.missingQuestionIds, ["q2"]); assert.equal(repeated.allQuestionsAnswered, false);
  const complete = effects.inspectTrustedCompletionCoverage(session, [row("a", "q1", 0), row("b", "q2", 1)]);
  assert.equal(complete.allQuestionsAnswered, true); assert.equal(complete.completionAwardEnabled, false);
  for (const patch of [{ user_id: "other" }, { session_id: "other" }, { content_version: "old" }, { session_slot: -1 }, { verified_at: "invalid" }]) {
    assert.throws(() => effects.inspectTrustedCompletionCoverage(session, [{ ...row("a", "q1", 0), ...patch }]), /INVALID_EFFECT_EVIDENCE/);
  }
  assert.throws(() => effects.inspectTrustedCompletionCoverage(session, [row("a", "q1", 0), row("a", "q2", 1)]), /INVALID_EFFECT_EVIDENCE/);
});
