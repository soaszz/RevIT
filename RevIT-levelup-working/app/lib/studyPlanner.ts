import {
  STUDY_PLAN_CATEGORIES,
  type StudyPlan,
  type StudyPlanBlock,
  type StudyPlanCategory,
} from "./domain";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type PlannerAnalytics = {
  plannedMinutes: number;
  completedStudySessions: number;
  subjectsStudied: string[];
};

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validCategory(value: unknown): value is StudyPlanCategory {
  return STUDY_PLAN_CATEGORIES.includes(value as StudyPlanCategory);
}

export function studyPlansStorageKey(userId?: string | null) {
  return `revit-study-plans-v1:${userId ?? "local"}`;
}

export function normalizeStudyPlans(value: unknown): StudyPlan[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): StudyPlan[] => {
    if (!raw || typeof raw !== "object") return [];
    const input = raw as Partial<StudyPlan>;
    if (typeof input.id !== "string" || !DATE_PATTERN.test(input.date ?? "") || typeof input.title !== "string") return [];
    const blocks = Array.isArray(input.blocks) ? input.blocks.flatMap((rawBlock): StudyPlanBlock[] => {
      if (!rawBlock || typeof rawBlock !== "object") return [];
      const block = rawBlock as Partial<StudyPlanBlock>;
      if (typeof block.id !== "string" || !TIME_PATTERN.test(block.startTime ?? "") || !TIME_PATTERN.test(block.endTime ?? "") || typeof block.activity !== "string" || !block.activity.trim()) return [];
      const addedToCalendar = Boolean(block.addedToCalendar);
      return [{
        id: block.id,
        startTime: block.startTime!,
        endTime: block.endTime!,
        activity: block.activity.trim(),
        subject: cleanOptional(block.subject),
        topic: cleanOptional(block.topic),
        notes: cleanOptional(block.notes),
        category: validCategory(block.category) ? block.category : "Other",
        addedToCalendar,
        calendarEventId: addedToCalendar && typeof block.calendarEventId === "string" ? block.calendarEventId : null,
        completed: Boolean(block.completed),
      }];
    }) : [];
    const now = new Date().toISOString();
    return [{
      id: input.id,
      date: input.date!,
      title: input.title.trim() || "Study plan",
      blocks,
      createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
    }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

export function minutesFromTime(value: string) {
  if (!TIME_PATTERN.test(value)) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function studyBlockMinutes(block: Pick<StudyPlanBlock, "startTime" | "endTime">) {
  return Math.max(0, minutesFromTime(block.endTime) - minutesFromTime(block.startTime));
}

export function formatStudyTime(value: string) {
  if (!TIME_PATTERN.test(value)) return value;
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatPlanDate(date: string, style: "long" | "short" = "long") {
  if (!DATE_PATTERN.test(date)) return date;
  return new Intl.DateTimeFormat("en-US", {
    weekday: style === "long" ? "long" : undefined,
    month: style === "long" ? "long" : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function calculatePlannerAnalytics(plans: StudyPlan[], date?: string): PlannerAnalytics {
  const matching = date ? plans.filter((plan) => plan.date === date) : plans;
  const studyBlocks = matching.flatMap((plan) => plan.blocks).filter((block) => block.category === "Study");
  return {
    plannedMinutes: studyBlocks.reduce((sum, block) => sum + studyBlockMinutes(block), 0),
    completedStudySessions: studyBlocks.filter((block) => block.completed).length,
    subjectsStudied: [...new Set(studyBlocks.filter((block) => block.completed && block.subject).map((block) => block.subject!))].sort(),
  };
}

export function timeInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

export function nextUpcomingStudyBlock(plans: StudyPlan[], todayKey: string, currentMinute: number) {
  return plans
    .flatMap((plan) => plan.blocks
      .filter((block) => block.category === "Study" && !block.completed)
      .map((block) => ({ plan, block })))
    .filter(({ plan, block }) => plan.date > todayKey || (plan.date === todayKey && minutesFromTime(block.endTime) > currentMinute))
    .sort((a, b) => a.plan.date.localeCompare(b.plan.date) || a.block.startTime.localeCompare(b.block.startTime))[0] ?? null;
}

export function duplicateStudyPlan(plan: StudyPlan, date: string, idFactory: () => string = () => crypto.randomUUID()): StudyPlan {
  const now = new Date().toISOString();
  return {
    ...plan,
    id: idFactory(),
    date,
    title: `${plan.title} copy`,
    createdAt: now,
    updatedAt: now,
    blocks: plan.blocks.map((block) => ({
      ...block,
      id: idFactory(),
      calendarEventId: block.addedToCalendar ? idFactory() : null,
      completed: false,
    })),
  };
}

export function moveStudyBlock(blocks: StudyPlanBlock[], blockId: string, direction: -1 | 1) {
  const index = blocks.findIndex((block) => block.id === blockId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
