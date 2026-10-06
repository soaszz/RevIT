"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  STUDY_PLAN_CATEGORIES,
  PLANNER_EVENT_KINDS,
  type PlannerEventKind,
  type PlannerAttachmentMeta,
  type StudyPlan,
  type StudyPlanBlock,
  type StudyPlanCategory,
} from "../lib/domain";
import {
  calculatePlannerAnalytics,
  duplicateStudyPlan,
  formatPlanDate,
  formatStudyTime,
  getWeekDates,
  getExpandedItemsForDate,
  moveStudyBlock,
  nextUpcomingStudyBlock,
  studyBlockMinutes,
  timeInTimeZone,
  type ExpandedPlannerItem,
} from "../lib/studyPlanner";
import { downloadStudyPlanImage, downloadStudyPlanPdf } from "../lib/studyPlanExport";
import {
  storeAttachment,
  getAttachmentUrl,
  deleteAttachment,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "../lib/plannerStorage";

type PlannerViewMode = "today" | "week" | "plans";

type ItemModalMode = {
  isOpen: boolean;
  kind: PlannerEventKind;
  editingBlock: StudyPlanBlock | null;
  targetPlanId: string | null;
};

type ItemFormDraft = {
  activity: string;
  kind: PlannerEventKind;
  subject: string;
  topic: string;
  startTime: string;
  endTime: string;
  category: StudyPlanCategory;
  notes: string;
  room: string;
  instructor: string;
  targetCount: string;
  targetType: "mcq" | "flashcard" | "pages";
  dueDate: string;
  dueTime: string;
  recurrenceDays: number[];
  recurrenceEnd: string;
  addedToCalendar: boolean;
  attachments: PlannerAttachmentMeta[];
};

const DEFAULT_FORM_DRAFT: ItemFormDraft = {
  activity: "",
  kind: "study",
  subject: "",
  topic: "",
  startTime: "08:00",
  endTime: "09:30",
  category: "Study",
  notes: "",
  room: "",
  instructor: "",
  targetCount: "",
  targetType: "mcq",
  dueDate: "",
  dueTime: "23:59",
  recurrenceDays: [],
  recurrenceEnd: "",
  addedToCalendar: true,
  attachments: [],
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function hoursLabel(minutes: number) {
  if (!minutes) return "0 hr";
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hr`;
}

// Preserve TodayStudyPlan export for backwards compatibility with tests and dashboard widgets
export function TodayStudyPlan({
  plans,
  todayKey,
  timeZone,
  onOpenPlanner,
}: {
  plans: StudyPlan[];
  todayKey: string;
  timeZone: string;
  onOpenPlanner: (planId?: string) => void;
}) {
  const todayItems = useMemo(() => getExpandedItemsForDate(plans, todayKey), [plans, todayKey]);
  const analytics = calculatePlannerAnalytics(plans, todayKey);
  const next = nextUpcomingStudyBlock(plans, todayKey, timeInTimeZone(new Date(), timeZone));

  return (
    <section className="today-plan-card">
      <div className="today-plan-heading">
        <div>
          <p className="eyebrow">Today&apos;s schedule</p>
          <h2>{todayItems.length ? `${todayItems.length} academic event${todayItems.length === 1 ? "" : "s"}` : "Plan a focused study day"}</h2>
        </div>
        <button className="text-button" type="button" onClick={() => onOpenPlanner(todayItems[0]?.planId)}>
          Open planner
        </button>
      </div>
      <div className="today-plan-stats">
        <span>
          <strong>{hoursLabel(analytics.plannedMinutes)}</strong>study planned
        </span>
        <span>
          <strong>{analytics.completedStudySessions}</strong>completed
        </span>
        <span>
          <strong>{next ? formatStudyTime(next.block.startTime) : "—"}</strong>next session
        </span>
      </div>
      {todayItems.length ? (
        <div className="today-plan-list">
          {todayItems.slice(0, 4).map(({ planId, block }) => (
            <button type="button" key={block.id} onClick={() => onOpenPlanner(planId)}>
              <time>{formatStudyTime(block.startTime)}</time>
              <span>
                <strong>{block.activity}</strong>
                <small>{[block.subject, block.topic].filter(Boolean).join(" · ") || block.eventKind?.toUpperCase() || block.category}</small>
              </span>
              <i className={block.completed ? "complete" : ""} aria-label={block.completed ? "Completed" : "Planned"}>
                {block.completed ? "Done" : (block.eventKind ? block.eventKind.toUpperCase() : block.category)}
              </i>
            </button>
          ))}
          {todayItems.length > 4 && <p>+{todayItems.length - 4} more block{todayItems.length - 4 === 1 ? "" : "s"} in Planner</p>}
        </div>
      ) : (
        <div className="today-plan-empty">
          <p>No academic activities scheduled for today yet.</p>
          <button className="secondary-button" type="button" onClick={() => onOpenPlanner()}>
            Add to today
          </button>
        </div>
      )}
      {next && next.plan.date !== todayKey && (
        <p className="next-plan-note">
          Next study session: {formatPlanDate(next.plan.date, "short")} at {formatStudyTime(next.block.startTime)} · {next.block.activity}
        </p>
      )}
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
  // Top-level Navigation Mode: Today vs Week vs Plans
  const [plannerMode, setPlannerMode] = useState<PlannerViewMode>("today");
  const [activeDate, setActiveDate] = useState<string>(defaultDate);

  // Modal creation states
  const [itemModal, setItemModal] = useState<ItemModalMode>({
    isOpen: false,
    kind: "study",
    editingBlock: null,
    targetPlanId: null,
  });
  const [draft, setDraft] = useState<ItemFormDraft>(DEFAULT_FORM_DRAFT);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Plan container modals (for "Plans" tab)
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<StudyPlan | null>(null);
  const [planTitleInput, setPlanTitleInput] = useState("");
  const [planDateInput, setPlanDateInput] = useState(defaultDate);

  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState(defaultDate);

  // Status & Feedback
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Ordered list of plans
  const orderedPlans = useMemo(
    () => [...plans].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
    [plans]
  );
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? orderedPlans[0] ?? null;

  // Sync selected plan
  useEffect(() => {
    if (selectedPlanId && plans.some((p) => p.id === selectedPlanId)) return;
    if (orderedPlans[0]) onSelectPlan(orderedPlans[0].id);
  }, [onSelectPlan, orderedPlans, plans, selectedPlanId]);

  // Expanded items for Today
  const todayItems = useMemo(() => getExpandedItemsForDate(plans, defaultDate), [plans, defaultDate]);

  // Week Dates & Matrix
  const weekDates = useMemo(() => getWeekDates(activeDate), [activeDate]);

  const weekMatrix = useMemo(() => {
    return weekDates.map((dateStr) => {
      const items = getExpandedItemsForDate(plans, dateStr);
      return {
        date: dateStr,
        items,
      };
    });
  }, [plans, weekDates]);

  // Study progress analytics
  const studyProgress = useMemo(() => {
    let planned = 0;
    let completed = 0;
    weekMatrix.forEach((col) => {
      col.items.forEach((item) => {
        if (item.block.eventKind === "study" || item.block.category === "Study") {
          planned++;
          if (item.block.completed) completed++;
        }
      });
    });
    return { planned, completed };
  }, [weekMatrix]);

  // Upcoming items across the week
  const upcomingItems = useMemo(() => {
    const all = plans
      .flatMap((p) => p.blocks.map((b) => ({ plan: p, block: b })))
      .filter(({ plan, block }) => plan.date > defaultDate || (plan.date === defaultDate && !block.completed))
      .sort((a, b) => a.plan.date.localeCompare(b.plan.date) || a.block.startTime.localeCompare(b.block.startTime));
    return all.slice(0, 5);
  }, [plans, defaultDate]);

  // Helper: Replace or update a plan
  const replacePlan = useCallback((plan: StudyPlan) => {
    onChange(plans.map((p) => (p.id === plan.id ? { ...plan, updatedAt: new Date().toISOString() } : p)));
  }, [onChange, plans]);

  // Helper: ensure a plan container exists for a target date
  const ensurePlanForDate = useCallback((targetDate: string): StudyPlan => {
    const existing = plans.find((p) => p.date === targetDate);
    if (existing) return existing;
    const newPlan: StudyPlan = {
      id: crypto.randomUUID(),
      title: `Plan for ${formatPlanDate(targetDate, "short")}`,
      date: targetDate,
      blocks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onChange([...plans, newPlan]);
    return newPlan;
  }, [onChange, plans]);

  // Toggle completion of a block
  const toggleBlockCompleted = useCallback((targetPlanId: string, blockId: string) => {
    const plan = plans.find((p) => p.id === targetPlanId);
    if (!plan) return;
    const cleanId = blockId.split("_rec_")[0];
    const updatedBlocks = plan.blocks.map((b) => (b.id === cleanId ? { ...b, completed: !b.completed } : b));
    replacePlan({ ...plan, blocks: updatedBlocks });
  }, [plans, replacePlan]);

  // Open Unified "+ Add" Modal
  const openAddItemModal = (kind: PlannerEventKind = "study", block?: StudyPlanBlock, planId?: string) => {
    setError("");
    setStatus("");
    setUploadError("");

    if (block) {
      setItemModal({
        isOpen: true,
        kind: block.eventKind || "study",
        editingBlock: block,
        targetPlanId: planId || selectedPlan?.id || null,
      });
      setDraft({
        activity: block.activity,
        kind: block.eventKind || "study",
        subject: block.subject || "",
        topic: block.topic || "",
        startTime: block.startTime,
        endTime: block.endTime,
        category: block.category,
        notes: block.notes || "",
        room: block.room || "",
        instructor: block.instructor || "",
        targetCount: block.targetCount ? String(block.targetCount) : "",
        targetType: block.targetType || "mcq",
        dueDate: block.dueDate || "",
        dueTime: block.dueTime || "23:59",
        recurrenceDays: block.recurrenceDays || [],
        recurrenceEnd: block.recurrenceEnd || "",
        addedToCalendar: block.addedToCalendar,
        attachments: block.attachments || [],
      });
    } else {
      setItemModal({
        isOpen: true,
        kind,
        editingBlock: null,
        targetPlanId: planId || selectedPlan?.id || null,
      });
      setDraft({
        ...DEFAULT_FORM_DRAFT,
        kind,
        category: kind === "class" ? "Event" : kind === "exam" ? "Exam" : "Study",
      });
    }
  };

  // Handle file attachment upload to IndexedDB
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError("");

    const newAttachments: PlannerAttachmentMeta[] = [...draft.attachments];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setUploadError(`File "${file.name}" exceeds 10MB limit.`);
        continue;
      }
      const attId = crypto.randomUUID();
      try {
        await storeAttachment(attId, file, file.name);
        newAttachments.push({
          id: attId,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
        });
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Failed to store attachment in local storage.");
      }
    }
    setDraft((prev) => ({ ...prev, attachments: newAttachments }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Remove attachment
  const handleRemoveAttachment = async (id: string) => {
    await deleteAttachment(id);
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((a) => a.id !== id),
    }));
  };

  // Open attachment preview / download
  const handleOpenAttachment = async (id: string, name: string) => {
    const url = await getAttachmentUrl(id);
    if (!url) {
      alert("Attachment could not be opened from local storage.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  // Save Item Draft
  const handleSaveItem = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!draft.activity.trim()) {
      setError("Please enter a title / name for this activity.");
      return;
    }

    const targetDate = plannerMode === "today" ? defaultDate : activeDate;
    let targetPlan = itemModal.targetPlanId
      ? plans.find((p) => p.id === itemModal.targetPlanId)
      : plans.find((p) => p.date === targetDate);

    if (!targetPlan) {
      targetPlan = ensurePlanForDate(targetDate);
    }

    const cleanBlockId = itemModal.editingBlock?.id ? itemModal.editingBlock.id.split("_rec_")[0] : crypto.randomUUID();

    const block: StudyPlanBlock = {
      id: cleanBlockId,
      startTime: draft.startTime,
      endTime: draft.endTime,
      activity: draft.activity.trim(),
      subject: draft.subject.trim() || null,
      topic: draft.topic.trim() || null,
      notes: draft.notes.trim() || null,
      category: draft.kind === "class" ? "Event" : draft.kind === "exam" ? "Exam" : draft.category,
      addedToCalendar: draft.addedToCalendar,
      calendarEventId: draft.addedToCalendar ? itemModal.editingBlock?.calendarEventId ?? crypto.randomUUID() : null,
      completed: itemModal.editingBlock?.completed ?? false,
      eventKind: draft.kind,
      room: draft.room.trim() || null,
      instructor: draft.instructor.trim() || null,
      targetCount: draft.targetCount ? Number(draft.targetCount) : null,
      targetType: draft.targetCount ? draft.targetType : null,
      recurrenceDays: draft.kind === "class" && draft.recurrenceDays.length > 0 ? draft.recurrenceDays : null,
      recurrenceEnd: draft.kind === "class" && draft.recurrenceEnd ? draft.recurrenceEnd : null,
      dueDate: draft.kind === "deadline" || draft.kind === "task" ? draft.dueDate || null : null,
      dueTime: draft.kind === "deadline" ? draft.dueTime || null : null,
      attachments: draft.attachments,
    };

    const existingIndex = targetPlan.blocks.findIndex((b) => b.id === cleanBlockId);
    let updatedBlocks: StudyPlanBlock[];
    if (existingIndex >= 0) {
      updatedBlocks = targetPlan.blocks.map((b) => (b.id === cleanBlockId ? block : b));
    } else {
      updatedBlocks = [...targetPlan.blocks, block];
    }

    replacePlan({ ...targetPlan, blocks: updatedBlocks });
    setItemModal({ isOpen: false, kind: "study", editingBlock: null, targetPlanId: null });
    setStatus(`${draft.kind.toUpperCase()} saved.`);
  };

  // Delete an item
  const handleDeleteItem = (targetPlanId: string, blockId: string) => {
    const plan = plans.find((p) => p.id === targetPlanId);
    if (!plan) return;
    const cleanId = blockId.split("_rec_")[0];
    const itemToDelete = plan.blocks.find((b) => b.id === cleanId);
    if (!itemToDelete) return;
    if (!window.confirm(`Delete "${itemToDelete.activity}"?`)) return;

    // Delete associated attachments from IndexedDB
    if (itemToDelete.attachments) {
      itemToDelete.attachments.forEach((att) => deleteAttachment(att.id));
    }

    const updatedBlocks = plan.blocks.filter((b) => b.id !== cleanId);
    replacePlan({ ...plan, blocks: updatedBlocks });
    setStatus("Item deleted.");
  };

  // Plan management actions (for Plans tab)
  const openNewPlanModal = () => {
    setEditingPlan(null);
    setPlanTitleInput("Daily study plan");
    setPlanDateInput(activeDate);
    setPlanModalOpen(true);
  };

  const openEditPlanModal = (plan: StudyPlan) => {
    setEditingPlan(plan);
    setPlanTitleInput(plan.title);
    setPlanDateInput(plan.date);
    setPlanModalOpen(true);
  };

  const handleSavePlan = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!planTitleInput.trim() || !planDateInput) return;

    if (editingPlan) {
      replacePlan({ ...editingPlan, title: planTitleInput.trim(), date: planDateInput });
      setStatus("Plan updated.");
    } else {
      const newPlan: StudyPlan = {
        id: crypto.randomUUID(),
        title: planTitleInput.trim(),
        date: planDateInput,
        blocks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onChange([...plans, newPlan]);
      onSelectPlan(newPlan.id);
      setStatus("New plan created.");
    }
    setPlanModalOpen(false);
  };

  const handleDeletePlan = (plan: StudyPlan) => {
    if (!window.confirm(`Delete "${plan.title}" and its activities?`)) return;
    const remaining = plans.filter((p) => p.id !== plan.id);
    onChange(remaining);
    onSelectPlan(remaining[0]?.id ?? null);
    setStatus("Study plan deleted.");
  };

  const handleDuplicatePlan = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlan || !duplicateDate) return;
    const copy = duplicateStudyPlan(selectedPlan, duplicateDate);
    onChange([...plans, copy]);
    onSelectPlan(copy.id);
    setDuplicateOpen(false);
    setStatus("Plan duplicated.");
  };

  const runExport = (kind: "pdf" | "png" | "jpeg") => {
    if (!selectedPlan) return;
    setError("");
    try {
      if (kind === "pdf") downloadStudyPlanPdf(selectedPlan);
      else downloadStudyPlanImage(selectedPlan, kind);
      setStatus(`${kind.toUpperCase()} exported successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    }
  };

  return (
    <div className="planner-shell-v2">
      {/* ====================================================================
          TOP PLANNER HEADER & NAVIGATION MODES
          ==================================================================== */}
      <section className="planner-header-card">
        <div className="planner-header-row">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <p className="eyebrow" style={{ margin: 0 }}>Academic Planner</p>
              <span className="state-pill" style={{ fontSize: "9px" }}>Local-only · Private</span>
            </div>
            <h2>Schedule &amp; Timetable</h2>
            <p>Schedule your classes, organize study sessions, and prepare for upcoming exams &amp; deadlines.</p>
          </div>

          <div className="planner-top-actions">
            {/* View Mode Selector: Today | Week | Plans */}
            <div className="theme-segmented-control" role="tablist" aria-label="Planner view mode">
              <button
                type="button"
                role="tab"
                aria-selected={plannerMode === "today"}
                className={`theme-segment-btn ${plannerMode === "today" ? "active" : ""}`}
                onClick={() => setPlannerMode("today")}
              >
                Today
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={plannerMode === "week"}
                className={`theme-segment-btn ${plannerMode === "week" ? "active" : ""}`}
                onClick={() => setPlannerMode("week")}
              >
                Week
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={plannerMode === "plans"}
                className={`theme-segment-btn ${plannerMode === "plans" ? "active" : ""}`}
                onClick={() => setPlannerMode("plans")}
              >
                Plans ({plans.length})
              </button>
            </div>

            {/* Single Primary Action: + Add */}
            <button
              type="button"
              className="primary-button"
              onClick={() => openAddItemModal("study")}
            >
              + Add
            </button>
          </div>
        </div>

        {/* Status / Alert bar */}
        {(status || error) && (
          <p className={`planner-status ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
            {error || status}
          </p>
        )}
      </section>

      {/* ====================================================================
          VIEW 1: TODAY VIEW (Chronological agenda + Up Next + Study Progress)
          ==================================================================== */}
      {plannerMode === "today" && (
        <div className="planner-today-grid">
          {/* Main Today Timeline */}
          <div className="today-main-card">
            <div className="today-timeline-header">
              <div>
                <p className="eyebrow">Today&apos;s schedule</p>
                <h3>{formatPlanDate(defaultDate, "long")}</h3>
              </div>
              <span className="state-pill">{todayItems.length} item{todayItems.length === 1 ? "" : "s"}</span>
            </div>

            {todayItems.length === 0 ? (
              <div className="plan-empty">
                <span aria-hidden="true" />
                <h3>Your day is clear</h3>
                <p>No classes, study sessions, or exams scheduled for today.</p>
                <button type="button" className="secondary-button" onClick={() => openAddItemModal("study")}>
                  + Add to today
                </button>
              </div>
            ) : (
              <div className="today-timeline-list">
                {todayItems.map(({ planId, block }) => {
                  const kind = block.eventKind || "study";
                  return (
                    <article key={block.id} className={`planner-event-card kind-${kind} ${block.completed ? "is-completed" : ""}`}>
                      <div className="event-time-col">
                        <time>{formatStudyTime(block.startTime)}</time>
                        <span>to</span>
                        <time>{formatStudyTime(block.endTime)}</time>
                      </div>

                      <div className="event-body-col">
                        <div className="event-tag-row">
                          <span className={`event-kind-badge kind-${kind}`}>
                            {kind.toUpperCase()}
                          </span>
                          {block.subject && <span className="event-subject-pill">{block.subject}</span>}
                          {block.room && <span className="event-room-pill">Room {block.room}</span>}
                          {block.targetCount && (
                            <span className="event-target-pill">
                              Goal: {block.targetCount} {block.targetType}
                            </span>
                          )}
                        </div>

                        <h4>{block.activity}</h4>
                        {block.topic && <p className="event-topic-line">{block.topic}</p>}
                        {block.notes && <p className="event-notes-line">{block.notes}</p>}

                        {/* Attachments pills */}
                        {block.attachments && block.attachments.length > 0 && (
                          <div className="event-attachments-strip">
                            {block.attachments.map((att) => (
                              <button
                                key={att.id}
                                type="button"
                                className="attachment-chip"
                                onClick={() => handleOpenAttachment(att.id, att.name)}
                                title="Click to open / view"
                              >
                                📎 {att.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="event-action-col">
                        <label className="event-complete-toggle">
                          <input
                            type="checkbox"
                            checked={block.completed}
                            onChange={() => toggleBlockCompleted(planId, block.id)}
                          />
                          <span>{block.completed ? "Done" : "Complete"}</span>
                        </label>
                        <div className="event-mini-btns">
                          <button
                            type="button"
                            className="text-button-subtle"
                            onClick={() => openAddItemModal(block.eventKind || "study", block, planId)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-button-subtle danger"
                            onClick={() => handleDeleteItem(planId, block.id)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Today Sidebar: Up Next & Study Progress */}
          <aside className="today-sidebar-card">
            {/* Study Progress Box */}
            <div className="today-side-box">
              <p className="eyebrow">Weekly study progress</p>
              <h4>
                {studyProgress.completed} of {studyProgress.planned} planned sessions completed
              </h4>
              <div className="study-meter-bar">
                <span
                  style={{
                    width: `${studyProgress.planned > 0 ? Math.round((studyProgress.completed / studyProgress.planned) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="meter-subtext">
                {studyProgress.planned > 0
                  ? `${Math.round((studyProgress.completed / studyProgress.planned) * 100)}% of goal reached this week`
                  : "No study sessions scheduled yet this week."}
              </p>
            </div>

            {/* Up Next Box */}
            <div className="today-side-box">
              <p className="eyebrow">Up next</p>
              {upcomingItems.length === 0 ? (
                <p className="upcoming-empty-note">No upcoming events ahead.</p>
              ) : (
                <div className="upcoming-items-list">
                  {upcomingItems.map(({ plan, block }) => (
                    <div key={block.id} className="upcoming-item-row">
                      <div className="upcoming-date-pill">
                        {plan.date === defaultDate ? "Today" : formatPlanDate(plan.date, "short")}
                      </div>
                      <div className="upcoming-details">
                        <strong>{block.activity}</strong>
                        <span>
                          {formatStudyTime(block.startTime)} · {block.eventKind?.toUpperCase() || block.category}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ====================================================================
          VIEW 2: WEEK VIEW (7-Day Responsive Grid & Agenda)
          ==================================================================== */}
      {plannerMode === "week" && (
        <div className="planner-week-container">
          {/* Week Navigation Header */}
          <div className="week-nav-bar">
            <div className="week-nav-info">
              <p className="eyebrow">Week of</p>
              <h3>
                {formatPlanDate(weekDates[0], "short")} – {formatPlanDate(weekDates[6], "short")}
              </h3>
            </div>
            <div className="week-nav-controls">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const d = new Date(`${weekDates[0]}T12:00:00Z`);
                  d.setUTCDate(d.getUTCDate() - 7);
                  setActiveDate(d.toISOString().slice(0, 10));
                }}
              >
                ‹ Previous Week
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveDate(defaultDate)}
              >
                Current Week
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const d = new Date(`${weekDates[0]}T12:00:00Z`);
                  d.setUTCDate(d.getUTCDate() + 7);
                  setActiveDate(d.toISOString().slice(0, 10));
                }}
              >
                Next Week ›
              </button>
            </div>
          </div>

          {/* 7-Day Responsive Matrix */}
          <div className="week-matrix-grid">
            {weekMatrix.map((col) => {
              const isToday = col.date === defaultDate;
              const [y, m, d] = col.date.split("-").map(Number);
              const dayIdx = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();

              return (
                <div key={col.date} className={`week-day-column ${isToday ? "is-today" : ""}`}>
                  <div className="week-day-header">
                    <span className="day-name">{DAY_LABELS[dayIdx]}</span>
                    <strong className="day-number">{d}</strong>
                    {isToday && <span className="today-badge">TODAY</span>}
                  </div>

                  <div className="week-events-stack">
                    {col.items.length === 0 ? (
                      <div className="week-empty-slot">
                        <button
                          type="button"
                          className="quick-add-slot-btn"
                          onClick={() => {
                            setActiveDate(col.date);
                            openAddItemModal("study", undefined, undefined);
                          }}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      col.items.map(({ planId, block }) => {
                        const kind = block.eventKind || "study";
                        return (
                          <div
                            key={block.id}
                            className={`week-event-card kind-${kind} ${block.completed ? "completed" : ""}`}
                            onClick={() => openAddItemModal(kind, block, planId)}
                          >
                            <span className="week-event-time">{formatStudyTime(block.startTime)}</span>
                            <strong className="week-event-name">{block.activity}</strong>
                            {block.subject && <span className="week-event-sub">{block.subject}</span>}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW 3: PLANS TAB (Goal-oriented Study Plans with Session Counts)
          ==================================================================== */}
      {plannerMode === "plans" && (
        <div className="planner-plans-container">
          <aside className="plan-library">
            <div className="plan-library-heading">
              <div>
                <p className="eyebrow">Saved locally</p>
                <h2>Study plans</h2>
              </div>
              <span>{plans.length}</span>
            </div>
            <button className="primary-button wide" type="button" onClick={openNewPlanModal}>
              New study plan
            </button>
            <div className="plan-library-list">
              {orderedPlans.map((plan) => (
                <button
                  className={selectedPlan?.id === plan.id ? "active" : ""}
                  type="button"
                  key={plan.id}
                  onClick={() => onSelectPlan(plan.id)}
                >
                  <strong>{plan.title}</strong>
                  <span>{formatPlanDate(plan.date, "short")}</span>
                  <small>{plan.blocks.length} block{plan.blocks.length === 1 ? "" : "s"}</small>
                </button>
              ))}
              {!plans.length && (
                <div className="plan-library-empty">
                  <strong>No plans yet</strong>
                  <p>Create a daily plan container to organize study blocks toward your exams.</p>
                </div>
              )}
            </div>
            <p className="local-storage-note">Planner schedules stay on this device and are separated by signed-in account.</p>
          </aside>

          <section className="plan-workspace">
            {selectedPlan ? (
              <>
                <div className="plan-workspace-heading">
                  <div>
                    <p className="eyebrow">{formatPlanDate(selectedPlan.date)}</p>
                    <h2>{selectedPlan.title}</h2>
                    <p>
                      {selectedPlan.blocks.length} time block{selectedPlan.blocks.length === 1 ? "" : "s"} ·{" "}
                      {hoursLabel(calculatePlannerAnalytics([selectedPlan]).plannedMinutes)} of study planned
                    </p>
                  </div>
                  <button className="primary-button" type="button" onClick={() => openAddItemModal("study", undefined, selectedPlan.id)}>
                    Add time block
                  </button>
                </div>

                <div className="plan-toolbar" aria-label="Study plan actions">
                  <button type="button" onClick={() => openEditPlanModal(selectedPlan)}>
                    Edit plan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDuplicateDate(selectedPlan.date);
                      setDuplicateOpen(true);
                      setError("");
                    }}
                  >
                    Duplicate day
                  </button>
                  <span className="plan-toolbar-divider" />
                  <button type="button" onClick={() => runExport("pdf")}>Export PDF</button>
                  <button type="button" onClick={() => runExport("png")}>Export PNG</button>
                  <button type="button" onClick={() => runExport("jpeg")}>Export JPG</button>
                  <button className="danger" type="button" onClick={() => handleDeletePlan(selectedPlan)}>
                    Delete plan
                  </button>
                </div>

                <div className="plan-block-list">
                  {selectedPlan.blocks.map((block, index) => (
                    <article
                      className={`plan-block category-${block.category.toLowerCase()} ${block.completed ? "completed" : ""}`}
                      key={block.id}
                    >
                      <div className="plan-block-time">
                        <time>{formatStudyTime(block.startTime)}</time>
                        <span>to</span>
                        <time>{formatStudyTime(block.endTime)}</time>
                        <small>{Math.round(studyBlockMinutes(block) / 6) / 10} hr</small>
                      </div>

                      <div className="plan-block-copy">
                        <div className="plan-block-title">
                          <span>{block.eventKind?.toUpperCase() || block.category}</span>
                          {block.addedToCalendar && <i>In calendar</i>}
                        </div>
                        <h3>{block.activity}</h3>
                        {(block.subject || block.topic) && (
                          <p>{[block.subject, block.topic].filter(Boolean).join(" · ")}</p>
                        )}
                        {block.notes && <small>{block.notes}</small>}
                        <label className="complete-control">
                          <input
                            type="checkbox"
                            checked={block.completed}
                            onChange={() => toggleBlockCompleted(selectedPlan.id, block.id)}
                          />
                          Mark session completed
                        </label>
                      </div>

                      <div className="plan-block-actions">
                        <button type="button" onClick={() => replacePlan({ ...selectedPlan, blocks: moveStudyBlock(selectedPlan.blocks, block.id, -1) })} disabled={index === 0}>
                          Move up
                        </button>
                        <button type="button" onClick={() => replacePlan({ ...selectedPlan, blocks: moveStudyBlock(selectedPlan.blocks, block.id, 1) })} disabled={index === selectedPlan.blocks.length - 1}>
                          Move down
                        </button>
                        <button type="button" onClick={() => openAddItemModal(block.eventKind || "study", block, selectedPlan.id)}>
                          Edit
                        </button>
                        <button className="danger" type="button" onClick={() => handleDeleteItem(selectedPlan.id, block.id)}>
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}

                  {!selectedPlan.blocks.length && (
                    <div className="plan-empty">
                      <span aria-hidden="true" />
                      <h3>Your day is open</h3>
                      <p>Add study, class, exam, deadline, or task blocks.</p>
                      <button className="secondary-button" type="button" onClick={() => openAddItemModal("study", undefined, selectedPlan.id)}>
                        Add first time block
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="plan-empty standalone">
                <span aria-hidden="true" />
                <h2>Build your first study plan</h2>
                <p>Organize a day into custom time blocks and track your study milestones.</p>
                <button className="primary-button" type="button" onClick={openNewPlanModal}>
                  Create study plan
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ====================================================================
          UNIFIED "+ ADD" MODAL (Class, Study Session, Exam, Deadline, Task)
          ==================================================================== */}
      {itemModal.isOpen && (
        <div className="inline-modal" role="presentation">
          <form onSubmit={handleSaveItem} aria-label={itemModal.editingBlock ? "Edit item" : "Add item"} style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow">Academic Planner</p>
                <h2>{itemModal.editingBlock ? "Edit Item" : "Add to Planner"}</h2>
              </div>
              <button type="button" onClick={() => setItemModal((prev) => ({ ...prev, isOpen: false }))} aria-label="Close">
                ×
              </button>
            </div>

            {/* Event Kind Selector Tabs */}
            <div className="theme-segmented-control" role="tablist" style={{ margin: "10px 0" }}>
              {PLANNER_EVENT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={draft.kind === k}
                  className={`theme-segment-btn ${draft.kind === k ? "active" : ""}`}
                  onClick={() => setDraft((prev) => ({ ...prev, kind: k }))}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Activity Title */}
            <label className="profile-name-field">
              <span>{draft.kind === "class" ? "Class / Subject Name" : draft.kind === "exam" ? "Exam / Quiz Name" : "Activity Name"}</span>
              <input
                maxLength={100}
                value={draft.activity}
                onChange={(e) => setDraft((prev) => ({ ...prev, activity: e.target.value }))}
                placeholder={
                  draft.kind === "class"
                    ? "e.g. Clinical Chemistry Lecture"
                    : draft.kind === "exam"
                    ? "e.g. Bacteriology Midterm Exam"
                    : draft.kind === "deadline"
                    ? "e.g. Case Study Submission"
                    : "e.g. Review Gram Positive Bacteria"
                }
                required
              />
            </label>

            {/* Subject & Topic */}
            <div className="planner-time-fields">
              <label className="profile-name-field">
                <span>Subject (optional)</span>
                <input
                  list="planner-subjects-list"
                  maxLength={80}
                  value={draft.subject}
                  onChange={(e) => setDraft((prev) => ({ ...prev, subject: e.target.value }))}
                  placeholder="e.g. Hematology"
                />
              </label>
              <label className="profile-name-field">
                <span>Topic (optional)</span>
                <input
                  list="planner-topics-list"
                  maxLength={100}
                  value={draft.topic}
                  onChange={(e) => setDraft((prev) => ({ ...prev, topic: e.target.value }))}
                  placeholder="e.g. Anemias"
                />
              </label>
            </div>
            <datalist id="planner-subjects-list">{subjectOptions.map((v) => <option value={v} key={v} />)}</datalist>
            <datalist id="planner-topics-list">{topicOptions.map((v) => <option value={v} key={v} />)}</datalist>

            {/* Times (Start & End) for Class / Study / Exam */}
            {draft.kind !== "task" && (
              <div className="planner-time-fields">
                <label className="profile-name-field">
                  <span>Start time</span>
                  <input
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => setDraft((prev) => ({ ...prev, startTime: e.target.value }))}
                    required
                  />
                </label>
                <label className="profile-name-field">
                  <span>End time</span>
                  <input
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => setDraft((prev) => ({ ...prev, endTime: e.target.value }))}
                    required
                  />
                </label>
              </div>
            )}

            {/* Class Recurring Days */}
            {draft.kind === "class" && (
              <div style={{ marginTop: "10px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                  Recurring Class Days
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[1, 2, 3, 4, 5, 6, 0].map((dayNum) => {
                    const active = draft.recurrenceDays.includes(dayNum);
                    return (
                      <button
                        key={dayNum}
                        type="button"
                        className={`day-toggle-btn ${active ? "active" : ""}`}
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          border: "1px solid var(--line)",
                          background: active ? "var(--green)" : "var(--surface-soft)",
                          color: active ? "var(--accent-ink)" : "var(--ink)",
                          fontWeight: 700,
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setDraft((prev) => ({
                            ...prev,
                            recurrenceDays: active
                              ? prev.recurrenceDays.filter((d) => d !== dayNum)
                              : [...prev.recurrenceDays, dayNum],
                          }));
                        }}
                      >
                        {DAY_LETTERS[dayNum]}
                      </button>
                    );
                  })}
                </div>

                <label className="profile-name-field" style={{ marginTop: "10px" }}>
                  <span>Recurring Until (Semester End Date)</span>
                  <input
                    type="date"
                    value={draft.recurrenceEnd}
                    onChange={(e) => setDraft((prev) => ({ ...prev, recurrenceEnd: e.target.value }))}
                  />
                </label>

                <div className="planner-time-fields" style={{ marginTop: "10px" }}>
                  <label className="profile-name-field">
                    <span>Room / Laboratory</span>
                    <input
                      value={draft.room}
                      onChange={(e) => setDraft((prev) => ({ ...prev, room: e.target.value }))}
                      placeholder="e.g. Lab 402"
                    />
                  </label>
                  <label className="profile-name-field">
                    <span>Professor / Instructor</span>
                    <input
                      value={draft.instructor}
                      onChange={(e) => setDraft((prev) => ({ ...prev, instructor: e.target.value }))}
                      placeholder="e.g. Dr. Santos"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Study Target (for Study Sessions) */}
            {draft.kind === "study" && (
              <div className="planner-time-fields" style={{ marginTop: "10px" }}>
                <label className="profile-name-field">
                  <span>Target Count (optional)</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.targetCount}
                    onChange={(e) => setDraft((prev) => ({ ...prev, targetCount: e.target.value }))}
                    placeholder="e.g. 50"
                  />
                </label>
                <label className="profile-name-field">
                  <span>Target Type</span>
                  <select
                    value={draft.targetType}
                    onChange={(e) => setDraft((prev) => ({ ...prev, targetType: e.target.value as any }))}
                  >
                    <option value="mcq">MCQ Questions</option>
                    <option value="flashcard">Flashcards</option>
                    <option value="pages">Pages Read</option>
                  </select>
                </label>
              </div>
            )}

            {/* Deadlines Due Date & Time */}
            {(draft.kind === "deadline" || draft.kind === "task") && (
              <div className="planner-time-fields" style={{ marginTop: "10px" }}>
                <label className="profile-name-field">
                  <span>Due Date</span>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                  />
                </label>
                {draft.kind === "deadline" && (
                  <label className="profile-name-field">
                    <span>Due Time</span>
                    <input
                      type="time"
                      value={draft.dueTime}
                      onChange={(e) => setDraft((prev) => ({ ...prev, dueTime: e.target.value }))}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Notes */}
            <label className="profile-name-field" style={{ marginTop: "10px" }}>
              <span>Notes (optional)</span>
              <textarea
                rows={2}
                maxLength={300}
                value={draft.notes}
                onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Key concepts, syllabus coverage, or reminder notes..."
              />
            </label>

            {/* Attachments Section (PDF, JPG, PNG, WebP) */}
            <div style={{ marginTop: "12px", padding: "12px", border: "1px dashed var(--line)", borderRadius: "10px", background: "var(--surface-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--ink)" }}>Attached Materials (PDF, Images)</span>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ minHeight: "28px", padding: "3px 10px", fontSize: "10px" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  + Add File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleAttachmentUpload}
                />
              </div>

              {uploadError && <p className="form-status error" style={{ marginBottom: "6px" }}>{uploadError}</p>}

              {draft.attachments.length === 0 ? (
                <p style={{ margin: 0, fontSize: "10px", color: "var(--muted)", fontStyle: "italic" }}>
                  No materials attached yet (max 10MB per file). Stored locally in your browser.
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {draft.attachments.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "var(--paper)",
                        border: "1px solid var(--line)",
                        fontSize: "11px",
                      }}
                    >
                      <span>📎 {att.name}</span>
                      <button
                        type="button"
                        style={{ border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: "14px" }}
                        onClick={() => handleRemoveAttachment(att.id)}
                        aria-label={`Remove ${att.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add to RevIT Calendar Checkbox */}
            <label className="planner-calendar-option" htmlFor="planner-add-to-calendar" style={{ marginTop: "12px" }}>
              <input
                id="planner-add-to-calendar"
                type="checkbox"
                aria-label="Add to RevIT Calendar"
                checked={draft.addedToCalendar}
                onChange={(e) => setDraft((prev) => ({ ...prev, addedToCalendar: e.target.checked }))}
              />
              <span>
                <strong>Add to RevIT Calendar</strong>
                <small>Show this block beside your existing calendar events.</small>
              </span>
            </label>

            {error && <p className="form-status" role="alert">{error}</p>}

            <div className="profile-modal-actions" style={{ marginTop: "16px" }}>
              <button
                className="text-button quiet"
                type="button"
                onClick={() => setItemModal((prev) => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit">
                {itemModal.editingBlock ? "Save changes" : "Add item"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Plan Container Form Modal */}
      {planModalOpen && (
        <div className="inline-modal" role="presentation">
          <form onSubmit={handleSavePlan} aria-label={editingPlan ? "Edit study plan" : "Create study plan"}>
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow">Study Planner</p>
                <h2>{editingPlan ? "Edit plan" : "New plan"}</h2>
              </div>
              <button type="button" onClick={() => setPlanModalOpen(false)} aria-label="Close">×</button>
            </div>
            <label className="profile-name-field">
              <span>Plan title</span>
              <input
                maxLength={80}
                value={planTitleInput}
                onChange={(e) => setPlanTitleInput(e.target.value)}
                required
              />
            </label>
            <label className="profile-name-field">
              <span>Date</span>
              <input
                type="date"
                value={planDateInput}
                onChange={(e) => setPlanDateInput(e.target.value)}
                required
              />
            </label>
            <div className="profile-modal-actions">
              <button className="text-button quiet" type="button" onClick={() => setPlanModalOpen(false)}>
                Cancel
              </button>
              <button className="primary-button" type="submit">
                {editingPlan ? "Save changes" : "Create plan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Duplicate Plan Modal */}
      {duplicateOpen && selectedPlan && (
        <div className="inline-modal" role="presentation">
          <form onSubmit={handleDuplicatePlan} aria-label="Duplicate study plan">
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow">Duplicate schedule</p>
                <h2>Choose another day</h2>
              </div>
              <button type="button" onClick={() => setDuplicateOpen(false)} aria-label="Close">×</button>
            </div>
            <p className="duplicate-note">All time blocks and calendar choices will be copied. Completion states will reset.</p>
            <label className="profile-name-field">
              <span>New date</span>
              <input
                type="date"
                value={duplicateDate}
                onChange={(e) => setDuplicateDate(e.target.value)}
                required
              />
            </label>
            <div className="profile-modal-actions">
              <button className="text-button quiet" type="button" onClick={() => setDuplicateOpen(false)}>
                Cancel
              </button>
              <button className="primary-button" type="submit">
                Duplicate plan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
