"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  ASSESSMENT_TYPES,
  SUBJECTS,
  type DailyActivity,
  type ExamSchedule,
  type GradeSubject,
  type AssessmentType,
} from "../lib/domain";
import { buildMonthGrid, dateKeyInTimeZone, examStatus, intensityFor, upcomingExam } from "../lib/studyCalendar";

const SUBJECT_TONES: Record<GradeSubject, string> = {
  Hematology: "heme",
  "Clinical Chemistry": "chem",
  Bacteriology: "bact",
  AUBF: "aubf",
};

export default function StudyCalendar({ activity, exams, timeZone, onSaveExam, onDeleteExam }: {
  activity: DailyActivity[];
  exams: ExamSchedule[];
  timeZone: string;
  onSaveExam: (exam: Omit<ExamSchedule, "id"> & { id?: string }) => Promise<void>;
  onDeleteExam: (id: string) => Promise<void>;
}) {
  const now = new Date();
  const todayKey = dateKeyInTimeZone(now, timeZone);
  const [cursor, setCursor] = useState(() => ({ year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) - 1 }));
  const [selectedDate, setSelectedDate] = useState(todayKey);
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
  const examsByDate = useMemo(() => {
    const map = new Map<string, ExamSchedule[]>();
    exams.forEach((exam) => map.set(exam.scheduled_date, [...(map.get(exam.scheduled_date) ?? []), exam]));
    return map;
  }, [exams]);
  const selectedActivity = activityByDate.get(selectedDate);
  const selectedExams = examsByDate.get(selectedDate) ?? [];
  const nextExam = upcomingExam(exams, todayKey);

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
    setStatus(""); setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setStatus("");
    try {
      await onSaveExam({ id: editing?.id, subject, assessment_type: assessmentType, scheduled_date: scheduledDate, note: note.trim() || null });
      setSelectedDate(scheduledDate); setFormOpen(false);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Exam date could not be saved."); }
    finally { setPending(false); }
  }

  async function remove(id: string) {
    setPending(true); setStatus("");
    try { await onDeleteExam(id); setFormOpen(false); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Exam date could not be deleted."); }
    finally { setPending(false); }
  }

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(cursor.year, cursor.month, 1)));
  return (
    <section className="calendar-card">
      <div className="calendar-heading">
        <div><p className="eyebrow">Study activity & exams</p><h2>{monthName}</h2><p>Only answered questions and completed AI reviews count as activity.</p></div>
        <div className="calendar-actions"><button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">←</button><button type="button" onClick={() => setCursor({ year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) - 1 })}>Today</button><button type="button" onClick={() => moveMonth(1)} aria-label="Next month">→</button></div>
      </div>
      <div className="calendar-layout">
        <div>
          <div className="calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="month-grid" aria-label={`${monthName} calendar`}>
            {days.map((day) => {
              const daily = activityByDate.get(day.key);
              const dayExams = examsByDate.get(day.key) ?? [];
              const intensity = intensityFor(daily);
              return (
                <button type="button" key={day.key} className={`calendar-day intensity-${intensity} ${day.inMonth ? "" : "outside"} ${day.key === todayKey ? "today" : ""} ${selectedDate === day.key ? "selected" : ""}`} onClick={() => setSelectedDate(day.key)} aria-label={`${day.key}, activity level ${intensity}, ${dayExams.length} exams`}>
                  <span>{day.day}</span>
                  <span className="exam-dots">{dayExams.slice(0, 4).map((exam) => <i className={SUBJECT_TONES[exam.subject]} key={exam.id} title={`${exam.subject} ${exam.assessment_type}`} />)}</span>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i className={`intensity-${level}`} key={level} />)}<span>More</span><b>Dots mark exams</b></div>
        </div>
        <aside className="day-details">
          <p className="eyebrow">Selected day</p><h3>{new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`))}</h3>
          <div className="day-stats"><span><strong>{selectedActivity?.questions_answered ?? 0}</strong> questions</span><span><strong>{selectedActivity?.correct_answers ?? 0}</strong> correct</span><span><strong>{selectedActivity?.review_count ?? 0}</strong> AI reviews</span></div>
          {selectedActivity?.subjects_studied.length ? <p className="subjects-studied">Studied: {selectedActivity.subjects_studied.join(", ")}</p> : <p className="empty-note">No meaningful study activity recorded.</p>}
          <div className="exam-list">
            {selectedExams.map((exam) => <button type="button" key={exam.id} onClick={() => openExam(exam)}><i className={SUBJECT_TONES[exam.subject]} /><span><strong>{exam.subject}</strong><small>{exam.assessment_type} · {examStatus(exam.scheduled_date, todayKey)}</small></span></button>)}
          </div>
          <button className="secondary-button wide" type="button" onClick={() => openExam()}>Add assessment</button>
        </aside>
      </div>
      <div className="up-next">
        <span className="state-pill">Up next</span>
        {nextExam ? <div><strong>{nextExam.subject} · {nextExam.assessment_type}</strong><p>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${nextExam.scheduled_date}T12:00:00Z`))} · {examStatus(nextExam.scheduled_date, todayKey)}</p>{nextExam.note && <small>{nextExam.note}</small>}</div> : <div><strong>No upcoming assessment</strong><p>Add a date to keep the closest exam visible here.</p></div>}
      </div>
      {formOpen && <div className="inline-modal" role="dialog" aria-modal="true" aria-label="Assessment date editor"><form onSubmit={submit}><div className="profile-modal-heading"><div><p className="eyebrow">Exam schedule</p><h2>{editing ? "Edit assessment" : "Add assessment"}</h2></div><button type="button" onClick={() => setFormOpen(false)} aria-label="Close">×</button></div><label className="profile-name-field"><span>Subject</span><select value={subject} onChange={(event) => setSubject(event.target.value as GradeSubject)}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="profile-name-field"><span>Assessment</span><select value={assessmentType} onChange={(event) => setAssessmentType(event.target.value as AssessmentType)}>{ASSESSMENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="profile-name-field"><span>Date</span><input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required /></label><label className="profile-name-field"><span>Note</span><textarea rows={3} maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} /></label>{status && <p className="form-status" role="alert">{status}</p>}<div className="profile-modal-actions">{editing && <button className="danger-button" type="button" onClick={() => void remove(editing.id)} disabled={pending}>Delete</button>}<button className="text-button quiet" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save date"}</button></div></form></div>}
    </section>
  );
}
