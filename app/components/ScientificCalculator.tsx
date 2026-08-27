"use client";

import katex from "katex";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateExpression,
  calculatorExpressionToLatex,
  formatCalculatorFraction,
  formatCalculatorResult,
  type AngleMode,
} from "../lib/scientificCalculator";

type Timeline = { past: string[]; present: string; future: string[] };
type PanelPosition = { x: number; y: number };

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

function katexMarkup(latex: string, displayMode = false) {
  return katex.renderToString(latex, { displayMode, throwOnError: false, strict: "ignore", output: "html" });
}

function resultLatex(result: string) {
  const fraction = result.match(/^(-?\d+)\/(\d+)$/);
  if (fraction) return String.raw`\frac{${fraction[1]}}{${fraction[2]}}`;
  return result.replace(/e([+-]?\d+)/i, String.raw`\times 10^{$1}`);
}

export default function ScientificCalculator() {
  const [open, setOpen] = useState(false);
  const [timeline, setTimeline] = useState<Timeline>(INITIAL_TIMELINE);
  const [angleMode, setAngleMode] = useState<AngleMode>("deg");
  const [secondMode, setSecondMode] = useState(false);
  const [resultMode, setResultMode] = useState<"fraction" | "decimal">("fraction");
  const [lastAnswer, setLastAnswer] = useState(0);
  const [memory, setMemory] = useState(0);
  const [calculationError, setCalculationError] = useState("");
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragCleanupRef = useRef<() => void>(() => undefined);

  const preview = useMemo(() => {
    if (!timeline.present.trim()) return null;
    try {
      const value = calculateExpression(timeline.present, angleMode, lastAnswer);
      const display = resultMode === "fraction" ? formatCalculatorFraction(value) : formatCalculatorResult(value);
      return {
        value,
        display,
        expressionHtml: katexMarkup(calculatorExpressionToLatex(timeline.present), true),
        resultHtml: katexMarkup(resultLatex(display)),
      };
    } catch {
      return null;
    }
  }, [angleMode, lastAnswer, resultMode, timeline.present]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!position) return;
    const keepInsideViewport = () => {
      const panel = panelRef.current;
      if (!panel) return;
      setPosition((current) => current ? {
        x: Math.min(Math.max(8, current.x), Math.max(8, window.innerWidth - panel.offsetWidth - 8)),
        y: Math.min(Math.max(8, current.y), Math.max(8, window.innerHeight - panel.offsetHeight - 8)),
      } : current);
    };
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, [position]);

  useEffect(() => () => dragCleanupRef.current(), []);

  const commit = (next: string) => {
    setCalculationError("");
    setTimeline((current) => next === current.present ? current : {
      past: [...current.past.slice(-99), current.present],
      present: next.slice(0, 220),
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
    const startsPrimary = value.startsWith("(") || value === "π" || value === "e" || value === "Ans" || value === "10^(" || value === "e^(" || /^(sin|cos|tan|asin|acos|atan|ln|log|sqrt|cbrt|root|frac)/.test(value);
    const endsPrimary = /[0-9πe)!%]/.test(previous) || current.endsWith("Ans");
    const digitAfterPrimary = /^[0-9.]$/.test(value) && (/[πe)!%]/.test(previous) || current.endsWith("Ans"));

    if (value === "×10^" && !current) return commit("10^");
    if (["^2", "^3"].includes(value) && (!current || OPERATORS.has(previous) || previous === "(" || previous === ",")) return;
    if (OPERATORS.has(value)) {
      if (!current && value !== "−") return;
      if (OPERATORS.has(previous)) commit(`${current.slice(0, -1)}${value}`);
      else commit(`${current}${value}`);
      return;
    }
    commit(`${current}${(startsPrimary && endsPrimary) || digitAfterPrimary ? "×" : ""}${value}`);
  };

  const insertFraction = () => {
    const current = timeline.present.trim();
    if (!current) commit("frac(");
    else if (OPERATORS.has(current.slice(-1)) || current.endsWith("(") || current.endsWith(",")) append("frac(");
    else commit(`frac(${current},`);
  };

  const toggleSign = () => {
    const current = timeline.present.trim();
    if (!current) return append("−");
    if (current.startsWith("−(") && current.endsWith(")")) commit(current.slice(2, -1));
    else commit(`−(${current})`);
  };

  const calculate = () => {
    try {
      const value = calculateExpression(timeline.present, angleMode, lastAnswer);
      setLastAnswer(value);
      setCalculationError("");
    } catch (error) {
      setCalculationError(error instanceof Error ? error.message : "Check the expression");
    }
  };

  const updateMemory = (operation: "clear" | "recall" | "add" | "subtract") => {
    if (operation === "clear") return setMemory(0);
    if (operation === "recall") return append(`(${formatCalculatorResult(memory)})`);
    try {
      const value = calculateExpression(timeline.present, angleMode, lastAnswer);
      setMemory((current) => operation === "add" ? current + value : current - value);
      setCalculationError("");
    } catch (error) {
      setCalculationError(error instanceof Error ? error.message : "Check the expression");
    }
  };

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = rect.left;
    const originY = rect.top;
    const panelWidth = rect.width;
    const panelHeight = rect.height;
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      setPosition({
        x: Math.min(Math.max(8, originX + moveEvent.clientX - startX), Math.max(8, window.innerWidth - panelWidth - 8)),
        y: Math.min(Math.max(8, originY + moveEvent.clientY - startY), Math.max(8, window.innerHeight - panelHeight - 8)),
      });
    };
    const stop = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      dragCleanupRef.current();
      setDragging(false);
    };
    dragCleanupRef.current();
    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    setPosition({ x: rect.left, y: rect.top });
    setDragging(true);
    event.preventDefault();
  };

  const panelStyle: CSSProperties | undefined = position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined;
  const currentFunction = (normal: string, inverse: string) => secondMode ? inverse : normal;

  return (
    <div className={`scientific-calculator ${open ? "open" : ""}`}>
      {open && (
        <section ref={panelRef} style={panelStyle} className={`calculator-panel ${dragging ? "dragging" : ""}`} id="revit-scientific-calculator" role="dialog" aria-labelledby="calculator-title">
          <header className="calculator-header" onPointerDown={startDrag}>
            <div className="calculator-drag-title"><span className="calculator-grip" aria-hidden="true">⠿</span><div><span className="calculator-kicker">Natural display</span><h2 id="calculator-title">Scientific calculator</h2></div></div>
            <div className="calculator-header-actions">
              <button type="button" onClick={undo} disabled={!timeline.past.length} aria-label="Undo calculator input" title="Undo"><HistoryIcon direction="undo" /></button>
              <button type="button" onClick={redo} disabled={!timeline.future.length} aria-label="Redo calculator input" title="Redo"><HistoryIcon direction="redo" /></button>
              <button type="button" onClick={() => setPosition(null)} disabled={!position} aria-label="Reset calculator position" title="Reset position">⌖</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close calculator" title="Close">×</button>
            </div>
          </header>

          <div className="calculator-status-bar">
            <span className={secondMode ? "active" : ""}>2ND</span>
            <span className={memory ? "active" : ""}>M</span>
            <button type="button" onClick={() => setAngleMode((current) => current === "deg" ? "rad" : "deg")} aria-label={`Angle mode: ${angleMode === "deg" ? "degrees" : "radians"}. Click to change.`}>{angleMode.toUpperCase()}</button>
            <span>Math</span>
            <span>{resultMode === "fraction" ? "FRC" : "DEC"}</span>
          </div>

          <div className="calculator-display">
            <div className="calculator-natural-display" aria-hidden="true">
              {preview
                ? <span dangerouslySetInnerHTML={{ __html: preview.expressionHtml }} />
                : <span className="calculator-placeholder">{timeline.present || "0"}</span>}
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
              placeholder="Type or use the keys"
            />
            <output className={calculationError ? "error" : ""} aria-live="polite">
              {calculationError
                ? calculationError
                : preview && <><span aria-hidden="true">=</span><span dangerouslySetInnerHTML={{ __html: preview.resultHtml }} /></>}
            </output>
          </div>

          <div className="calculator-keypad" aria-label="Calculator keypad">
            <button type="button" className={`shift-key ${secondMode ? "active" : ""}`} onClick={() => setSecondMode((current) => !current)}>2nd</button>
            <button type="button" className="function-key fraction-key" onClick={insertFraction} aria-label="Insert fraction">a⁄b</button>
            <button type="button" className="function-key" onClick={() => append(secondMode ? "cbrt(" : "sqrt(")}>{secondMode ? "∛" : "√"}</button>
            <button type="button" className="function-key" onClick={() => append(secondMode ? "^3" : "^2")}>{secondMode ? "x³" : "x²"}</button>
            <button type="button" className="function-key" onClick={() => append(secondMode ? "root(" : "^")}>{secondMode ? "ⁿ√x" : "xʸ"}</button>
            <button type="button" className="function-key" onClick={() => append(secondMode ? "10^(" : "log(")}>{secondMode ? "10ˣ" : "log"}</button>

            <button type="button" className="function-key" onClick={() => append(`${currentFunction("sin", "asin")}(`)}>{secondMode ? "sin⁻¹" : "sin"}</button>
            <button type="button" className="function-key" onClick={() => append(`${currentFunction("cos", "acos")}(`)}>{secondMode ? "cos⁻¹" : "cos"}</button>
            <button type="button" className="function-key" onClick={() => append(`${currentFunction("tan", "atan")}(`)}>{secondMode ? "tan⁻¹" : "tan"}</button>
            <button type="button" className="function-key" onClick={() => append(secondMode ? "e^(" : "ln(")}>{secondMode ? "eˣ" : "ln"}</button>
            <button type="button" className="utility-key" onClick={() => append("(")}>(</button>
            <button type="button" className="utility-key" onClick={() => append(")")}>)</button>

            <button type="button" className="memory-key" onClick={() => updateMemory("clear")}>MC</button>
            <button type="button" className="memory-key" onClick={() => updateMemory("recall")}>MR</button>
            <button type="button" className="memory-key" onClick={() => updateMemory("add")}>M+</button>
            <button type="button" className="memory-key" onClick={() => updateMemory("subtract")}>M−</button>
            <button type="button" className="function-key" onClick={() => append("π")}>π</button>
            <button type="button" className="function-key" onClick={() => append("e")}>e</button>

            <button type="button" className="function-key compact-key" onClick={() => setResultMode((current) => current === "fraction" ? "decimal" : "fraction")}>S⇔D</button>
            <button type="button" className="function-key" onClick={() => append(",")}>,</button>
            <button type="button" className="function-key compact-key" onClick={() => append("×10^")}>EXP</button>
            <button type="button" className="function-key" onClick={() => append("!")}>x!</button>
            <button type="button" className="function-key" onClick={() => append("%")}>%</button>
            <button type="button" className="function-key compact-key" onClick={() => append("Ans")}>Ans</button>

            {["7", "8", "9"].map((value) => <button type="button" key={value} onClick={() => append(value)}>{value}</button>)}
            <button type="button" className="delete-key" onClick={() => commit(timeline.present.slice(0, -1))}>DEL</button>
            <button type="button" className="clear-key" onClick={() => commit("")}>AC</button>
            <button type="button" className="operator-key" onClick={() => append("÷")}>÷</button>

            {["4", "5", "6"].map((value) => <button type="button" key={value} onClick={() => append(value)}>{value}</button>)}
            <button type="button" className="operator-key" onClick={() => append("×")}>×</button>
            <button type="button" className="function-key" onClick={() => timeline.present.trim() ? commit(`frac(1,${timeline.present})`) : commit("frac(1,")}>1/x</button>
            <button type="button" className="function-key" onClick={() => append("abs(")}>|x|</button>

            {["1", "2", "3"].map((value) => <button type="button" key={value} onClick={() => append(value)}>{value}</button>)}
            <button type="button" className="operator-key" onClick={() => append("+")}>+</button>
            <button type="button" className="operator-key" onClick={() => append("−")}>−</button>
            <button type="button" className="function-key sign-key" onClick={toggleSign}>(−)</button>

            <button type="button" className="zero-key" onClick={() => append("0")}>0</button>
            <button type="button" onClick={() => append(".")}>.</button>
            <button type="button" className="function-key compact-key" onClick={() => append("×10^")}>×10ˣ</button>
            <button type="button" className="function-key compact-key" onClick={() => append("Ans")}>Ans</button>
            <button type="button" className="equals-key" onClick={calculate}>=</button>
          </div>
          <p className="calculator-drag-note">Drag the title bar to move</p>
        </section>
      )}

      {!open && (
        <button className="calculator-fab" type="button" onClick={() => setOpen(true)} aria-label="Open scientific calculator" aria-expanded="false" aria-controls="revit-scientific-calculator" title="Scientific calculator">
          <CalculatorIcon />
        </button>
      )}
    </div>
  );
}
