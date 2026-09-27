"use client";

import { motion, AnimatePresence } from "motion/react";

type MobileReviewBarProps = {
  selectedTopicCount: number;
  questionCount: number;
  itemLabel?: string;
  onStart: () => void;
  onClear: () => void;
};

export default function MobileReviewBar({
  selectedTopicCount,
  questionCount,
  itemLabel = "question",
  onStart,
  onClear,
}: MobileReviewBarProps) {
  const visible = selectedTopicCount > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="mobile-review-bar"
          initial={{ y: 50, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 50, opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
        >
          <div className="mobile-review-bar-content">
            <div className="mobile-review-bar-info">
              <span className="mobile-review-badge">
                {selectedTopicCount} topic{selectedTopicCount === 1 ? "" : "s"}
              </span>
              <strong className="mobile-review-count">
                {questionCount} {itemLabel}{questionCount === 1 ? "" : "s"}
              </strong>
            </div>

            <div className="mobile-review-bar-actions">
              <button
                type="button"
                className="mobile-review-clear"
                onClick={onClear}
                title="Clear selected topics"
              >
                Clear
              </button>
              <motion.button
                type="button"
                className="mobile-review-start"
                onClick={onStart}
                disabled={questionCount === 0}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
              >
                <span>Start review</span>
                <span aria-hidden="true">→</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
