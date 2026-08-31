"use client";

import { useEffect, useRef, useState } from "react";
import {
  reviewTimerProgress,
  reviewTimerVisualState,
  type ReviewTimerDuration,
} from "../lib/reviewTimer";
import styles from "./QuestionTimer.module.css";

type QuestionTimerProps = {
  durationSeconds: ReviewTimerDuration;
  questionKey: string;
  paused: boolean;
  onExpire: () => void;
};

export default function QuestionTimer({ durationSeconds, questionKey, paused, onExpire }: QuestionTimerProps) {
  const [remainingMilliseconds, setRemainingMilliseconds] = useState(durationSeconds * 1000);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (paused) return;
    const durationMilliseconds = durationSeconds * 1000;
    const deadline = performance.now() + durationMilliseconds;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let interval = 0;
    let expired = false;

    const update = () => {
      const nextRemaining = Math.max(0, deadline - performance.now());
      setRemainingMilliseconds(nextRemaining);
      if (nextRemaining === 0 && !expired) {
        expired = true;
        onExpireRef.current();
      }
      return nextRemaining;
    };

    if (reducedMotion) {
      interval = window.setInterval(update, 250);
    } else {
      const tick = () => {
        if (update() > 0) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [durationSeconds, paused, questionKey]);

  const remainingSeconds = Math.ceil(remainingMilliseconds / 1000);
  const progress = reviewTimerProgress(remainingMilliseconds, durationSeconds);
  const visualState = reviewTimerVisualState(remainingSeconds, durationSeconds);
  const timerColor = visualState === "critical"
    ? "var(--danger)"
    : visualState === "approaching"
      ? "var(--amber)"
      : "var(--green)";

  return (
    <div
      className={`${styles.timer} ${styles[visualState]} ${paused ? styles.paused : ""}`}
      role="timer"
      aria-label={`${remainingSeconds} seconds remaining`}
      aria-atomic="true"
      style={{ position: "relative", width: 112, height: 112, flex: "0 0 auto", color: timerColor }}
    >
      <svg
        width="112"
        height="112"
        viewBox="0 0 120 120"
        fill="none"
        aria-hidden="true"
        style={{ display: "block", width: "100%", height: "100%" }}
      >
        <circle className={styles.track} cx="60" cy="60" r="52" pathLength="100" fill="none" stroke="var(--surface-soft)" strokeWidth="8" />
        <circle
          className={styles.progress}
          cx="60"
          cy="60"
          r="52"
          pathLength="100"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="100"
          strokeDashoffset={100 - progress * 100}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span
        className={styles.value}
        style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", justifyItems: "center", color: "var(--ink)" }}
      >
        <strong style={{ color: "var(--ink)", fontSize: 29, fontVariantNumeric: "tabular-nums" }}>{remainingSeconds}</strong>
        <small style={{ color: "var(--muted)", display: "block", marginTop: 6 }}>seconds</small>
      </span>
    </div>
  );
}
