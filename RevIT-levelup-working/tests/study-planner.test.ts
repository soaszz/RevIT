import assert from "node:assert/strict";
import test from "node:test";
import type { StudyPlan, StudyPlanBlock } from "../app/lib/domain";
import {
  calculatePlannerAnalytics,
  duplicateStudyPlan,
  formatStudyTime,
  moveStudyBlock,
  nextUpcomingStudyBlock,
  normalizeStudyPlans,
  studyBlockMinutes,
  studyPlansStorageKey,
} from "../app/lib/studyPlanner";

const block = (overrides: Partial<StudyPlanBlock> = {}): StudyPlanBlock => ({
  id: "block-1",
  startTime: "07:00",
  endTime: "09:00",
  activity: "Study AUBF",
  subject: "Hematology",
  topic: null,
  notes: null,
  category: "Study",
  addedToCalendar: true,
  calendarEventId: "event-1",
  completed: false,
  ...overrides,
});

const plan = (overrides: Partial<StudyPlan> = {}): StudyPlan => ({
  id: "plan-1",
  date: "2026-08-30",
  title: "Board review",
  blocks: [block()],
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
  ...overrides,
});

test("normalizes local study plan data and rejects malformed records", () => {
  const normalized = normalizeStudyPlans([
    plan(),
    { id: "bad", date: "August 30", title: "Bad", blocks: [] },
    { ...plan({ id: "plan-2" }), blocks: [{ ...block(), id: "bad-time", startTime: "7 AM" }] },
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].blocks.length, 1);
  assert.equal(normalized[1].blocks.length, 0);
  assert.equal(studyPlansStorageKey("user-1"), "revit-study-plans-v1:user-1");
  assert.equal(studyPlansStorageKey(null), "revit-study-plans-v1:local");
});

test("calculates duration and planner analytics without affecting quiz mastery", () => {
  const plans = [plan({ blocks: [
    block({ completed: true }),
    block({ id: "block-2", startTime: "09:00", endTime: "10:00", activity: "Break", category: "Break", subject: null, completed: true }),
    block({ id: "block-3", startTime: "10:00", endTime: "11:30", subject: "Bacteriology" }),
  ] })];
  assert.equal(studyBlockMinutes(plans[0].blocks[0]), 120);
  assert.deepEqual(calculatePlannerAnalytics(plans, "2026-08-30"), {
    plannedMinutes: 210,
    completedStudySessions: 1,
    subjectsStudied: ["Hematology"],
  });
  assert.equal(formatStudyTime("00:05"), "12:05 AM");
  assert.equal(formatStudyTime("13:30"), "1:30 PM");
});

test("finds the next unfinished study session across multiple plans", () => {
  const plans = [
    plan({ date: "2026-08-30", blocks: [block({ endTime: "08:00" }), block({ id: "later", startTime: "14:00", endTime: "15:00", activity: "Later" })] }),
    plan({ id: "tomorrow", date: "2026-08-31", blocks: [block({ id: "future", activity: "Future" })] }),
  ];
  assert.equal(nextUpcomingStudyBlock(plans, "2026-08-30", 9 * 60)?.block.id, "later");
  assert.equal(nextUpcomingStudyBlock(plans, "2026-08-30", 16 * 60)?.block.id, "future");
});

test("duplicates plans with new IDs, calendar event IDs, and reset completion", () => {
  let sequence = 0;
  const copy = duplicateStudyPlan(plan({ blocks: [block({ completed: true })] }), "2026-09-01", () => `new-${++sequence}`);
  assert.equal(copy.id, "new-1");
  assert.equal(copy.blocks[0].id, "new-2");
  assert.equal(copy.blocks[0].calendarEventId, "new-3");
  assert.equal(copy.blocks[0].completed, false);
  assert.equal(copy.date, "2026-09-01");
});

test("reorders blocks without mutating the original array", () => {
  const blocks = [block({ id: "a" }), block({ id: "b" }), block({ id: "c" })];
  const moved = moveStudyBlock(blocks, "b", -1);
  assert.deepEqual(moved.map((item) => item.id), ["b", "a", "c"]);
  assert.deepEqual(blocks.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(moveStudyBlock(blocks, "a", -1), blocks);
});
