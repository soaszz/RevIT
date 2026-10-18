"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  ASSESSMENT_TYPES,
  SUBJECTS,
  type DailyActivity,
  type ExamSchedule,
  type GradeRecord,
  type GradeSubject,
  type AssessmentType,
  type StudyPlan,
  type StudyPlanBlock,
  type PlannerEventKind,
} from "../lib/domain";
import { buildMonthGrid, dateKeyInTimeZone, examStatus, intensityFor, upcomingExam } from "../lib/studyCalendar";
import { calculateGrade } from "../lib/gradeCalculator";
import {
  getNormalizedActivitiesForDate,
  getNormalizedActivitiesForRange,
  type NormalizedActivity,
} from "../lib/plannerNormalization";

const SUBJECT_TONES: Record<GradeSubject, string> = {
  Hematology: "heme",
  "Clinical Chemistry": "chem",
  Bacteriology: "bact",
  AUBF: "aubf",
};

export default function StudyCalendar({
  activity,
  exams,
  grades,
  studyPlans,
  timeZone,
  onSaveExam,
  onDeleteExam,
  onOpenStudyPlan,
  onOpenItemModal,
}: {
  activity: DailyActivity[];
  exams: ExamSchedule[];
  grades: GradeRecord[];
  studyPlans: StudyPlan[];
  timeZone: string;
  onSaveExam: (exam: Omit<ExamSchedule, "id"> & { id?: string }) => Promise<void>;
  onDeleteExam: (id: string) => Promise<void>;
  onOpenStudyPlan: (planId: string) => void;
  onOpenItemModal?: (kind: PlannerEventKind, block?: StudyPlanBlock, planId?: string, date?: string) => void;
}) {
  const now = new Date();
  const todayKey = dateKeyInTimeZone(now, timeZone);
  const [cursor, setCursor] = useState(() => ({ year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) - 1 }));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calendarFilter, setCalendarFilter] = useState<"all" | "pinned">("all");
  const [editing, setEditing] = useState<ExamSchedule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [subject, setSubject] = useState<GradeSubject>("Hematology");
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("Pre-Test");
  const [scheduledDate, setScheduledDate] = useState(todayKey);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  const days = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const activityByDate = useMemo(() => new Map(activity.map((day) => [day.activity_date, day])), [activity]);

  // Compute month's normalized activities across date range in single pass
  const monthActivitiesMap = useMemo(() => {
    if (!days.length) return new Map<string, NormalizedActivity[]>();
    const startDate = days[0].key;
    const endDate = days[days.length - 1].key;
    return getNormalizedActivitiesForRange(startDate, endDate, {
      plans: studyPlans,
      exams,
      calendarOnly: calendarFilter === "pinned",
      includeHistory: false,
    });
  }, [days, studyPlans, exams, calendarFilter]);

  // Selected date normalized activities (includes practice history for selected day)
  const selectedDateActivities = useMemo(() => {
    return getNormalizedActivitiesForDate(selectedDate, {
      plans: studyPlans,
      exams,
      activity,
      calendarOnly: calendarFilter === "pinned",
      includeHistory: true,
    });
  }, [selectedDate, studyPlans, exams, activity, calendarFilter]);

  // Segregate scheduled activities from practice history
  const selectedScheduled = useMemo(
    () => selectedDateActivities.filter((item) => item.kind !== "practice_history"),
    [selectedDateActivities],
  );

  const selectedPractice = useMemo(
    () => selectedDateActivities.find((item) => item.kind === "practice_history"),
    [selectedDateActivities],
  );

  const selectedDailyActivity = activityByDate.get(selectedDate);
  const nextExam = upcomingExam(exams, todayKey);
  const nextExamGrade = nextExam ? grades.find((record) => record.subject === nextExam.subject) : null;
  const nextExamGradeSummary = nextExamGrade ? calculateGrade(nextExamGrade) : null;

  function moveMonth(amount: number) {
    const date = new Date(Date.UTC(cursor.year, cursor.month + amount, 1));
    setCursor({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  }

  function openExam(exam?: ExamSchedule) {
    setEditing(exam ?? null);
    setSubject(exam?.subject ?? "Hematology");
    setAssessmentType(exam?.assessment_type ?? "Pre-Test");
    setScheduledDate(exam?.scheduled_date ?? selectedDate);
    setNote(exam?.note ?? "");
    setStatus("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus("");
    try {
      await onSaveExam({ id: editing?.id, subject, assessment_type: assessmentType, scheduled_date: scheduledDate, note: note.trim() || null });
      setSelectedDate(scheduledDate);
      setFormOpen(false);
    } catch {
      setStatus("Exam date could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    setStatus("");
    try {
      await onDeleteExam(id);
      setFormOpen(false);
    } catch {
      setStatus("Exam date could not be deleted. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(cursor.year, cursor.month, 1)));

  return (
    <section className="calendar-card" aria-label="Academic Calendar">
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">Study activity, plans &amp; exams</p>
          <h3>{monthName}</h3>
          <p style={{ marginTop: "2px", fontSize: "12px", color: "var(--muted)" }}>
            {calendarFilter === "all"
              ? "Displaying all scheduled academic events, classes, and exams. Pinned items are marked."
              : "Displaying only activities explicitly pinned to the calendar."}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Calendar Scope Filter: All vs Pinned */}
          <div className="theme-segmented-control" role="group" aria-label="Calendar event scope">
            <button
              type="button"
              className={`theme-segment-btn ${calendarFilter === "all" ? "active" : ""}`}
              onClick={() => setCalendarFilter("all")}
            >
              All Activities
            </button>
            <button
              type="button"
              className={`theme-segment-btn ${calendarFilter === "pinned" ? "active" : ""}`}
              onClick={() => setCalendarFilter("pinned")}
            >
              Pinned Only
            </button>
          </div>

          <div className="calendar-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
            >
              ‹ Prev Month
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setCursor({ year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) - 1 })}
            >
              Current Month
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
            >
              Next Month ›
            </button>
          </div>
        </div>
      </div>

      <div className="calendar-layout">
        <div className="calendar-main">
          <div className="calendar-month-shell">
            <div className="calendar-weekdays" aria-hidden="true">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="month-grid" aria-label={`${monthName} calendar`}>
              {days.map((day) => {
                const dayActivities = monthActivitiesMap.get(day.key) ?? [];
                const isSelected = selectedDate === day.key;
                const isToday = day.key === todayKey;

                return (
                  <button
                    type="button"
                    key={day.key}
                    className={`calendar-day ${day.inMonth ? "in-month" : "outside"} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setSelectedDate(day.key)}
                    aria-label={`${day.key}, ${dayActivities.length} scheduled items`}
                  >
                    <div className="cal-day-header">
                      <span className="cal-day-num">{day.day}</span>
                      {isToday && <span className="cal-day-today-tag">TODAY</span>}
                    </div>

                    {/* Desktop/Tablet: Compact activity title rows */}
                    <div className="cal-day-events" aria-hidden="true">
                      {dayActivities.slice(0, 2).map((item) => (
                        <div key={item.id} className={`cal-event-row kind-${item.kind}`}>
                          <span className="cal-event-bar" />
                          <span className="cal-event-title">{item.title}</span>
                        </div>
                      ))}
                      {dayActivities.length > 2 && (
                        <span className="cal-event-more">+{dayActivities.length - 2} more</span>
                      )}
                    </div>

                    {/* Mobile: Compact category dot indicators */}
                    <div className="cal-day-dots" aria-hidden="true">
                      {dayActivities.slice(0, 3).map((item) => (
                        <span key={item.id} className={`cal-dot kind-${item.kind}`} title={item.title} />
                      ))}
                      {dayActivities.length > 3 && (
                        <span className="cal-dot-more">+{dayActivities.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="calendar-category-legend" aria-label="Event category colors">
            <span className="cal-legend-item"><i className="cal-dot kind-class" /> Class</span>
            <span className="cal-legend-item"><i className="cal-dot kind-study" /> Study</span>
            <span className="cal-legend-item"><i className="cal-dot kind-formal_exam" /> Exam</span>
            <span className="cal-legend-item"><i className="cal-dot kind-deadline" /> Due / Task</span>
          </div>
        </div>

        <aside className="day-details">
          <p className="eyebrow">Selected day</p>
          <h3>
            {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
              new Date(`${selectedDate}T12:00:00Z`),
            )}
          </h3>

          {/* Scheduled Activities for Selected Day */}
          <div style={{ marginTop: "12px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
                Scheduled Items ({selectedScheduled.length})
              </span>
              {onOpenItemModal && (
                <button
                  type="button"
                  className="text-button-subtle"
                  style={{ fontSize: "11px", color: "var(--green)", fontWeight: 700, padding: 0 }}
                  onClick={() => onOpenItemModal("study", undefined, undefined, selectedDate)}
                >
                  + Add for this date
                </button>
              )}
            </div>

            {selectedScheduled.length === 0 ? (
              <div className="plan-empty" style={{ margin: "14px 0", padding: "18px 14px" }}>
                <h4 style={{ margin: "0 0 4px", fontSize: "13px" }}>No activities scheduled</h4>
                <p style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--muted)" }}>No events or exams set for this date.</p>
                {onOpenItemModal && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onOpenItemModal("study", undefined, undefined, selectedDate)}
                  >
                    + Add Activity
                  </button>
                )}
              </div>
            ) : (
              <div className="calendar-plan-list">
                {selectedScheduled.map((item) => {
                  const isFormalExam = item.kind === "formal_exam";
                  const subjectTone = item.subject && SUBJECT_TONES[item.subject as GradeSubject];

                  return (
                    <div
                      key={item.id}
                      className={`calendar-plan-item kind-${item.kind}`}
                      onClick={() => {
                        if (isFormalExam && item.rawExam) {
                          openExam(item.rawExam);
                        } else if (item.rawBlock && onOpenItemModal) {
                          onOpenItemModal(item.rawBlock.eventKind || "study", item.rawBlock, item.planId ?? undefined, item.date);
                        } else if (item.planId) {
                          onOpenStudyPlan(item.planId);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <i
                        className={
                          isFormalExam
                            ? subjectTone ?? "exam"
                            : item.completed
                              ? "complete"
                              : item.kind === "class"
                                ? "class-dot"
                                : ""
                        }
                        style={item.kind === "class" ? { backgroundColor: "#60a5fa" } : undefined}
                      />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "2px" }}>
                          <span className={`event-kind-badge kind-${item.kind}`} style={{ fontSize: "8.5px", padding: "1px 6px" }}>
                            {isFormalExam ? "EXAM" : item.kind.toUpperCase()}
                          </span>
                          <strong style={{ fontSize: "13px" }}>{item.title}</strong>
                          {item.addedToCalendar && (
                            <span style={{ fontSize: "9px", color: "var(--green)", fontWeight: 700 }}>
                              Pinned
                            </span>
                          )}
                          {item.attachments.length > 0 && (
                            <span style={{ fontSize: "9.5px", color: "var(--muted)" }}>
                              {item.attachments.length} att
                            </span>
                          )}
                        </div>
                        <small style={{ color: "var(--muted)", display: "block", marginTop: "2px" }}>
                          {item.timeDisplay}
                          {item.room ? ` · Room ${item.room}` : ""}
                          {item.instructor ? ` · ${item.instructor}` : ""}
                          {isFormalExam ? ` · ${examStatus(item.date, todayKey)}` : ""}
                        </small>
                        {item.notes && (
                          <small style={{ color: "var(--text-secondary, #94a3b8)", display: "block", marginTop: "2px", fontStyle: "italic" }}>
                            {item.notes}
                          </small>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Practice History Section (Distinct visual category - Requirement 3) */}
          <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green)" }}>
                Completed Practice History
              </span>
            </div>

            {selectedDailyActivity && selectedDailyActivity.questions_answered > 0 ? (
              <div style={{ padding: "10px", background: "var(--surface, rgba(255, 255, 255, 0.03))", borderRadius: "10px" }}>
                <div className="day-stats" style={{ margin: 0 }}>
                  <span><strong>{selectedDailyActivity.questions_answered}</strong> questions</span>
                  <span><strong>{selectedDailyActivity.correct_answers}</strong> correct</span>
                  <span><strong>{selectedDailyActivity.review_count}</strong> sessions</span>
                </div>
                {selectedDailyActivity.subjects_studied.length > 0 && (
                  <p className="subjects-studied" style={{ marginTop: "6px" }}>
                    Studied: {selectedDailyActivity.subjects_studied.join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="empty-note" style={{ fontSize: "12px", margin: 0 }}>
                No practice attempts recorded on this day.
              </p>
            )}
          </div>

          <div style={{ marginTop: "16px" }}>
            <button className="secondary-button wide" type="button" onClick={() => openExam()}>
              + Add assessment date
            </button>
          </div>
        </aside>
      </div>

      {/* Up Next Section */}
      <div className="up-next">
        <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--green)" }}>
          Up next
        </span>
        {nextExam ? (
          <div>
            <strong>{nextExam.subject} · {nextExam.assessment_type}</strong>
            <p>
              {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
                new Date(`${nextExam.scheduled_date}T12:00:00Z`),
              )} · {examStatus(nextExam.scheduled_date, todayKey)}
            </p>
            {nextExamGradeSummary?.normalizedPerformance != null && (
              <small>Current completed-work performance: {nextExamGradeSummary.normalizedPerformance.toFixed(1)}%</small>
            )}
            {nextExam.note && <small>{nextExam.note}</small>}
          </div>
        ) : (
          <div>
            <strong>No upcoming assessment</strong>
            <p>Add a date to keep the closest exam visible here.</p>
          </div>
        )}
      </div>

      {/* Inline Assessment Form Modal */}
      {formOpen && (
        <div className="inline-modal" role="dialog" aria-modal="true" aria-label="Assessment date editor">
          <form onSubmit={submit}>
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow">Exam schedule</p>
                <h2>{editing ? "Edit assessment" : "Add assessment"}</h2>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close">×</button>
            </div>
            <label className="profile-name-field">
              <span>Subject</span>
              <select value={subject} onChange={(event) => setSubject(event.target.value as GradeSubject)}>
                {SUBJECTS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="profile-name-field">
              <span>Assessment</span>
              <select value={assessmentType} onChange={(event) => setAssessmentType(event.target.value as AssessmentType)}>
                {ASSESSMENT_TYPES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="profile-name-field">
              <span>Date</span>
              <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required />
            </label>
            <label className="profile-name-field">
              <span>Note</span>
              <textarea rows={3} maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            {status && <p className="form-status" role="alert">{status}</p>}
            <div className="profile-modal-actions">
              {editing && (
                <button className="danger-button" type="button" onClick={() => void remove(editing.id)} disabled={pending}>
                  Delete
                </button>
              )}
              <button className="text-button quiet" type="button" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="primary-button" type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save date"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
