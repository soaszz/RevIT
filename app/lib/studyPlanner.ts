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
      const validKinds = ["class", "study", "exam", "deadline", "task"];
      const rawKind = typeof block.eventKind === "string" ? block.eventKind.toLowerCase() : null;
      const eventKind = rawKind && validKinds.includes(rawKind) ? (rawKind as StudyPlanBlock["eventKind"]) : "study";
      const recurrenceDays = Array.isArray(block.recurrenceDays) ? block.recurrenceDays.filter((d) => typeof d === "number" && d >= 0 && d <= 6) : null;
      const attachments = Array.isArray(block.attachments) ? block.attachments.flatMap((att) => {
        if (!att || typeof att !== "object" || typeof att.id !== "string" || typeof att.name !== "string") return [];
        return [{
          id: att.id,
          name: att.name,
          size: typeof att.size === "number" ? att.size : 0,
          mimeType: typeof att.mimeType === "string" ? att.mimeType : "application/octet-stream",
        }];
      }) : [];

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
        eventKind,
        room: cleanOptional(block.room),
        instructor: cleanOptional(block.instructor),
        targetCount: typeof block.targetCount === "number" && block.targetCount > 0 ? block.targetCount : null,
        targetType: block.targetType === "mcq" || block.targetType === "flashcard" || block.targetType === "pages" ? block.targetType : null,
        recurrenceDays,
        recurrenceEnd: typeof block.recurrenceEnd === "string" && DATE_PATTERN.test(block.recurrenceEnd) ? block.recurrenceEnd : null,
        dueDate: typeof block.dueDate === "string" && DATE_PATTERN.test(block.dueDate) ? block.dueDate : null,
        dueTime: typeof block.dueTime === "string" && TIME_PATTERN.test(block.dueTime) ? block.dueTime : null,
        attachments,
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

/**
 * Given a date (YYYY-MM-DD), returns the 7 days of its Monday-to-Sunday week.
 */
export function getWeekDates(anchorDate: string): string[] {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  // 0 is Sunday, 1 is Monday, etc. We want Monday as start of week.
  const dayOfWeek = anchor.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(anchor.getTime() + diffToMonday * 86400000);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime() + i * 86400000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export type ExpandedPlannerItem = {
  planId: string;
  planTitle: string;
  planDate: string;
  isVirtualOccurrence: boolean;
  block: StudyPlanBlock;
};

/**
 * Returns all direct and recurring occurrences of planner blocks for a specific date (YYYY-MM-DD).
 */
export function getExpandedItemsForDate(plans: StudyPlan[], targetDate: string): ExpandedPlannerItem[] {
  const [tYear, tMonth, tDay] = targetDate.split("-").map(Number);
  const targetDayOfWeek = new Date(Date.UTC(tYear, tMonth - 1, tDay, 12)).getUTCDay();

  const items: ExpandedPlannerItem[] = [];

  for (const plan of plans) {
    for (const block of plan.blocks) {
      // 1. Direct match on plan date
      if (plan.date === targetDate) {
        items.push({
          planId: plan.id,
          planTitle: plan.title,
          planDate: plan.date,
          isVirtualOccurrence: false,
          block,
        });
        continue;
      }

      // 2. Recurring match (e.g. CLASS recurring weekly on specific days)
      if (
        block.recurrenceDays &&
        block.recurrenceDays.includes(targetDayOfWeek) &&
        plan.date <= targetDate &&
        (!block.recurrenceEnd || block.recurrenceEnd >= targetDate)
      ) {
        items.push({
          planId: plan.id,
          planTitle: plan.title,
          planDate: targetDate,
          isVirtualOccurrence: true,
          block: {
            ...block,
            id: `${block.id}_rec_${targetDate}`,
          },
        });
      }
    }
  }

  return items.sort((a, b) => a.block.startTime.localeCompare(b.block.startTime));
}

