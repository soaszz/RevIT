"use client";

import type { CSSProperties } from "react";
import { motion } from "motion/react";
import styles from "./ReviewModeSwitch.module.css";

export type ReviewLibraryMode = "mcqs" | "flashcards";

type ReviewModeSwitchProps = {
  mode: ReviewLibraryMode;
  onChange: (mode: ReviewLibraryMode) => void;
};

const modes: Array<{ id: ReviewLibraryMode; label: string; icon: string }> = [
  { id: "mcqs", label: "MCQs", icon: "/icons/mcqs.svg" },
  { id: "flashcards", label: "Flashcards", icon: "/icons/flashcards.svg" },
];

export default function ReviewModeSwitch({ mode, onChange }: ReviewModeSwitchProps) {
  return (
    <div className={styles.switcher}>
      <span className={styles.label}>Review mode</span>
      <div className={styles.options} role="group" aria-label="Choose review mode">
        {modes.map((option) => {
          const isActive = mode === option.id;
          return (
            <motion.button
              className={`${styles.option} ${isActive ? styles.active : ""}`}
              type="button"
              key={option.id}
              aria-pressed={isActive}
              onClick={() => onChange(option.id)}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 26 }}
              style={{ position: "relative" }}
            >
              {isActive && (
                <motion.span
                  layoutId="activeReviewModePill"
                  className={styles.activePill}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                />
              )}
              <span
                className={styles.icon}
                style={{ "--review-mode-icon": `url("${option.icon}")`, position: "relative", zIndex: 1 } as CSSProperties}
                aria-hidden="true"
              />
              <span style={{ position: "relative", zIndex: 1 }}>{option.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
