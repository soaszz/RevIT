"use client";

import { useEffect, useId, useState } from "react";
import { LANDING_DEMO_MCQS, type LandingDemoMcq } from "../data/landingDemoContent";
import styles from "./LandingMcqDemo.module.css";

type Props = {
  question?: LandingDemoMcq;
  startHref?: string;
};

export default function LandingMcqDemo({ question, startHref = "/auth?mode=register#account" }: Props) {
  const [activeQuestion, setActiveQuestion] = useState<LandingDemoMcq>(question ?? LANDING_DEMO_MCQS[0]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const formGroupId = useId();

  useEffect(() => {
    if (!question) {
      const randomIndex = Math.floor(Math.random() * LANDING_DEMO_MCQS.length);
      setActiveQuestion(LANDING_DEMO_MCQS[randomIndex]);
    }
  }, [question]);

  const isCorrect = selectedOption !== null && selectedOption === activeQuestion.correctAnswer;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (selectedOption === null || submitted) return;
    setSubmitted(true);
  }

  return (
    <div className={styles.demoCard} aria-labelledby={`${formGroupId}-heading`}>
      <div className={styles.demoHeader}>
        <div>
          <span className={styles.categoryPill}>{activeQuestion.subject}</span>
          <p className={styles.topicSubtitle}>{activeQuestion.topic}</p>
        </div>
        <span className={styles.modeBadge} aria-label="Interactive demo mode">
          <span className={styles.pulseDot} aria-hidden="true" />
          Interactive Demo
        </span>
      </div>

      <h3 id={`${formGroupId}-heading`} className={styles.prompt}>
        {activeQuestion.prompt}
      </h3>

      <form onSubmit={handleSubmit} className={styles.form}>
        <fieldset className={styles.fieldset} disabled={submitted}>
          <legend className="sr-only">Choose an answer</legend>
          <div className={styles.choices} role="radiogroup" aria-label="Answer choices">
            {activeQuestion.choices.map((choice, index) => {
              const letter = String.fromCharCode(65 + index);
              const isSelected = selectedOption === index;
              const isOptionCorrect = index === activeQuestion.correctAnswer;

              let choiceStateClass = "";
              if (submitted) {
                if (isOptionCorrect) {
                  choiceStateClass = styles.choiceCorrect;
                } else if (isSelected) {
                  choiceStateClass = styles.choiceWrong;
                } else {
                  choiceStateClass = styles.choiceDimmed;
                }
              } else if (isSelected) {
                choiceStateClass = styles.choiceSelected;
              }

              return (
                <label
                  key={index}
                  className={`${styles.choiceLabel} ${choiceStateClass}`}
                  htmlFor={`${formGroupId}-opt-${index}`}
                >
                  <input
                    id={`${formGroupId}-opt-${index}`}
                    type="radio"
                    name={`${formGroupId}-radio`}
                    value={index}
                    checked={isSelected}
                    onChange={() => !submitted && setSelectedOption(index)}
                    disabled={submitted}
                    className={styles.radioInput}
                  />
                  <span className={styles.choiceIndex} aria-hidden="true">
                    {letter}
                  </span>
                  <span className={styles.choiceText}>{choice}</span>
                  {submitted && isOptionCorrect && (
                    <span className={styles.resultIconCorrect} aria-label="Correct answer">
                      ✓
                    </span>
                  )}
                  {submitted && isSelected && !isOptionCorrect && (
                    <span className={styles.resultIconWrong} aria-label="Incorrect answer">
                      ✕
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        {!submitted ? (
          <div className={styles.actions}>
            <button
              className="primary-button"
              type="submit"
              disabled={selectedOption === null}
              style={{ minHeight: "44px", padding: "10px 22px" }}
            >
              Check Answer
            </button>
            <span className={styles.helperText}>Select one answer to verify</span>
          </div>
        ) : (
          <div
            className={`${styles.feedbackCard} ${isCorrect ? styles.feedbackCorrect : styles.feedbackWrong}`}
            role="status"
            aria-live="polite"
          >
            <div className={styles.feedbackTop}>
              <span className={styles.feedbackMark} aria-hidden="true">
                {isCorrect ? "✓" : "✕"}
              </span>
              <div>
                <strong>{isCorrect ? "Correct answer!" : "Incorrect"}</strong>
                <p className={styles.correctReveal}>
                  Correct: <b>{String.fromCharCode(65 + activeQuestion.correctAnswer)}. {activeQuestion.choices[activeQuestion.correctAnswer]}</b>
                </p>
              </div>
            </div>

            <div className={styles.rationaleBlock}>
              <span className={styles.rationaleKicker}>Rationale</span>
              <p className={styles.rationaleText}>{activeQuestion.explanation}</p>
            </div>

            <div className={styles.followupCta}>
              <div>
                <p className={styles.ctaTitle}>Ready for more?</p>
                <p className={styles.ctaSubtitle}>Practice 999+ free medical technology board questions.</p>
              </div>
              <a className="primary-button" href={startHref}>
                Start Reviewing Free <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
