import {
  type StudyPlan,
  type StudyPlanBlock,
  type DailyActivity,
  type ExamSchedule,
  type PlannerEventKind,
  type PlannerAttachmentMeta,
  type StudyPlanCategory,
} from "./domain";
import { formatStudyTime } from "./studyPlanner";

export type NormalizedActivitySource = "planner_block" | "exam_schedule" | "daily_activity";

export type NormalizedActivityKind =
  | PlannerEventKind
  | "formal_exam"
  | "practice_history";

export type NormalizedActivity = {
  /** Unique stable display identifier (e.g. original ID or virtual recurring occurrence ID) */
  id: string;
  /** Originating storage source */
  source: NormalizedActivitySource;
  /** Visual & semantic classification kind */
  kind: NormalizedActivityKind;
  /** Original category if sourced from a study plan block */
  category: StudyPlanCategory | "Exam" | "Practice";
  /** Primary label / title */
  title: string;
  /** Date key in YYYY-MM-DD */
  date: string;
  /** Start time in 24-hr HH:mm (if applicable) */
  startTime: string | null;
  /** End time in 24-hr HH:mm (if applicable) */
  endTime: string | null;
  /** Human-readable time representation (e.g. "8:00 AM - 9:30 AM", "Due 11:59 PM", or "All day") */
  timeDisplay: string;
  /** Associated subject (e.g. "Hematology", "Clinical Chemistry", or custom) */
  subject: string | null;
  /** Associated topic */
  topic: string | null;
  /** Descriptive notes or syllabus details */
  notes: string | null;
  /** Physical or virtual room */
  room: string | null;
  /** Instructor / Professor */
  instructor: string | null;
  /** Whether the activity has been finished or marked complete */
  completed: boolean;
  /** Explicit flag indicating whether the item is pinned to the monthly calendar */
  addedToCalendar: boolean;
  /** Whether this instance is a virtual recurrence generated from recurrence rules */
  isRecurring: boolean;
  /** Recurrence days of week: 0=Sun, 1=Mon, ..., 6=Sat */
  recurrenceDays: number[] | null;
  /** Final cutoff date for recurrence (YYYY-MM-DD) */
  recurrenceEnd: string | null;
  /** Deadlines & tasks due date (YYYY-MM-DD) */
  dueDate: string | null;
  /** Deadlines & tasks due time (HH:mm) */
  dueTime: string | null;
  /** Associated attachments (PDF, JPG, PNG, WebP) stored in local IndexedDB */
  attachments: PlannerAttachmentMeta[];
  /** Target quantity (e.g. 50 questions, 10 pages) */
  targetCount: number | null;
  /** Target metric classification */
  targetType: "mcq" | "flashcard" | "pages" | null;
  /** Container plan reference (if sourced from a StudyPlan) */
  planId: string | null;
  /** Container plan title */
  planTitle: string | null;
  /** Preserved raw references to the original stored structures without any mutation */
  rawBlock?: StudyPlanBlock;
  rawExam?: ExamSchedule;
  rawActivity?: DailyActivity;
};

export type ActivityNormalizationOptions = {
  plans?: StudyPlan[];
  exams?: ExamSchedule[];
  activity?: DailyActivity[];
  /** Only include activities flagged for calendar display */
  calendarOnly?: boolean;
  /** Include historical practice question logs in calendar/agenda views */
  includeHistory?: boolean;
};

/**
 * Normalizes a StudyPlanBlock into a uniform NormalizedActivity.
 * Preserves all underlying fields, recurrence info, and attachment metadata.
 */
export function normalizePlannerBlock(
  block: StudyPlanBlock,
  plan: StudyPlan,
  occurrenceDate?: string,
  isVirtualOccurrence = false,
): NormalizedActivity {
  const date = occurrenceDate ?? block.dueDate ?? plan.date;
  const isDeadlineOrTask = block.eventKind === "deadline" || block.eventKind === "task";

  let timeDisplay = "All day";
  if (isDeadlineOrTask && block.dueTime) {
    timeDisplay = `Due ${formatStudyTime(block.dueTime)}`;
  } else if (block.startTime && block.endTime) {
    timeDisplay = `${formatStudyTime(block.startTime)} – ${formatStudyTime(block.endTime)}`;
  } else if (block.startTime) {
    timeDisplay = formatStudyTime(block.startTime);
  }

  const kind: NormalizedActivityKind = block.eventKind ?? "study";

  return {
    id: isVirtualOccurrence && occurrenceDate ? `${block.id}_rec_${occurrenceDate}` : block.id,
    source: "planner_block",
    kind,
    category: block.category,
    title: block.activity,
    date,
    startTime: block.startTime || null,
    endTime: block.endTime || null,
    timeDisplay,
    subject: block.subject || null,
    topic: block.topic || null,
    notes: block.notes || null,
    room: block.room || null,
    instructor: block.instructor || null,
    completed: Boolean(block.completed),
    addedToCalendar: Boolean(block.addedToCalendar),
    isRecurring: Boolean(block.recurrenceDays && block.recurrenceDays.length > 0),
    recurrenceDays: block.recurrenceDays ?? null,
    recurrenceEnd: block.recurrenceEnd ?? null,
    dueDate: block.dueDate ?? null,
    dueTime: block.dueTime ?? null,
    attachments: Array.isArray(block.attachments) ? block.attachments : [],
    targetCount: block.targetCount ?? null,
    targetType: block.targetType ?? null,
    planId: plan.id,
    planTitle: plan.title,
    rawBlock: block,
  };
}

