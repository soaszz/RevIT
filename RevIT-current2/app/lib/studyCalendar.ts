import { ACTIVITY_THRESHOLDS, type DailyActivity, type ExamSchedule } from "./domain";

const DAY_MS = 86_400_000;

export function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function utcFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(key: string, amount: number) {
  return new Date(utcFromKey(key) + amount * DAY_MS).toISOString().slice(0, 10);
}

export function activityEffort(activity?: DailyActivity) {
  if (!activity) return 0;
  const accuracyBonus = activity.questions_answered > 0
    ? Math.round((activity.correct_answers / activity.questions_answered) * 4)
    : 0;
  return activity.questions_answered + activity.review_count * 2 + accuracyBonus;
}

export function intensityFor(activity?: DailyActivity): 0 | 1 | 2 | 3 | 4 {
  const effort = activityEffort(activity);
  if (effort < ACTIVITY_THRESHOLDS.light) return 0;
  if (effort < ACTIVITY_THRESHOLDS.medium) return 1;
  if (effort < ACTIVITY_THRESHOLDS.strong) return 2;
  if (effort < ACTIVITY_THRESHOLDS.intense) return 3;
  return 4;
}

export function calculateStreak(activity: DailyActivity[], todayKey: string) {
  const active = [...new Set(activity.filter((day) => activityEffort(day) > 0).map((day) => day.activity_date))].sort();
  if (!active.length) return { current: 0, longest: 0, activeDays: 0 };

  let longest = 1;
  let run = 1;
  for (let index = 1; index < active.length; index += 1) {
    if (utcFromKey(active[index]) - utcFromKey(active[index - 1]) === DAY_MS) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
  }

  const latest = active[active.length - 1];
  const yesterday = addDays(todayKey, -1);
  let current = 0;
  if (latest === todayKey || latest === yesterday) {
    current = 1;
    for (let index = active.length - 1; index > 0; index -= 1) {
      if (utcFromKey(active[index]) - utcFromKey(active[index - 1]) !== DAY_MS) break;
      current += 1;
    }
  }
  return { current, longest, activeDays: active.length };
}

export function buildMonthGrid(year: number, monthIndex: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const startOffset = first.getUTCDay();
  const start = new Date(Date.UTC(year, monthIndex, 1 - startOffset));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    return {
      key: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === monthIndex,
    };
  });
}

export function upcomingExam(exams: ExamSchedule[], todayKey: string) {
  return [...exams]
    .filter((exam) => exam.scheduled_date >= todayKey)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0] ?? null;
}

export function daysUntil(dateKey: string, todayKey: string) {
  return Math.round((utcFromKey(dateKey) - utcFromKey(todayKey)) / DAY_MS);
}

export function greetingFor(date: Date, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function examStatus(dateKey: string, todayKey: string) {
  const delta = daysUntil(dateKey, todayKey);
  if (delta < 0) return "Past";
  if (delta === 0) return "Today";
  return `${delta} day${delta === 1 ? "" : "s"} away`;
}
