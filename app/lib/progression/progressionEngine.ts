import type { DailyActivity, QuestionAttempt } from "../domain";
import type { ReinforcementLevels } from "../adaptiveQuestions";
import { dateKeyInTimeZone } from "../studyCalendar";
import { levelForXp, levelProgress, levelTitle } from "../xpConfig";
import {
  DAILY_DOSE_MISSION,
  getAssignedDailyMissions,
  getAssignedWeeklyMissions,
} from "./missionsCatalog";
import { MILESTONES_CATALOG } from "./milestonesCatalog";
import type {
  MilestoneProgress,
  Mission,
  MissionProgress,
  ProgressionSnapshotData,
  XpTransaction,
} from "./types";

const TRANSACTIONS_STORAGE_KEY = "revit-xp-transactions-v1";

function getIsoWeekKey(date: Date, timezone: string): { weekKey: string; daysLeft: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dayIndexMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const currentDay = dayIndexMap[weekdayStr] ?? 1;
  const daysLeft = Math.max(1, 8 - currentDay);

  // Compute ISO week number
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);

  return {
    weekKey: `${year}-W${String(weekNumber).padStart(2, "0")}`,
    daysLeft,
  };
}

export function loadStoredXpTransactions(ownerKey: string): XpTransaction[] {
  try {
    const raw = localStorage.getItem(`${TRANSACTIONS_STORAGE_KEY}:${ownerKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredXpTransactions(ownerKey: string, transactions: XpTransaction[]) {
  try {
    localStorage.setItem(`${TRANSACTIONS_STORAGE_KEY}:${ownerKey}`, JSON.stringify(transactions));
  } catch {}
}

export type ProgressionEvaluationInput = {
  ownerKey: string;
  timezone: string;
  attempts: QuestionAttempt[];
  activity: DailyActivity[];
  reinforcement: ReinforcementLevels;
  masteredTopicIds?: string[];
  baseXp: number;
  currentStreak: number;
  longestStreak: number;
  onMissionCompleted?: (mission: Mission, xpAwarded: number) => void;
  onLevelUp?: (newLevel: number, newTitle: string) => void;
};

/**
 * Pure evaluation engine for RevIT Gamified Study Progression.
 * Evaluates real-time mission progress, awards idempotent XP, tracks milestones, and determines levels.
 */
export function evaluateProgression(input: ProgressionEvaluationInput): ProgressionSnapshotData {
  const now = new Date();
  const dateKey = dateKeyInTimeZone(now, input.timezone);
  const { weekKey, daysLeft } = getIsoWeekKey(now, input.timezone);

  const dailyMissions = getAssignedDailyMissions(dateKey);
  const weeklyMissions = getAssignedWeeklyMissions(weekKey);

  // 1. Filter Attempts for Today (Idempotent: unique question per day)
  const todayStartMs = new Date(`${dateKey}T00:00:00`).getTime();
  const todayAttempts = input.attempts.filter((a) => {
    const aDateKey = dateKeyInTimeZone(new Date(a.timestamp), input.timezone);
    return aDateKey === dateKey;
  });

  // Anti-farming de-duplication: count distinct questions per day
  const todayDistinctQuestions = new Set(todayAttempts.map((a) => a.questionId));
  const todayMcqCount = todayDistinctQuestions.size;

  // Streak of consecutive correct answers today
  let todayMaxCorrectStreak = 0;
  let currentCorrectStreak = 0;
  for (const a of todayAttempts) {
    if (a.correct) {
      currentCorrectStreak += 1;
      todayMaxCorrectStreak = Math.max(todayMaxCorrectStreak, currentCorrectStreak);
    } else {
      currentCorrectStreak = 0;
    }
  }

  // Count corrected previously missed questions
  const priorWrongQuestions = new Set<string>();
  for (const a of input.attempts) {
    if (new Date(a.timestamp).getTime() < todayStartMs && !a.correct) {
      priorWrongQuestions.add(a.questionId);
    }
  }
  const todayCorrectedWrong = todayAttempts.filter(
    (a) => a.correct && priorWrongQuestions.has(a.questionId)
  ).length;

  // Distinct subjects studied today
  const todaySubjectCount = new Set(
    todayAttempts.map((a) => a.subjectId).filter(Boolean)
  ).size;

  // Today study minutes from daily activity
  const todayActivityRecord = input.activity.find((d) => d.activity_date === dateKey);
  const todayStudyMinutes = Math.round(
    (todayActivityRecord?.questions_answered ?? 0) * 1.5 + (todayActivityRecord?.review_count ?? 0) * 2
  );

  // Flashcards reviewed (from reinforcement levels)
  const flashcardLevels = Object.values(input.reinforcement ?? {}) as number[];
  const totalFlashcardsReviewed = flashcardLevels.reduce((sum: number, lvl: number) => sum + Math.max(1, lvl), 0);
  const todayFlashcardsReviewed = Math.min(totalFlashcardsReviewed, Math.round(todayMcqCount * 0.8));

  // 2. Filter Attempts for This Week
  const weekStartMs = now.getTime() - 7 * 86400000;
  const weekAttempts = input.attempts.filter((a) => new Date(a.timestamp).getTime() >= weekStartMs);
  const weekDistinctQuestions = new Set(weekAttempts.map((a) => a.questionId));
  const weekMcqCount = weekDistinctQuestions.size;
  const weekSubjectsCount = new Set(weekAttempts.map((a) => a.subjectId).filter(Boolean)).size;

  const weekActiveDays = new Set(
    input.activity.filter((d) => new Date(d.activity_date).getTime() >= weekStartMs && d.questions_answered > 0).map((d) => d.activity_date)
  ).size;

  // 3. Transactions & Idempotency Store
  const storedTransactions = loadStoredXpTransactions(input.ownerKey);
  const transactionKeys = new Set(storedTransactions.map((t) => t.awardKey));
  const newTransactions: XpTransaction[] = [];
  let bonusXpEarned = 0;

  function awardXpIfEligible(
    sourceType: XpTransaction["sourceType"],
    sourceId: string,
    awardKey: string,
    amount: number,
    onSuccess?: () => void
  ) {
    if (transactionKeys.has(awardKey)) return;
    transactionKeys.add(awardKey);
    const tx: XpTransaction = {
      id: crypto.randomUUID(),
      userId: input.ownerKey,
      amount,
      sourceType,
      sourceId,
      awardKey,
      createdAt: new Date().toISOString(),
    };
    newTransactions.push(tx);
    bonusXpEarned += amount;
    onSuccess?.();
  }

  // 4. Evaluate Daily Missions Progress
  const dailyProgress: (Mission & MissionProgress)[] = [];
  let completedDailyCount = 0;

  for (const mission of dailyMissions) {
    let current = 0;
    switch (mission.conditionType) {
      case "mcq_count":
        current = todayMcqCount;
        break;
      case "mcq_correct_streak":
        current = todayMaxCorrectStreak;
        break;
      case "mcq_clean_sweep":
        current = todayMaxCorrectStreak >= 10 ? 10 : 0;
        break;
      case "weakness_corrected":
      case "weakness_reviewed":
        current = todayCorrectedWrong;
        break;
      case "flashcards_reviewed":
        current = todayFlashcardsReviewed;
        break;
      case "subjects_variety":
        current = todaySubjectCount;
        break;
      case "study_minutes":
        current = todayStudyMinutes;
        break;
      case "review_library_topic":
        current = (input.masteredTopicIds?.length ?? 0) > 0 ? 1 : 0;
        break;
      default:
        current = 0;
    }

    const completed = current >= mission.target;
    if (completed) {
      completedDailyCount += 1;
      const awardKey = `mission:daily:${dateKey}:${mission.id}`;
      awardXpIfEligible("daily_mission", mission.id, awardKey, mission.xpReward, () => {
        input.onMissionCompleted?.(mission, mission.xpReward);
      });
    }

    dailyProgress.push({
      ...mission,
      missionId: mission.id,
      current: Math.min(mission.target, current),
      target: mission.target,
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    });
  }

  // Check Daily Dose Bonus (All assigned daily missions completed)
  const allDailyDone = completedDailyCount >= dailyMissions.length && dailyMissions.length > 0;
  if (allDailyDone) {
    const doseKey = `mission:daily:${dateKey}:${DAILY_DOSE_MISSION.id}`;
    awardXpIfEligible("daily_mission", DAILY_DOSE_MISSION.id, doseKey, DAILY_DOSE_MISSION.xpReward, () => {
      input.onMissionCompleted?.(DAILY_DOSE_MISSION, DAILY_DOSE_MISSION.xpReward);
    });
  }
  dailyProgress.push({
    ...DAILY_DOSE_MISSION,
    missionId: DAILY_DOSE_MISSION.id,
    current: Math.min(3, completedDailyCount),
    target: 3,
    completed: allDailyDone,
  });

  // 5. Evaluate Weekly Missions Progress
  const weeklyProgress: (Mission & MissionProgress)[] = [];
  for (const mission of weeklyMissions) {
    let current = 0;
    switch (mission.conditionType) {
      case "mcq_count":
        current = weekMcqCount;
        break;
      case "subjects_variety":
        current = weekSubjectsCount;
        break;
      case "weakness_corrected":
        current = todayCorrectedWrong;
        break;
      case "flashcards_reviewed":
        current = totalFlashcardsReviewed;
        break;
      case "study_days":
        current = weekActiveDays;
        break;
      default:
        current = 0;
    }

    const completed = current >= mission.target;
    if (completed) {
      const awardKey = `mission:weekly:${weekKey}:${mission.id}`;
      awardXpIfEligible("weekly_mission", mission.id, awardKey, mission.xpReward, () => {
        input.onMissionCompleted?.(mission, mission.xpReward);
      });
    }

    weeklyProgress.push({
      ...mission,
      missionId: mission.id,
      current: Math.min(mission.target, current),
      target: mission.target,
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    });
  }

  // 6. Evaluate Permanent Milestones
  const totalMcqAnswered = input.attempts.length;
  const totalCorrect = input.attempts.filter((a) => a.correct).length;
  const totalWeaknessFixed = input.attempts.filter((a) => a.correct).length;
  const totalTopicsMastered = input.masteredTopicIds?.length ?? 0;

  const milestonesProgress: (typeof MILESTONES_CATALOG[number] & MilestoneProgress)[] = [];
  for (const milestone of MILESTONES_CATALOG) {
    let current = 0;
    switch (milestone.category) {
      case "mcqs":
        current = totalMcqAnswered;
        break;
      case "correct":
        current = totalCorrect;
        break;
      case "flashcards":
        current = totalFlashcardsReviewed;
        break;
      case "weakness":
        current = totalWeaknessFixed;
        break;
      case "streaks":
        current = input.longestStreak;
        break;
      case "library":
        current = totalTopicsMastered;
        break;
    }

    const completed = current >= milestone.target;
    if (completed) {
      const awardKey = `milestone:${milestone.id}`;
      awardXpIfEligible("milestone", milestone.id, awardKey, milestone.xpReward);
    }

    milestonesProgress.push({
      ...milestone,
      milestoneId: milestone.id,
      current: Math.min(milestone.target, current),
      target: milestone.target,
      completed,
    });
  }

  // Save any new transaction records
  if (newTransactions.length > 0) {
    saveStoredXpTransactions(input.ownerKey, [...storedTransactions, ...newTransactions]);
  }

  // 7. Calculate Aggregated Level and Progression
  const priorTotalXp = input.baseXp;
  const effectiveTotalXp = priorTotalXp + bonusXpEarned;

  const priorLevel = levelForXp(priorTotalXp);
  const effectiveLevelProgress = levelProgress(effectiveTotalXp);

  // Level-up notification trigger
  if (effectiveLevelProgress.level > priorLevel) {
    input.onLevelUp?.(effectiveLevelProgress.level, effectiveLevelProgress.title);
  }

  return {
    totalXp: effectiveTotalXp,
    level: effectiveLevelProgress.level,
    levelTitle: effectiveLevelProgress.title,
    currentLevelXp: effectiveLevelProgress.currentLevelXp,
    nextLevelXp: effectiveLevelProgress.nextLevelXp,
    xpNeeded: effectiveLevelProgress.xpNeeded,
    progressPercent: effectiveLevelProgress.progressPercent,
    currentStreak: input.currentStreak,
    bestStreak: input.longestStreak,
    completedDailyCount: Math.min(3, completedDailyCount),
    totalDailyCount: 3,
    dailyMissions: dailyProgress,
    weeklyMissions: weeklyProgress,
    milestones: milestonesProgress,
    daysLeftInWeek: daysLeft,
  };
}
