import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  accuracyRequirementMessage,
  formatLeaderboardMetric,
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIODS,
  type CurrentLeaderboardPosition,
} from "../app/lib/leaderboard";

const position: CurrentLeaderboardPosition = {
  rank: null,
  displayName: "Ced",
  avatarUrl: null,
  metricValue: 75,
  answeredCount: 12,
  minimumRequired: 20,
  questionsNeeded: 8,
  eligible: false,
  optedIn: true,
  percentile: null,
  participantCount: 3,
  periodTimezone: "Asia/Manila",
};

test("V1 exposes exactly the requested periods and primary metrics", () => {
  assert.deepEqual(LEADERBOARD_PERIODS.map(({ id }) => id), ["daily", "weekly", "all_time"]);
  assert.deepEqual(LEADERBOARD_METRICS.map(({ id }) => id), ["questions", "accuracy", "study_xp"]);
});

test("leaderboard values and accuracy progress are presented consistently", () => {
  assert.equal(formatLeaderboardMetric("questions", 1284), "1,284");
  assert.equal(formatLeaderboardMetric("accuracy", 94.7), "94.7%");
  assert.equal(formatLeaderboardMetric("study_xp", 2450), "2,450 XP");
  assert.equal(
    accuracyRequirementMessage(position, "daily"),
    "Complete 8 more eligible questions to enter today's Accuracy leaderboard.",
  );
});

test("migration centralizes thresholds and does not accept a client XP amount", () => {
  const sql = readFileSync("supabase/migrations/202609030006_leaderboards_v1.sql", "utf8");
  assert.match(sql, /if p_period = 'daily' then return 20/);
  assert.match(sql, /if p_period = 'weekly' then return 75/);
  assert.match(sql, /if p_period = 'all_time' then return 200/);
  assert.doesNotMatch(sql, /create or replace function public\.record_study_activity\([\s\S]*?p_xp/i);
  assert.match(sql, /revoke insert, update, delete on public\.question_attempts from authenticated/);
  assert.match(sql, /partition by attempt\.user_id, attempt\.question_id/);
});
