"use client";

import katex from "katex";
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateExpression,
  calculatorExpressionToLatex,
  calculatorExpressionWithCursorToLatex,
  formatCalculatorFraction,
  formatCalculatorResult,
  type AngleMode,
} from "../lib/scientificCalculator";

type Timeline = { past: string[]; present: string; future: string[] };
type PanelPosition = { x: number; y: number };
type PanelSize = { width: number; height: number };

const INITIAL_TIMELINE: Timeline = { past: [], present: "", future: [] };
const OPERATORS = new Set(["+", "−", "×", "÷", "^"]);
const PANEL_GUTTER = 8;
const MIN_PANEL_WIDTH = 340;
const MIN_PANEL_HEIGHT = 360;

function clampPanelDimension(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, Math.min(minimum, maximum)), maximum);
}

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
  return katex.renderToString(latex, { displayMode, throwOnError: false, strict: "ignore", trust: true, output: "html" });
}

function resultLatex(result: string) {
  const fraction = result.match(/^(-?\d+)\/(\d+)$/);
  if (fraction) return String.raw`\frac{${fraction[1]}}{${fraction[2]}}`;
  return result.replace(/e([+-]?\d+)/i, String.raw`\times 10^{$1}`);
}

function findFractionRange(expression: string, cursorIndex: number) {
  let candidate: { numeratorStart: number; comma: number; denominatorStart: number; end: number } | null = null;
  let searchFrom = 0;
  while (searchFrom < expression.length) {
    const functionStart = expression.indexOf("frac(", searchFrom);
    if (functionStart < 0 || functionStart > cursorIndex) break;
    const numeratorStart = functionStart + 5;
    let depth = 1;
    let comma = -1;
    let end = expression.length;
    for (let index = numeratorStart; index < expression.length; index += 1) {
      if (expression[index] === "(") depth += 1;
      else if (expression[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      } else if (expression[index] === "," && depth === 1 && comma < 0) comma = index;
    }
    if (comma >= 0 && cursorIndex >= numeratorStart && cursorIndex <= end) {
      candidate = { numeratorStart, comma, denominatorStart: comma + 1, end };
    }
    searchFrom = functionStart + 5;
  }
  return candidate;
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
  const [cursorIndex, setCursorIndex] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [size, setSize] = useState<PanelSize | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragCleanupRef = useRef<() => void>(() => undefined);
  const resizeCleanupRef = useRef<() => void>(() => undefined);

  const preview = useMemo(() => {
    if (!timeline.present.trim()) return null;
    try {
      const value = calculateExpression(timeline.present, angleMode, lastAnswer);
      const display = resultMode === "fraction" ? formatCalculatorFraction(value) : formatCalculatorResult(value);
      return {
        value,
        display,
        resultHtml: katexMarkup(resultLatex(display)),
      };
    } catch {
      return null;
    }
  }, [angleMode, lastAnswer, resultMode, timeline.present]);

  const naturalExpressionHtml = useMemo(() => {
    try {
      return katexMarkup(calculatorExpressionWithCursorToLatex(timeline.present, cursorIndex), true);
    } catch {
      try {
        return katexMarkup(calculatorExpressionToLatex(timeline.present), true);
      } catch {
        return null;
      }
    }
  }, [cursorIndex, timeline.present]);

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
    if (!open || !inputRef.current) return;
    inputRef.current.setSelectionRange(cursorIndex, cursorIndex);
  }, [cursorIndex, open, timeline.present]);

  useEffect(() => {
    if (!open) return;
    const keepInsideViewport = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const maxWidth = Math.max(1, window.innerWidth - PANEL_GUTTER * 2);
      const maxHeight = Math.max(1, window.innerHeight - PANEL_GUTTER * 2);
      setSize((current) => current ? {
        width: Math.min(current.width, maxWidth),
        height: Math.min(current.height, maxHeight),
      } : current);
      setPosition((current) => current ? {
        x: Math.min(Math.max(PANEL_GUTTER, current.x), Math.max(PANEL_GUTTER, window.innerWidth - Math.min(panel.offsetWidth, maxWidth) - PANEL_GUTTER)),
        y: Math.min(Math.max(PANEL_GUTTER, current.y), Math.max(PANEL_GUTTER, window.innerHeight - Math.min(panel.offsetHeight, maxHeight) - PANEL_GUTTER)),
      } : current);
    };
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, [open]);

  useEffect(() => () => {
    dragCleanupRef.current();
    resizeCleanupRef.current();
  }, []);

  const commit = (next: string, nextCursor = next.length) => {
    setCalculationError("");
    setCursorIndex(Math.min(Math.max(0, nextCursor), next.length));
    setTimeline((current) => next === current.present ? current : {
      past: [...current.past.slice(-99), current.present],
      present: next.slice(0, 220),
      future: [],
    });
  };

  const undo = () => {
    setCalculationError("");
    const previous = timeline.past[timeline.past.length - 1];
    if (previous === undefined) return;
    setCursorIndex(previous.length);
    setTimeline((current) => current.past.length ? {
      past: current.past.slice(0, -1),
      present: current.past[current.past.length - 1],
      future: [current.present, ...current.future].slice(0, 100),
    } : current);
  };

  const redo = () => {
    setCalculationError("");
    const next = timeline.future[0];
    if (next === undefined) return;
    setCursorIndex(next.length);
    setTimeline((current) => current.future.length ? {
      past: [...current.past.slice(-99), current.present],
      present: current.future[0],
      future: current.future.slice(1),
    } : current);
  };

  const append = (value: string) => {
    const current = timeline.present;
    const safeCursor = Math.min(cursorIndex, current.length);
    const beforeCursor = current.slice(0, safeCursor);
    const afterCursor = current.slice(safeCursor);
    const previous = beforeCursor.slice(-1);
    const startsPrimary = value.startsWith("(") || value === "π" || value === "e" || value === "Ans" || value === "10^(" || value === "e^(" || /^(sin|cos|tan|asin|acos|atan|ln|log|sqrt|cbrt|root|frac)/.test(value);
    const endsPrimary = /[0-9πe)!%]/.test(previous) || beforeCursor.endsWith("Ans");
    const digitAfterPrimary = /^[0-9.]$/.test(value) && (/[πe)!%]/.test(previous) || beforeCursor.endsWith("Ans"));

    if (value === "×10^" && !current) return commit("10^", 3);
    if (["^2", "^3"].includes(value) && (!beforeCursor || OPERATORS.has(previous) || previous === "(" || previous === ",")) return;
    if (OPERATORS.has(value)) {
      if (!beforeCursor && value !== "−") return;
      if (OPERATORS.has(previous)) commit(`${beforeCursor.slice(0, -1)}${value}${afterCursor}`, safeCursor);
      else commit(`${beforeCursor}${value}${afterCursor}`, safeCursor + value.length);
      return;
    }
    const prefix = (startsPrimary && endsPrimary) || digitAfterPrimary ? "×" : "";
    commit(`${beforeCursor}${prefix}${value}${afterCursor}`, safeCursor + prefix.length + value.length);
  };

  const insertFraction = () => {
    const current = timeline.present.trim();
    const safeCursor = Math.min(cursorIndex, current.length);
    const beforeCursor = current.slice(0, safeCursor);
    const afterCursor = current.slice(safeCursor);
    if (!current) commit("frac(", 5);
    else if (OPERATORS.has(beforeCursor.slice(-1)) || beforeCursor.endsWith("(") || beforeCursor.endsWith(",")) append("frac(");
    else commit(`frac(${beforeCursor},)${afterCursor}`, beforeCursor.length + 6);
  };

  const moveCursor = (direction: "left" | "right" | "up" | "down") => {
    const expression = timeline.present;
    if (direction === "left" || direction === "right") {
      const step = direction === "left" ? -1 : 1;
      let next = Math.min(Math.max(0, cursorIndex + step), expression.length);
      if (direction === "left") while (next > 0 && /[A-Za-z]/.test(expression[next - 1])) next -= 1;
      else while (next < expression.length && /[A-Za-z]/.test(expression[next])) next += 1;
      setCursorIndex(next);
      inputRef.current?.focus();
      return;
    }

    const fraction = findFractionRange(expression, cursorIndex);
    if (fraction) {
      const numeratorLength = fraction.comma - fraction.numeratorStart;
      const denominatorLength = fraction.end - fraction.denominatorStart;
      if (direction === "down" && cursorIndex <= fraction.comma) {
        const offset = Math.max(0, cursorIndex - fraction.numeratorStart);
        setCursorIndex(fraction.denominatorStart + Math.min(offset, denominatorLength));
        return;
      }
      if (direction === "up" && cursorIndex >= fraction.denominatorStart) {
        const offset = Math.max(0, cursorIndex - fraction.denominatorStart);
        setCursorIndex(fraction.numeratorStart + Math.min(offset, numeratorLength));
        return;
      }
    }
    setCursorIndex(direction === "up" ? 0 : expression.length);
    inputRef.current?.focus();
  };

  const deleteBeforeCursor = () => {
    if (!cursorIndex) return;
    const current = timeline.present;
    let start = cursorIndex - 1;
    if (/[A-Za-z]/.test(current[start])) while (start > 0 && /[A-Za-z]/.test(current[start - 1])) start -= 1;
    commit(`${current.slice(0, start)}${current.slice(cursorIndex)}`, start);
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
        x: Math.min(Math.max(PANEL_GUTTER, originX + moveEvent.clientX - startX), Math.max(PANEL_GUTTER, window.innerWidth - panelWidth - PANEL_GUTTER)),
        y: Math.min(Math.max(PANEL_GUTTER, originY + moveEvent.clientY - startY), Math.max(PANEL_GUTTER, window.innerHeight - panelHeight - PANEL_GUTTER)),
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

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const originWidth = rect.width;
    const originHeight = rect.height;
    const originX = rect.left;
    const originY = rect.top;
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const maxWidth = Math.max(1, window.innerWidth - originX - PANEL_GUTTER);
      const maxHeight = Math.max(1, window.innerHeight - originY - PANEL_GUTTER);
      setSize({
        width: clampPanelDimension(originWidth + moveEvent.clientX - startX, MIN_PANEL_WIDTH, maxWidth),
        height: clampPanelDimension(originHeight + moveEvent.clientY - startY, MIN_PANEL_HEIGHT, maxHeight),
      });
    };
    const stop = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      resizeCleanupRef.current();
      setResizing(false);
    };
    resizeCleanupRef.current();
    resizeCleanupRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    setPosition({ x: originX, y: originY });
    setSize({ width: originWidth, height: originHeight });
    setResizing(true);
    event.preventDefault();
    event.stopPropagation();
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!panelRef.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const rect = panelRef.current.getBoundingClientRect();
    const maxWidth = Math.max(1, window.innerWidth - rect.left - PANEL_GUTTER);
    const maxHeight = Math.max(1, window.innerHeight - rect.top - PANEL_GUTTER);
    const step = event.shiftKey ? 40 : 16;
    const widthDelta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const heightDelta = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    setPosition({ x: rect.left, y: rect.top });
    setSize({
      width: clampPanelDimension(rect.width + widthDelta, MIN_PANEL_WIDTH, maxWidth),
      height: clampPanelDimension(rect.height + heightDelta, MIN_PANEL_HEIGHT, maxHeight),
    });
    event.preventDefault();
  };

  const resetPanel = () => {
    setPosition(null);
    setSize(null);
  };

  const panelStyle: CSSProperties | undefined = position || size ? {
    ...(position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : {}),
    ...(size ? { width: size.width, height: size.height } : {}),
  } : undefined;
  const currentFunction = (normal: string, inverse: string) => secondMode ? inverse : normal;

  return (
    <div className={`scientific-calculator ${open ? "open" : ""}`}>
      {open && (
        <section ref={panelRef} style={panelStyle} className={`calculator-panel ${dragging ? "dragging" : ""} ${resizing ? "resizing" : ""}`} id="revit-scientific-calculator" role="dialog" aria-labelledby="calculator-title">
          <header className="calculator-header" onPointerDown={startDrag}>
            <div className="calculator-drag-title"><span className="calculator-grip" aria-hidden="true">⠿</span><div><span className="calculator-kicker">Natural display</span><h2 id="calculator-title">Scientific calculator</h2></div></div>
            <div className="calculator-header-actions">
              <button type="button" onClick={undo} disabled={!timeline.past.length} aria-label="Undo calculator input" title="Undo"><HistoryIcon direction="undo" /></button>
              <button type="button" onClick={redo} disabled={!timeline.future.length} aria-label="Redo calculator input" title="Redo"><HistoryIcon direction="redo" /></button>
              <button type="button" onClick={resetPanel} disabled={!position && !size} aria-label="Reset calculator position and size" title="Reset position and size">⌖</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close calculator" title="Close">×</button>
            </div>
          </header>

          <div className="calculator-body">
            <div className="calculator-status-bar">
            <span className={secondMode ? "active" : ""}>2ND</span>
            <span className={memory ? "active" : ""}>M</span>
            <button type="button" onClick={() => setAngleMode((current) => current === "deg" ? "rad" : "deg")} aria-label={`Angle mode: ${angleMode === "deg" ? "degrees" : "radians"}. Click to change.`}>{angleMode.toUpperCase()}</button>
            <span>Math</span>
            <span>{resultMode === "fraction" ? "FRC" : "DEC"}</span>
          </div>

          <div className="calculator-display">
            <div className="calculator-natural-display" aria-hidden="true">
              {naturalExpressionHtml
                ? <span dangerouslySetInnerHTML={{ __html: naturalExpressionHtml }} />
                : <span className="calculator-placeholder">{timeline.present || "0"}</span>}
            </div>
            <label className="sr-only" htmlFor="calculator-expression">Calculator expression</label>
            <input
              className="calculator-expression-source"
              ref={inputRef}
              id="calculator-expression"
              value={timeline.present}
              onChange={(event) => commit(event.target.value, event.target.selectionStart ?? event.target.value.length)}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); calculate(); }
                else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                  event.preventDefault();
                  moveCursor(event.key.replace("Arrow", "").toLowerCase() as "left" | "right" | "up" | "down");
                }
              }}
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
            />
            <output className={calculationError ? "error" : ""} aria-live="polite">
              {calculationError
                ? calculationError
                : preview && <span dangerouslySetInnerHTML={{ __html: preview.resultHtml }} />}
            </output>
          </div>

          <div className="calculator-navigation" role="group" aria-label="Expression navigation">
            <button type="button" className="calculator-nav-up" onClick={() => moveCursor("up")} aria-label="Move cursor up">▲</button>
            <button type="button" className="calculator-nav-left" onClick={() => moveCursor("left")} aria-label="Move cursor left">◀</button>
            <button type="button" className="calculator-nav-center" onClick={() => { setCursorIndex(timeline.present.length); inputRef.current?.focus(); }} aria-label="Move cursor to end" title="Move to end">●</button>
            <button type="button" className="calculator-nav-right" onClick={() => moveCursor("right")} aria-label="Move cursor right">▶</button>
            <button type="button" className="calculator-nav-down" onClick={() => moveCursor("down")} aria-label="Move cursor down">▼</button>
          </div>

          <div className="calculator-keypad" aria-label="Calculator keypad">
            <button type="button" className={`shift-key ${secondMode ? "active" : ""}`} onClick={() => setSecondMode((current) => !current)}>2nd</button>
            <button type="button" className="function-key fraction-key" onClick={insertFraction} aria-label="Insert fraction"><span aria-hidden="true"><i>□</i><i>□</i></span></button>
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
            <button type="button" className="delete-key" onClick={deleteBeforeCursor}>DEL</button>
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
            <p className="calculator-drag-note" id="calculator-resize-instructions">Drag the title bar to move<span className="calculator-resize-note"> · drag the lower-right corner to resize</span></p>
            </div>
          <button className="calculator-resize-handle" type="button" onPointerDown={startResize} onKeyDown={resizeWithKeyboard} aria-label="Resize calculator" aria-describedby="calculator-resize-instructions" title="Drag to resize; use arrow keys for precise control"><span aria-hidden="true">↘</span></button>
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
