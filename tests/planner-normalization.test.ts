import assert from "node:assert/strict";
import test from "node:test";
import type { DailyActivity, ExamSchedule, StudyPlan, StudyPlanBlock } from "../app/lib/domain";
import {
  getNormalizedActivitiesForDate,
  getNormalizedActivitiesForRange,
  getTimetableRange,
  formatTimetableHour,
  layoutDayTimetable,
  normalizeExamSchedule,
  normalizePlannerBlock,
  summarizeActivities,
} from "../app/lib/plannerNormalization";

const sampleBlock = (overrides: Partial<StudyPlanBlock> = {}): StudyPlanBlock => ({
  id: "blk-1",
  startTime: "08:00",
  endTime: "09:30",
  activity: "Clinical Chemistry Lecture",
  subject: "Clinical Chemistry",
  topic: "Liver Function Tests",
  notes: "Room 402, Prof. Cruz",
  category: "Study",
  addedToCalendar: true,
  calendarEventId: "evt-1",
  completed: false,
  eventKind: "class",
  room: "Room 402",
  instructor: "Prof. Cruz",
  targetCount: 50,
  targetType: "mcq",
  attachments: [
    { id: "att-1", name: "Liver_LFT_Notes.pdf", size: 1024, mimeType: "application/pdf" },
  ],
  ...overrides,
});

const samplePlan = (overrides: Partial<StudyPlan> = {}): StudyPlan => ({
  id: "plan-1",
  date: "2026-10-12",
  title: "Monday Schedule",
  blocks: [sampleBlock()],
  createdAt: "2026-10-10T00:00:00.000Z",
  updatedAt: "2026-10-10T00:00:00.000Z",
  ...overrides,
});

test("Requirement 1: Normalizes diverse planner block types into consistent display structure", () => {
  const p = samplePlan();
  const b = sampleBlock();
  const normalized = normalizePlannerBlock(b, p);

  assert.equal(normalized.id, "blk-1");
  assert.equal(normalized.kind, "class");
  assert.equal(normalized.title, "Clinical Chemistry Lecture");
  assert.equal(normalized.timeDisplay, "8:00 AM – 9:30 AM");
  assert.equal(normalized.room, "Room 402");
  assert.equal(normalized.instructor, "Prof. Cruz");
  assert.equal(normalized.addedToCalendar, true);
  assert.equal(normalized.attachments.length, 1);
  assert.equal(normalized.attachments[0].name, "Liver_LFT_Notes.pdf");
  assert.equal(normalized.rawBlock, b);
});

test("Requirement 1: Normalizes deadlines & tasks with due time formatting", () => {
  const deadlineBlock = sampleBlock({
    id: "task-1",
    activity: "Submit Bacteriology Lab Report",
    eventKind: "deadline",
    dueDate: "2026-10-15",
    dueTime: "23:59",
  });
  const p = samplePlan({ date: "2026-10-12" });
  const normalized = normalizePlannerBlock(deadlineBlock, p, "2026-10-15");

  assert.equal(normalized.kind, "deadline");
  assert.equal(normalized.date, "2026-10-15");
  assert.equal(normalized.timeDisplay, "Due 11:59 PM");
});

test("Requirement 2: Preserves ExamSchedule and deduplicates local and remote representations", () => {
  const localExam: ExamSchedule = {
    id: "local-exam-1",
    subject: "Hematology",
    assessment_type: "Comprehensive Exam",
    scheduled_date: "2026-10-20",
    note: "Bring pencil and ID",
  };
  const remoteExam: ExamSchedule = {
    id: "remote-exam-1", // different ID from Supabase sync
    subject: "Hematology",
    assessment_type: "Comprehensive Exam",
    scheduled_date: "2026-10-20",
    note: "Bring pencil and ID",
  };

  const results = getNormalizedActivitiesForDate("2026-10-20", {
    exams: [localExam, remoteExam],
  });

  // Must only appear ONCE, not duplicated
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, "formal_exam");
  assert.equal(results[0].title, "Hematology · Comprehensive Exam");
  assert.equal(results[0].source, "exam_schedule");
});

