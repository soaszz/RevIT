"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReviewTimerDuration } from "../lib/reviewTimer";
import type { ReviewMode, QuestionAttempt } from "../lib/domain";

export type SavedRecentSession = {
  id: string;
  poolIds: string[];
  targetCount: number;
  questionIds: string[];
  choiceOrders: Record<string, number[]>;
  strictWrongOnly: boolean;
  sessionMode: ReviewMode;
  index: number;
  attempts: QuestionAttempt[];
  activeTimer: { enabled: boolean; duration: ReviewTimerDuration };
  selectedTopicIds?: string[];
  wrongAnswersOnly?: boolean;
  book?: "Harr" | "Ciulla" | "all";
  pausedAt: string;
  primaryTopicName: string;
  subjectName: string;
};

type ResumeSessionModalProps = {
  isOpen: boolean;
  session: SavedRecentSession | null;
  onResume: () => void;
  onDismiss: () => void;
  onDiscard: () => void;
};

function formatPausedAgo(isoDateString: string): string {
  try {
    const elapsedMs = Date.now() - new Date(isoDateString).getTime();
    const minutes = Math.max(1, Math.floor(elapsedMs / (60 * 1000)));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "recently";
  }
}

export default function ResumeSessionModal({
  isOpen,
  session,
  onResume,
  onDismiss,
  onDiscard,
}: ResumeSessionModalProps) {
  const [mounted, setMounted] = useState(false);
  const resumeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";

    const timer = setTimeout(() => resumeBtnRef.current?.focus(), 15);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onDismiss]);

  if (!isOpen || !mounted || !session) return null;

  const progressPercent = Math.min(100, Math.round(((session.index + 1) / Math.max(session.targetCount, 1)) * 100));

  const modal = (
    <div
      className="confirm-bg-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-session-title"
    >
      <div className="confirm-modal resume-session-modal" style={{ maxWidth: "460px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 9px",
              borderRadius: "99px",
              background: "var(--surface-tint)",
              color: "var(--green)",
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: ".06em",
              textTransform: "uppercase",
            }}
          >
            <span style={{ fontSize: "12px", lineHeight: 1 }}>⏱</span> Paused Session
          </span>
          <span style={{ color: "var(--muted)", fontSize: "11px" }}>
            Paused {formatPausedAgo(session.pausedAt)}
          </span>
        </div>

        <h2 id="resume-session-title" style={{ margin: "6px 0 8px", fontSize: "21px", letterSpacing: "-.03em" }}>
          Continue recent session?
        </h2>
        <p style={{ margin: "0 0 18px", color: "var(--muted)", fontSize: "13px", lineHeight: "1.55" }}>
          You have an active review session saved. Would you like to pick up where you left off?
        </p>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: "var(--surface-soft)",
            border: "1px solid var(--line)",
            marginBottom: "22px",
          }}
        >
          <div style={{ color: "var(--green)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
            {session.subjectName}{session.book ? ` · ${session.book}` : ""}
          </div>
          <div style={{ color: "var(--ink)", fontSize: "15px", fontWeight: 750, marginTop: "3px", letterSpacing: "-.02em" }}>
            {session.primaryTopicName}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", marginTop: "10px", marginBottom: "6px" }}>
            <span>Question {session.index + 1} of {session.targetCount}</span>
            <span>{progressPercent}% completed</span>
          </div>
          <div style={{ width: "100%", height: "6px", borderRadius: "99px", background: "color-mix(in srgb, var(--line) 80%, transparent)", overflow: "hidden" }}>
            <div style={{ width: `${progressPercent}%`, height: "100%", background: "var(--green)", borderRadius: "99px", transition: "width .2s ease" }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="text-button quiet"
            onClick={onDiscard}
            style={{ color: "var(--danger)", fontSize: "12px", padding: "6px 8px" }}
            title="Discard this saved session"
          >
            Discard
          </button>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="text-button quiet"
              onClick={onDismiss}
              style={{ fontSize: "13px" }}
            >
              Not now
            </button>
            <button
              ref={resumeBtnRef}
              type="button"
              className="primary-button"
              onClick={onResume}
              style={{ padding: "10px 20px", fontSize: "13px" }}
            >
              Continue session
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
