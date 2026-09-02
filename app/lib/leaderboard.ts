export const LEADERBOARD_PERIODS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "all_time", label: "All Time" },
] as const;

export const LEADERBOARD_METRICS = [
  { id: "questions", label: "Questions", heading: "Most Questions Answered" },
  { id: "accuracy", label: "Accuracy", heading: "Highest Accuracy" },
  { id: "study_xp", label: "Study XP", heading: "Study XP" },
] as const;

export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number]["id"];
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number]["id"];

export type LeaderboardRow = {
  rank: number;
  displayName: string;
  avatarUrl: string | null;
  metricValue: number;
  answeredCount: number;
  isCurrentUser: boolean;
  periodTimezone: string;
};

export type CurrentLeaderboardPosition = {
  rank: number | null;
  displayName: string;
  avatarUrl: string | null;
  metricValue: number;
  answeredCount: number;
  minimumRequired: number;
  questionsNeeded: number;
  eligible: boolean;
  optedIn: boolean;
  percentile: number | null;
  participantCount: number;
  periodTimezone: string;
};

export function formatLeaderboardMetric(metric: LeaderboardMetric, value: number) {
  if (metric === "accuracy") return `${value.toFixed(1)}%`;
  if (metric === "study_xp") return `${Math.round(value).toLocaleString()} XP`;
  return Math.round(value).toLocaleString();
}

export function accuracyRequirementMessage(position: CurrentLeaderboardPosition, period: LeaderboardPeriod) {
  const periodCopy = period === "daily" ? "today's" : period === "weekly" ? "this week's" : "the all-time";
  if (position.questionsNeeded <= 0) return "Accuracy requirement complete.";
  return `Complete ${position.questionsNeeded} more eligible question${position.questionsNeeded === 1 ? "" : "s"} to enter ${periodCopy} Accuracy leaderboard.`;
}

export function periodLabel(period: LeaderboardPeriod) {
  return LEADERBOARD_PERIODS.find((option) => option.id === period)?.label ?? "Weekly";
}

export function metricHeading(metric: LeaderboardMetric) {
  return LEADERBOARD_METRICS.find((option) => option.id === metric)?.heading ?? "Leaderboard";
}
