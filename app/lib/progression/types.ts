export type MissionCategory = "daily" | "weekly";

export type MissionCondition =
  | "mcq_count"
  | "mcq_correct_streak"
  | "mcq_clean_sweep"
  | "weakness_corrected"
  | "weakness_reviewed"
  | "review_library_topic"
  | "flashcards_reviewed"
  | "subjects_variety"
  | "study_minutes"
  | "study_days"
  | "all_daily_completed";

export type Mission = {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  xpReward: number;
  target: number;
  unit: string;
  conditionType: MissionCondition;
};

export type MissionProgress = {
  missionId: string;
  current: number;
  target: number;
  completed: boolean;
  completedAt?: string;
};

export type MilestoneCategory =
  | "mcqs"
  | "correct"
  | "flashcards"
  | "weakness"
  | "streaks"
  | "library";

export type Milestone = {
  id: string;
  title: string;
  description: string;
  category: MilestoneCategory;
  target: number;
  unit: string;
  xpReward: number;
};

export type MilestoneProgress = {
  milestoneId: string;
  current: number;
  target: number;
  completed: boolean;
  completedAt?: string;
};

export type XpTransaction = {
  id: string;
  userId: string;
  amount: number;
  sourceType: "daily_mission" | "weekly_mission" | "milestone" | "achievement" | "study_activity";
  sourceId: string;
  awardKey: string;
  createdAt: string;
};

export type ProgressionSnapshotData = {
  totalXp: number;
  level: number;
  levelTitle: string;
  currentLevelXp: number;
  nextLevelXp: number;
  xpNeeded: number;
  progressPercent: number;
  currentStreak: number;
  bestStreak: number;
  completedDailyCount: number;
  totalDailyCount: number;
  dailyMissions: (Mission & MissionProgress)[];
  weeklyMissions: (Mission & MissionProgress)[];
  milestones: (Milestone & MilestoneProgress)[];
  daysLeftInWeek: number;
};
