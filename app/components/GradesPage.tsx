"use client";

import { useMemo, useState, useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GRADE_FIELDS,
  PASSING_GRADE,
  SUBJECTS,
  type CustomGradeAssessment,
  type CustomGradeCategory,
  type CustomGradebook,
  type GradeField,
  type GradeRecord,
  type GradeSubject,
  type GradeValues,
} from "../lib/domain";
import {
  calculateGrade,
  calculateUniversalGrade,
  sanitizeGradeScore,
  simulateUniversalTarget,
  simulateUniversalWhatIf,
  nuSubjectToUniversalCategories,
  type UniversalCategoryInput,
  type UniversalGradeSummary,
} from "../lib/gradeCalculator";
import {
  deleteCustomAssessment,
  deleteCustomCategory,
  deleteCustomGradebook,
  saveCustomAssessment,
  saveCustomCategory,
  saveCustomGradebook,
  universalGradebooksStorageKey,
} from "../lib/cloudService";

type GradeMatrix = Record<GradeSubject, GradeValues>;

const DISPLAY_FIELD_KEYS: GradeField[] = [
  "pre_test",
  "post_test",
  "oral_revalida",
  "written_revalida",
  "comprehensive",
];

const SUBJECT_LABELS: Record<GradeSubject, string> = {
  Hematology: "Hema 1",
  "Clinical Chemistry": "CC 1",
  Bacteriology: "Bacteriology",
  AUBF: "AUBF",
};

const CATEGORY_LABELS: Record<GradeField, { title: string; rowPrefix: string; numberSeparator: string }> = {
  pre_test: { title: "Pre-Tests", rowPrefix: "Pre-Test", numberSeparator: " " },
  post_test: { title: "Post-Tests", rowPrefix: "Post-Test", numberSeparator: " " },
  comprehensive: { title: "Comprehensive Exam", rowPrefix: "CE", numberSeparator: "" },
  written_revalida: { title: "Written Revalida", rowPrefix: "WR", numberSeparator: "" },
  oral_revalida: { title: "Oral Revalida", rowPrefix: "OR", numberSeparator: "" },
};

const DISPLAY_FIELDS = DISPLAY_FIELD_KEYS.map((key) => {
  const field = GRADE_FIELDS.find((item) => item.key === key);
  if (!field) throw new Error(`Missing grade field: ${key}`);
  return field;
});

function valuesFor(record?: GradeRecord): GradeValues {
  return Object.fromEntries(
    GRADE_FIELDS.map((field) => [field.key, record?.[field.key] ?? null]),
  ) as unknown as GradeValues;
}

function matrixFromRecords(records: GradeRecord[]): GradeMatrix {
  return Object.fromEntries(
    SUBJECTS.map((subject) => [subject, valuesFor(records.find((record) => record.subject === subject))]),
  ) as GradeMatrix;
}

function categoryPercentage(matrix: GradeMatrix, field: (typeof GRADE_FIELDS)[number]) {
  const totalScore = SUBJECTS.reduce((total, subject) => total + (matrix[subject][field.key] ?? 0), 0);
  return (totalScore / (field.max * SUBJECTS.length)) * field.weight * 100;
}

type DeleteTarget =
  | { type: "gradebook"; id: string; name: string }
  | { type: "category"; id: string; name: string }
  | { type: "assessment"; id: string; name: string }
  | null;

