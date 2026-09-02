import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CurrentLeaderboardPosition,
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardRow,
} from "./leaderboard";

type LeaderboardRowRecord = {
  rank: number | string;
  display_name: string;
  avatar_url: string | null;
  metric_value: number | string;
  answered_count: number | string;
  is_current_user: boolean;
  period_timezone: string;
};

type CurrentPositionRecord = {
  rank: number | string | null;
  display_name: string;
  avatar_url: string | null;
  metric_value: number | string;
  answered_count: number | string;
  minimum_required: number | string;
  questions_needed: number | string;
  eligible: boolean;
  opted_in: boolean;
  percentile: number | string | null;
  participant_count: number | string;
  period_timezone: string;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRow(row: LeaderboardRowRecord): LeaderboardRow {
  return {
    rank: asNumber(row.rank),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    metricValue: asNumber(row.metric_value),
    answeredCount: asNumber(row.answered_count),
    isCurrentUser: row.is_current_user,
    periodTimezone: row.period_timezone,
  };
}

function normalizePosition(row: CurrentPositionRecord): CurrentLeaderboardPosition {
  return {
    rank: row.rank === null ? null : asNumber(row.rank),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    metricValue: asNumber(row.metric_value),
    answeredCount: asNumber(row.answered_count),
    minimumRequired: asNumber(row.minimum_required),
    questionsNeeded: asNumber(row.questions_needed),
    eligible: row.eligible,
    optedIn: row.opted_in,
    percentile: row.percentile === null ? null : asNumber(row.percentile),
    participantCount: asNumber(row.participant_count),
    periodTimezone: row.period_timezone,
  };
}

export async function loadLeaderboard(client: SupabaseClient, input: {
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  subjectId: string | null;
  limit?: number;
  offset?: number;
}) {
  const parameters = {
    p_period: input.period,
    p_metric: input.metric,
    p_subject_id: input.subjectId,
  };
  const [leaderboard, currentPosition] = await Promise.all([
    client.rpc("get_leaderboard", {
      ...parameters,
      p_limit: input.limit ?? 50,
      p_offset: input.offset ?? 0,
    }),
    client.rpc("get_current_user_leaderboard_position", parameters),
  ]);
  const failure = leaderboard.error ?? currentPosition.error;
  if (failure?.code === "PGRST202" || failure?.message.toLowerCase().includes("get_leaderboard")) {
    throw new Error("Apply the RevIT Leaderboards V1 Supabase migration, then retry.");
  }
  if (failure) throw new Error(failure.message);
  const currentRecord = (Array.isArray(currentPosition.data) ? currentPosition.data[0] : currentPosition.data) as CurrentPositionRecord | null;
  if (!currentRecord) throw new Error("Your leaderboard position could not be loaded.");
  return {
    rows: ((leaderboard.data ?? []) as LeaderboardRowRecord[]).map(normalizeRow),
    currentPosition: normalizePosition(currentRecord),
  };
}