test("Requirement 2b: Does not merge two legitimate distinct exams with same date, subject, and assessment type", () => {
  const lectureExam: ExamSchedule = {
    id: "exam-lec-1",
    subject: "Hematology",
    assessment_type: "Pre-Test",
    scheduled_date: "2026-10-20",
    note: "Lecture Quiz (Morning)",
  };
  const labExam: ExamSchedule = {
    id: "exam-lab-1",
    subject: "Hematology",
    assessment_type: "Pre-Test",
    scheduled_date: "2026-10-20",
    note: "Practical Quiz (Afternoon)",
  };

  const results = getNormalizedActivitiesForDate("2026-10-20", {
    exams: [lectureExam, labExam],
  });

  // Both legitimate distinct exams must be preserved
  assert.equal(results.length, 2);
  assert.equal(results[0].id, "exam-lec-1");
  assert.equal(results[1].id, "exam-lab-1");
  assert.equal(results[0].notes, "Lecture Quiz (Morning)");
  assert.equal(results[1].notes, "Practical Quiz (Afternoon)");
});

test("Requirement 3: Distinguishes scheduled activities from completed practice history", () => {
  const act: DailyActivity = {
    id: "act-1",
    activity_date: "2026-10-12",
    questions_answered: 30,
    correct_answers: 26,
    review_count: 2,
    subjects_studied: ["Hematology", "Clinical Chemistry"],
  };
  const planWithTask = samplePlan({
    blocks: [sampleBlock({ eventKind: "study", activity: "Upcoming Study" })],
  });

  // Without history flag (standard agenda/schedule view)
  const scheduledOnly = getNormalizedActivitiesForDate("2026-10-12", {
    plans: [planWithTask],
    activity: [act],
    includeHistory: false,
  });
  assert.equal(scheduledOnly.length, 1);
  assert.equal(scheduledOnly[0].kind, "study");

  // With history flag (calendar day detail view)
  const withHistory = getNormalizedActivitiesForDate("2026-10-12", {
    plans: [planWithTask],
    activity: [act],
    includeHistory: true,
  });
  assert.equal(withHistory.length, 2);
  const practiceItem = withHistory.find((item) => item.kind === "practice_history");
  assert.ok(practiceItem);
  assert.equal(practiceItem.completed, true);
  assert.equal(practiceItem.source, "daily_activity");
  assert.equal(practiceItem.timeDisplay, "26/30 correct (87%)");
});

test("Requirement 4: Expands recurring activities across date ranges, month boundaries, and year boundaries", () => {
  // Weekly class on Mondays (day 1) and Wednesdays (day 3), starts 2026-10-05, ends 2027-01-15
  const recurringClass = sampleBlock({
    id: "rec-class-1",
    activity: "Bacteriology Lecture",
    eventKind: "class",
    recurrenceDays: [1, 3], // Mon, Wed
    recurrenceEnd: "2027-01-15",
  });
  const sourcePlan = samplePlan({
    date: "2026-10-05", // First Monday
    blocks: [recurringClass],
  });

  // Date 1: Monday in November (Month boundary) -> 2026-11-02 is Monday
  const novMon = getNormalizedActivitiesForDate("2026-11-02", { plans: [sourcePlan] });
  assert.equal(novMon.length, 1);
  assert.equal(novMon[0].isRecurring, true);
  assert.equal(novMon[0].id, "rec-class-1_rec_2026-11-02");

  // Date 2: Tuesday in November -> 2026-11-03 is Tuesday (not in recurrenceDays)
  const novTue = getNormalizedActivitiesForDate("2026-11-03", { plans: [sourcePlan] });
  assert.equal(novTue.length, 0);

  // Date 3: Wednesday in January 2027 (Year boundary before cutoff) -> 2027-01-06 is Wednesday
  const janWed = getNormalizedActivitiesForDate("2027-01-06", { plans: [sourcePlan] });
  assert.equal(janWed.length, 1);
  assert.equal(janWed[0].isRecurring, true);
  assert.equal(janWed[0].id, "rec-class-1_rec_2027-01-06");

  // Date 4: Wednesday in January 2027 after cutoff -> 2027-01-20 is Wednesday
  const janAfterEnd = getNormalizedActivitiesForDate("2027-01-20", { plans: [sourcePlan] });
  assert.equal(janAfterEnd.length, 0);

  // Critical: Source plan block MUST remain unmutated (virtual occurrences never persisted)
  assert.equal(sourcePlan.blocks.length, 1);
  assert.equal(sourcePlan.blocks[0].id, "rec-class-1");
});