/**
 * Normalizes an ExamSchedule into a uniform NormalizedActivity.
 */
export function normalizeExamSchedule(exam: ExamSchedule): NormalizedActivity {
  return {
    id: exam.id,
    source: "exam_schedule",
    kind: "formal_exam",
    category: "Exam",
    title: `${exam.subject} · ${exam.assessment_type}`,
    date: exam.scheduled_date,
    startTime: null,
    endTime: null,
    timeDisplay: exam.assessment_type,
    subject: exam.subject,
    topic: null,
    notes: exam.note || null,
    room: null,
    instructor: null,
    completed: false,
    addedToCalendar: true,
    isRecurring: false,
    recurrenceDays: null,
    recurrenceEnd: null,
    dueDate: null,
    dueTime: null,
    attachments: [],
    targetCount: null,
    targetType: null,
    planId: null,
    planTitle: null,
    rawExam: exam,
  };
}

/**
 * Normalizes a DailyActivity practice log into a uniform NormalizedActivity.
 */
export function normalizeDailyActivity(act: DailyActivity): NormalizedActivity {
  const accuracy = act.questions_answered > 0
    ? Math.round((act.correct_answers / act.questions_answered) * 100)
    : 0;

  return {
    id: act.id ?? `act_${act.activity_date}`,
    source: "daily_activity",
    kind: "practice_history",
    category: "Study",
    title: `${act.questions_answered} questions reviewed`,
    date: act.activity_date,
    startTime: null,
    endTime: null,
    timeDisplay: `${act.correct_answers}/${act.questions_answered} correct (${accuracy}%)`,
    subject: act.subjects_studied.length ? act.subjects_studied.join(", ") : null,
    topic: null,
    notes: `${act.review_count} review session${act.review_count === 1 ? "" : "s"} completed`,
    room: null,
    instructor: null,
    completed: true,
    addedToCalendar: false,
    isRecurring: false,
    recurrenceDays: null,
    recurrenceEnd: null,
    dueDate: null,
    dueTime: null,
    attachments: [],
    targetCount: act.questions_answered,
    targetType: "mcq",
    planId: null,
    planTitle: null,
    rawActivity: act,
  };
}

/**
 * Retrieves all normalized activities matching a specific target date (YYYY-MM-DD).
 * Accurately calculates recurring rule expansions without modifying stored records.
 */
