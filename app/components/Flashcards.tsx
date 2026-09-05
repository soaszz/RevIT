"use client";

import { useEffect, useMemo, useState } from "react";
import {
  questions,
  subjectById,
  subjects,
  topicById,
  topics,
} from "../content/reviewerContent";
import { buildFlashcardDeck, shuffleFlashcards, type Flashcard } from "../lib/flashcards";
import styles from "./Flashcards.module.css";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export default function Flashcards() {
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const topicQuestionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of questions) {
      counts.set(question.topicId, (counts.get(question.topicId) ?? 0) + 1);
    }
    return counts;
  }, []);

  const availableCards = useMemo(
    () => selectedTopicIds.reduce((total, topicId) => total + (topicQuestionCounts.get(topicId) ?? 0), 0),
    [selectedTopicIds, topicQuestionCounts],
  );

  const currentCard = deck[cardIndex];
  const reviewing = deck.length > 0;

  useEffect(() => {
    if (!reviewing) return;

    function handleKeyboard(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      if (event.code === "Space") {
        if (event.target instanceof HTMLElement && event.target.closest("button, a")) return;
        event.preventDefault();
        setFlipped((current) => !current);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCardIndex((current) => Math.max(0, current - 1));
        setFlipped(false);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCardIndex((current) => Math.min(deck.length - 1, current + 1));
        setFlipped(false);
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [deck.length, reviewing]);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((current) => current.includes(topicId)
      ? current.filter((id) => id !== topicId)
      : [...current, topicId]);
  }

  function toggleSubject(subjectId: string) {
    const subjectTopicIds = topics.filter((topic) => topic.subjectId === subjectId).map((topic) => topic.id);
    const allSelected = subjectTopicIds.every((id) => selectedTopicIds.includes(id));
    setSelectedTopicIds((current) => allSelected
      ? current.filter((id) => !subjectTopicIds.includes(id))
      : [...new Set([...current, ...subjectTopicIds])]);
  }

  function startReviewing() {
    const nextDeck = buildFlashcardDeck(questions, selectedTopicIds);
    if (!nextDeck.length) return;
    setDeck(nextDeck);
    setCardIndex(0);
    setFlipped(false);
  }

  function changeTopics() {
    setDeck([]);
    setCardIndex(0);
    setFlipped(false);
  }

  function moveCard(offset: -1 | 1) {
    setCardIndex((current) => Math.min(deck.length - 1, Math.max(0, current + offset)));
    setFlipped(false);
  }

  function shuffleDeck() {
    setDeck((current) => shuffleFlashcards(current));
    setCardIndex(0);
    setFlipped(false);
  }

  function toggleCard() {
    setFlipped((current) => !current);
  }

  if (reviewing && currentCard) {
    const subjectName = subjectById.get(currentCard.subjectId)?.name ?? "Uncategorized";
    const topicName = topicById.get(currentCard.topicId)?.name ?? "Uncategorized";

    return (
      <div className={styles.reviewerShell}>
        <div className={styles.sessionToolbar}>
          <div>
            <p className="eyebrow">Passive review</p>
            <strong>{deck.length} cards from {selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"}</strong>
          </div>
          <div className={styles.toolbarActions}>
            <button className="text-button" type="button" onClick={shuffleDeck}>Shuffle</button>
            <button className="text-button quiet" type="button" onClick={changeTopics}>Change topics</button>
          </div>
        </div>

        <div className={`${styles.cardStage} ${flipped ? styles.flipped : ""}`} aria-live="polite">
          <article className={`${styles.cardFace} ${styles.cardFront}`} aria-hidden={flipped}>
            <button
              className={styles.cardHitArea}
              type="button"
              tabIndex={flipped ? -1 : 0}
              aria-label={`Show answer for: ${currentCard.prompt}`}
              onClick={toggleCard}
            />
            <div className={styles.cardTopline}>
              <div>
                <p className={styles.subjectLabel}>{subjectName}</p>
                <p className={styles.topicLabel}>{topicName}</p>
              </div>
              <span>{cardIndex + 1} / {deck.length}</span>
            </div>
            <div className={styles.questionArea}>
              <h2>{currentCard.prompt}</h2>
            </div>
            <button className={`${styles.flipControl} primary-button`} type="button" tabIndex={flipped ? -1 : 0} onClick={toggleCard}>
              Flip card
            </button>
          </article>

          <article className={`${styles.cardFace} ${styles.cardBack}`} aria-hidden={!flipped}>
            <button
              className={styles.cardHitArea}
              type="button"
              tabIndex={flipped ? 0 : -1}
              aria-label={`Show question. Answer: ${currentCard.answer}`}
              onClick={toggleCard}
            />
            <div className={styles.answerBlock}>
              <p className={styles.sideLabel}>Answer</p>
              <h2>{currentCard.answer}</h2>
            </div>
            <div className={styles.explanationBlock}>
              <p className={styles.sideLabel}>Explanation</p>
              <p>{currentCard.explanation}</p>
            </div>
            <button className={`${styles.flipControl} secondary-button`} type="button" tabIndex={flipped ? 0 : -1} onClick={toggleCard}>
              Flip back
            </button>
          </article>
        </div>

        <div className={styles.navigation} aria-label="Flashcard navigation">
          <button className="secondary-button" type="button" onClick={() => moveCard(-1)} disabled={cardIndex === 0}>
            <span aria-hidden="true">←</span> Previous
          </button>
          <span aria-live="polite">Card {cardIndex + 1} of {deck.length}</span>
          <button className="primary-button" type="button" onClick={() => moveCard(1)} disabled={cardIndex === deck.length - 1}>
            Next <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className={styles.keyboardHint}>Tip: use Space to flip and the arrow keys to move between cards.</p>
      </div>
    );
  }

  return (
    <div className="library-shell">
      <div className="library-layout">
        <div className="subject-list">
          {subjects.map((subject) => {
            const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
            const subjectSelected = subjectTopics.filter((topic) => selectedTopicIds.includes(topic.id)).length;
            const subjectFullySelected = subjectTopics.length > 0 && subjectSelected === subjectTopics.length;
            const subjectCardCount = subjectTopics.reduce(
              (total, topic) => total + (topicQuestionCounts.get(topic.id) ?? 0),
              0,
            );

            return (
              <section className="subject-card" key={subject.id}>
                <div className="subject-heading">
                  <div>
                    <p className="eyebrow">{subjectCardCount} flashcards</p>
                    <h2>{subject.name}</h2>
                    <p>{subject.description}</p>
                  </div>
                  <button className="text-button" type="button" onClick={() => toggleSubject(subject.id)}>
                    {subjectFullySelected ? "Unselect subject" : "Select subject"}
                  </button>
                </div>
                <div className="topic-selection-grid">
                  {subjectTopics.map((topic) => {
                    const count = topicQuestionCounts.get(topic.id) ?? 0;
                    const selected = selectedTopicIds.includes(topic.id);
                    return (
                      <label className={`topic-select-card ${selected ? "selected" : ""}`} key={topic.id}>
                        <input type="checkbox" checked={selected} onChange={() => toggleTopic(topic.id)} />
                        <span className="topic-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                        <span className="topic-select-copy">
                          <strong>{topic.name}</strong>
                          <small>{topic.description}</small>
                          <em>{count} card{count === 1 ? "" : "s"}</em>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="subject-selection-note">{subjectSelected} of {subjectTopics.length} topics selected</p>
              </section>
            );
          })}
        </div>

        <aside className="selection-panel">
          <p className="eyebrow">Deck setup</p>
          <h2>{selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"} selected</h2>
          <p>{availableCards} card{availableCards === 1 ? " is" : "s are"} available from your selection.</p>
          <div className="selection-controls">
            <button className="text-button" type="button" onClick={() => setSelectedTopicIds(topics.map((topic) => topic.id))}>Select all</button>
            <button className="text-button quiet" type="button" onClick={() => setSelectedTopicIds([])}>Clear all</button>
          </div>
          <button className="primary-button wide" type="button" onClick={startReviewing} disabled={!availableCards}>
            Start reviewing
          </button>
        </aside>
      </div>
    </div>
  );
}