test("Requirement 5: Cross-view activity consistency (Today, Week, and Calendar consume identical normalized items)", () => {
  const p = samplePlan({
    date: "2026-10-12",
    blocks: [
      sampleBlock({ id: "b1", activity: "Morning Class", startTime: "08:00", endTime: "09:30" }),
      sampleBlock({ id: "b2", activity: "Evening Review", startTime: "18:00", endTime: "19:00" }),
    ],
  });
  const exam: ExamSchedule = {
    id: "ex-1",
    subject: "AUBF",
    assessment_type: "Pre-Test",
    scheduled_date: "2026-10-12",
    note: null,
  };

  // Direct date resolution (Today view)
  const todayResult = getNormalizedActivitiesForDate("2026-10-12", { plans: [p], exams: [exam] });

  // Date range resolution (Week view & Calendar view)
  const rangeMap = getNormalizedActivitiesForRange("2026-10-12", "2026-10-18", { plans: [p], exams: [exam] });
  const weekDayResult = rangeMap.get("2026-10-12") ?? [];

  assert.equal(todayResult.length, 3);
  assert.equal(weekDayResult.length, 3);
  assert.deepEqual(todayResult.map((i) => i.id), weekDayResult.map((i) => i.id));
  assert.deepEqual(todayResult.map((i) => i.title), weekDayResult.map((i) => i.title));
});

test("Requirement 6: Attachment metadata integrity", () => {
  const blockWithMultiAtt = sampleBlock({
    id: "att-blk",
    attachments: [
      { id: "a1", name: "Lecture1.pdf", size: 5000, mimeType: "application/pdf" },
      { id: "a2", name: "Diagram.png", size: 12000, mimeType: "image/png" },
    ],
  });
  const p = samplePlan({ blocks: [blockWithMultiAtt] });
  const normalized = getNormalizedActivitiesForDate("2026-10-12", { plans: [p] });

  assert.equal(normalized[0].attachments.length, 2);
  assert.equal(normalized[0].attachments[0].id, "a1");
  assert.equal(normalized[0].attachments[1].name, "Diagram.png");
});

test("Requirement 8: summarizeActivities accurately aggregates metrics", () => {
  const activities = [
    normalizePlannerBlock(sampleBlock({ eventKind: "class" }), samplePlan()),
    normalizePlannerBlock(sampleBlock({ eventKind: "study", completed: true }), samplePlan()),
    normalizePlannerBlock(sampleBlock({ eventKind: "deadline" }), samplePlan()),
    normalizeExamSchedule({ id: "e1", subject: "Hematology", assessment_type: "Comprehensive Exam", scheduled_date: "2026-10-12", note: null }),
  ];

  const summary = summarizeActivities(activities);
  assert.equal(summary.total, 4);
  assert.equal(summary.completed, 1);
  assert.equal(summary.pending, 3);
  assert.equal(summary.classes, 1);
  assert.equal(summary.study, 1);
  assert.equal(summary.exams, 1);
  assert.equal(summary.deadlines, 1);
});

test("Requirement 9: layoutDayTimetable positions timed activities and isolates untimed items", () => {
  const p = samplePlan();
  const timedBlock = normalizePlannerBlock(
    sampleBlock({ id: "t1", startTime: "08:00", endTime: "09:30", activity: "Lecture" }),
    p,
  );
  const untimedBlock = normalizePlannerBlock(
    sampleBlock({ id: "u1", startTime: "", endTime: "", activity: "Self-study reading" }),
    p,
  );
  const formalExam = normalizeExamSchedule({
    id: "e1",
    subject: "Bacteriology",
    assessment_type: "Comprehensive Exam",
    scheduled_date: "2026-10-12",
    note: null,
  });

  const { timed, untimed } = layoutDayTimetable([timedBlock, untimedBlock, formalExam]);

  // Timed items have positions calculated
  assert.equal(timed.length, 1);
  assert.equal(timed[0].activity.id, "t1");
  assert.equal(timed[0].startMinutes, 480); // 8:00 AM = 8*60 = 480
  assert.equal(timed[0].endMinutes, 570); // 9:30 AM = 9*60+30 = 570
  // 480 - 420 (7:00 AM) = 60 mins -> top = (60/60)*48 = 48px
  assert.equal(timed[0].topPx, 48);
  // duration 90 mins -> height = (90/60)*48 = 72px
  assert.equal(timed[0].heightPx, 72);
  assert.equal(timed[0].widthPct, 100);
  assert.equal(timed[0].leftPct, 0);

  // Untimed items isolated into separate collection
  assert.equal(untimed.length, 2);
  assert.ok(untimed.some((u) => u.id === "u1"));
  assert.ok(untimed.some((u) => u.id === "e1"));
});

