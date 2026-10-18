"use client";

import type { ReviewerQuestion } from "../content/reviewerContent";
import { parseMatchingChoice } from "../lib/matchingQuestion";
import styles from "./MatchingQuestion.module.css";

type Props = {
  question: ReviewerQuestion;
  selectedAnswers: number[];
  revealed: boolean;
  onChange: (itemIndex: number, answerIndex: number) => void;
};

export { parseMatchingChoice };

export default function MatchingQuestion({ question, selectedAnswers, revealed, onChange }: Props) {
  const matching = question.matching;
  if (!matching) return null;

  const parsedChoices = question.choices.map((choice, index) => parseMatchingChoice(choice, index));

  return (
    <div className={styles.matchingContainer}>
      <section className={styles.bankSection} aria-label="Answer bank">
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Answer Bank</h3>
          <span className={styles.countMeta}>{parsedChoices.length} options</span>
        </div>
        <div className={styles.bankGrid}>
          {parsedChoices.map((choice) => (
            <div key={choice.id} className={styles.bankCard}>
              <span className={styles.bankLabel}>{choice.label}</span>
              <span className={styles.bankText}>{choice.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.statementsSection} aria-label="Statements to match">
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Statements to Match</h3>
          <span className={styles.countMeta}>{matching.items.length} items</span>
        </div>
        <div className={styles.statementList}>
          {matching.items.map((item, index) => {
            const selectedIdx = selectedAnswers[index];
            const correctKey = matching.answerKey[index];
            const isCorrect = revealed && selectedIdx === correctKey;
            const isWrong = revealed && selectedIdx !== correctKey;
            const correctChoice = parsedChoices[correctKey];

            return (
              <div
                key={index}
                className={`${styles.statementCard} ${revealed ? (isCorrect ? styles.cardCorrect : styles.cardWrong) : ""}`}
              >
                <div className={styles.statementContent}>
                  <span className={styles.statementIndex}>{index + 1}.</span>
                  <span className={styles.statementText}>{item}</span>
                </div>

                <div className={styles.statementControl}>
                  <select
                    id={`match-select-${question.id}-${index}`}
                    aria-label={`Match statement ${index + 1}: ${item}`}
                    value={selectedIdx !== undefined && selectedIdx >= 0 ? selectedIdx : ""}
                    onChange={(event) => onChange(index, Number(event.target.value))}
                    disabled={revealed}
                    className={styles.selectInput}
                  >
                    <option value="" disabled>Select match...</option>
                    {parsedChoices.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.label} · {choice.text}
                      </option>
                    ))}
                  </select>

                  {revealed && correctChoice && (
                    <div className={styles.feedbackRow} aria-live="polite">
                      {isCorrect ? (
                        <span className={styles.feedbackCorrect}>
                          ✓ Correct: {correctChoice.label} · {correctChoice.text}
                        </span>
                      ) : (
                        <span className={styles.feedbackWrong}>
                          ✗ Correct: {correctChoice.label} · {correctChoice.text}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
