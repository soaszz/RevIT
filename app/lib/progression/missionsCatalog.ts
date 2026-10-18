import type { Mission } from "./types";

export const DAILY_MISSION_POOL: Mission[] = [
  {
    id: "first_draw",
    title: "FIRST DRAW",
    description: "Answer your first MCQ today",
    category: "daily",
    xpReward: 10,
    target: 1,
    unit: "MCQ",
    conditionType: "mcq_count",
  },
  {
    id: "quick_review",
    title: "QUICK REVIEW",
    description: "Answer 10 MCQs",
    category: "daily",
    xpReward: 20,
    target: 10,
    unit: "MCQs",
    conditionType: "mcq_count",
  },
  {
    id: "twenty_strong",
    title: "TWENTY STRONG",
    description: "Answer 20 MCQs",
    category: "daily",
    xpReward: 35,
    target: 20,
    unit: "MCQs",
    conditionType: "mcq_count",
  },
  {
    id: "half_century",
    title: "HALF CENTURY",
    description: "Answer 50 MCQs",
    category: "daily",
    xpReward: 75,
    target: 50,
    unit: "MCQs",
    conditionType: "mcq_count",
  },
  {
    id: "on_a_roll",
    title: "ON A ROLL",
    description: "Get 5 correct answers consecutively",
    category: "daily",
    xpReward: 25,
    target: 5,
    unit: "in a row",
    conditionType: "mcq_correct_streak",
  },
  {
    id: "hot_streak",
    title: "HOT STREAK",
    description: "Get 10 correct answers consecutively",
    category: "daily",
    xpReward: 50,
    target: 10,
    unit: "in a row",
    conditionType: "mcq_correct_streak",
  },
  {
    id: "clean_sweep",
    title: "CLEAN SWEEP",
    description: "Score 10/10 within an eligible MCQ session",
    category: "daily",
    xpReward: 60,
    target: 10,
    unit: "score",
    conditionType: "mcq_clean_sweep",
  },
  {
    id: "redemption",
    title: "REDEMPTION",
    description: "Correct 5 questions previously answered incorrectly",
    category: "daily",
    xpReward: 40,
    target: 5,
    unit: "corrected",
    conditionType: "weakness_corrected",
  },
  {
    id: "weakness_hunter",
    title: "WEAKNESS HUNTER",
    description: "Review or correctly answer 10 questions from Weakness",
    category: "daily",
    xpReward: 35,
    target: 10,
    unit: "questions",
    conditionType: "weakness_reviewed",
  },
  {
    id: "bookworm",
    title: "BOOKWORM",
    description: "Complete or review one eligible Review Library topic",
    category: "daily",
    xpReward: 20,
    target: 1,
    unit: "topic",
    conditionType: "review_library_topic",
  },
  {
    id: "flash_round",
    title: "FLASH ROUND",
    description: "Review 20 flashcards",
    category: "daily",
    xpReward: 30,
    target: 20,
    unit: "cards",
    conditionType: "flashcards_reviewed",
  },
  {
    id: "recall_master",
    title: "RECALL MASTER",
    description: "Review 50 flashcards",
    category: "daily",
    xpReward: 65,
    target: 50,
    unit: "cards",
    conditionType: "flashcards_reviewed",
  },
  {
    id: "subject_hopper",
    title: "SUBJECT HOPPER",
    description: "Answer eligible MCQs from 3 different subjects",
    category: "daily",
    xpReward: 40,
    target: 3,
    unit: "subjects",
    conditionType: "subjects_variety",
  },
  {
    id: "study_sprint",
    title: "STUDY SPRINT",
    description: "Complete 30 minutes of legitimate study activity",
    category: "daily",
    xpReward: 30,
    target: 30,
    unit: "mins",
    conditionType: "study_minutes",
  },
];

export const DAILY_DOSE_MISSION: Mission = {
  id: "daily_dose",
  title: "DAILY DOSE",
  description: "Complete all assigned daily missions",
  category: "daily",
  xpReward: 75,
  target: 3,
  unit: "missions",
  conditionType: "all_daily_completed",
};

export const WEEKLY_MISSION_POOL: Mission[] = [
  {
    id: "weekly_grind",
    title: "WEEKLY GRIND",
    description: "Answer 250 eligible MCQs",
    category: "weekly",
    xpReward: 250,
    target: 250,
    unit: "MCQs",
    conditionType: "mcq_count",
  },
  {
    id: "board_mode",
    title: "BOARD MODE",
    description: "Answer 500 eligible MCQs",
    category: "weekly",
    xpReward: 500,
    target: 500,
    unit: "MCQs",
    conditionType: "mcq_count",
  },
  {
    id: "well_rounded",
    title: "WELL-ROUNDED",
    description: "Study at least 5 different MedTech subjects during the week",
    category: "weekly",
    xpReward: 150,
    target: 5,
    unit: "subjects",
    conditionType: "subjects_variety",
  },
  {
    id: "weakness_breaker",
    title: "WEAKNESS BREAKER",
    description: "Correct 25 previously missed questions",
    category: "weekly",
    xpReward: 120,
    target: 25,
    unit: "corrected",
    conditionType: "weakness_corrected",
  },
  {
    id: "flashcard_week",
    title: "FLASHCARD WEEK",
    description: "Complete 100 flashcard reviews",
    category: "weekly",
    xpReward: 100,
    target: 100,
    unit: "cards",
    conditionType: "flashcards_reviewed",
  },
  {
    id: "consistency_week",
    title: "CONSISTENCY WEEK",
    description: "Study on at least 4 separate days during the week",
    category: "weekly",
    xpReward: 120,
    target: 4,
    unit: "days",
    conditionType: "study_days",
  },
];

function stringSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Assigns exactly 3 balanced daily missions based on deterministic day seed:
 * 1 MCQ Volume Goal
 * 1 Skill/Weakness/Streak Goal
 * 1 Variety/Flashcard/Library Goal
 */
export function getAssignedDailyMissions(dateKey: string): Mission[] {
  const seed = stringSeed(dateKey);

  const volumeMissions = DAILY_MISSION_POOL.filter(
    (m) => m.conditionType === "mcq_count" && m.id !== "first_draw"
  );
  const skillMissions = DAILY_MISSION_POOL.filter(
    (m) =>
      m.conditionType === "mcq_correct_streak" ||
      m.conditionType === "mcq_clean_sweep" ||
      m.conditionType === "weakness_corrected" ||
      m.conditionType === "weakness_reviewed"
  );
  const varietyMissions = DAILY_MISSION_POOL.filter(
    (m) =>
      m.conditionType === "flashcards_reviewed" ||
      m.conditionType === "review_library_topic" ||
      m.conditionType === "subjects_variety" ||
      m.conditionType === "study_minutes"
  );

  const selectedVolume = volumeMissions[seed % volumeMissions.length];
  const selectedSkill = skillMissions[(seed + 1) % skillMissions.length];
  const selectedVariety = varietyMissions[(seed + 2) % varietyMissions.length];

  return [selectedVolume, selectedSkill, selectedVariety];
}

/**
 * Assigns structured weekly missions for the active ISO week.
 */
export function getAssignedWeeklyMissions(weekKey: string): Mission[] {
  const seed = stringSeed(weekKey);
  const pickCount = 4;
  const missions: Mission[] = [];
  const pool = [...WEEKLY_MISSION_POOL];

  for (let i = 0; i < pickCount && pool.length > 0; i++) {
    const index = (seed + i * 3) % pool.length;
    missions.push(pool.splice(index, 1)[0]);
  }

  return missions;
}
