"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import Image from "next/image";
import {
  STUDY_PLAN_CATEGORIES,
  PLANNER_EVENT_KINDS,
  type PlannerEventKind,
  type PlannerAttachmentMeta,
  type StudyPlan,
  type StudyPlanBlock,
  type StudyPlanCategory,
  type DailyActivity,
  type ExamSchedule,
  type GradeRecord,
} from "../lib/domain";
import StudyCalendar from "./StudyCalendar";
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
import {
  getNormalizedActivitiesForDate,
  layoutDayTimetable,
  getTimetableRange,
  formatTimetableHour,
  TIMETABLE_START_HOUR,
  TIMETABLE_HOURS,
  TIMETABLE_HOUR_HEIGHT,
  type NormalizedActivity,
} from "../lib/plannerNormalization";

export type PlannerViewMode = "today" | "week" | "calendar" | "plans";

type ItemModalMode = {
  isOpen: boolean;
  kind: PlannerEventKind;
  editingBlock: StudyPlanBlock | null;
  targetPlanId: string | null;
};

type ItemFormDraft = {
  date: string;
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
  date: "",
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
  onStartReview,
}: {
  plans: StudyPlan[];
  todayKey: string;
  timeZone: string;
  onOpenPlanner: (planId?: string) => void;
  onStartReview?: () => void;
}) {
  const todayItems = useMemo(() => getExpandedItemsForDate(plans, todayKey), [plans, todayKey]);
  const analytics = calculatePlannerAnalytics(plans, todayKey);
  const next = nextUpcomingStudyBlock(plans, todayKey, timeInTimeZone(new Date(), timeZone));

  return (
    <section className="today-plan-card" aria-label="Today's Schedule">
      <div className="today-plan-heading">
        <div className="today-plan-title-with-icon">
          <span className="today-plan-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
              <path d="m8 13 2 2 5-5" />
            </svg>
          </span>
          <h2>Today&apos;s Schedule</h2>
        </div>
      </div>

      {todayItems.length ? (
        <div className="today-plan-list">
          {todayItems.slice(0, 3).map(({ planId, block }) => (
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
          {todayItems.length > 3 && <p className="today-plan-more-text">+{todayItems.length - 3} more block{todayItems.length - 3 === 1 ? "" : "s"} in Planner</p>}
        </div>
      ) : (
        <div className="today-plan-empty-body">
          <div className="today-plan-empty-text-col">
            <h3 className="today-plan-empty-title">No study sessions yet</h3>
            <p className="today-plan-empty-desc">Plan a focused study day or start a quick review.</p>
          </div>
          <div className="schedule-illustration-slot" aria-hidden="true">
            <Image
              src="/schedule-frog-calendar.png"
              alt="Frog with calendar"
              width={320}
              height={220}
              style={{ objectFit: "contain", maxWidth: "100%", height: "auto" }}
              unoptimized
              priority
            />
          </div>
          <div className="today-plan-empty-buttons">
            <button
              className="primary-button today-plan-review-btn"
              type="button"
              onClick={onStartReview ?? (() => onOpenPlanner())}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Start 15-question review &ndash;</span>
            </button>
            <button
              className="secondary-button today-plan-planner-btn"
              type="button"
              onClick={() => onOpenPlanner()}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Open Planner</span>
            </button>
          </div>
        </div>
      )}

      <div className="today-plan-stats">
        <span>
          <strong>{hoursLabel(analytics.plannedMinutes)}</strong>
          <small>study planned</small>
        </span>
        <span>
          <strong>{analytics.completedStudySessions}</strong>
          <small>completed</small>
        </span>
        <span>
          <strong>{next ? formatStudyTime(next.block.startTime) : "—"}</strong>
          <small>next session</small>
        </span>
      </div>
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
  activity = [],
  exams = [],
  grades = [],
  timeZone = "Asia/Manila",
  onSaveExam,
  onDeleteExam,
  initialViewMode,
  onViewModeChange,
}: {
  plans: StudyPlan[];
  selectedPlanId: string | null;
  defaultDate: string;
  subjectOptions: string[];
  topicOptions: string[];
  onChange: (plans: StudyPlan[]) => void;
  onSelectPlan: (id: string | null) => void;
  activity?: DailyActivity[];
  exams?: ExamSchedule[];
  grades?: GradeRecord[];
  timeZone?: string;
  onSaveExam?: (exam: Omit<ExamSchedule, "id"> & { id?: string }) => Promise<void>;
  onDeleteExam?: (id: string) => Promise<void>;
  initialViewMode?: PlannerViewMode;
  onViewModeChange?: (mode: PlannerViewMode) => void;
}) {
  // Top-level Navigation Mode: Today vs Week vs Calendar vs Plans
  const [plannerMode, setPlannerModeState] = useState<PlannerViewMode>(initialViewMode || "today");

  useEffect(() => {
    if (initialViewMode && initialViewMode !== plannerMode) {
      setPlannerModeState(initialViewMode);
    }
  }, [initialViewMode]);

  const setPlannerMode = (mode: PlannerViewMode) => {
    setPlannerModeState(mode);
    onViewModeChange?.(mode);
  };
  const [activeDate, setActiveDate] = useState<string>(defaultDate);
  const [weekViewType, setWeekViewType] = useState<"timetable" | "agenda">("timetable");

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

  // Deduplicated subject & topic options for datalists
  const uniqueSubjectOptions = useMemo(
    () => Array.from(new Set(subjectOptions.filter(Boolean))),
    [subjectOptions]
  );
  const uniqueTopicOptions = useMemo(
    () => Array.from(new Set(topicOptions.filter(Boolean))),
    [topicOptions]
  );

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

  // Auto-scroll today's card into view in week view
  useEffect(() => {
    if (plannerMode === "week") {
      const timer = setTimeout(() => {
        const todayEl = document.querySelector(".week-day-column.is-today");
        if (todayEl) {
          todayEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [plannerMode, activeDate]);

  // Normalized activities for Today (scheduled blocks, exams, and practice history)
  const todayNormalized = useMemo(
    () => getNormalizedActivitiesForDate(defaultDate, { plans, exams, activity, includeHistory: true }),
    [plans, exams, activity, defaultDate],
  );

  const todayScheduled = useMemo(
    () => todayNormalized.filter((item) => item.kind !== "practice_history"),
    [todayNormalized],
  );

  const todayPractice = useMemo(
    () => todayNormalized.find((item) => item.kind === "practice_history"),
    [todayNormalized],
  );

  // Week Dates & Matrix using normalization
  const weekDates = useMemo(() => getWeekDates(activeDate), [activeDate]);

  const weekMatrix = useMemo(() => {
    return weekDates.map((dateStr) => {
      const items = getNormalizedActivitiesForDate(dateStr, { plans, exams, includeHistory: false });
      return {
        date: dateStr,
        items,
      };
    });
  }, [plans, exams, weekDates]);

  const [mobileTimetableDate, setMobileTimetableDate] = useState<string>(defaultDate);

  // Dynamic timetable hours computed across all scheduled items in the active week
  const allWeekItems = useMemo(() => {
    return weekMatrix.flatMap((col) => col.items);
  }, [weekMatrix]);

  const { startHour: weekStartHour, endHour: weekEndHour, hours: weekHours } = useMemo(() => {
    return getTimetableRange(allWeekItems);
  }, [allWeekItems]);

  // Selected column for mobile single-day timetable view
  const activeMobileCol = useMemo(() => {
    const match = weekMatrix.find((c) => c.date === mobileTimetableDate);
    if (match) return match;
    const todayMatch = weekMatrix.find((c) => c.date === defaultDate);
    return todayMatch ?? weekMatrix[0] ?? { date: defaultDate, items: [] };
  }, [weekMatrix, mobileTimetableDate, defaultDate]);

  // Study progress analytics across the week
  const studyProgress = useMemo(() => {
    let planned = 0;
    let completed = 0;
    weekMatrix.forEach((col) => {
      col.items.forEach((item) => {
        if (item.kind === "study" || item.category === "Study") {
          planned++;
          if (item.completed) completed++;
        }
      });
    });
    return { planned, completed };
  }, [weekMatrix]);

  // Upcoming scheduled activities across plans and exams
  const upcomingItems = useMemo(() => {
    const [year, month, day] = defaultDate.split("-").map(Number);
    const startUtc = Date.UTC(year, month - 1, day);
    const upcoming: NormalizedActivity[] = [];

    for (let i = 0; i <= 14; i++) {
      const dateKey = new Date(startUtc + i * 86_400_000).toISOString().slice(0, 10);
      const items = getNormalizedActivitiesForDate(dateKey, { plans, exams, includeHistory: false });
      const pending = items.filter((item) => dateKey > defaultDate || !item.completed);
      upcoming.push(...pending);
      if (upcoming.length >= 5) break;
    }

    return upcoming.slice(0, 5);
  }, [plans, exams, defaultDate]);

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
  const openAddItemModal = (
    kind: PlannerEventKind = "study",
    block?: StudyPlanBlock,
    planId?: string,
    initialDate?: string,
    initialStartTime?: string,
    initialEndTime?: string
  ) => {
    setError("");
    setStatus("");
    setUploadError("");

    const targetDate = initialDate || (planId ? plans.find((p) => p.id === planId)?.date : undefined) || (plannerMode === "today" ? defaultDate : activeDate);

    if (block) {
      setItemModal({
        isOpen: true,
        kind: block.eventKind || "study",
        editingBlock: block,
        targetPlanId: planId || selectedPlan?.id || null,
      });
      setDraft({
        date: targetDate,
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
        targetPlanId: planId || (selectedPlan?.date === targetDate ? selectedPlan.id : null),
      });
      setDraft({
        ...DEFAULT_FORM_DRAFT,
        date: targetDate,
        kind,
        category: kind === "class" ? "Event" : kind === "exam" ? "Exam" : kind === "break" ? "Break" : "Study",
        startTime: initialStartTime || DEFAULT_FORM_DRAFT.startTime,
        endTime: initialEndTime || DEFAULT_FORM_DRAFT.endTime,
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

    const targetDate = draft.date || (plannerMode === "today" ? defaultDate : activeDate);
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
      recurrenceDays: draft.kind === "class" && draft.recurrenceDays.length > 0 ? draft.recurrenceDays : (draft.recurrenceDays.length > 0 ? draft.recurrenceDays : (itemModal.editingBlock?.recurrenceDays ?? null)),
      recurrenceEnd: draft.kind === "class" && draft.recurrenceEnd ? draft.recurrenceEnd : (draft.recurrenceEnd || itemModal.editingBlock?.recurrenceEnd || null),
      dueDate: draft.kind === "deadline" || draft.kind === "task" ? draft.dueDate || null : null,
      dueTime: draft.kind === "deadline" ? draft.dueTime || null : null,
      attachments: draft.attachments.length > 0 ? draft.attachments : (itemModal.editingBlock?.attachments || []),
    };

    let nextPlans = [...plans];

    // If editing existing block, prevent duplicate records across plan containers:
    // Strip cleanBlockId from any plan whose date is not targetDate
    if (itemModal.editingBlock) {
      nextPlans = nextPlans.map((p) => {
        if (p.date !== targetDate && p.blocks.some((b) => b.id === cleanBlockId)) {
          return {
            ...p,
            blocks: p.blocks.filter((b) => b.id !== cleanBlockId),
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      });
    }

    let targetPlan = nextPlans.find((p) => p.date === targetDate);
    if (!targetPlan) {
      targetPlan = {
        id: crypto.randomUUID(),
        title: `Plan for ${formatPlanDate(targetDate, "short")}`,
        date: targetDate,
        blocks: [block],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      nextPlans.push(targetPlan);
    } else {
      const existingIndex = targetPlan.blocks.findIndex((b) => b.id === cleanBlockId);
      const updatedBlocks = existingIndex >= 0
        ? targetPlan.blocks.map((b) => (b.id === cleanBlockId ? block : b))
        : [...targetPlan.blocks, block];
      nextPlans = nextPlans.map((p) =>
        p.id === targetPlan!.id
          ? { ...targetPlan!, blocks: updatedBlocks, updatedAt: new Date().toISOString() }
          : p
      );
    }

    onChange(nextPlans);
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
              <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 650 }}>Local-only · Private</span>
            </div>
            <h2>Schedule &amp; Timetable</h2>
            <p>Schedule your classes, organize study sessions, and prepare for upcoming exams &amp; deadlines.</p>
          </div>

          <div className="planner-top-actions">
            {/* View Mode Selector: Today | Week | Calendar | Plans */}
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
                aria-selected={plannerMode === "calendar"}
                className={`theme-segment-btn ${plannerMode === "calendar" ? "active" : ""}`}
                onClick={() => setPlannerMode("calendar")}
              >
                Calendar
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
              <span style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 650 }}>
                {todayScheduled.length} item{todayScheduled.length === 1 ? "" : "s"}
              </span>
            </div>

            {todayScheduled.length === 0 ? (
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
                {todayScheduled.map((item) => {
                  const isFormalExam = item.kind === "formal_exam";
                  return (
                    <article key={item.id} className={`planner-event-card kind-${item.kind} ${item.completed ? "is-completed" : ""}`}>
                      <div className="event-time-col">
                        {item.startTime && item.endTime ? (
                          <>
                            <time>{formatStudyTime(item.startTime)}</time>
                            <span>to</span>
                            <time>{formatStudyTime(item.endTime)}</time>
                          </>
                        ) : (
                          <time>{item.timeDisplay}</time>
                        )}
                      </div>

                      <div className="event-body-col">
                        <div className="event-tag-row">
                          <span className={`event-kind-badge kind-${item.kind}`}>
                            {item.kind.toUpperCase()}
                          </span>
                          {item.subject && <span className="event-subject-pill">{item.subject}</span>}
                          {item.room && <span className="event-room-pill">Room {item.room}</span>}
                          {item.targetCount && (
                            <span className="event-target-pill">
                              Goal: {item.targetCount} {item.targetType}
                            </span>
                          )}
                          {item.addedToCalendar && (
                            <span style={{ fontSize: "10px", color: "var(--green)", fontWeight: 700 }}>
                              Pinned
                            </span>
                          )}
                        </div>

                        <h4>{item.title}</h4>
                        {item.topic && <p className="event-topic-line">{item.topic}</p>}
                        {item.notes && <p className="event-notes-line">{item.notes}</p>}

                        {/* Attachments */}
                        {item.attachments && item.attachments.length > 0 && (
                          <div className="event-attachments-strip">
                            {item.attachments.map((att) => (
                              <button
                                key={att.id}
                                type="button"
                                className="attachment-chip"
                                onClick={() => handleOpenAttachment(att.id, att.name)}
                                title="Click to open / view"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: "4px" }}>
                                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                </svg>
                                {att.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="event-action-col">
                        {!isFormalExam && item.planId && (
                          <label className="event-complete-toggle">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleBlockCompleted(item.planId!, item.id)}
                            />
                            <span>{item.completed ? "Done" : "Complete"}</span>
                          </label>
                        )}
                        <div className="event-mini-btns">
                          {item.rawBlock && (
                            <button
                              type="button"
                              className="text-button-subtle"
                              onClick={() => openAddItemModal(item.rawBlock!.eventKind || "study", item.rawBlock, item.planId ?? undefined)}
                            >
                              Edit
                            </button>
                          )}
                          {item.rawBlock && item.planId && (
                            <button
                              type="button"
                              className="text-button-subtle danger"
                              onClick={() => handleDeleteItem(item.planId!, item.id)}
                            >
                              ×
                            </button>
                          )}
                          {isFormalExam && item.rawExam && onDeleteExam && (
                            <button
                              type="button"
                              className="text-button-subtle danger"
                              onClick={() => void onDeleteExam(item.rawExam!.id)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Completed Practice History (Distinct Category - Requirement 3) */}
            {todayPractice && (
              <div style={{ marginTop: "18px", padding: "14px 18px", background: "var(--surface, rgba(255, 255, 255, 0.03))", borderRadius: "12px", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <p className="eyebrow" style={{ margin: 0, color: "var(--green)" }}>Completed practice review</p>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>Study Session</span>
                </div>
                <h4 style={{ margin: "4px 0", fontSize: "15px" }}>{todayPractice.title}</h4>
                <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--muted)" }}>
                  {todayPractice.timeDisplay} {todayPractice.subject ? `· ${todayPractice.subject}` : ""}
                </p>
                {todayPractice.notes && (
                  <small style={{ color: "var(--muted)", display: "block", marginTop: "4px" }}>
                    {todayPractice.notes}
                  </small>
                )}
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
                  {upcomingItems.map((item) => (
                    <div key={item.id} className="upcoming-item-row">
                      <div className="upcoming-date-pill">
                        {item.date === defaultDate ? "Today" : formatPlanDate(item.date, "short")}
                      </div>
                      <div className="upcoming-details">
                        <strong>{item.title}</strong>
                        <span>
                          {item.timeDisplay} · {item.kind.toUpperCase()}
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

            <div className="week-controls-cluster">
              {/* Timetable / Agenda Switch (Requirement 4) */}
              <div className="theme-segmented-control" role="group" aria-label="Week display format">
                <button
                  type="button"
                  className={`theme-segment-btn ${weekViewType === "timetable" ? "active" : ""}`}
                  onClick={() => setWeekViewType("timetable")}
                >
                  Timetable
                </button>
                <button
                  type="button"
                  className={`theme-segment-btn ${weekViewType === "agenda" ? "active" : ""}`}
                  onClick={() => setWeekViewType("agenda")}
                >
                  Agenda
                </button>
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
          </div>

          {/* VIEW 2A: DETAILED HOURLY TIMETABLE (Dynamic hours & Mobile Single-Day) */}
          {weekViewType === "timetable" ? (
            <div className="week-timetable-shell" aria-label="Hourly Timetable">
              {/* DESKTOP & TABLET 7-COLUMN TIMETABLE VIEW (> 768px) */}
              <div className="desktop-timetable-view">
                <div className="timetable-scroll-container">
                  <div className="timetable-grid-wrapper">
                    {/* Header Row: 7 Weekday Columns */}
                    <div className="timetable-header-row">
                      <div className="timetable-time-corner">TIME</div>
                      {weekMatrix.map((col) => {
                        const isToday = col.date === defaultDate;
                        const [y, m, d] = col.date.split("-").map(Number);
                        const dayIdx = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
                        return (
                          <div key={col.date} className={`timetable-day-header ${isToday ? "is-today" : ""}`}>
                            <span className="day-name">{DAY_LABELS[dayIdx]}</span>
                            <strong className="day-number">{d}</strong>
                            {isToday && <span className="today-badge">TODAY</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Dedicated Untimed / All-Day Row (Untimed Activities, Deadlines, Formal Exams) */}
                    <div className="timetable-untimed-row">
                      <div className="timetable-untimed-label">All Day / Due</div>
                      {weekMatrix.map((col) => {
                        const { untimed } = layoutDayTimetable(col.items, weekStartHour, weekEndHour);
                        return (
                          <div key={col.date} className="timetable-untimed-cell">
                            {untimed.length === 0 ? (
                              <button
                                type="button"
                                className="quick-add-slot-btn"
                                style={{ margin: "auto", width: "22px", height: "22px", fontSize: "13px" }}
                                title={`+ Add task or untimed activity for ${col.date}`}
                                onClick={() => openAddItemModal("task", undefined, undefined, col.date)}
                              >
                                +
                              </button>
                            ) : (
                              untimed.map((item) => (
                                <div
                                  key={item.id}
                                  className={`timetable-untimed-chip kind-${item.kind} ${item.completed ? "completed" : ""}`}
                                  onClick={() => {
                                    if (item.rawBlock) {
                                      openAddItemModal(item.rawBlock.eventKind || "study", item.rawBlock, item.planId ?? undefined, item.date);
                                    }
                                  }}
                                  title={`${item.title} (${item.timeDisplay})`}
                                >
                                  <strong style={{ fontSize: "10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {item.title}
                                  </strong>
                                  <span style={{ fontSize: "8.5px", color: "var(--muted)" }}>{item.timeDisplay}</span>
                                </div>
                              ))
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Hourly Timetable Grid Body (Dynamic Range: default 7 AM - 10 PM, expands earlier/later) */}
                    <div className="timetable-body-row" style={{ height: `${weekHours.length * TIMETABLE_HOUR_HEIGHT}px` }}>
                      {/* Sticky-like Left Hour Markers */}
                      <div className="timetable-time-gutter" aria-hidden="true">
                        {weekHours.map((hr) => {
                          const displayHour = formatTimetableHour(hr);
                          const topPx = (hr - weekStartHour) * TIMETABLE_HOUR_HEIGHT;
                          return (
                            <div
                              key={hr}
                              className="timetable-hour-label"
                              style={{ top: `${topPx}px` }}
                            >
                              {displayHour}
                            </div>
                          );
                        })}
                      </div>

                      {/* 7 Day Time Tracks with Side-by-Side Overlapping Events */}
                      {weekMatrix.map((col) => {
                        const isToday = col.date === defaultDate;
                        const { timed } = layoutDayTimetable(col.items, weekStartHour, weekEndHour);

                        return (
                          <div
                            key={col.date}
                            className={`timetable-day-track ${isToday ? "is-today" : ""}`}
                          >
                            {/* Hour Horizontal Guides & Interactive Click Slots */}
                            {weekHours.map((hr) => {
                              const topPx = (hr - weekStartHour) * TIMETABLE_HOUR_HEIGHT;
                              const startStr = `${String(hr % 24).padStart(2, "0")}:00`;
                              const endStr = `${String((hr + 1) % 24).padStart(2, "0")}:00`;
                              return (
                                <div
                                  key={hr}
                                  className="timetable-hour-slot"
                                  style={{ top: `${topPx}px`, height: `${TIMETABLE_HOUR_HEIGHT}px` }}
                                  title={`Click to add activity at ${formatTimetableHour(hr)} on ${col.date}`}
                                  onClick={() => openAddItemModal("study", undefined, undefined, col.date, startStr, endStr)}
                                />
                              );
                            })}

                            {/* Positioned Events (with Overlap Columns & Recurring Classes) */}
                            {timed.map(({ activity: item, topPx, heightPx, widthPct, leftPct }) => {
                              return (
                                <div
                                  key={item.id}
                                  className={`timetable-event-block kind-${item.kind} ${item.completed ? "completed" : ""}`}
                                  style={{
                                    top: `${topPx}px`,
                                    height: `${heightPx}px`,
                                    left: `${leftPct}%`,
                                    width: `calc(${widthPct}% - 4px)`,
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.rawBlock) {
                                      openAddItemModal(item.rawBlock.eventKind || "study", item.rawBlock, item.planId ?? undefined, item.date);
                                    }
                                  }}
                                  title={`${item.title} (${item.timeDisplay})${item.room ? ` · Room ${item.room}` : ""}`}
                                >
                                  <span className="timetable-event-time">{item.timeDisplay}</span>
                                  <strong className="timetable-event-name">{item.title}</strong>
                                  {item.subject && (
                                    <span className="timetable-event-sub">{item.subject}</span>
                                  )}
                                  {item.room && (
                                    <span className="timetable-event-sub" style={{ opacity: 0.85 }}>
                                      Room {item.room}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* MOBILE SINGLE-DAY TIMETABLE VIEW (<= 768px, zero horizontal scrolling) */}
              <div className="mobile-timetable-view">
                {/* 7-Day Day Selector Strip */}
                <div className="mobile-timetable-strip" role="tablist" aria-label="Select day of week">
                  {weekMatrix.map((col) => {
                    const isSelected = col.date === activeMobileCol.date;
                    const isToday = col.date === defaultDate;
                    const [y, m, d] = col.date.split("-").map(Number);
                    const dayIdx = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
                    const hasItems = col.items.length > 0;

                    return (
                      <button
                        key={col.date}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        className={`mobile-timetable-day-tab ${isSelected ? "selected" : ""} ${isToday ? "is-today" : ""}`}
                        onClick={() => setMobileTimetableDate(col.date)}
                      >
                        <span className="mobile-tab-dayname">{DAY_LABELS[dayIdx]}</span>
                        <strong className="mobile-tab-daynum">{d}</strong>
                        {hasItems && <span className="mobile-tab-dot" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>

                {/* Active Day Header & Quick Add */}
                <div className="mobile-timetable-day-summary">
                  <div>
                    <strong>{formatPlanDate(activeMobileCol.date, "long")}</strong>
                    <span className="mobile-day-meta">
                      {activeMobileCol.items.length === 1 ? "1 activity" : `${activeMobileCol.items.length} activities`}
                      {activeMobileCol.date === defaultDate && " · Today"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="theme-button-primary mobile-add-btn"
                    onClick={() => openAddItemModal("study", undefined, undefined, activeMobileCol.date)}
                  >
                    + Add Activity
                  </button>
                </div>

                {/* Untimed / All-Day Activities */}
                {(() => {
                  const { untimed } = layoutDayTimetable(activeMobileCol.items, weekStartHour, weekEndHour);
                  return (
                    <div className="mobile-timetable-untimed">
                      <div className="mobile-untimed-header">
                        <span>ALL DAY & DUE</span>
                        <button
                          type="button"
                          className="quick-add-slot-btn"
                          title={`+ Add task or deadline for ${activeMobileCol.date}`}
                          onClick={() => openAddItemModal("task", undefined, undefined, activeMobileCol.date)}
                        >
                          +
                        </button>
                      </div>
                      {untimed.length === 0 ? (
                        <div className="mobile-untimed-empty">No untimed activities or deadlines</div>
                      ) : (
                        <div className="mobile-untimed-list">
                          {untimed.map((item) => (
                            <div
                              key={item.id}
                              className={`timetable-untimed-chip kind-${item.kind} ${item.completed ? "completed" : ""}`}
                              onClick={() => {
                                if (item.rawBlock) {
                                  openAddItemModal(item.rawBlock.eventKind || "study", item.rawBlock, item.planId ?? undefined, item.date);
                                }
                              }}
                              title={`${item.title} (${item.timeDisplay})`}
                            >
                              <strong style={{ fontSize: "11px" }}>{item.title}</strong>
                              <span style={{ fontSize: "9.5px", color: "var(--muted)" }}>{item.timeDisplay}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Single-Day Hourly Timeline */}
                {(() => {
                  const { timed } = layoutDayTimetable(activeMobileCol.items, weekStartHour, weekEndHour);
                  return (
                    <div className="mobile-timeline-container" style={{ height: `${weekHours.length * TIMETABLE_HOUR_HEIGHT}px` }}>
                      {/* Hour labels gutter */}
                      <div className="timetable-time-gutter" aria-hidden="true">
                        {weekHours.map((hr) => {
                          const displayHour = formatTimetableHour(hr);
                          const topPx = (hr - weekStartHour) * TIMETABLE_HOUR_HEIGHT;
                          return (
                            <div key={hr} className="timetable-hour-label" style={{ top: `${topPx}px` }}>
                              {displayHour}
                            </div>
                          );
                        })}
                      </div>

                      {/* Single Day Time Track */}
                      <div className="mobile-timeline-track">
                        {weekHours.map((hr) => {
                          const topPx = (hr - weekStartHour) * TIMETABLE_HOUR_HEIGHT;
                          const startStr = `${String(hr % 24).padStart(2, "0")}:00`;
                          const endStr = `${String((hr + 1) % 24).padStart(2, "0")}:00`;
                          return (
                            <div
                              key={hr}
                              className="timetable-hour-slot"
                              style={{ top: `${topPx}px`, height: `${TIMETABLE_HOUR_HEIGHT}px` }}
                              title={`Click to add activity at ${formatTimetableHour(hr)} on ${activeMobileCol.date}`}
                              onClick={() => openAddItemModal("study", undefined, undefined, activeMobileCol.date, startStr, endStr)}
                            />
                          );
                        })}

                        {timed.map(({ activity: item, topPx, heightPx, widthPct, leftPct }) => (
                          <div
                            key={item.id}
                            className={`timetable-event-block kind-${item.kind} ${item.completed ? "completed" : ""}`}
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                              left: `${leftPct}%`,
                              width: `calc(${widthPct}% - 4px)`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.rawBlock) {
                                openAddItemModal(item.rawBlock.eventKind || "study", item.rawBlock, item.planId ?? undefined, item.date);
                              }
                            }}
                            title={`${item.title} (${item.timeDisplay})${item.room ? ` · Room ${item.room}` : ""}`}
                          >
                            <span className="timetable-event-time">{item.timeDisplay}</span>
                            <strong className="timetable-event-name">{item.title}</strong>
                            {item.subject && (
                              <span className="timetable-event-sub">{item.subject}</span>
                            )}
                            {item.room && (
                              <span className="timetable-event-sub" style={{ opacity: 0.85 }}>
                                Room {item.room}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            /* VIEW 2B: 7-DAY RESPONSIVE AGENDA MATRIX */
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
                              openAddItemModal("study", undefined, undefined, col.date);
                            }}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        col.items.map((item) => {
                          return (
                            <div
                              key={item.id}
                              className={`week-event-card kind-${item.kind} ${item.completed ? "completed" : ""}`}
                              onClick={() => {
                                if (item.rawBlock) {
                                  openAddItemModal(item.rawBlock.eventKind || "study", item.rawBlock, item.planId ?? undefined, item.date);
                                }
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                                <span className={`event-kind-badge kind-${item.kind}`} style={{ fontSize: "8px", padding: "1px 5px" }}>
                                  {item.kind.toUpperCase()}
                                </span>
                                <span className="week-event-time">{item.timeDisplay}</span>
                              </div>
                              <strong className="week-event-name">{item.title}</strong>
                              {item.subject && <span className="week-event-sub">{item.subject}</span>}
                              {item.room && <span className="week-event-sub" style={{ opacity: 0.85 }}>Room {item.room}</span>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          VIEW 3: CALENDAR VIEW (Complete Monthly Calendar & Assessments)
          ==================================================================== */}
      {plannerMode === "calendar" && (
        <div className="planner-calendar-view" style={{ marginTop: "18px" }}>
          <StudyCalendar
            activity={activity}
            exams={exams}
            grades={grades}
            studyPlans={plans}
            timeZone={timeZone}
            onSaveExam={onSaveExam ?? (async () => {})}
            onDeleteExam={onDeleteExam ?? (async () => {})}
            onOpenStudyPlan={(planId) => {
              setPlannerMode("plans");
              onSelectPlan(planId);
            }}
            onOpenItemModal={(kind, block, planId, date) => {
              openAddItemModal(kind, block, planId, date);
            }}
          />
        </div>
      )}

      {/* ====================================================================
          VIEW 4: PLANS TAB (Goal-oriented Study Plans with Session Counts)
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
                      className={`plan-block kind-${block.eventKind || "study"} category-${block.category.toLowerCase()} ${block.completed ? "completed" : ""}`}
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
                          <span className={`event-kind-badge kind-${block.eventKind || "study"}`}>
                            {block.eventKind?.toUpperCase() || block.category}
                          </span>
                          {block.addedToCalendar && (
                            <span style={{ fontSize: "10px", color: "var(--green)", fontWeight: 700 }}>
                              Pinned
                            </span>
                          )}
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
                        <button type="button" onClick={() => openAddItemModal(block.eventKind || "study", block, selectedPlan.id, selectedPlan.date)}>
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
          <form onSubmit={handleSaveItem} aria-label={itemModal.editingBlock ? "Edit item" : "Add item"} className="planner-item-modal-form">
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow">Academic Planner</p>
                <h2>{itemModal.editingBlock ? "Edit Item" : "Add to Planner"}</h2>
              </div>
              <button type="button" onClick={() => setItemModal((prev) => ({ ...prev, isOpen: false }))} aria-label="Close">
                ×
              </button>
            </div>

            <div className="planner-item-modal-body">
              {/* Event Kind Selector Tabs */}
              <div className="theme-segmented-control planner-kind-selector" role="tablist">
                {PLANNER_EVENT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={draft.kind === k}
                  className={`theme-segment-btn ${draft.kind === k ? "active" : ""}`}
                  onClick={() => setDraft((prev) => ({ ...prev, kind: k, category: k === "break" ? "Break" : k === "class" ? "Event" : k === "exam" ? "Exam" : prev.category }))}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Scheduled Date Field */}
            <label className="profile-name-field">
              <span>Date</span>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
                required
              />
            </label>

            {/* Activity Title */}
            <label className="profile-name-field">
              <span>{draft.kind === "class" ? "Class / Subject Name" : draft.kind === "exam" ? "Exam / Quiz Name" : draft.kind === "break" ? "Break / Rest Name" : "Activity Name"}</span>
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
                    : draft.kind === "break"
                    ? "e.g. Lunch Break, Quick Rest, Coffee"
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
            <datalist id="planner-subjects-list">{uniqueSubjectOptions.map((v) => <option value={v} key={v} />)}</datalist>
            <datalist id="planner-topics-list">{uniqueTopicOptions.map((v) => <option value={v} key={v} />)}</datalist>

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
                          border: "none",
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
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                        {att.name}
                      </span>
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
            </div>

            <div className="profile-modal-actions planner-item-modal-footer">
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
