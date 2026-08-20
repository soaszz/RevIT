"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GRADE_FIELDS,
  PASSING_GRADE,
  SUBJECTS,
  type GradeField,
  type GradeRecord,
  type GradeSubject,
  type GradeValues,
} from "../lib/domain";
import { sanitizeGradeScore } from "../lib/gradeCalculator";

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

export default function GradesPage({ grades, onSave }: { grades: GradeRecord[]; onSave: (record: GradeRecord) => Promise<void> }) {
  const [matrix, setMatrix] = useState<GradeMatrix>(() => matrixFromRecords(grades));
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error">("success");

  useEffect(() => {
    setMatrix(matrixFromRecords(grades));
  }, [grades]);

  const categoryPercentages = useMemo(
    () => Object.fromEntries(GRADE_FIELDS.map((field) => [field.key, categoryPercentage(matrix, field)])) as Record<GradeField, number>,
    [matrix],
  );
  const overallPercentage = GRADE_FIELDS.reduce((total, field) => total + categoryPercentages[field.key], 0);
  const completedEntries = SUBJECTS.reduce(
    (count, subject) => count + GRADE_FIELDS.filter((field) => matrix[subject][field.key] !== null).length,
    0,
  );

  function update(subject: GradeSubject, field: GradeField, raw: string, max: number) {
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
    } catch (error) {
      setStatusType("error");
      setStatus(error instanceof Error ? error.message : "Grades could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grades-shell">
      <section className="grade-overview-card grade-ledger-overview">
        <div className="grade-ledger-heading">
          <div><p className="eyebrow">Assessment gradebook</p><h2>Grades by category</h2><p>Enter every subject grade under its assessment category. Each card shows how much that category contributes to your final grade.</p></div>
          <span className="state-pill">Pass mark {PASSING_GRADE}%</span>
        </div>
        <div className="grade-summary-grid">
          <div><span>Current weighted grade</span><strong>{overallPercentage.toFixed(2)}%</strong><small>Sum of the five category percentages</small></div>
          <div><span>Grades recorded</span><strong>{completedEntries} / {SUBJECTS.length * GRADE_FIELDS.length}</strong><small>Across four subjects and five assessments</small></div>
          <div><span>Assessments remaining</span><strong>{SUBJECTS.length * GRADE_FIELDS.length - completedEntries}</strong><small>Blank entries can be completed later</small></div>
        </div>
      </section>

      <div className="grade-category-grid">
        {DISPLAY_FIELDS.map((field) => (
          <section className={`grade-category-card grade-category-${field.key}`} key={field.key}>
            <div className="grade-category-heading">
              <div><p className="eyebrow">{Math.round(field.weight * 100)}% of final grade</p><h2>{CATEGORY_LABELS[field.key].title} <span>({field.max})</span></h2></div>
              <span className="grade-weight-pill">{field.max} points</span>
            </div>
            <div className="grade-subject-list">
              {SUBJECTS.map((subject, subjectIndex) => (
                <label key={subject}>
                  <span className="grade-entry-label"><strong>{CATEGORY_LABELS[field.key].rowPrefix}{CATEGORY_LABELS[field.key].numberSeparator}{subjectIndex + 1} - {SUBJECT_LABELS[subject]}</strong><small>{subject}</small></span>
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
                      onChange={(event) => update(subject, field.key, event.target.value, field.max)}
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
        <div><strong>Finished entering grades?</strong><span>Save all five categories for the four subjects together.</span></div>
        {status && <p className={`form-status ${statusType}`} role={statusType === "error" ? "alert" : "status"}>{status}</p>}
        <button className="primary-button" type="button" onClick={() => void saveAll()} disabled={pending}>{pending ? "Saving…" : "Save all grades"}</button>
      </div>
    </div>
  );
}