test("Requirement 10: layoutDayTimetable resolves overlapping events side-by-side without collision", () => {
  const p = samplePlan();
  // Event A: 09:00 - 10:30
  const eventA = normalizePlannerBlock(
    sampleBlock({ id: "ov-a", startTime: "09:00", endTime: "10:30", activity: "Class A" }),
    p,
  );
  // Event B: 09:30 - 11:00 (overlaps with Event A from 09:30 to 10:30)
  const eventB = normalizePlannerBlock(
    sampleBlock({ id: "ov-b", startTime: "09:30", endTime: "11:00", activity: "Study Session B" }),
    p,
  );

  const { timed } = layoutDayTimetable([eventA, eventB]);

  assert.equal(timed.length, 2);
  // Both items share 50% width and are offset horizontally
  const itemA = timed.find((t) => t.activity.id === "ov-a");
  const itemB = timed.find((t) => t.activity.id === "ov-b");

  assert.ok(itemA);
  assert.ok(itemB);
  assert.equal(itemA.widthPct, 50);
  assert.equal(itemB.widthPct, 50);
  assert.notEqual(itemA.leftPct, itemB.leftPct);
  assert.ok(itemA.leftPct === 0 || itemB.leftPct === 0);
  assert.ok(itemA.leftPct === 50 || itemB.leftPct === 50);
});

test("Requirement 11: Dynamic Week Timetable Hours expands range dynamically and formats correctly", () => {
  const p = samplePlan();
  // Standard daytime activities (default range 7 AM to 10 PM)
  const dayBlock = normalizePlannerBlock(sampleBlock({ startTime: "09:00", endTime: "11:00" }), p);
  const defaultRange = getTimetableRange([dayBlock]);
  assert.equal(defaultRange.startHour, 7);
  assert.equal(defaultRange.endHour, 22);
  assert.equal(defaultRange.hours.length, 15);
  assert.equal(defaultRange.hours[0], 7);
  assert.equal(defaultRange.hours[14], 21);

  // Early morning activity (5:30 AM) expands startHour to 5
  const earlyBlock = normalizePlannerBlock(sampleBlock({ startTime: "05:30", endTime: "07:00" }), p);
  const earlyRange = getTimetableRange([earlyBlock, dayBlock]);
  assert.equal(earlyRange.startHour, 5);
  assert.equal(earlyRange.endHour, 22);
  assert.equal(earlyRange.hours[0], 5);

  // Late night activity (22:30 to 23:45) expands endHour to 24 (12 AM midnight)
  const lateBlock = normalizePlannerBlock(sampleBlock({ startTime: "22:30", endTime: "23:45" }), p);
  const lateRange = getTimetableRange([lateBlock]);
  assert.equal(lateRange.startHour, 7);
  assert.equal(lateRange.endHour, 24);
  assert.equal(lateRange.hours[lateRange.hours.length - 1], 23);

  // Midnight crossing activity (23:00 to 01:30 next day) expands endHour to 26 (2 AM next day)
  const midnightBlock = normalizePlannerBlock(sampleBlock({ startTime: "23:00", endTime: "01:30" }), p);
  const midnightRange = getTimetableRange([midnightBlock]);
  assert.equal(midnightRange.startHour, 7);
  assert.equal(midnightRange.endHour, 26);
  assert.equal(midnightRange.hours[midnightRange.hours.length - 1], 25);

  // Formatter verifies readable labels
  assert.equal(formatTimetableHour(7), "7 AM");
  assert.equal(formatTimetableHour(12), "12 PM");
  assert.equal(formatTimetableHour(22), "10 PM");
  assert.equal(formatTimetableHour(23), "11 PM");
  assert.equal(formatTimetableHour(24), "12 AM (+1d)");
  assert.equal(formatTimetableHour(25), "1 AM (+1d)");
});

test("Requirement 12: layoutDayTimetable positions early morning and midnight-crossing events without artificial clamping", () => {
  const p = samplePlan();
  // 5:30 AM to 7:00 AM (90 mins)
  const earlyBlock = normalizePlannerBlock(
    sampleBlock({ id: "early-1", startTime: "05:30", endTime: "07:00", activity: "Early Study" }),
    p,
  );
  // 23:00 to 01:00 (+1d, 120 mins)
  const midnightBlock = normalizePlannerBlock(
    sampleBlock({ id: "mid-1", startTime: "23:00", endTime: "01:00", activity: "Night Shift" }),
    p,
  );

  const { startHour, endHour } = getTimetableRange([earlyBlock, midnightBlock]);
  assert.equal(startHour, 5);
  assert.equal(endHour, 25);

  const { timed } = layoutDayTimetable([earlyBlock, midnightBlock], startHour, endHour);
  assert.equal(timed.length, 2);

  const earlyTimed = timed.find((t) => t.activity.id === "early-1");
  const midTimed = timed.find((t) => t.activity.id === "mid-1");

  assert.ok(earlyTimed);
  assert.ok(midTimed);

  // Early item: start at 5:30 (330 min). Relative to startHour 5 (300 min), offset = 30 min -> top = (30/60)*48 = 24px
  assert.equal(earlyTimed.startMinutes, 330);
  assert.equal(earlyTimed.endMinutes, 420);
  assert.equal(earlyTimed.topPx, 24);
  assert.equal(earlyTimed.heightPx, 72); // 90 min = 1.5 * 48 = 72px

  // Midnight item: start at 23:00 (1380 min). Relative to startHour 5 (300 min), offset = 1080 min -> top = 18 * 48 = 864px
  assert.equal(midTimed.startMinutes, 1380);
  assert.equal(midTimed.endMinutes, 1500); // 60 + 1440 = 1500 min
  assert.equal(midTimed.topPx, 864);
  assert.equal(midTimed.heightPx, 96); // 120 min = 2 * 48 = 96px
});

