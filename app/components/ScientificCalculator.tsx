"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateExpression, formatCalculatorResult, type AngleMode } from "../lib/scientificCalculator";

type Timeline = { past: string[]; present: string; future: string[] };

const INITIAL_TIMELINE: Timeline = { past: [], present: "", future: [] };
const OPERATORS = new Set(["+", "−", "×", "÷", "^"]);

function CalculatorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="2.75" width="16" height="18.5" rx="3" />
      <path d="M7.5 6.5h9M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18.5h.01M12 18.5h4" />
    </svg>
  );
}

function HistoryIcon({ direction }: { direction: "undo" | "redo" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={direction === "redo" ? "redo-icon" : undefined}>
      <path d="M9 7 5 11l4 4M6 11h7a5 5 0 0 1 5 5v1" />
    </svg>
  );
}

export default function ScientificCalculator() {
  const [open, setOpen] = useState(false);
  const [timeline, setTimeline] = useState<Timeline>(INITIAL_TIMELINE);
  const [angleMode, setAngleMode] = useState<AngleMode>("deg");
  const [lastAnswer, setLastAnswer] = useState(0);
  const [calculationError, setCalculationError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    if (!timeline.present.trim()) return null;
    try {
      return formatCalculatorResult(calculateExpression(timeline.present, angleMode, lastAnswer));
    } catch {
      return null;
    }
  }, [angleMode, lastAnswer, timeline.present]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const commit = (next: string) => {
    setCalculationError("");
    setTimeline((current) => next === current.present ? current : {
      past: [...current.past.slice(-99), current.present],
      present: next.slice(0, 180),
      future: [],
    });
  };

  const undo = () => {
    setCalculationError("");
    setTimeline((current) => current.past.length ? {
      past: current.past.slice(0, -1),
      present: current.past[current.past.length - 1],
      future: [current.present, ...current.future].slice(0, 100),
    } : current);
  };

  const redo = () => {
    setCalculationError("");
    setTimeline((current) => current.future.length ? {
      past: [...current.past.slice(-99), current.present],
      present: current.future[0],
      future: current.future.slice(1),
    } : current);
  };

  const append = (value: string) => {
    const current = timeline.present;
    const previous = current.slice(-1);
    const startsPrimary = value === "(" || value === "π" || value === "e" || value === "Ans" || /^(sin|cos|tan|ln|log|sqrt)/.test(value);
    const endsPrimary = /[0-9πe)!%]/.test(previous) || current.endsWith("Ans");
    const digitAfterPrimary = /^[0-9.]$/.test(value) && (/[πe)!%]/.test(previous) || current.endsWith("Ans"));

    if (value === "^2" && (!current || OPERATORS.has(previous) || previous === "(")) return;
    if (OPERATORS.has(value)) {
      if (!current && value !== "−") return;
      if (OPERATORS.has(previous)) commit(`${current.slice(0, -1)}${value}`);
      else commit(`${current}${value}`);
      return;
    }
    commit(`${current}${(startsPrimary && endsPrimary) || digitAfterPrimary ? "×" : ""}${value}`);
  };

  const calculate = () => {
    try {
      const value = calculateExpression(timeline.present, angleMode, lastAnswer);
      const result = formatCalculatorResult(value);
      setLastAnswer(value);
      commit(result);
    } catch (error) {
      setCalculationError(error instanceof Error ? error.message : "Check the expression");
    }
  };

  return (
    <div className={`scientific-calculator ${open ? "open" : ""}`}>
      {open && (
        <section className="calculator-panel" id="revit-scientific-calculator" role="dialog" aria-modal="false" aria-labelledby="calculator-title">
          <header className="calculator-header">
            <div><span className="calculator-kicker">Study tool</span><h2 id="calculator-title">Scientific calculator</h2></div>
            <div className="calculator-header-actions">
              <button type="button" onClick={undo} disabled={!timeline.past.length} aria-label="Undo calculator input" title="Undo"><HistoryIcon direction="undo" /></button>
              <button type="button" onClick={redo} disabled={!timeline.future.length} aria-label="Redo calculator input" title="Redo"><HistoryIcon direction="redo" /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close calculator" title="Close">×</button>
            </div>
          </header>

          <div className="calculator-display">
            <div className="calculator-mode-row">
              <button type="button" className="angle-mode" onClick={() => setAngleMode((current) => current === "deg" ? "rad" : "deg")} aria-label={`Angle mode: ${angleMode === "deg" ? "degrees" : "radians"}. Click to change.`}>{angleMode.toUpperCase()}</button>
              <span>{timeline.past.length ? `${timeline.past.length} edit${timeline.past.length === 1 ? "" : "s"}` : "Ready"}</span>
            </div>
            <label className="sr-only" htmlFor="calculator-expression">Calculator expression</label>
            <input
              ref={inputRef}
              id="calculator-expression"
              value={timeline.present}
              onChange={(event) => commit(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); calculate(); } }}
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              placeholder="0"
            />
            <output className={calculationError ? "error" : ""} aria-live="polite">{calculationError || (preview ? `= ${preview}` : "Enter a valid expression")}</output>
          </div>

          <div className="calculator-keypad" aria-label="Calculator keypad">
            <button type="button" className="utility-key" onClick={() => commit("")}>AC</button>
            <button type="button" className="utility-key" onClick={() => commit(timeline.present.slice(0, -1))}>DEL</button>
            <button type="button" className="utility-key" onClick={() => append("(")}>(</button>
            <button type="button" className="utility-key" onClick={() => append(")")}>)</button>
            <button type="button" className="operator-key" onClick={() => append("÷")}>÷</button>

            <button type="button" className="function-key" onClick={() => append("sin(")}>sin</button>
            <button type="button" className="function-key" onClick={() => append("cos(")}>cos</button>
            <button type="button" className="function-key" onClick={() => append("tan(")}>tan</button>
            <button type="button" className="function-key" onClick={() => append("ln(")}>ln</button>
            <button type="button" className="function-key" onClick={() => append("log(")}>log</button>

            <button type="button" className="function-key" onClick={() => append("sqrt(")}>√</button>
            <button type="button" className="function-key" onClick={() => append("^2")}>x²</button>
            <button type="button" className="function-key" onClick={() => append("^")}>xʸ</button>
            <button type="button" className="function-key" onClick={() => append("π")}>π</button>
            <button type="button" className="function-key" onClick={() => append("e")}>e</button>

            {["7", "8", "9"].map((value) => <button type="button" key={value} onClick={() => append(value)}>{value}</button>)}
            <button type="button" className="function-key" onClick={() => append("%")}>%</button>
            <button type="button" className="operator-key" onClick={() => append("×")}>×</button>

            {["4", "5", "6"].map((value) => <button type="button" key={value} onClick={() => append(value)}>{value}</button>)}
            <button type="button" className="function-key ans-key" onClick={() => append("Ans")}>Ans</button>
            <button type="button" className="operator-key" onClick={() => append("−")}>−</button>

            {["1", "2", "3"].map((value) => <button type="button" key={value} onClick={() => append(value)}>{value}</button>)}
            <button type="button" onClick={() => append(".")}>.</button>
            <button type="button" className="operator-key" onClick={() => append("+")}>+</button>

            <button type="button" className="zero-key" onClick={() => append("0")}>0</button>
            <button type="button" className="function-key" onClick={() => append("!")}>x!</button>
            <button type="button" className="equals-key" onClick={calculate}>=</button>
          </div>
        </section>
      )}

      {!open && (
        <button
          className="calculator-fab"
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open scientific calculator"
          aria-expanded="false"
          aria-controls="revit-scientific-calculator"
          title="Scientific calculator"
        >
          <CalculatorIcon />
        </button>
      )}
    </div>
  );
}