export function getNormalizedActivitiesForDate(
  targetDate: string,
  options: ActivityNormalizationOptions = {},
): NormalizedActivity[] {
  const {
    plans = [],
    exams = [],
    activity = [],
    calendarOnly = false,
    includeHistory = false,
  } = options;

  const [tYear, tMonth, tDay] = targetDate.split("-").map(Number);
  const targetDayOfWeek = new Date(Date.UTC(tYear, tMonth - 1, tDay, 12)).getUTCDay();

  const results: NormalizedActivity[] = [];

  // 1. Process Academic Planner Blocks (direct + recurring + due dates)
  for (const plan of plans) {
    for (const block of plan.blocks) {
      if (calendarOnly && !block.addedToCalendar) continue;

      // Direct match on plan container date
      if (plan.date === targetDate) {
        results.push(normalizePlannerBlock(block, plan, targetDate, false));
        continue;
      }

      // Explicit due date match for deadlines & tasks
      if (block.dueDate === targetDate && plan.date !== targetDate) {
        results.push(normalizePlannerBlock(block, plan, targetDate, false));
        continue;
      }

      // Recurrence rule match (e.g. classes repeating weekly on specified days)
      if (
        block.recurrenceDays &&
        block.recurrenceDays.includes(targetDayOfWeek) &&
        plan.date <= targetDate &&
        (!block.recurrenceEnd || block.recurrenceEnd >= targetDate)
      ) {
        results.push(normalizePlannerBlock(block, plan, targetDate, true));
      }
    }
  }

  // 2. Process Formal Exam Schedules
  // Deduplicates by exact ID and cross-source signature (date + subject + assessment_type + note)
  // This ensures identical cross-source items are merged while legitimate distinct exams with differing details remain separate.
  const seenExamIds = new Set<string>();
  const seenExamSignatures = new Set<string>();
  for (const exam of exams) {
    if (exam.scheduled_date === targetDate) {
      if (seenExamIds.has(exam.id)) continue;
      const noteNorm = (exam.note ?? "").trim().toLowerCase();
      const signature = `${exam.scheduled_date}:${exam.subject}:${exam.assessment_type}:${noteNorm}`;
      if (seenExamSignatures.has(signature)) continue;

      seenExamIds.add(exam.id);
      seenExamSignatures.add(signature);
      results.push(normalizeExamSchedule(exam));
    }
  }

  // 3. Process Daily Practice Activity (if requested)
  if (includeHistory) {
    for (const act of activity) {
      if (act.activity_date === targetDate && act.questions_answered > 0) {
        results.push(normalizeDailyActivity(act));
      }
    }
  }

  // Deterministic chronological ordering:
  // Timed items first by startTime, then due items by dueTime, then all-day items.
  return results.sort((a, b) => {
    const timeA = a.startTime ?? (a.dueTime ? `due_${a.dueTime}` : "zz");
    const timeB = b.startTime ?? (b.dueTime ? `due_${b.dueTime}` : "zz");
    return timeA.localeCompare(timeB) || a.title.localeCompare(b.title);
  });
}

/**
 * Returns a Map of date strings (YYYY-MM-DD) to their normalized activities for a given date range.
 */
export function getNormalizedActivitiesForRange(
  startDate: string,
  endDate: string,
  options: ActivityNormalizationOptions = {},
): Map<string, NormalizedActivity[]> {
  const result = new Map<string, NormalizedActivity[]>();
  const [sYear, sMonth, sDay] = startDate.split("-").map(Number);
  const [eYear, eMonth, eDay] = endDate.split("-").map(Number);

  const startUtc = Date.UTC(sYear, sMonth - 1, sDay);
  const endUtc = Date.UTC(eYear, eMonth - 1, eDay);
  const DAY_MS = 86_400_000;

  for (let cursor = startUtc; cursor <= endUtc; cursor += DAY_MS) {
    const dateKey = new Date(cursor).toISOString().slice(0, 10);
    const items = getNormalizedActivitiesForDate(dateKey, options);
    if (items.length > 0) {
      result.set(dateKey, items);
    }
  }

  return result;
}

/**
 * Aggregates summary counts across normalized activities.
 */
export function summarizeActivities(activities: NormalizedActivity[]) {
  const total = activities.length;
  const completed = activities.filter((a) => a.completed).length;
  const classes = activities.filter((a) => a.kind === "class").length;
  const study = activities.filter((a) => a.kind === "study").length;
  const exams = activities.filter((a) => a.kind === "exam" || a.kind === "formal_exam").length;
  const deadlines = activities.filter((a) => a.kind === "deadline" || a.kind === "task").length;

  return {
    total,
    completed,
    pending: total - completed,
    classes,
    study,
    exams,
    deadlines,
  };
}

export const TIMETABLE_DEFAULT_START_HOUR = 7;
export const TIMETABLE_DEFAULT_END_HOUR = 22;
export const TIMETABLE_START_HOUR = 7;
export const TIMETABLE_END_HOUR = 22;
export const TIMETABLE_HOUR_HEIGHT = 48; // px per hour
export const TIMETABLE_HOURS = Array.from(
  { length: TIMETABLE_END_HOUR - TIMETABLE_START_HOUR },
  (_, i) => i + TIMETABLE_START_HOUR
);

export type TimetablePositionedEvent = {
  activity: NormalizedActivity;
  startMinutes: number;
  endMinutes: number;
  topPx: number;
  heightPx: number;
  widthPct: number;
  leftPct: number;
};

export function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Calculates a dynamic timetable hour range based on actual scheduled items.
 * Defaults to 7:00 AM (7) to 10:00 PM (22).
 * Expands dynamically earlier or later (including past midnight) when scheduled activities require it.
 */