test("Requirement 13: Activity relocation across dates preserves attachments, recurrence, status, and stable IDs without duplicates", () => {
  const initialPlanA: StudyPlan = {
    id: "plan-a",
    date: "2026-10-12",
    title: "Monday Plan",
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
    blocks: [
      sampleBlock({
        id: "stable-block-1",
        activity: "Advanced Hematology",
        eventKind: "class",
        completed: true,
        recurrenceDays: [1, 3, 5],
        recurrenceEnd: "2026-12-31",
        addedToCalendar: true,
        calendarEventId: "cal-stable-1",
        attachments: [{ id: "att-xyz", name: "HemeSlide.jpg", size: 4096, mimeType: "image/jpeg" }],
      }),
      sampleBlock({ id: "other-block-a", activity: "Stay here" }),
    ],
  };

  const initialPlanB: StudyPlan = {
    id: "plan-b",
    date: "2026-10-15",
    title: "Thursday Plan",
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
    blocks: [sampleBlock({ id: "existing-block-b", activity: "Thursday task" })],
  };

  const plans = [initialPlanA, initialPlanB];

  // Moving stable-block-1 from Monday (2026-10-12) to Thursday (2026-10-15)
  const targetDate = "2026-10-15";
  const movingBlock = initialPlanA.blocks[0];
  const cleanBlockId = movingBlock.id;

  // Simulate handleSaveItem container update logic
  let nextPlans = plans.map((p) => {
    if (p.date !== targetDate && p.blocks.some((b) => b.id === cleanBlockId)) {
      return {
        ...p,
        blocks: p.blocks.filter((b) => b.id !== cleanBlockId),
      };
    }
    return p;
  });

  const targetPlan = nextPlans.find((p) => p.date === targetDate)!;
  const updatedBlocks = [...targetPlan.blocks, movingBlock];
  nextPlans = nextPlans.map((p) => (p.id === targetPlan.id ? { ...p, blocks: updatedBlocks } : p));

  // Verify Source Plan A: stable-block-1 removed, other-block-a untouched
  const updatedPlanA = nextPlans.find((p) => p.id === "plan-a")!;
  assert.equal(updatedPlanA.blocks.length, 1);
  assert.equal(updatedPlanA.blocks[0].id, "other-block-a");

  // Verify Destination Plan B: stable-block-1 added, existing-block-b untouched
  const updatedPlanB = nextPlans.find((p) => p.id === "plan-b")!;
  assert.equal(updatedPlanB.blocks.length, 2);
  assert.equal(updatedPlanB.blocks[0].id, "existing-block-b");
  assert.equal(updatedPlanB.blocks[1].id, "stable-block-1");

  // Verify NO duplicate records anywhere
  const allInstances = nextPlans.flatMap((p) => p.blocks).filter((b) => b.id === "stable-block-1");
  assert.equal(allInstances.length, 1);

  // Verify all metadata strictly preserved
  const savedItem = allInstances[0];
  assert.equal(savedItem.id, "stable-block-1");
  assert.equal(savedItem.activity, "Advanced Hematology");
  assert.equal(savedItem.completed, true);
  assert.deepEqual(savedItem.recurrenceDays, [1, 3, 5]);
  assert.equal(savedItem.recurrenceEnd, "2026-12-31");
  assert.equal(savedItem.addedToCalendar, true);
  assert.equal(savedItem.calendarEventId, "cal-stable-1");
  assert.ok(savedItem.attachments);
  assert.equal(savedItem.attachments.length, 1);
  assert.equal(savedItem.attachments[0].id, "att-xyz");
  assert.equal(savedItem.attachments[0].name, "HemeSlide.jpg");
});

