"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  STUDY_PLAN_CATEGORIES,
  type StudyPlan,
  type StudyPlanBlock,
  type StudyPlanCategory,
} from "../lib/domain";
import {
  calculatePlannerAnalytics,
  duplicateStudyPlan,
  formatPlanDate,
  formatStudyTime,
  moveStudyBlock,
  nextUpcomingStudyBlock,
  studyBlockMinutes,
  timeInTimeZone,
} from "../lib/studyPlanner";
import { downloadStudyPlanImage, downloadStudyPlanPdf } from "../lib/studyPlanExport";

type BlockDraft = {
  startTime: string;
  endTime: string;
  activity: string;
  subject: string;
  topic: string;
  notes: string;
  category: StudyPlanCategory;
  addedToCalendar: boolean;
};

const EMPTY_BLOCK: BlockDraft = {
  startTime: "07:00",
  endTime: "08:00",
  activity: "",
  subject: "",
  topic: "",
  notes: "",
  category: "Study",
  addedToCalendar: true,
};

function hoursLabel(minutes: number) {
  if (!minutes) return "0 hr";
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hr`;
}

export function TodayStudyPlan({ plans, todayKey, timeZone, onOpenPlanner }: {
  plans: StudyPlan[];
  todayKey: string;
  timeZone: string;
  onOpenPlanner: (planId?: string) => void;
}) {
  const todayPlans = plans.filter((plan) => plan.date === todayKey);
  const todayBlocks = todayPlans.flatMap((plan) => plan.blocks.map((block) => ({ plan, block })))
    .sort((a, b) => a.block.startTime.localeCompare(b.block.startTime));
  const analytics = calculatePlannerAnalytics(plans, todayKey);
  const next = nextUpcomingStudyBlock(plans, todayKey, timeInTimeZone(new Date(), timeZone));
  return (
    <section className="today-plan-card">
      <div className="today-plan-heading">
        <div><p className="eyebrow">Today&apos;s plan</p><h2>{todayPlans.length ? `${todayPlans.length} active plan${todayPlans.length === 1 ? "" : "s"}` : "Plan a focused study day"}</h2></div>
        <button className="text-button" type="button" onClick={() => onOpenPlanner(todayPlans[0]?.id)}>Open planner</button>
      </div>
      <div className="today-plan-stats">
        <span><strong>{hoursLabel(analytics.plannedMinutes)}</strong>study planned</span>
        <span><strong>{analytics.completedStudySessions}</strong>completed</span>
        <span><strong>{next ? formatStudyTime(next.block.startTime) : "—"}</strong>next session</span>
      </div>
      {todayBlocks.length ? (
        <div className="today-plan-list">
          {todayBlocks.slice(0, 4).map(({ plan, block }) => (
            <button type="button" key={block.id} onClick={() => onOpenPlanner(plan.id)}>
              <time>{formatStudyTime(block.startTime)}</time>
              <span><strong>{block.activity}</strong><small>{[block.subject, block.topic].filter(Boolean).join(" · ") || block.category}</small></span>
              <i className={block.completed ? "complete" : ""} aria-label={block.completed ? "Completed" : "Planned"}>{block.completed ? "Done" : block.category}</i>
            </button>
          ))}
          {todayBlocks.length > 4 && <p>+{todayBlocks.length - 4} more block{todayBlocks.length - 4 === 1 ? "" : "s"} in Study Planner</p>}
        </div>
      ) : (
        <div className="today-plan-empty"><p>No schedule blocks for today yet.</p><button className="secondary-button" type="button" onClick={() => onOpenPlanner()}>Create today&apos;s plan</button></div>
      )}
      {next && next.plan.date !== todayKey && <p className="next-plan-note">Next study session: {formatPlanDate(next.plan.date, "short")} at {formatStudyTime(next.block.startTime)} · {next.block.activity}</p>}
    </section>
  );
}

export default function StudyPlanner({
  plans,
  selectedPlanId,
  defaultDate,
  subjectOptions,
  topicOptions,
  onChange,
  onSelectPlan,
}: {
  plans: StudyPlan[];
  selectedPlanId: string | null;
  defaultDate: string;
  subjectOptions: string[];
  topicOptions: string[];
  onChange: (plans: StudyPlan[]) => void;
  onSelectPlan: (id: string | null) => void;
}) {
  const [planForm, setPlanForm] = useState<"new" | "edit" | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [planDate, setPlanDate] = useState(defaultDate);
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<BlockDraft>(EMPTY_BLOCK);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState(defaultDate);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const orderedPlans = useMemo(() => [...plans].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)), [plans]);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const planAnalytics = selectedPlan ? calculatePlannerAnalytics([selectedPlan]) : null;

  useEffect(() => {
    if (selectedPlanId && plans.some((plan) => plan.id === selectedPlanId)) return;
    onSelectPlan(orderedPlans[0]?.id ?? null);
  }, [onSelectPlan, orderedPlans, plans, selectedPlanId]);

  function replacePlan(plan: StudyPlan) {
    onChange(plans.map((item) => item.id === plan.id ? { ...plan, updatedAt: new Date().toISOString() } : item));
  }

  function openPlanEditor(mode: "new" | "edit") {
    setError(""); setStatus(""); setPlanForm(mode);
    setPlanTitle(mode === "edit" ? selectedPlan?.title ?? "" : "Daily study plan");
    setPlanDate(mode === "edit" ? selectedPlan?.date ?? defaultDate : defaultDate);
  }

  function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("planTitle") ?? planTitle).trim();
    const date = String(formData.get("planDate") ?? planDate);
    if (!title || !date) { setError("Enter a plan title and date."); return; }
    const now = new Date().toISOString();
    if (planForm === "edit" && selectedPlan) {
      replacePlan({ ...selectedPlan, title, date });
      setStatus("Plan details updated.");
    } else {
      const plan: StudyPlan = { id: crypto.randomUUID(), title, date, blocks: [], createdAt: now, updatedAt: now };
      onChange([...plans, plan]); onSelectPlan(plan.id); setStatus("New study plan created.");
    }
    setPlanForm(null);
  }

  function removePlan() {
    if (!selectedPlan || !window.confirm(`Delete “${selectedPlan.title}” and all its schedule blocks?`)) return;
    const remaining = plans.filter((plan) => plan.id !== selectedPlan.id);
    onChange(remaining); onSelectPlan(remaining[0]?.id ?? null); setStatus("Study plan deleted.");
  }

  function openBlockEditor(block?: StudyPlanBlock) {
    setError(""); setStatus(""); setEditingBlockId(block?.id ?? null);
    setBlockDraft(block ? {
      startTime: block.startTime,
      endTime: block.endTime,
      activity: block.activity,
      subject: block.subject ?? "",
      topic: block.topic ?? "",
      notes: block.notes ?? "",
      category: block.category,
      addedToCalendar: block.addedToCalendar,
    } : EMPTY_BLOCK);
    setBlockFormOpen(true);
  }

  function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const formData = new FormData(event.currentTarget);
    const submittedDraft = {
      ...blockDraft,
      startTime: String(formData.get("startTime") ?? blockDraft.startTime),
      endTime: String(formData.get("endTime") ?? blockDraft.endTime),
    };
    if (!selectedPlan || !submittedDraft.activity.trim()) { setError("Enter an activity name."); return; }
    if (studyBlockMinutes(submittedDraft) <= 0) { setError("End time must be later than start time."); return; }
    const existing = selectedPlan.blocks.find((block) => block.id === editingBlockId);
    const block: StudyPlanBlock = {
      id: existing?.id ?? crypto.randomUUID(),
      startTime: submittedDraft.startTime,
      endTime: submittedDraft.endTime,
      activity: submittedDraft.activity.trim(),
      subject: submittedDraft.subject.trim() || null,
      topic: submittedDraft.topic.trim() || null,
      notes: submittedDraft.notes.trim() || null,
      category: submittedDraft.category,
      addedToCalendar: submittedDraft.addedToCalendar,
      calendarEventId: submittedDraft.addedToCalendar ? existing?.calendarEventId ?? crypto.randomUUID() : null,
      completed: existing?.completed ?? false,
    };
    const blocks = existing
      ? selectedPlan.blocks.map((item) => item.id === block.id ? block : item)
      : [...selectedPlan.blocks, block];
    replacePlan({ ...selectedPlan, blocks });
    setBlockFormOpen(false); setStatus(existing ? "Schedule block updated." : "Schedule block added.");
  }

  function removeBlock(block: StudyPlanBlock) {
    if (!selectedPlan || !window.confirm(`Delete “${block.activity}”?`)) return;
    replacePlan({ ...selectedPlan, blocks: selectedPlan.blocks.filter((item) => item.id !== block.id) });
    setStatus("Schedule block deleted.");
  }

  function toggleComplete(block: StudyPlanBlock) {
    if (!selectedPlan) return;
    replacePlan({ ...selectedPlan, blocks: selectedPlan.blocks.map((item) => item.id === block.id ? { ...item, completed: !item.completed } : item) });
  }

  function reorderBlock(blockId: string, direction: -1 | 1) {
    if (!selectedPlan) return;
    replacePlan({ ...selectedPlan, blocks: moveStudyBlock(selectedPlan.blocks, blockId, direction) });
  }

  function duplicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const formData = new FormData(event.currentTarget);
    const date = String(formData.get("duplicateDate") ?? duplicateDate);
    if (!selectedPlan || !date) { setError("Choose a date for the duplicate plan."); return; }
    const copy = duplicateStudyPlan(selectedPlan, date);
    onChange([...plans, copy]); onSelectPlan(copy.id); setDuplicateOpen(false); setStatus("Study plan duplicated.");
  }

  function runExport(kind: "pdf" | "png" | "jpeg") {
    if (!selectedPlan) return;
    setError("");
    try {
      if (kind === "pdf") downloadStudyPlanPdf(selectedPlan);
      else downloadStudyPlanImage(selectedPlan, kind);
      setStatus(`${kind === "jpeg" ? "JPG" : kind.toUpperCase()} export downloaded.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "The study plan could not be exported.");
    }
  }

  return (
    <div className="planner-shell">
      <aside className="plan-library">
        <div className="plan-library-heading"><div><p className="eyebrow">Saved locally</p><h2>Study plans</h2></div><span>{plans.length}</span></div>
        <button className="primary-button wide" type="button" onClick={() => openPlanEditor("new")}>New study plan</button>
        <div className="plan-library-list">
          {orderedPlans.map((plan) => (
            <button className={selectedPlan?.id === plan.id ? "active" : ""} type="button" key={plan.id} onClick={() => onSelectPlan(plan.id)}>
              <strong>{plan.title}</strong><span>{formatPlanDate(plan.date, "short")}</span><small>{plan.blocks.length} block{plan.blocks.length === 1 ? "" : "s"}</small>
            </button>
          ))}
          {!plans.length && <div className="plan-library-empty"><strong>No plans yet</strong><p>Create a daily schedule, then optionally show its blocks in the RevIT calendar.</p></div>}
        </div>
        <p className="local-storage-note">Planner schedules stay on this device and are separated by signed-in account.</p>
      </aside>

      <section className="plan-workspace">
        {selectedPlan ? (
          <>
            <div className="plan-workspace-heading">
              <div><p className="eyebrow">{formatPlanDate(selectedPlan.date)}</p><h2>{selectedPlan.title}</h2><p>{selectedPlan.blocks.length} time block{selectedPlan.blocks.length === 1 ? "" : "s"} · {hoursLabel(planAnalytics?.plannedMinutes ?? 0)} of study planned</p></div>
              <button className="primary-button" type="button" onClick={() => openBlockEditor()}>Add time block</button>
            </div>
            <div className="plan-toolbar" aria-label="Study plan actions">
              <button type="button" onClick={() => openPlanEditor("edit")}>Edit plan</button>
              <button type="button" onClick={() => { setDuplicateDate(selectedPlan.date); setDuplicateOpen(true); setError(""); }}>Duplicate day</button>
              <span className="plan-toolbar-divider" />
              <button type="button" onClick={() => runExport("pdf")}>Export PDF</button>
              <button type="button" onClick={() => runExport("png")}>Export PNG</button>
              <button type="button" onClick={() => runExport("jpeg")}>Export JPG</button>
              <button className="danger" type="button" onClick={removePlan}>Delete plan</button>
            </div>
            {(status || error) && <p className={`planner-status ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || status}</p>}
            <div className="plan-block-list">
              {selectedPlan.blocks.map((block, index) => (
                <article className={`plan-block category-${block.category.toLowerCase()} ${block.completed ? "completed" : ""}`} key={block.id}>
                  <div className="plan-block-time"><time>{formatStudyTime(block.startTime)}</time><span>to</span><time>{formatStudyTime(block.endTime)}</time><small>{Math.round(studyBlockMinutes(block) / 6) / 10} hr</small></div>
                  <div className="plan-block-copy">
                    <div className="plan-block-title"><span>{block.category}</span>{block.addedToCalendar && <i>In calendar</i>}</div>
                    <h3>{block.activity}</h3>
                    {(block.subject || block.topic) && <p>{[block.subject, block.topic].filter(Boolean).join(" · ")}</p>}
                    {block.notes && <small>{block.notes}</small>}
                    <label className="complete-control"><input type="checkbox" checked={block.completed} onChange={() => toggleComplete(block)} />Mark session completed</label>
                  </div>
                  <div className="plan-block-actions">
                    <button type="button" onClick={() => reorderBlock(block.id, -1)} disabled={index === 0}>Move up</button>
                    <button type="button" onClick={() => reorderBlock(block.id, 1)} disabled={index === selectedPlan.blocks.length - 1}>Move down</button>
                    <button type="button" onClick={() => openBlockEditor(block)}>Edit</button>
                    <button className="danger" type="button" onClick={() => removeBlock(block)}>Delete</button>
                  </div>
                </article>
              ))}
              {!selectedPlan.blocks.length && <div className="plan-empty"><span aria-hidden="true" /><h3>Your day is open</h3><p>Add study, break, exam, event, or other time blocks. Calendar sync is optional for every block.</p><button className="secondary-button" type="button" onClick={() => openBlockEditor()}>Add first time block</button></div>}
            </div>
          </>
        ) : (
          <div className="plan-empty standalone"><span aria-hidden="true" /><h2>Build your first study plan</h2><p>Organize a day into custom time blocks and choose which sessions should also appear in the RevIT calendar.</p><button className="primary-button" type="button" onClick={() => openPlanEditor("new")}>Create study plan</button></div>
        )}
      </section>

      {planForm && <div className="inline-modal" role="presentation"><form onSubmit={savePlan} aria-label={planForm === "edit" ? "Edit study plan" : "Create study plan"}><div className="profile-modal-heading"><div><p className="eyebrow">Study Planner</p><h2>{planForm === "edit" ? "Edit plan" : "New plan"}</h2></div><button type="button" onClick={() => setPlanForm(null)} aria-label="Close">×</button></div><label className="profile-name-field"><span>Plan title</span><input name="planTitle" maxLength={80} value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} required /></label><label className="profile-name-field"><span>Date</span><input name="planDate" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} required /></label>{error && <p className="form-status" role="alert">{error}</p>}<div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={() => setPlanForm(null)}>Cancel</button><button className="primary-button" type="submit">{planForm === "edit" ? "Save changes" : "Create plan"}</button></div></form></div>}

      {blockFormOpen && <div className="inline-modal planner-block-modal" role="presentation"><form onSubmit={saveBlock} aria-label={editingBlockId ? "Edit schedule block" : "Add schedule block"}><div className="profile-modal-heading"><div><p className="eyebrow">Schedule block</p><h2>{editingBlockId ? "Edit activity" : "Add activity"}</h2></div><button type="button" onClick={() => setBlockFormOpen(false)} aria-label="Close">×</button></div><div className="planner-time-fields"><label className="profile-name-field"><span>Start time</span><input name="startTime" type="time" value={blockDraft.startTime} onChange={(event) => setBlockDraft((current) => ({ ...current, startTime: event.target.value }))} required /></label><label className="profile-name-field"><span>End time</span><input name="endTime" type="time" value={blockDraft.endTime} onChange={(event) => setBlockDraft((current) => ({ ...current, endTime: event.target.value }))} required /></label></div><label className="profile-name-field"><span>Activity name</span><input maxLength={100} value={blockDraft.activity} onChange={(event) => setBlockDraft((current) => ({ ...current, activity: event.target.value }))} placeholder="Review Bacteriology" required /></label><label className="profile-name-field"><span>Category</span><select value={blockDraft.category} onChange={(event) => setBlockDraft((current) => ({ ...current, category: event.target.value as StudyPlanCategory }))}>{STUDY_PLAN_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><div className="planner-time-fields"><label className="profile-name-field"><span>Subject (optional)</span><input list="planner-subjects" maxLength={80} value={blockDraft.subject} onChange={(event) => setBlockDraft((current) => ({ ...current, subject: event.target.value }))} /></label><label className="profile-name-field"><span>Topic (optional)</span><input list="planner-topics" maxLength={100} value={blockDraft.topic} onChange={(event) => setBlockDraft((current) => ({ ...current, topic: event.target.value }))} /></label></div><datalist id="planner-subjects">{subjectOptions.map((value) => <option value={value} key={value} />)}</datalist><datalist id="planner-topics">{topicOptions.map((value) => <option value={value} key={value} />)}</datalist><label className="profile-name-field"><span>Notes (optional)</span><textarea rows={3} maxLength={300} value={blockDraft.notes} onChange={(event) => setBlockDraft((current) => ({ ...current, notes: event.target.value }))} /></label><label className="planner-calendar-option" htmlFor="planner-add-to-calendar"><input id="planner-add-to-calendar" type="checkbox" aria-label="Add to RevIT Calendar" checked={blockDraft.addedToCalendar} onChange={(event) => setBlockDraft((current) => ({ ...current, addedToCalendar: event.target.checked }))} /><span><strong>Add to RevIT Calendar</strong><small>Show this block beside your existing calendar events.</small></span></label>{error && <p className="form-status" role="alert">{error}</p>}<div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={() => setBlockFormOpen(false)}>Cancel</button><button className="primary-button" type="submit">{editingBlockId ? "Save block" : "Add block"}</button></div></form></div>}

      {duplicateOpen && selectedPlan && <div className="inline-modal" role="presentation"><form onSubmit={duplicate} aria-label="Duplicate study plan"><div className="profile-modal-heading"><div><p className="eyebrow">Duplicate schedule</p><h2>Choose another day</h2></div><button type="button" onClick={() => setDuplicateOpen(false)} aria-label="Close">×</button></div><p className="duplicate-note">All time blocks and calendar choices will be copied. Completion states will reset.</p><label className="profile-name-field"><span>New date</span><input name="duplicateDate" type="date" value={duplicateDate} onChange={(event) => setDuplicateDate(event.target.value)} required /></label>{error && <p className="form-status" role="alert">{error}</p>}<div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={() => setDuplicateOpen(false)}>Cancel</button><button className="primary-button" type="submit">Duplicate plan</button></div></form></div>}
    </div>
  );
}