export function getTimetableRange(items: NormalizedActivity[]): {
  startHour: number;
  endHour: number;
  hours: number[];
} {
  let minHour = TIMETABLE_DEFAULT_START_HOUR;
  let maxHour = TIMETABLE_DEFAULT_END_HOUR;

  for (const item of items) {
    const start = parseTimeToMinutes(item.startTime);
    if (start === null) continue;

    const startH = Math.floor(start / 60);
    if (startH < minHour) {
      minHour = Math.max(0, startH);
    }

    let end = parseTimeToMinutes(item.endTime);
    if (end === null) {
      end = start + 60;
    } else if (end <= start) {
      // Midnight crossing: e.g. 23:00 to 01:00
      if (end + 1440 - start <= 14 * 60) {
        end = end + 1440;
      } else {
        end = start + 60;
      }
    }

    const endH = Math.ceil(end / 60);
    if (endH > maxHour) {
      maxHour = endH;
    }
  }

  const hours = Array.from({ length: maxHour - minHour }, (_, i) => i + minHour);
  return { startHour: minHour, endHour: maxHour, hours };
}

/**
 * Formats an hour integer into human-readable 12-hour AM/PM label (e.g. "7 AM", "12 PM", "11 PM", "1 AM (+1d)").
 */
export function formatTimetableHour(hr: number): string {
  const normalized = hr % 24;
  const isNextDay = hr >= 24;
  const suffix = isNextDay ? " (+1d)" : "";

  if (normalized === 0) return `12 AM${suffix}`;
  if (normalized === 12) return `12 PM${suffix}`;
  if (normalized > 12) return `${normalized - 12} PM${suffix}`;
  return `${normalized} AM${suffix}`;
}

/**
 * Positions timed activities into an hourly timetable with collision resolution for overlapping events,
 * and isolates untimed activities into a separate list.
 * Supports dynamic start and end hour ranges, preserving actual event start/end times and midnight crossings.
 */
export function layoutDayTimetable(
  items: NormalizedActivity[],
  startHour = TIMETABLE_START_HOUR,
  endHour = TIMETABLE_END_HOUR,
): {
  untimed: NormalizedActivity[];
  timed: TimetablePositionedEvent[];
} {
  const untimed: NormalizedActivity[] = [];
  const timedRaw: { activity: NormalizedActivity; start: number; end: number; duration: number }[] = [];

  for (const item of items) {
    const start = parseTimeToMinutes(item.startTime);
    if (start === null) {
      untimed.push(item);
      continue;
    }

    let end = parseTimeToMinutes(item.endTime);
    if (end === null) {
      end = start + 60; // Default 1 hour if unspecified
    } else if (end <= start) {
      // Crosses midnight if within 14 hours window
      if (end + 1440 - start <= 14 * 60) {
        end = end + 1440;
      } else {
        end = start + 60;
      }
    }

    // Preserve actual event times without artificial clamping
    const minBound = startHour * 60;
    const maxBound = endHour * 60;
    const actualStart = Math.max(start, minBound);
    const actualEnd = Math.min(end, maxBound);
    const duration = Math.max(actualEnd - actualStart, 25); // minimum 25 min height for legibility

    timedRaw.push({
      activity: item,
      start: actualStart,
      end: actualStart + duration,
      duration,
    });
  }

  // Interval coloring / collision detection to place overlapping events side-by-side
  const sorted = [...timedRaw].sort((a, b) => a.start - b.start || b.duration - a.duration);
  const columns: typeof timedRaw[] = [];
  const colAssignment = new Map<NormalizedActivity, number>();

  for (const item of sorted) {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const last = col[col.length - 1];
      if (last.end <= item.start) {
        col.push(item);
        colAssignment.set(item.activity, c);
        placed = true;
        break;
      }
    }
    if (!placed) {
      colAssignment.set(item.activity, columns.length);
      columns.push([item]);
    }
  }

  const timed: TimetablePositionedEvent[] = sorted.map((item) => {
    const overlapping = sorted.filter((other) => other.start < item.end && other.end > item.start);
    const colIndex = colAssignment.get(item.activity) ?? 0;
    const maxCol = Math.max(...overlapping.map((o) => (colAssignment.get(o.activity) ?? 0) + 1), 1);
    const widthPct = 100 / maxCol;
    const leftPct = colIndex * widthPct;

    const offsetMinutes = item.start - startHour * 60;
    const topPx = (offsetMinutes / 60) * TIMETABLE_HOUR_HEIGHT;
    const heightPx = (item.duration / 60) * TIMETABLE_HOUR_HEIGHT;

    return {
      activity: item.activity,
      startMinutes: item.start,
      endMinutes: item.end,
      topPx,
      heightPx,
      widthPct,
      leftPct,
    };
  });

  return { untimed, timed };
}
