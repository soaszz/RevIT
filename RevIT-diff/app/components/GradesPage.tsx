"use client";

import { useMemo, useState } from "react";
import {
  GRADE_FIELDS,
  PASSING_GRADE,
  SUBJECTS,
  type GradeField,
  type GradeRecord,
  type GradeSubject,
  type GradeValues,
} from "../lib/domain";
import { calculateGrade, calculateGuidance, calculateNextAssessmentTarget, sanitizeGradeScore } from "../lib/gradeCalculator";

function recordValues(record?: GradeRecord): GradeValues {
  return Object.fromEntries(GRADE_FIELDS.map((field) => [field.key, record?.[field.key] ?? null])) as unknown as GradeValues;
}

function scoreLabel(value: number) { return Number.isFinite(value) ? `${Math.max(0, value).toFixed(1)}%` : "—"; }

export default function GradesPage({ grades, onSave }: { grades: GradeRecord[]; onSave: (record: GradeRecord) => Promise<void> }) {
  const [subject, setSubject] = useState<GradeSubject>("Hematology");
  const actualRecord = grades.find((record) => record.subject === subject);
  const [actual, setActual] = useState<GradeValues>(() => recordValues(actualRecord));
  const [simulated, setSimulated] = useState<GradeValues>(() => recordValues(actualRecord));
  const [target, setTarget] = useState(PASSING_GRADE);
  const [laterAverage, setLaterAverage] = useState(75);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  const actualSummary = useMemo(() => calculateGrade(actual), [actual]);
  const simulation = useMemo(() => calculateGuidance(simulated, target), [simulated, target]);
  const nextField = GRADE_FIELDS.find((field) => simulated[field.key] === null)?.key;
  const nextTarget = nextField ? calculateNextAssessmentTarget(simulated, nextField, target, laterAverage) : null;

  function update(setter: (values: GradeValues) => void, values: GradeValues, field: GradeField, raw: string, max: number) {
    setter({ ...values, [field]: sanitizeGradeScore(raw, max) });
  }

  function chooseSubject(nextSubject: GradeSubject) {
    const values = recordValues(grades.find((record) => record.subject === nextSubject));
    setSubject(nextSubject); setActual(values); setSimulated(values); setStatus("");
  }

  async function save() {
    setPending(true); setStatus("");
    try {
      await onSave({ ...actualRecord, ...actual, subject });
      setSimulated(actual); setStatus("Actual grades saved to the cloud.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Grades could not be saved."); }
    finally { setPending(false); }
  }

  return (
    <div className="grades-shell">
      <section className="grade-overview-card">
        <div className="grade-subject-tabs" role="tablist">{SUBJECTS.map((item) => <button type="button" key={item} className={subject === item ? "active" : ""} onClick={() => chooseSubject(item)}>{item}</button>)}</div>
        <div className="grade-summary-grid">
          <div><span>Weighted earned</span><strong>{actualSummary.earnedPoints.toFixed(2)} / 100</strong><small>{actualSummary.complete ? "Final weighted grade" : "Completed assessments only"}</small></div>
          <div><span>Completed weight</span><strong>{Math.round(actualSummary.completedWeight * 100)}%</strong><small>{Math.round((1 - actualSummary.completedWeight) * 100)}% remains blank</small></div>
          <div><span>Current performance</span><strong>{actualSummary.normalizedPerformance === null ? "—" : scoreLabel(actualSummary.normalizedPerformance)}</strong><small>Normalized across completed work</small></div>
        </div>
      </section>

      <div className="grade-columns">
        <section className="grade-card">
          <div className="section-heading"><div><p className="eyebrow">My Grades</p><h2>Actual assessment scores</h2></div><span className="state-pill">Pass mark {PASSING_GRADE}%</span></div>
          <p className="grade-intro">Leave an assessment blank until it is completed. Blank is never treated as zero.</p>
          <div className="grade-input-list">{GRADE_FIELDS.map((field) => {
            const value = actual[field.key];
            const contribution = value === null ? null : (value / field.max) * 100 * field.weight;
            return <label key={field.key}><span><strong>{field.label}</strong><small>Max {field.max} · {field.weight * 100}% weight</small></span><input aria-label={`${field.label} actual score`} type="number" min={0} max={field.max} step="0.01" placeholder="Blank" value={value ?? ""} onChange={(event) => update(setActual, actual, field.key, event.target.value, field.max)} /><em>{contribution === null ? "Not entered" : `${contribution.toFixed(2)} pts`}</em></label>;
          })}</div>
          {status && <p className="form-status" role="status">{status}</p>}
          <button className="primary-button" type="button" onClick={() => void save()} disabled={pending}>{pending ? "Saving…" : "Save actual grades"}</button>
        </section>

        <section className="grade-card simulator-card">
          <div className="section-heading"><div><p className="eyebrow">Grade Simulator</p><h2>Private what-if workspace</h2></div><button className="text-button" type="button" onClick={() => { setSimulated(actual); setTarget(PASSING_GRADE); setLaterAverage(75); }}>Reset to actual</button></div>
          <p className="grade-intro">Hypothetical changes update live and never overwrite My Grades.</p>
          <div className="simulator-controls"><label><span>Target final grade</span><input type="number" min={0} max={100} value={target} onChange={(event) => setTarget(Math.min(100, Math.max(0, Number(event.target.value))))} /></label><label><span>Assume later scores</span><input type="number" min={0} max={100} value={laterAverage} onChange={(event) => setLaterAverage(Math.min(100, Math.max(0, Number(event.target.value))))} /><em>%</em></label></div>
          <div className="grade-input-list compact">{GRADE_FIELDS.map((field) => <label key={field.key}><span><strong>{field.label}</strong><small>out of {field.max}</small></span><input aria-label={`${field.label} simulated score`} type="number" min={0} max={field.max} step="0.01" placeholder="What if?" value={simulated[field.key] ?? ""} onChange={(event) => update(setSimulated, simulated, field.key, event.target.value, field.max)} /></label>)}</div>
          <div className={`guidance-panel state-${simulation.state.toLowerCase().replaceAll(" ", "-")}`}>
            <span>{simulation.state}</span>
            <strong>{simulation.complete ? `${simulation.earnedPoints.toFixed(2)}% projected final` : `${simulation.earnedPoints.toFixed(2)} weighted points earned`}</strong>
            {simulation.state === "Passing secured" ? <p>You have already secured the {target}% target, even before remaining blank assessments.</p> : simulation.state === "Mathematically impossible" ? <p>The maximum possible result is {simulation.maxPossible.toFixed(2)}%, below the {target}% target.</p> : <p>You need an average of <strong>{scoreLabel(simulation.requiredAverage)}</strong> across the remaining {Math.round(simulation.remainingWeight * 100)}% weight to reach {target}%.</p>}
          </div>
          {nextTarget && <div className="next-target"><p className="eyebrow">Next-assessment target</p><strong>{nextTarget.field.label}: {nextTarget.alreadyCovered ? "any score keeps the current assumption viable" : nextTarget.achievable ? `${Math.max(0, nextTarget.requiredScore).toFixed(1)} / ${nextTarget.field.max} minimum` : "not enough under this assumption"}</strong><p>Assumes {laterAverage}% on every later blank assessment. Recommended buffer: {nextTarget.recommendedScore} / {nextTarget.field.max}.</p></div>}
        </section>
      </div>
    </div>
  );
}
