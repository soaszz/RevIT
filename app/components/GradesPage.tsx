"use client";

import { useMemo, useState, useEffect, type CSSProperties } from "react";
import assessmentStyles from "./GradesAssessment.module.css";
import simulatorStyles from "./GradeSimulator.module.css";
import { gradeSimulationPreview } from "../lib/gradeSimulationPreview";
import { buildMtap2Gradebooks, MTAP_2_GRADE_SUBJECTS, presetCategoryPercentage, isMtap2Gradebook, mergeMtap2Gradebooks, mtap2Matrix, retainPendingMtap2, syncMtap2Gradebooks } from "../lib/mtap2Grades";
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

type GradeMatrix = Record<string, GradeValues>;

const DISPLAY_FIELD_KEYS: GradeField[] = [
  "pre_test",
  "post_test",
  "oral_revalida",
  "written_revalida",
  "comprehensive",
];

// Presentation only: canonical matrix keys and persisted subject identifiers stay unchanged.
const MTAP_2_GRADE_LABELS: Record<string, string> = {
  Hematology: "Hematology 2",
  "Clinical Chemistry": "Clinical Chemistry 2",
};

const CATEGORY_LABELS: Record<GradeField, string> = {
  pre_test: "Pre-Tests",
  post_test: "Post-Tests",
  comprehensive: "Comprehensive Exam",
  written_revalida: "Written Revalida",
  oral_revalida: "Oral Revalida",
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
  onMtap2Synced,
  userId,
  cloudClient,
}: {
  grades: GradeRecord[];
  onSave: (record: GradeRecord) => Promise<void>;
  showSimulator: boolean;
  mtapFeaturesEnabled?: boolean;
  initialCustomGradebooks?: CustomGradebook[];
  onMtap2Synced?: (books: CustomGradebook[]) => void;
  userId?: string | null;
  cloudClient?: SupabaseClient | null;
}) {
  // Mode selection: "nu_preset" | "custom"
  const [activeMode, setActiveMode] = useState<"nu_preset" | "mtap2_preset" | "custom">(() => (
    mtapFeaturesEnabled ? "nu_preset" : "custom"
  ));
  const effectiveMode = mtapFeaturesEnabled ? activeMode : "custom";

  const isMtap2 = effectiveMode === "mtap2_preset";
  const gradeSubjectLabel = (subject: string) => isMtap2 ? MTAP_2_GRADE_LABELS[subject] ?? subject : subject;
  const presetSubjects: readonly string[] = isMtap2 ? MTAP_2_GRADE_SUBJECTS.map(s => s.name) : SUBJECTS;
  const isPreset = effectiveMode !== "custom";
  const [mtap2Draft, setMtap2Draft] = useState<GradeMatrix | null>(null);
  useEffect(() => { setMtap2Draft(null); }, [userId]);

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
    if (initialCustomGradebooks && initialCustomGradebooks.length > 0) {
      try { return retainPendingMtap2(initialCustomGradebooks, JSON.parse(localStorage.getItem(storageKey) ?? "[]"), userId ?? "local"); } catch { return initialCustomGradebooks; }
    }
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
    customGradebooks.find(b => !isMtap2Gradebook(b))?.id ?? null
  ));

  // Sync customGradebooks if initialCustomGradebooks updates from cloud
  useEffect(() => {
    if (initialCustomGradebooks && initialCustomGradebooks.length > 0) {
      setCustomGradebooks(local => retainPendingMtap2(initialCustomGradebooks, local, userId ?? "local"));
    }
  }, [initialCustomGradebooks]);

  const regularGradebooks = customGradebooks.filter(b => !isMtap2Gradebook(b));
  const presetMatrix = isMtap2 ? mtap2Draft ?? mtap2Matrix(customGradebooks, userId ?? "local") : matrix;

  // Sync selectedGradebookId if list changes
  useEffect(() => {
    if (regularGradebooks.length > 0 && (!selectedGradebookId || !regularGradebooks.some((b) => b.id === selectedGradebookId))) {
      setSelectedGradebookId(regularGradebooks[0].id);
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
  const [simSubject, setSimSubject] = useState<string>("Hematology");
  const [simTargetCategory, setSimTargetCategory] = useState<string>("");
  const [simTargetGrade, setSimTargetGrade] = useState<string>("75");
  const [simHypotheticalScore, setSimHypotheticalScore] = useState<number>(85);

  const activeEntryCount = presetSubjects.length * GRADE_FIELDS.length;

  // NU MTAP Calculations
  const categoryPercentages = useMemo(
    () => Object.fromEntries(GRADE_FIELDS.map((field) => [field.key, presetCategoryPercentage(presetMatrix, field, presetSubjects)])) as Record<GradeField, number>,
    [presetMatrix, isMtap2],
  );
  const overallPercentage = GRADE_FIELDS.reduce((total, field) => total + categoryPercentages[field.key], 0);
  const completedEntries = GRADE_FIELDS.reduce((count, field) =>
    count + presetSubjects.filter(subject => presetMatrix[subject][field.key] !== null).length, 0);

  function updateNuScore(subject: string, field: GradeField, raw: string, max: number) {
    if (isMtap2) { setMtap2Draft(current => ({ ...(current ?? presetMatrix), [subject]: { ...(current ?? presetMatrix)[subject], [field]: sanitizeGradeScore(raw, max) } })); setStatus(""); return; }
    setMatrix((current) => ({
      ...current,
      [subject]: { ...current[subject], [field]: sanitizeGradeScore(raw, max) },
    }));
    setStatus("");
  }

  async function saveAll() {
    let localMtap2Saved = false;
    setPending(true);
    setStatus("");
    try {
      if (isMtap2) {
        const books = await buildMtap2Gradebooks(presetMatrix, userId ?? "local");
        const pendingBooks = books.map(b => ({ ...b, mtap2Pending: true }));
        const next = mergeMtap2Gradebooks(customGradebooks, pendingBooks);
        localStorage.setItem(storageKey, JSON.stringify(next));
        localMtap2Saved = true;
        setCustomGradebooks(next);
        if (cloudClient && userId) {
          await syncMtap2Gradebooks(cloudClient, books, userId);
          onMtap2Synced?.(books);
          setCustomGradebooks(current => mergeMtap2Gradebooks(current, books));
          setStatus("MTAP 2 grades were saved and synced.");
        } else setStatus("MTAP 2 grades were saved on this device. Sign in to sync across devices.");
        setMtap2Draft(null); setStatusType("success");
        return;
      }
      await Promise.all(SUBJECTS.map((subject) => onSave({
        ...grades.find((record) => record.subject === subject),
        ...matrix[subject],
        subject,
      })));
      setStatusType("success");
      setStatus("All subject grades were saved.");
    } catch {
      setStatusType("error");
      setStatus(isMtap2 && localMtap2Saved ? "Cloud sync did not complete. Saved local MTAP 2 grades remain on this device; retry Save all grades." : "Grades could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // Currently selected custom gradebook
  const activeCustomBook = useMemo(
    () => regularGradebooks.find((b) => b.id === selectedGradebookId) ?? null,
    [customGradebooks, selectedGradebookId],
  );

  // Active custom book summary
  const customSummary: UniversalGradeSummary | null = useMemo(() => {
    if (!activeCustomBook) return null;
    return calculateUniversalGrade(activeCustomBook.categories, activeCustomBook.passingGrade);
  }, [activeCustomBook]);

  // NU subject categories for Universal Simulator
  const nuSimCategories = useMemo(() => {
    return nuSubjectToUniversalCategories(presetMatrix[presetSubjects.includes(simSubject) ? simSubject : presetSubjects[0]]);
  }, [presetMatrix, simSubject, isMtap2]);

  // Determine active simulator categories & passing grade
  const isNuSim = isPreset;
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
    if (!Number.isFinite(target) || target < 1 || target > 100) return null;
    return simulateUniversalTarget(activeSimCategories, simTargetCategory, target, 75);
  }, [activeSimCategories, simTargetCategory, simTargetGrade]);

  // What-If Simulator output
  const whatIfResult = useMemo(() => {
    if (!simTargetCategory || activeSimCategories.length === 0) return null;
    return gradeSimulationPreview(
      activeSimCategories,
      simTargetCategory,
      simHypotheticalScore,
      activeSimPassingGrade,
    );
  }, [activeSimCategories, simTargetCategory, simHypotheticalScore, activeSimPassingGrade]);

  const targetGradeValid = simTargetGrade.trim() !== "" && Number.isFinite(Number(simTargetGrade)) && Number(simTargetGrade) >= 1 && Number(simTargetGrade) <= 100;

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
      <section className={`${assessmentStyles.overview} grade-overview-card grade-ledger-overview`}>
        <div className="grade-ledger-heading">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <p className="eyebrow" style={{ margin: 0 }}>Academic Gradebook</p>
              {mtapFeaturesEnabled && (
                <span className="grade-mode-badge">
                  {isPreset ? (isMtap2 ? "NU MOA MTAP 2 Preset" : "NU MOA MTAP 1 Preset") : "Custom Gradebook"}
                </span>
              )}
            </div>
            <h2>Grades by category</h2>
            <p>
              Track course performance, customize weighted grading categories, and simulate target scores to plan your study milestones.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {mtapFeaturesEnabled && (
              <div className="theme-segmented-control" role="tablist" aria-label="Gradebook mode" style={{ flexWrap: "wrap", maxWidth: "100%", minWidth: 0 }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveMode === "nu_preset"}
                  className={`theme-segment-btn ${effectiveMode === "nu_preset" ? "active" : ""}`}
                  onClick={() => setActiveMode("nu_preset")}
                >
                  NU MOA · MTAP 1
                </button>
                <button type="button" role="tab" aria-selected={isMtap2} className={`theme-segment-btn ${isMtap2 ? "active" : ""}`} onClick={() => setActiveMode("mtap2_preset")} disabled={pending}>NU MOA · MTAP 2</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveMode === "custom"}
                  className={`theme-segment-btn ${effectiveMode === "custom" ? "active" : ""}`}
                  onClick={() => setActiveMode("custom")}
                >
                  Custom Subjects ({regularGradebooks.length})
                </button>
              </div>
            )}
            <span className="state-pill">
              Pass mark {isPreset ? PASSING_GRADE : (activeCustomBook?.passingGrade ?? 75)}%
            </span>
          </div>
        </div>

        {/* Overview metric strip */}
        <div className="grade-summary-grid">
          {showSimulator && (
            <div className="grade-simulator-summary">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <span>Grade Simulator</span>
                {mtapFeaturesEnabled && (
                  <span className={assessmentStyles.contextLabel}>
                    {isPreset ? "For NU MOA" : "Universal"}
                  </span>
                )}
              </div>
              <strong>
                {isPreset
                  ? `${overallPercentage.toFixed(2)}%`
                  : customSummary?.currentPerformance !== null
                  ? `${customSummary?.currentPerformance.toFixed(1)}%`
                  : "—"}
              </strong>
              <small>
                {isPreset
                  ? "Projected weighted grade calibrated for NU MOA Students"
                  : customSummary?.status ?? "Current Performance"}
              </small>
            </div>
          )}

          <div>
            <span>Grades recorded</span>
            <strong>
              {isPreset
                ? `${completedEntries} / ${activeEntryCount}`
                : activeCustomBook
                ? `${customSummary?.categorySummaries.reduce((sum, c) => sum + c.completedCount, 0)} assessments`
                : "0"}
            </strong>
            <small>
              {isPreset
                ? `Across four subjects and five assessments`
                : activeCustomBook
                ? `${activeCustomBook.categories.length} grading categories`
                : "Add your first subject to start"}
            </small>
          </div>

          <div>
            <span>Points Secured</span>
            <strong>
              {isPreset
                ? `${overallPercentage.toFixed(1)} / 100%`
                : customSummary
                ? `${customSummary.earnedPoints.toFixed(1)} / 100%`
                : "—"}
            </strong>
            <small>
              {isPreset
                ? `${activeEntryCount - completedEntries} assessments remaining`
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
      {isPreset && (
        <>
          <div className="grade-category-grid">
            {DISPLAY_FIELDS.map((field) => (
              <section className={`${assessmentStyles.assessment} grade-category-card grade-category-${field.key}`} key={field.key}>
                <div className="grade-category-heading">
                  <div>
                    <p className="eyebrow">{Math.round(field.weight * 100)}% of final grade</p>
                    <h2>{CATEGORY_LABELS[field.key]} <span>({field.max})</span></h2>
                  </div>
                  <span className="grade-weight-pill">{field.max} points</span>
                </div>
                <div className="grade-subject-list">
                  {presetSubjects.map((subject) => (
                    <label key={subject}>
                      <span className="grade-entry-label">
                        <strong>{gradeSubjectLabel(subject)}</strong>
                      </span>
                      <div className="grade-score-control">
                        <input
                          className="grade-score-input"
                          aria-label={`${field.label} ${gradeSubjectLabel(subject)} score`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={field.max}
                          step="0.01"
                          placeholder="—"
                          value={presetMatrix[subject][field.key] ?? ""}
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
      {effectiveMode === "custom" && (
        <div className="custom-gradebook-container">
          {/* Subject Navigation Bar */}
          <div className="subject-nav-bar">
            <div className="subject-tabs-scroll">
              {regularGradebooks.map((book) => {
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
          {regularGradebooks.length === 0 && (
            <section className="gradebook-empty-state">
              <svg className="empty-state-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0.5-.05" />
                <path d="M6 2v20" />
              </svg>
              <h3>Set up your gradebook</h3>
              <p>
                {mtapFeaturesEnabled
                  ? "Choose how your grades are calculated. Track coursework with custom categories or use the built-in NU MOA preset."
                  : "Track coursework, set category weights, and calculate target final exam scores across all your subjects."}
              </p>
              <div className="empty-state-actions">
                {mtapFeaturesEnabled && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setActiveMode("nu_preset")}
                  >
                    Use NU MOA · MTAP 1 Preset
                  </button>
                )}
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
                    <section className={`${assessmentStyles.assessment} custom-category-card`} key={category.id}>
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
                                    aria-label={`${assessment.name} score`}
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
        <section className={`${assessmentStyles.assessment} ${simulatorStyles.simulator}`} aria-labelledby="grade-simulator-heading">
          <header className={simulatorStyles.header}>
            <div className={simulatorStyles.copy}>
              <div className={simulatorStyles.heading}>
                <h3 id="grade-simulator-heading">Grade Simulator</h3>
                <span className={simulatorStyles.indicator}>Interactive preview</span>
              </div>
              <p>Plan a target or try a category score. Your saved grades stay unchanged.</p>
            </div>
            {isNuSim && (
              <div className={simulatorStyles.subject}>
                <label htmlFor="sim-subject-select">Subject</label>
                <select id="sim-subject-select" className={assessmentStyles.control}
                  value={presetSubjects.includes(simSubject) ? simSubject : presetSubjects[0]}
                  onChange={e => setSimSubject(e.target.value)}>
                  {presetSubjects.map(subject => <option key={subject} value={subject}>{gradeSubjectLabel(subject)}</option>)}
                </select>
              </div>
            )}
          </header>

          <div className={simulatorStyles.body}>
            <section className={simulatorStyles.panel} aria-labelledby="sim-target-heading">
              <header>
                <h4 id="sim-target-heading">Target Calculator</h4>
                <p className={simulatorStyles.help}>Find the category score needed for your desired final grade.</p>
              </header>
              <div className={simulatorStyles.field}>
                <label htmlFor="sim-target-category">Assessment category</label>
                <select id="sim-target-category" className={assessmentStyles.control} value={simTargetCategory}
                  onChange={e => setSimTargetCategory(e.target.value)} aria-describedby="sim-category-help">
                  {activeSimCategories.map(category => <option key={category.id} value={category.id}>{category.name} ({category.weight}% weight)</option>)}
                </select>
                <p id="sim-category-help" className={simulatorStyles.help}>Used by both calculators. A scenario replaces the selected category score.</p>
              </div>
              <div className={simulatorStyles.field}>
                <label htmlFor="sim-target-grade">Desired final grade (%)</label>
                <input id="sim-target-grade" type="number" inputMode="decimal" min="1" max="100" step="0.5"
                  className={assessmentStyles.control} value={simTargetGrade} onChange={e => setSimTargetGrade(e.target.value)}
                  aria-invalid={!targetGradeValid} aria-describedby={!targetGradeValid ? "sim-target-error" : undefined} />
                {!targetGradeValid && <p id="sim-target-error" className={simulatorStyles.error} role="alert">Enter a final grade from 1% to 100%.</p>}
              </div>
              {targetSimResult && (
                <div className={simulatorStyles.result} aria-live="polite">
                  <div className={simulatorStyles.metric}>
                    <span>Required score on {targetSimResult.targetCategoryName}</span>
                    <output htmlFor="sim-target-category sim-target-grade" aria-label="Required category score">{targetSimResult.requiredPercentage.toFixed(1)}%</output>
                  </div>
                  {targetSimResult.requiredPercentage > 100 ? (
                    <p className={simulatorStyles.notice}>Not achievable under these assumptions: the category score would exceed 100%.</p>
                  ) : targetSimResult.requiredPercentage <= 0 ? (
                    <p className={simulatorStyles.notice}>A score of 0% is enough under these assumptions. The calculated threshold is shown above.</p>
                  ) : <p>To reach a {targetSimResult.targetGrade}% final grade.</p>}
                  <p id="sim-assumptions">Assumes {targetSimResult.laterAverage}% on other unentered categories. Recorded categories keep their recorded scores.</p>
                </div>
              )}
              {targetGradeValid && !targetSimResult && <p className={simulatorStyles.help}>Choose a category with a weight above 0% to calculate a target.</p>}
            </section>

            <section className={simulatorStyles.panel} aria-labelledby="sim-whatif-heading">
              <header>
                <h4 id="sim-whatif-heading">What-If Scenarios</h4>
                <p className={simulatorStyles.help}>Try a percentage for {whatIfResult?.targetCategoryName ?? "the selected category"}. This does not save or change any grade.</p>
              </header>
              <div className={simulatorStyles.scoreControl}>
                <div className={simulatorStyles.scoreLabel}>
                  <label htmlFor="sim-hypothetical-score">Hypothetical category score (%)</label>
                  <div className={simulatorStyles.scoreEntry}>
                    <input id="sim-hypothetical-score" className={assessmentStyles.control} type="number" inputMode="numeric" min="0" max="100" step="1"
                      value={simHypotheticalScore} onChange={e => setSimHypotheticalScore(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))} />
                  </div>
                </div>
                <input type="range" id="sim-hypothetical-slider" min="0" max="100" step="1" className={simulatorStyles.slider}
                  style={{ "--score-fill": `${simHypotheticalScore}%` } as CSSProperties}
                  aria-label={`Hypothetical score for ${whatIfResult?.targetCategoryName ?? "selected category"}`}
                  aria-valuetext={`${simHypotheticalScore}% category score`}
                  value={simHypotheticalScore} onChange={e => setSimHypotheticalScore(Number(e.target.value))} />
                <div className={simulatorStyles.ends} aria-hidden="true"><span>0%</span><span>100%</span></div>
              </div>
              {whatIfResult && <>
                <div className={simulatorStyles.result} aria-live="polite">
                  <div className={simulatorStyles.metric}>
                    <span>Weighted Category Contribution</span>
                    <output htmlFor="sim-hypothetical-score sim-hypothetical-slider sim-target-category" aria-label="Weighted category contribution">{whatIfResult.hypotheticalContribution.toFixed(1)} points</output>
                  </div>
                  <p>{simHypotheticalScore}% category score at {whatIfResult.targetCategoryWeight}% weight.</p>
                  <p>{whatIfResult.recorded.completedWeight > 0
                    ? `Recorded weighted points: ${whatIfResult.recorded.earnedPoints.toFixed(1)} / 100.`
                    : "No recorded scores for this subject yet."}</p>
                  <p>Scenario subtotal with other recorded work: <strong>{whatIfResult.projectedEarnedPoints.toFixed(1)} / 100 points.</strong></p>
                  {whatIfResult.canProjectFinal ? <div className={simulatorStyles.metric}>
                    <span>Projected overall grade</span>
                    <output aria-label="Projected overall grade">{whatIfResult.projectedEarnedPoints.toFixed(1)}%</output>
                    <p>{whatIfResult.isPassing ? "Meets" : "Below"} the {activeSimPassingGrade}% pass mark for this scenario.</p>
                  </div> : <>
                    <p className={simulatorStyles.notice}>Overall projection unavailable.</p>
                    <p>{!whatIfResult.recorded.isWeightValid
                      ? "Category weights must total 100%."
                      : `Unentered work remains in: ${whatIfResult.missingCategories.join(", ")}. No score is assumed for that work.`}</p>
                  </>}
                </div>
                <div className={simulatorStyles.ladder}>
                  <h5>Projection Ladder</h5>
                  <p className={simulatorStyles.help}>{whatIfResult.canProjectFinal ? "Compare overall grades using recorded work." : "Compare weighted-point subtotals. Unentered work is not forecast."} Select a score to try it.</p>
                  <div className={simulatorStyles.scenarios}>
                    {whatIfResult.ladder.map(step => <button type="button" key={step.scorePercentage} className={simulatorStyles.scenario}
                      aria-pressed={step.scorePercentage === simHypotheticalScore} onClick={() => setSimHypotheticalScore(step.scorePercentage)}>
                      <strong>{step.scorePercentage}%</strong>
                      <span>{whatIfResult.canProjectFinal ? `${step.projectedFinal.toFixed(1)}% overall` : `${step.projectedFinal.toFixed(1)} weighted points`}</span>
                    </button>)}
                  </div>
                </div>
              </>}
            </section>
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
