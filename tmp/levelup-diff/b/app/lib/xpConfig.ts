import type { Achievement, AchievementConditionType } from "./domain";

export const XP_REWARDS = {
  CORRECT_QUESTION: 5,
  COMPLETE_STUDY_SESSION: 20,
  FIRST_AI_MESSAGE: 10,
  DAILY_STREAK: 10,
  FIRST_EXAM: 10,
} as const;

export const ACHIEVEMENT_CATALOG: Achievement[] = [
  { id: "10000000-0000-4000-8000-000000000001", name: "First Steps", description: "Answer your first question", icon: "✦", xp_reward: 25, condition_type: "questions_answered", condition_value: 1 },
  { id: "10000000-0000-4000-8000-000000000002", name: "AI Explorer", description: "Send your first message to RevIT AI", icon: "AI", xp_reward: 25, condition_type: "ai_messages", condition_value: 1 },
  { id: "10000000-0000-4000-8000-000000000003", name: "Question Starter", description: "Answer 100 questions", icon: "100", xp_reward: 50, condition_type: "questions_answered", condition_value: 100 },
  { id: "10000000-0000-4000-8000-000000000004", name: "Question Master", description: "Answer 500 questions", icon: "500", xp_reward: 100, condition_type: "questions_answered", condition_value: 500 },
  { id: "10000000-0000-4000-8000-000000000005", name: "3 Day Streak", description: "Study for 3 consecutive days", icon: "3×", xp_reward: 50, condition_type: "streak_days", condition_value: 3 },
  { id: "10000000-0000-4000-8000-000000000006", name: "7 Day Streak", description: "Study for 7 consecutive days", icon: "7×", xp_reward: 100, condition_type: "streak_days", condition_value: 7 },
  { id: "10000000-0000-4000-8000-000000000007", name: "First Exam", description: "Add your first exam to the schedule", icon: "E", xp_reward: 25, condition_type: "exam_created", condition_value: 1 },
  { id: "10000000-0000-4000-8000-000000000008", name: "Consistent Learner", description: "Complete 10 study sessions", icon: "10", xp_reward: 100, condition_type: "study_sessions", condition_value: 10 },
];

const LEVEL_TITLES = ["New Explorer", "Curious Learner", "Knowledge Builder", "Skilled Reviewer", "Mastery in Motion"] as const;

export type LevelProgress = {
  level: number;
  title: string;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpNeeded: number;
  progressPercent: number;
};

export function xpThresholdForLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(level));
  return 25 * (safeLevel - 1) * (safeLevel + 2);
}

export function levelForXp(totalXp: number) {
  const safeXp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xpThresholdForLevel(level + 1) <= safeXp) level += 1;
  return level;
}

export function levelTitle(level: number) {
  return LEVEL_TITLES[level - 1] ?? "Dedicated Scholar";
}

export function levelProgress(totalXp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = levelForXp(safeXp);
  const currentLevelXp = xpThresholdForLevel(level);
  const nextLevelXp = xpThresholdForLevel(level + 1);
  return {
    level,
    title: levelTitle(level),
    totalXp: safeXp,
    currentLevelXp,
    nextLevelXp,
    xpNeeded: Math.max(0, nextLevelXp - safeXp),
    progressPercent: Math.min(100, (safeXp / nextLevelXp) * 100),
  };
}

export function metricForCondition(
  condition: AchievementConditionType,
  metrics: { questionsAnswered: number; aiMessages: number; streakDays: number; examsCreated: number; studySessions: number },
) {
  switch (condition) {
    case "questions_answered": return metrics.questionsAnswered;
    case "ai_messages": return metrics.aiMessages;
    case "streak_days": return metrics.streakDays;
    case "exam_created": return metrics.examsCreated;
    case "study_sessions": return metrics.studySessions;
  }
}
