import type { CSSProperties } from "react";
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
        {modes.map((option) => (
          <button
            className={`${styles.option} ${mode === option.id ? styles.active : ""}`}
            type="button"
            key={option.id}
            aria-pressed={mode === option.id}
            onClick={() => onChange(option.id)}
          >
            <span
              className={styles.icon}
              style={{ "--review-mode-icon": `url("${option.icon}")` } as CSSProperties}
              aria-hidden="true"
            />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