export default function GradesPage({
  grades,
  onSave,
  showSimulator,
  mtapFeaturesEnabled = true,
  initialCustomGradebooks,
  userId,
  cloudClient,
}: {
  grades: GradeRecord[];
  onSave: (record: GradeRecord) => Promise<void>;
  showSimulator: boolean;
  mtapFeaturesEnabled?: boolean;
  initialCustomGradebooks?: CustomGradebook[];
  userId?: string | null;
  cloudClient?: SupabaseClient | null;
}) {
  // Mode selection: "nu_preset" | "custom"
  const [activeMode, setActiveMode] = useState<"nu_preset" | "custom">(() => (
    mtapFeaturesEnabled ? "nu_preset" : "custom"
  ));

  // NU MTAP state
  const [matrix, setMatrix] = useState<GradeMatrix>(() => matrixFromRecords(grades));
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error">("success");
  const [sourceGrades, setSourceGrades] = useState(grades);

  if (grades !== sourceGrades) {
    setSourceGrades(grades);
    setMatrix(matrixFromRecords(grades));
  }

  // Custom Gradebooks state
  const storageKey = universalGradebooksStorageKey(userId);
  const [customGradebooks, setCustomGradebooks] = useState<CustomGradebook[]>(() => {
    if (initialCustomGradebooks && initialCustomGradebooks.length > 0) return initialCustomGradebooks;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) return JSON.parse(stored) as CustomGradebook[];
      } catch {
        // fallback to empty
      }
    }
    return [];
  });

  const [selectedGradebookId, setSelectedGradebookId] = useState<string | null>(() => (
    customGradebooks[0]?.id ?? null
  ));

  // Sync customGradebooks if initialCustomGradebooks updates from cloud
  useEffect(() => {
    if (initialCustomGradebooks && initialCustomGradebooks.length > 0) {
      setCustomGradebooks(initialCustomGradebooks);
    }
  }, [initialCustomGradebooks]);

  // Sync selectedGradebookId if list changes
  useEffect(() => {
    if (customGradebooks.length > 0 && (!selectedGradebookId || !customGradebooks.some((b) => b.id === selectedGradebookId))) {
      setSelectedGradebookId(customGradebooks[0].id);
    }
  }, [customGradebooks, selectedGradebookId]);

  // Persist customGradebooks to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, JSON.stringify(customGradebooks));
      } catch {
        // ignore
      }
    }
  }, [customGradebooks, storageKey]);

  // Modals state
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<CustomGradebook | null>(null);
  const [subjectDraft, setSubjectDraft] = useState({ name: "", subjectCode: "", passingGrade: "75" });

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomGradeCategory | null>(null);
  const [categoryDraft, setCategoryDraft] = useState({ name: "", weight: "20" });

  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false);
  const [targetCategoryIdForAssessment, setTargetCategoryIdForAssessment] = useState<string | null>(null);
  const [assessmentDraft, setAssessmentDraft] = useState({ name: "", score: "", maxScore: "100" });

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  // Simulator State
  const [simSubject, setSimSubject] = useState<GradeSubject>("Hematology");
  const [simTargetCategory, setSimTargetCategory] = useState<string>("");
  const [simTargetGrade, setSimTargetGrade] = useState<string>("75");
  const [simHypotheticalScore, setSimHypotheticalScore] = useState<number>(85);

  // NU MTAP Calculations
  const categoryPercentages = useMemo(
    () => Object.fromEntries(GRADE_FIELDS.map((field) => [field.key, categoryPercentage(matrix, field)])) as Record<GradeField, number>,
    [matrix],
  );
  const overallPercentage = GRADE_FIELDS.reduce((total, field) => total + categoryPercentages[field.key], 0);
  const completedEntries = SUBJECTS.reduce(
    (count, subject) => count + GRADE_FIELDS.filter((field) => matrix[subject][field.key] !== null).length,
    0,
  );

  function updateNuScore(subject: GradeSubject, field: GradeField, raw: string, max: number) {
    setMatrix((current) => ({
      ...current,
      [subject]: { ...current[subject], [field]: sanitizeGradeScore(raw, max) },
    }));
    setStatus("");
  }

  async function saveAll() {
    setPending(true);
    setStatus("");
    try {
      await Promise.all(SUBJECTS.map((subject) => onSave({
        ...grades.find((record) => record.subject === subject),
        ...matrix[subject],
        subject,
      })));
      setStatusType("success");
      setStatus("All subject grades were saved.");
    } catch {
      setStatusType("error");
      setStatus("Grades could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // Currently selected custom gradebook
  const activeCustomBook = useMemo(
    () => customGradebooks.find((b) => b.id === selectedGradebookId) ?? null,
    [customGradebooks, selectedGradebookId],
  );

  // Active custom book summary
  const customSummary: UniversalGradeSummary | null = useMemo(() => {
    if (!activeCustomBook) return null;
    return calculateUniversalGrade(activeCustomBook.categories, activeCustomBook.passingGrade);
  }, [activeCustomBook]);

  // NU subject categories for Universal Simulator
  const nuSimCategories = useMemo(() => {
    return nuSubjectToUniversalCategories(matrix[simSubject]);
  }, [matrix, simSubject]);

  // Determine active simulator categories & passing grade
  const isNuSim = activeMode === "nu_preset";
  const activeSimCategories: UniversalCategoryInput[] = isNuSim
    ? nuSimCategories
    : (activeCustomBook?.categories ?? []);
  const activeSimPassingGrade = isNuSim ? PASSING_GRADE : (activeCustomBook?.passingGrade ?? 75);

  // Default simTargetCategory if empty or missing
  useEffect(() => {
    if (activeSimCategories.length > 0) {
      if (!simTargetCategory || !activeSimCategories.some((c) => c.id === simTargetCategory)) {
        setSimTargetCategory(activeSimCategories[0].id);
      }
    }
  }, [activeSimCategories, simTargetCategory]);

  // Target Simulator output
  const targetSimResult = useMemo(() => {
    if (!simTargetCategory || activeSimCategories.length === 0) return null;
    const target = Number(simTargetGrade);
    if (!Number.isFinite(target) || target <= 0) return null;
    return simulateUniversalTarget(activeSimCategories, simTargetCategory, target, 75);
  }, [activeSimCategories, simTargetCategory, simTargetGrade]);

  // What-If Simulator output
  const whatIfResult = useMemo(() => {
    if (!simTargetCategory || activeSimCategories.length === 0) return null;
    return simulateUniversalWhatIf(
      activeSimCategories,
      simTargetCategory,
      simHypotheticalScore,
      activeSimPassingGrade,
    );
  }, [activeSimCategories, simTargetCategory, simHypotheticalScore, activeSimPassingGrade]);

  // Subject CRUD
  function openAddSubject() {
    setEditingSubject(null);
    setSubjectDraft({ name: "", subjectCode: "", passingGrade: "75" });
    setSubjectModalOpen(true);
  }

  function openEditSubject(book: CustomGradebook) {
    setEditingSubject(book);
    setSubjectDraft({
      name: book.name,
      subjectCode: book.subjectCode ?? "",
      passingGrade: String(book.passingGrade),
    });
    setSubjectModalOpen(true);
  }

  async function handleSaveSubject() {
    const name = subjectDraft.name.trim();
    if (!name) return;
    const passingGradeNum = Number(subjectDraft.passingGrade);
    const passingGrade = (Number.isFinite(passingGradeNum) && passingGradeNum > 0 && passingGradeNum <= 100)
      ? passingGradeNum
      : 75;

    const payload = {
      name,
      subjectCode: subjectDraft.subjectCode.trim() || null,
      passingGrade,
      templateType: "custom" as const,
      position: editingSubject ? editingSubject.position : customGradebooks.length,
    };

    if (editingSubject) {
      const updated: CustomGradebook = {
        ...editingSubject,
        ...payload,
        updatedAt: new Date().toISOString(),
      };
      setCustomGradebooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      if (cloudClient && userId) {
        saveCustomGradebook(cloudClient, userId, { id: updated.id, ...payload }).catch(() => {});
      }
    } else {
      const tempId = `cb-${Date.now()}`;
      const created: CustomGradebook = {
        id: tempId,
        userId: userId ?? "local",
        ...payload,
        categories: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCustomGradebooks((prev) => [...prev, created]);
      setSelectedGradebookId(tempId);
      if (cloudClient && userId) {
        saveCustomGradebook(cloudClient, userId, payload).then((serverBook) => {
          setCustomGradebooks((prev) => prev.map((b) => (b.id === tempId ? { ...b, id: serverBook.id } : b)));
          setSelectedGradebookId(serverBook.id);
        }).catch(() => {});
      }
    }
    setSubjectModalOpen(false);
  }

  // Category CRUD
  function openAddCategory() {
    if (!activeCustomBook) return;
    setEditingCategory(null);
    setCategoryDraft({ name: "", weight: "20" });
    setCategoryModalOpen(true);
  }

  function openEditCategory(cat: CustomGradeCategory) {
    setEditingCategory(cat);
    setCategoryDraft({ name: cat.name, weight: String(cat.weight) });
    setCategoryModalOpen(true);
  }

  async function handleSaveCategory() {
    if (!activeCustomBook) return;
    const name = categoryDraft.name.trim();
    if (!name) return;
    const weightNum = Number(categoryDraft.weight);
    const weight = (Number.isFinite(weightNum) && weightNum > 0 && weightNum <= 100) ? weightNum : 20;

    if (editingCategory) {
      const updated: CustomGradeCategory = {
        ...editingCategory,
        name,
        weight,
        updatedAt: new Date().toISOString(),
      };
      setCustomGradebooks((prev) => prev.map((b) => {
        if (b.id !== activeCustomBook.id) return b;
        return {
          ...b,
          categories: b.categories.map((c) => (c.id === updated.id ? updated : c)),
        };
      }));
      if (cloudClient) {
        saveCustomCategory(cloudClient, { id: updated.id, gradebookId: activeCustomBook.id, name, weight }).catch(() => {});
      }
    } else {
      const tempId = `cat-${Date.now()}`;
      const created: CustomGradeCategory = {
        id: tempId,
        gradebookId: activeCustomBook.id,
        name,
        weight,
        position: activeCustomBook.categories.length,
        assessments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCustomGradebooks((prev) => prev.map((b) => {
        if (b.id !== activeCustomBook.id) return b;
        return { ...b, categories: [...b.categories, created] };
      }));
      if (cloudClient) {
        saveCustomCategory(cloudClient, { gradebookId: activeCustomBook.id, name, weight }).then((serverCat) => {
          setCustomGradebooks((prev) => prev.map((b) => {
            if (b.id !== activeCustomBook.id) return b;
            return {
              ...b,
              categories: b.categories.map((c) => (c.id === tempId ? { ...c, id: serverCat.id } : c)),
            };
          }));
        }).catch(() => {});
      }
    }
    setCategoryModalOpen(false);
  }

  // Assessment CRUD
  function openAddAssessment(catId: string) {
    setTargetCategoryIdForAssessment(catId);
    setAssessmentDraft({ name: "", score: "", maxScore: "100" });
    setAssessmentModalOpen(true);
  }

  async function handleSaveAssessment() {
    if (!activeCustomBook || !targetCategoryIdForAssessment) return;
    const name = assessmentDraft.name.trim();
    if (!name) return;
    const maxNum = Number(assessmentDraft.maxScore);
    const maxScore = (Number.isFinite(maxNum) && maxNum > 0) ? maxNum : 100;
    const scoreVal = assessmentDraft.score.trim() === "" ? null : Number(assessmentDraft.score);
    const score = (scoreVal !== null && Number.isFinite(scoreVal) && scoreVal >= 0) ? Math.min(maxScore, scoreVal) : null;

    const tempId = `ass-${Date.now()}`;
    const targetCat = activeCustomBook.categories.find((c) => c.id === targetCategoryIdForAssessment);
    const pos = targetCat ? targetCat.assessments.length : 0;

    const created: CustomGradeAssessment = {
      id: tempId,
      categoryId: targetCategoryIdForAssessment,
      name,
      score,
      maxScore,
      position: pos,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCustomGradebooks((prev) => prev.map((b) => {
      if (b.id !== activeCustomBook.id) return b;
      return {
        ...b,
        categories: b.categories.map((c) => {
          if (c.id !== targetCategoryIdForAssessment) return c;
          return { ...c, assessments: [...c.assessments, created] };
        }),
      };
    }));

    if (cloudClient) {
      saveCustomAssessment(cloudClient, {
        categoryId: targetCategoryIdForAssessment,
        name,
        score,
        maxScore,
        position: pos,
      }).then((serverAss) => {
        setCustomGradebooks((prev) => prev.map((b) => {
          if (b.id !== activeCustomBook.id) return b;
          return {
            ...b,
            categories: b.categories.map((c) => {
              if (c.id !== targetCategoryIdForAssessment) return c;
              return {
                ...c,
                assessments: c.assessments.map((a) => (a.id === tempId ? { ...a, id: serverAss.id } : a)),
              };
            }),
          };
        }));
      }).catch(() => {});
    }

    setAssessmentModalOpen(false);
  }

  function handleUpdateScoreInline(categoryId: string, assessmentId: string, rawScore: string, maxScore: number) {
    if (!activeCustomBook) return;
    const score = sanitizeGradeScore(rawScore, maxScore);

    setCustomGradebooks((prev) => prev.map((b) => {
      if (b.id !== activeCustomBook.id) return b;
      return {
        ...b,
        categories: b.categories.map((c) => {
          if (c.id !== categoryId) return c;
          return {
            ...c,
            assessments: c.assessments.map((a) => (a.id === assessmentId ? { ...a, score } : a)),
          };
        }),
      };
    }));

    if (cloudClient) {
      const cat = activeCustomBook.categories.find((c) => c.id === categoryId);
      const ass = cat?.assessments.find((a) => a.id === assessmentId);
      if (ass) {
        saveCustomAssessment(cloudClient, {
          id: assessmentId,
          categoryId,
          name: ass.name,
          score,
          maxScore,
        }).catch(() => {});
      }
    }
  }

  // Deletions
  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "gradebook") {
      const bookId = deleteTarget.id;
      setCustomGradebooks((prev) => prev.filter((b) => b.id !== bookId));
      if (selectedGradebookId === bookId) {
        const remaining = customGradebooks.filter((b) => b.id !== bookId);
        setSelectedGradebookId(remaining[0]?.id ?? null);
      }
      if (cloudClient && userId) {
        deleteCustomGradebook(cloudClient, userId, bookId).catch(() => {});
      }
    } else if (deleteTarget.type === "category") {
      const catId = deleteTarget.id;
      if (activeCustomBook) {
        setCustomGradebooks((prev) => prev.map((b) => {
          if (b.id !== activeCustomBook.id) return b;
          return { ...b, categories: b.categories.filter((c) => c.id !== catId) };
        }));
      }
      if (cloudClient) {
        deleteCustomCategory(cloudClient, catId).catch(() => {});
      }
    } else if (deleteTarget.type === "assessment") {
      const assId = deleteTarget.id;
      if (activeCustomBook) {
        setCustomGradebooks((prev) => prev.map((b) => {
          if (b.id !== activeCustomBook.id) return b;
          return {
            ...b,
            categories: b.categories.map((c) => ({
              ...c,
              assessments: c.assessments.filter((a) => a.id !== assId),
            })),
          };
        }));
      }
      if (cloudClient) {
        deleteCustomAssessment(cloudClient, assId).catch(() => {});
      }
    }
    setDeleteTarget(null);
  }

  return (
    <div className="grades-shell">
      {/* Top Header & Mode Navigation */}
      <section className="grade-overview-card grade-ledger-overview">
        <div className="grade-ledger-heading">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <p className="eyebrow" style={{ margin: 0 }}>Academic Gradebook</p>
              <span className="grade-mode-badge">
                {activeMode === "nu_preset" ? "NU MOA MTAP 1 Preset" : "Custom Gradebook"}
              </span>
            </div>
            <h2>Grades by category</h2>
            <p>
              Track course performance, customize weighted grading categories, and simulate target scores to plan your study milestones.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div className="theme-segmented-control" role="tablist" aria-label="Gradebook mode">
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === "nu_preset"}
                className={`theme-segment-btn ${activeMode === "nu_preset" ? "active" : ""}`}
                onClick={() => setActiveMode("nu_preset")}
              >
                NU MOA · MTAP 1
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === "custom"}
                className={`theme-segment-btn ${activeMode === "custom" ? "active" : ""}`}
                onClick={() => setActiveMode("custom")}
              >
                Custom Subjects ({customGradebooks.length})
              </button>
            </div>
            <span className="state-pill">
              Pass mark {activeMode === "nu_preset" ? PASSING_GRADE : (activeCustomBook?.passingGrade ?? 75)}%
            </span>
          </div>
        </div>

        {/* Overview metric strip */}
        <div className="grade-summary-grid">
          {showSimulator && (
            <div className="grade-simulator-summary">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <span>Grade Simulator</span>
                <span style={{ fontSize: "9px", padding: "2px 7px", borderRadius: "99px", background: "var(--green)", color: "var(--accent-ink)", fontWeight: 800, letterSpacing: "0.02em" }}>
                  {activeMode === "nu_preset" ? "For NU MOA" : "Universal"}
                </span>
              </div>
              <strong>
                {activeMode === "nu_preset"
                  ? `${overallPercentage.toFixed(2)}%`
                  : customSummary?.currentPerformance !== null
                  ? `${customSummary?.currentPerformance.toFixed(1)}%`
                  : "—"}
              </strong>
              <small>
                {activeMode === "nu_preset"
                  ? "Projected weighted grade calibrated for NU MOA Students"
                  : customSummary?.status ?? "Current Performance"}
              </small>
            </div>
          )}

          <div>
            <span>Grades recorded</span>
            <strong>
              {activeMode === "nu_preset"
                ? `${completedEntries} / ${SUBJECTS.length * GRADE_FIELDS.length}`
                : activeCustomBook
                ? `${customSummary?.categorySummaries.reduce((sum, c) => sum + c.completedCount, 0)} assessments`
                : "0"}
            </strong>
            <small>
              {activeMode === "nu_preset"
                ? "Across four subjects and five assessments"
                : activeCustomBook
                ? `${activeCustomBook.categories.length} grading categories`
                : "Add your first subject to start"}
            </small>
          </div>

          <div>
            <span>Points Secured</span>
            <strong>
              {activeMode === "nu_preset"
                ? `${overallPercentage.toFixed(1)} / 100%`
                : customSummary
                ? `${customSummary.earnedPoints.toFixed(1)} / 100%`
                : "—"}
            </strong>
            <small>
              {activeMode === "nu_preset"
                ? `${SUBJECTS.length * GRADE_FIELDS.length - completedEntries} assessments remaining`
                : customSummary?.isWeightValid
                ? `${(100 - customSummary.completedWeight).toFixed(0)}% weight unassessed`
                : "Weights must total 100%"}
            </small>
          </div>
        </div>
      </section>

      {/* ====================================================================
          MODE 1: NU MOA MTAP 1 PRESET
          ==================================================================== */}
      {activeMode === "nu_preset" && (
        <>
          <div className="grade-category-grid">
            {DISPLAY_FIELDS.map((field) => (
              <section className={`grade-category-card grade-category-${field.key}`} key={field.key}>
                <div className="grade-category-heading">
                  <div>
                    <p className="eyebrow">{Math.round(field.weight * 100)}% of final grade</p>
                    <h2>{CATEGORY_LABELS[field.key].title} <span>({field.max})</span></h2>
                  </div>
                  <span className="grade-weight-pill">{field.max} points</span>
                </div>
                <div className="grade-subject-list">
                  {SUBJECTS.map((subject, subjectIndex) => (
                    <label key={subject}>
                      <span className="grade-entry-label">
                        <strong>
                          {CATEGORY_LABELS[field.key].rowPrefix}
                          {CATEGORY_LABELS[field.key].numberSeparator}
                          {subjectIndex + 1} - {SUBJECT_LABELS[subject]}
                        </strong>
                        <small>{subject}</small>
                      </span>
                      <div className="grade-score-control">
                        <input
                          className="grade-score-input"
                          aria-label={`${field.label} ${subject} score`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={field.max}
                          step="0.01"
                          placeholder="—"
                          value={matrix[subject][field.key] ?? ""}
                          onChange={(event) => updateNuScore(subject, field.key, event.target.value, field.max)}
                        />
                        <span>/ {field.max}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="grade-category-total">
                  <span>Category percentage</span>
                  <strong>{categoryPercentages[field.key].toFixed(2)}%</strong>
                </div>
              </section>
            ))}
          </div>

          <div className="grade-save-bar">
            <div>
              <strong>Finished entering grades?</strong>
              <span>Save all five categories for the four subjects together.</span>
            </div>
            {status && <p className={`form-status ${statusType}`} role={statusType === "error" ? "alert" : "status"}>{status}</p>}
            <button className="primary-button" type="button" onClick={() => void saveAll()} disabled={pending}>
              {pending ? "Saving…" : "Save all grades"}
            </button>
          </div>
        </>
      )}

      {/* ====================================================================
          MODE 2: UNIVERSAL CUSTOM GRADEBOOKS
          ==================================================================== */}
      {activeMode === "custom" && (
        <div className="custom-gradebook-container">
          {/* Subject Navigation Bar */}
          <div className="subject-nav-bar">
            <div className="subject-tabs-scroll">
              {customGradebooks.map((book) => {
                const bookSummary = calculateUniversalGrade(book.categories, book.passingGrade);
                const isActive = book.id === selectedGradebookId;
                return (
                  <button
                    key={book.id}
                    type="button"
                    className={`subject-nav-tab ${isActive ? "active" : ""}`}
                    onClick={() => setSelectedGradebookId(book.id)}
                  >
                    <span className="subject-nav-name">{book.subjectCode ? `${book.subjectCode} · ${book.name}` : book.name}</span>
                    <span className={`subject-nav-score ${bookSummary.status === "Passing secured" || bookSummary.status === "On track" ? "good" : ""}`}>
                      {bookSummary.currentPerformance !== null ? `${bookSummary.currentPerformance.toFixed(1)}%` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="add-subject-btn" onClick={openAddSubject}>
              + Add Subject
            </button>
          </div>

          {/* Empty State: No subjects yet */}
          {customGradebooks.length === 0 && (
            <section className="gradebook-empty-state">
              <div className="empty-state-icon" aria-hidden="true">📚</div>
              <h3>Set up your gradebook</h3>
              <p>Choose how your grades are calculated. Track coursework with custom categories or use the built-in NU MOA preset.</p>
              <div className="empty-state-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveMode("nu_preset")}
                >
                  Use NU MOA · MTAP 1 Preset
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={openAddSubject}
                >
                  Create Custom Gradebook
                </button>
              </div>
            </section>
          )}

          {/* Active Subject Workspace */}
          {activeCustomBook && (
            <div className="custom-subject-workspace">
              {/* Subject Detail Header */}
              <div className="subject-workspace-header">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h3>{activeCustomBook.name}</h3>
                    {activeCustomBook.subjectCode && (
                      <span className="subject-code-badge">{activeCustomBook.subjectCode}</span>
                    )}
                    <span className={`status-pill ${customSummary?.status === "Passing secured" || customSummary?.status === "On track" ? "success" : "info"}`}>
                      {customSummary?.status}
                    </span>
                  </div>
                  <p className="subject-subtext">
                    Passing Grade: <strong>{activeCustomBook.passingGrade}%</strong> · Weighted Percentage System
                  </p>
                </div>
                <div className="subject-actions-row">
                  <button type="button" className="secondary-button compact" onClick={() => openEditSubject(activeCustomBook)}>
                    Settings
                  </button>
                  <button
                    type="button"
                    className="danger-button-subtle compact"
                    onClick={() => setDeleteTarget({ type: "gradebook", id: activeCustomBook.id, name: activeCustomBook.name })}
                  >
                    Delete Subject
                  </button>
                </div>
              </div>

              {/* Weight Validator Notice */}
              {customSummary && !customSummary.isWeightValid && (
                <div className={`weight-validator-notice ${customSummary.weightRemaining < 0 ? "over" : "incomplete"}`}>
                  <span className="notice-icon" aria-hidden="true">⚠️</span>
                  <div>
                    <strong>Total category weight: {customSummary.totalConfiguredWeight}% / 100%</strong>
                    <p>
                      {customSummary.weightRemaining > 0
                        ? `Your grading setup is incomplete. Category weights must total 100% before RevIT can calculate a final projected grade (${customSummary.weightRemaining}% remaining).`
                        : `Category weights exceed 100% (${Math.abs(customSummary.weightRemaining)}% over). Please adjust category weights.`}
                    </p>
                  </div>
                </div>
              )}

              {/* Category Cards Grid */}
              <div className="category-cards-stack">
                {activeCustomBook.categories.map((category) => {
                  const catSummary = customSummary?.categorySummaries.find((c) => c.id === category.id);
                  return (
                    <section className="custom-category-card" key={category.id}>
                      <div className="custom-category-header">
                        <div className="category-title-group">
                          <h4>{category.name}</h4>
                          <span className="category-weight-badge">{category.weight}% of final grade</span>
                          {catSummary?.hasData && (
                            <span className="category-performance-badge">
                              {catSummary.totalEarned} / {catSummary.totalPossible} pts ({catSummary.percentage?.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                        <div className="category-actions">
                          {catSummary?.hasData && (
                            <span className="category-contribution-pill">
                              +{catSummary.contribution.toFixed(2)}% to final
                            </span>
                          )}
                          <button type="button" className="text-button-subtle" onClick={() => openEditCategory(category)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-button-subtle danger"
                            onClick={() => setDeleteTarget({ type: "category", id: category.id, name: category.name })}
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {/* Assessments in this category */}
                      <div className="assessments-list">
                        {category.assessments.length === 0 ? (
                          <p className="no-assessments-hint">No assessments recorded in this category yet.</p>
                        ) : (
                          category.assessments.map((assessment) => {
                            const percent = (assessment.score !== null && assessment.maxScore > 0)
                              ? ((assessment.score / assessment.maxScore) * 100).toFixed(1)
                              : null;
                            return (
                              <div className="assessment-row" key={assessment.id}>
                                <span className="assessment-name">{assessment.name}</span>
                                <div className="assessment-score-inputs">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    max={assessment.maxScore}
                                    placeholder="—"
                                    className="grade-score-input inline"
                                    value={assessment.score ?? ""}
                                    onChange={(e) => handleUpdateScoreInline(category.id, assessment.id, e.target.value, assessment.maxScore)}
                                  />
                                  <span className="score-divider">/ {assessment.maxScore}</span>
                                  {percent !== null && <span className="score-percent-badge">{percent}%</span>}
                                  <button
                                    type="button"
                                    className="delete-assessment-btn"
                                    aria-label={`Delete ${assessment.name}`}
                                    onClick={() => setDeleteTarget({ type: "assessment", id: assessment.id, name: assessment.name })}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="category-footer">
                        <button
                          type="button"
                          className="add-assessment-btn"
                          onClick={() => openAddAssessment(category.id)}
                        >
                          + Add Assessment
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>

              {/* Add Category Trigger */}
              <div className="add-category-bar">
                <button type="button" className="secondary-button" onClick={openAddCategory}>
                  + Add Grading Category
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          UNIVERSAL GRADE SIMULATOR
          Works for both NU MOA MTAP 1 & Custom Gradebooks
          ==================================================================== */}
      {showSimulator && activeSimCategories.length > 0 && (
        <section className="universal-simulator-card" aria-labelledby="grade-simulator-heading">
          <div className="simulator-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <p className="eyebrow" style={{ margin: 0 }}>What-If &amp; Target Planning</p>
                <span className="state-pill" style={{ fontSize: "9px" }}>Interactive</span>
              </div>
              <h3 id="grade-simulator-heading">Grade Simulator</h3>
              <p>Simulate target score requirements or explore how a hypothetical grade impacts your projected final standing.</p>
            </div>

            {/* If in NU mode, allow picking which of the 4 subjects to simulate */}
            {isNuSim && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label htmlFor="sim-subject-select" style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)" }}>
                  Subject:
                </label>
                <select
                  id="sim-subject-select"
                  className="revit-select compact"
                  value={simSubject}
                  onChange={(e) => setSimSubject(e.target.value as GradeSubject)}
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="simulator-body-grid">
            {/* Target Score Calculator */}
            <div className="simulator-panel">
              <div className="panel-kicker">Target Calculator</div>
              <h4>What score do I need?</h4>
              <p className="panel-subtext">Calculate the required score on an assessment to secure your desired final grade.</p>

              <div className="sim-field-row">
                <label className="sim-label" htmlFor="sim-target-category">Assessment Category</label>
                <select
                  id="sim-target-category"
                  className="revit-select"
                  value={simTargetCategory}
                  onChange={(e) => setSimTargetCategory(e.target.value)}
                >
                  {activeSimCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.weight}% weight)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sim-field-row">
                <label className="sim-label" htmlFor="sim-target-grade">Desired Final Grade (%)</label>
                <input
                  id="sim-target-grade"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="100"
                  step="0.5"
                  className="grade-score-input"
                  value={simTargetGrade}
                  onChange={(e) => setSimTargetGrade(e.target.value)}
                />
              </div>

              {targetSimResult && (
                <div className={`sim-result-box ${targetSimResult.alreadySecured ? "secured" : !targetSimResult.achievable ? "impossible" : "reachable"}`}>
                  <div className="sim-result-metric">
                    <span>Required Score on {targetSimResult.targetCategoryName}</span>
                    <strong>
                      {targetSimResult.alreadySecured
                        ? "Target Secured"
                        : !targetSimResult.achievable
                        ? "Unreachable"
                        : `${targetSimResult.requiredPercentage.toFixed(1)}%`}
                    </strong>
                  </div>
                  <p className="sim-result-desc">{targetSimResult.explanation}</p>
                </div>
              )}
            </div>

            {/* What-If Scenario Slider */}
            <div className="simulator-panel">
              <div className="panel-kicker">What-If Scenarios</div>
              <h4>What happens if I score X?</h4>
              <p className="panel-subtext">Adjust the slider to preview your projected standing without altering real grades.</p>

              <div className="sim-slider-wrap">
                <div className="slider-label-row">
                  <span>Hypothetical score on {whatIfResult?.targetCategoryName}</span>
                  <strong>{simHypotheticalScore}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  aria-label="Hypothetical score slider"
                  className="sim-slider"
                  value={simHypotheticalScore}
                  onChange={(e) => setSimHypotheticalScore(Number(e.target.value))}
                />
              </div>

              {whatIfResult && (
                <div className="sim-whatif-output">
                  <div className="whatif-score-badge">
                    <span>Projected Final:</span>
                    <strong>{whatIfResult.projectedEarnedPoints.toFixed(1)}%</strong>
                    <span className={`status-pill ${whatIfResult.isPassing ? "success" : "warning"}`}>
                      {whatIfResult.isPassing ? "Passing" : "Below Target"}
                    </span>
                  </div>

                  {/* Projection Ladder Table */}
                  <div className="sim-ladder-table">
                    <span className="ladder-title">Projection Ladder</span>
                    <div className="ladder-pills-row">
                      {whatIfResult.ladder.slice(1, 6).map((step) => (
                        <div
                          key={step.scorePercentage}
                          className={`ladder-item ${step.isPassing ? "pass" : ""}`}
                          onClick={() => setSimHypotheticalScore(step.scorePercentage)}
                        >
                          <span className="ladder-step-in">{step.scorePercentage}%</span>
                          <span className="ladder-step-out">→ {step.projectedFinal.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ====================================================================
          MODALS & DIALOGS
          ==================================================================== */}

      {/* Add / Edit Subject Modal */}
      {subjectModalOpen && (
        <div className="profile-modal-backdrop" role="presentation">
          <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="subject-modal-title">
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow">Universal Gradebook</p>
                <h2 id="subject-modal-title">{editingSubject ? "Edit Subject" : "Add Subject"}</h2>
              </div>
              <button type="button" onClick={() => setSubjectModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-form-body">
              <label className="profile-field-label" htmlFor="subj-name">Subject Name</label>
              <input
                id="subj-name"
                className="account-input"
                placeholder="e.g. Clinical Chemistry II"
                value={subjectDraft.name}
                onChange={(e) => setSubjectDraft((prev) => ({ ...prev, name: e.target.value }))}
                required
              />

              <label className="profile-field-label" htmlFor="subj-code" style={{ marginTop: "12px" }}>
                Short Code (Optional)
              </label>
              <input
                id="subj-code"
                className="account-input"
                placeholder="e.g. CC2"
                maxLength={10}
                value={subjectDraft.subjectCode}
                onChange={(e) => setSubjectDraft((prev) => ({ ...prev, subjectCode: e.target.value }))}
              />

              <label className="profile-field-label" htmlFor="subj-pass" style={{ marginTop: "12px" }}>
                Passing Grade (%)
              </label>
              <input
                id="subj-pass"
                type="number"
                inputMode="decimal"
                min="1"
                max="100"
                className="account-input"
                value={subjectDraft.passingGrade}
                onChange={(e) => setSubjectDraft((prev) => ({ ...prev, passingGrade: e.target.value }))}
                required
              />
            </div>
            <div className="profile-modal-actions">
              <button type="button" className="text-button quiet" onClick={() => setSubjectModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleSaveSubject}>
                {editingSubject ? "Save changes" : "Create subject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {categoryModalOpen && (
        <div className="profile-modal-backdrop" role="presentation">
          <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="cat-modal-title">
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow">Grading Structure</p>
                <h2 id="cat-modal-title">{editingCategory ? "Edit Category" : "Add Category"}</h2>
              </div>
              <button type="button" onClick={() => setCategoryModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-form-body">
              <label className="profile-field-label" htmlFor="cat-name">Category Name</label>
              <input
                id="cat-name"
                className="account-input"
                placeholder="e.g. Quizzes, Laboratory, Midterm"
                value={categoryDraft.name}
                onChange={(e) => setCategoryDraft((prev) => ({ ...prev, name: e.target.value }))}
                required
              />

              <label className="profile-field-label" htmlFor="cat-weight" style={{ marginTop: "12px" }}>
                Weight (% of final grade)
              </label>
              <input
                id="cat-weight"
                type="number"
                inputMode="decimal"
                min="1"
                max="100"
                className="account-input"
                value={categoryDraft.weight}
                onChange={(e) => setCategoryDraft((prev) => ({ ...prev, weight: e.target.value }))}
                required
              />
            </div>
            <div className="profile-modal-actions">
              <button type="button" className="text-button quiet" onClick={() => setCategoryModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleSaveCategory}>
                {editingCategory ? "Save changes" : "Add category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Assessment Modal */}
      {assessmentModalOpen && (
        <div className="profile-modal-backdrop" role="presentation">
          <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="ass-modal-title">
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow">New Assessment</p>
                <h2 id="ass-modal-title">Add Assessment</h2>
              </div>
              <button type="button" onClick={() => setAssessmentModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-form-body">
              <label className="profile-field-label" htmlFor="ass-name">Assessment Name</label>
              <input
                id="ass-name"
                className="account-input"
                placeholder="e.g. Quiz 1, Midterm Exam"
                value={assessmentDraft.name}
                onChange={(e) => setAssessmentDraft((prev) => ({ ...prev, name: e.target.value }))}
                required
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
                <div>
                  <label className="profile-field-label" htmlFor="ass-score">Score (Optional)</label>
                  <input
                    id="ass-score"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="—"
                    className="account-input"
                    value={assessmentDraft.score}
                    onChange={(e) => setAssessmentDraft((prev) => ({ ...prev, score: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="profile-field-label" htmlFor="ass-max">Out of (Max)</label>
                  <input
                    id="ass-max"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="1"
                    placeholder="100"
                    className="account-input"
                    value={assessmentDraft.maxScore}
                    onChange={(e) => setAssessmentDraft((prev) => ({ ...prev, maxScore: e.target.value }))}
                    required
                  />
                </div>
              </div>
            </div>
            <div className="profile-modal-actions">
              <button type="button" className="text-button quiet" onClick={() => setAssessmentModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleSaveAssessment}>
                Add Assessment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="profile-modal-backdrop" role="presentation">
          <div className="profile-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
            <div className="profile-modal-heading">
              <div>
                <p className="eyebrow" style={{ color: "var(--danger)" }}>Delete Confirmation</p>
                <h2 id="delete-confirm-title">Delete {deleteTarget.type}?</h2>
              </div>
            </div>
            <p style={{ margin: "14px 0 20px", color: "var(--muted)", fontSize: "12px", lineHeight: "1.6" }}>
              Are you sure you want to delete <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>?
              {deleteTarget.type === "gradebook" && " This will permanently remove all its grading categories and recorded scores."}
              {deleteTarget.type === "category" && " All recorded assessments under this category will be removed."}
            </p>
            <div className="profile-modal-actions">
              <button type="button" className="text-button quiet" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="danger-button" onClick={confirmDelete}>
                Delete {deleteTarget.type}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
