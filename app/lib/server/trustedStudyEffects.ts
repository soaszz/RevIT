import "server-only";
import { reinforcementLevelAfterAnswer } from "../adaptiveQuestions";
import { ACHIEVEMENT_CATALOG, metricForCondition, XP_REWARDS } from "../xpConfig";

// Disconnected transaction planning only. Inputs must come from locked database rows, never request bodies.
export function planTrustedAttemptEffects(
  attempt: { id: string; is_correct: boolean; verified_at: string },
  reinforcementLevel: number,
) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(attempt.id) || typeof attempt.is_correct !== "boolean"
    || !Number.isFinite(Date.parse(attempt.verified_at)) || !Number.isInteger(reinforcementLevel)
    || reinforcementLevel < 0 || reinforcementLevel > 3) throw Error("INVALID_EFFECT_EVIDENCE");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(attempt.verified_at));
  return {
    answer: { eventKey: `answer:${attempt.id}`, xp: attempt.is_correct ? XP_REWARDS.CORRECT_QUESTION : 0 },
    daily: { eventKey: `xp:daily-streak:${date}`, xp: XP_REWARDS.DAILY_STREAK },
    activityDate: date,
    reinforcementLevel: reinforcementLevelAfterAnswer(reinforcementLevel, attempt.is_correct),
  };
}

export function planTrustedAchievementUnlocks(
  metrics: Parameters<typeof metricForCondition>[1], unlockedIds: readonly string[],
) {
  if (![metrics.questionsAnswered, metrics.aiMessages, metrics.streakDays, metrics.examsCreated, metrics.studySessions]
    .every(n => Number.isSafeInteger(n) && n >= 0)) throw Error("INVALID_EFFECT_EVIDENCE");
  const existing = new Set(unlockedIds);
  const candidates = ACHIEVEMENT_CATALOG.filter(a => !existing.has(a.id) && metricForCondition(a.condition_type, metrics) >= a.condition_value);
  // Award only unlock rows actually inserted under the database unique constraint, never this candidate sum.
  return candidates.map(a => ({ achievementId: a.id, xp: a.xp_reward }));
}

export function inspectTrustedCompletionCoverage(
  session: { id: string; user_id: string; question_pool: { question_id: string; content_version: string }[] },
  attempts: { id: string; user_id: string; session_id: string; session_slot: number; question_id: string; content_version: string; verified_at: string }[],
) {
  const pool = new Map(session.question_pool.map(q => [q.question_id, q.content_version]));
  if (!pool.size || pool.size !== session.question_pool.length) throw Error("INVALID_EFFECT_EVIDENCE");
  const ids = new Set<string>(), slots = new Set<number>(), covered = new Set<string>();
  for (const a of attempts) {
    if (a.user_id !== session.user_id || a.session_id !== session.id || ids.has(a.id) || slots.has(a.session_slot)
      || !Number.isSafeInteger(a.session_slot) || a.session_slot < 0 || a.session_slot >= 10000
      || pool.get(a.question_id) !== a.content_version || !Number.isFinite(Date.parse(a.verified_at))) throw Error("INVALID_EFFECT_EVIDENCE");
    ids.add(a.id); slots.add(a.session_slot); covered.add(a.question_id);
  }
  const missingQuestionIds = [...pool.keys()].filter(id => !covered.has(id));
  // Current manifests cannot distinguish strict plans from adaptive sequences or prove wrong-answer extensions.
  return { coveredQuestionIds: [...covered], missingQuestionIds, allQuestionsAnswered: missingQuestionIds.length === 0,
    completionAwardEnabled: false as const, reason: "ISSUED_SEQUENCE_REQUIRED" as const };
}
