"use client";

import { useEffect, useRef, useState } from "react";
import {
  reviewTimerProgress,
  reviewTimerVisualState,
  type ReviewTimerDuration,
} from "../lib/reviewTimer";

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

  return (
    <div
      className={`question-timer ${visualState} ${paused ? "paused" : ""}`}
      role="timer"
      aria-label={`${remainingSeconds} seconds remaining`}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="question-timer-track" cx="60" cy="60" r="52" pathLength="100" />
        <circle
          className="question-timer-progress"
          cx="60"
          cy="60"
          r="52"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - progress * 100}
        />
      </svg>
      <span className="question-timer-value"><strong>{remainingSeconds}</strong><small>seconds</small></span>
    </div>
  );
}
