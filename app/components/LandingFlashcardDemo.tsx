"use client";

import { useEffect, useId, useState } from "react";
import { LANDING_DEMO_FLASHCARDS, type LandingDemoFlashcard } from "../data/landingDemoContent";
import styles from "./LandingFlashcardDemo.module.css";

type Props = {
  card?: LandingDemoFlashcard;
};

export default function LandingFlashcardDemo({ card }: Props) {
  const [activeCard, setActiveCard] = useState<LandingDemoFlashcard>(card ?? LANDING_DEMO_FLASHCARDS[0]);
  const [flipped, setFlipped] = useState(false);
  const cardId = useId();

  useEffect(() => {
    if (!card) {
      const randomIndex = Math.floor(Math.random() * LANDING_DEMO_FLASHCARDS.length);
      setActiveCard(LANDING_DEMO_FLASHCARDS[randomIndex]);
    }
  }, [card]);

  function toggleFlip() {
    setFlipped((current) => !current);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.code === "Space" || event.key === "Enter") {
      event.preventDefault();
      toggleFlip();
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.stage} aria-live="polite">
        <div
          className={`${styles.card} ${flipped ? styles.cardFlipped : ""}`}
          tabIndex={0}
          role="button"
          aria-pressed={flipped}
          aria-label={
            flipped
              ? `Flashcard back. Answer: ${activeCard.answer}. Press space to flip back.`
              : `Flashcard front. Question: ${activeCard.prompt}. Press space to see answer.`
          }
          onClick={toggleFlip}
          onKeyDown={handleKeyDown}
        >
          {/* Front Face */}
          <article className={`${styles.face} ${styles.faceFront}`} aria-hidden={flipped}>
            <div className={styles.topline}>
              <div>
                <span className={styles.subjectPill}>{activeCard.subject}</span>
                <p className={styles.topicText}>{activeCard.topic}</p>
              </div>
              <span className={styles.modeBadge}>Flashcard Demo</span>
            </div>

            <div className={styles.questionContainer}>
              <p className={styles.prompt}>{activeCard.prompt}</p>
            </div>

            <div className={styles.bottomBar}>
              <span className={styles.hintText}>Click card or tap button to reveal</span>
              <button
                className={`primary-button ${styles.flipButton}`}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFlip();
                }}
              >
                Flip Card <span aria-hidden="true">↻</span>
              </button>
            </div>
          </article>

          {/* Back Face */}
          <article className={`${styles.face} ${styles.faceBack}`} aria-hidden={!flipped}>
            <div className={styles.topline}>
              <div>
                <span className={styles.subjectPill}>{activeCard.subject}</span>
                <p className={styles.topicText}>{activeCard.topic}</p>
              </div>
              <span className={styles.sideBadge}>Answer Revealed</span>
            </div>

            <div className={styles.answerContainer}>
              <div className={styles.answerBlock}>
                <span className={styles.sectionKicker}>Answer</span>
                <h4 className={styles.answerTitle}>{activeCard.answer}</h4>
              </div>

              <div className={styles.explanationBlock}>
                <span className={styles.sectionKicker}>Explanation</span>
                <p className={styles.explanationText}>{activeCard.explanation}</p>
              </div>
            </div>

            <div className={styles.bottomBar}>
              <span className={styles.hintText}>Click anywhere to flip back</span>
              <button
                className={`secondary-button ${styles.flipButton}`}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFlip();
                }}
              >
                Flip Back <span aria-hidden="true">↺</span>
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
