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
import { buildSubjectSections, filterSubjectsBySearch } from "../lib/reviewerLibrary";
import styles from "./Flashcards.module.css";
import LibrarySearch from "./LibrarySearch";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export default function Flashcards({ isNuRevit, onReviewingChange, onRequestConfirm }: { isNuRevit: boolean; onReviewingChange?: (reviewing: boolean, topics?: string[]) => void; onRequestConfirm?: (title: string, message: string, confirmLabel: string, action: () => void) => void }) {
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<string[]>([]);

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
  const visibleSubjects = useMemo(
    () => filterSubjectsBySearch(subjects, topics, subjectSearch),
    [subjectSearch],
  );
  const subjectSections = useMemo(
    () => buildSubjectSections(visibleSubjects, isNuRevit),
    [isNuRevit, visibleSubjects],
  );

  const currentCard = deck[cardIndex];
  const reviewing = deck.length > 0;

  useEffect(() => {
    onReviewingChange?.(reviewing, reviewing ? selectedTopicIds : []);
  }, [reviewing, selectedTopicIds, onReviewingChange]);

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

  function toggleSubjectExpanded(subjectId: string) {
    setExpandedSubjectIds((current) =>
      current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId],
    );
  }

  function startReviewing() {
    const nextDeck = buildFlashcardDeck(questions, selectedTopicIds);
    if (!nextDeck.length) return;
    setDeck(nextDeck);
    setCardIndex(0);
    setFlipped(false);
  }

  function changeTopics() {
    const msg = "Are you sure you want to end this review session? Your current progress will be lost.";
    const action = () => {
      setDeck([]);
      setCardIndex(0);
      setFlipped(false);
    };
    if (onRequestConfirm) {
      onRequestConfirm("End review session?", msg, "End session", action);
    } else {
      if (!window.confirm(msg)) return;
      action();
    }
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
            <button className="secondary-button" type="button" onClick={changeTopics}>Exit session</button>
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
              {currentCard.choices && currentCard.choices.length > 0 && (
                <div className={styles.horizontalChoices} role="list" aria-label="Question choices">
                  {currentCard.choices.map((choice, index) => {
                    const cleanChoice = choice.trim().replace(/^[A-D](?:[.):])\s+/, "");
                    const choiceLetter = String.fromCharCode(65 + index);
                    return (
                      <div className={styles.horizontalChoiceItem} key={index} role="listitem">
                        <span className={styles.choiceLetter}>{choiceLetter}</span>
                        <span className={styles.choiceText}>{cleanChoice}</span>
                      </div>
                    );
                  })}
                </div>
              )}
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
      <LibrarySearch
        id="flashcard-library-search"
        isNuRevit={isNuRevit}
        value={subjectSearch}
        resultCount={visibleSubjects.length}
        onChange={setSubjectSearch}
      />
      <div className="library-layout">
        <div className="subject-list">
          {subjectSections.map((section) => (
            <div className="subject-category" key={section.id}>
              {section.title && (
                <div className="subject-category-heading">
                  <div><p className="eyebrow">{isNuRevit ? "NU RevIT collection" : "Standard RevIT collection"}</p><h2>{section.title}</h2></div>
                  {section.description && <p>{section.description}</p>}
                </div>
              )}
              {section.subjects.map((subject) => {
                const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
                const subjectSelected = subjectTopics.filter((topic) => selectedTopicIds.includes(topic.id)).length;
                const subjectFullySelected = subjectTopics.length > 0 && subjectSelected === subjectTopics.length;
                const isExpanded = expandedSubjectIds.includes(subject.id);
                const subjectCardCount = subjectTopics.reduce(
                  (total, topic) => total + (topicQuestionCounts.get(topic.id) ?? 0),
                  0,
                );

                return (
                  <section className={`subject-card ${isExpanded ? "is-expanded" : ""}`} key={subject.id}>
                    <div
                      className="subject-heading subject-heading-clickable"
                      onClick={() => toggleSubjectExpanded(subject.id)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-controls={`flashcard-subject-topics-${subject.id}`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleSubjectExpanded(subject.id);
                        }
                      }}
                    >
                      <div className="subject-heading-info">
                        <div className="subject-heading-meta">
                          <span className="eyebrow">{subjectCardCount} flashcards · {subjectTopics.length} topic{subjectTopics.length === 1 ? "" : "s"}</span>
                          {subjectSelected > 0 && (
                            <span className={`subject-status-badge ${subjectFullySelected ? "fully-selected" : "partially-selected"}`}>
                              {subjectFullySelected ? "All selected" : `${subjectSelected}/${subjectTopics.length} selected`}
                            </span>
                          )}
                        </div>
                        <h2>{subject.name}</h2>
                        <p>{subject.description}</p>
                      </div>
                      <div className="subject-heading-actions" style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                        <button
                          className="text-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleSubject(subject.id);
                          }}
                        >
                          {subjectFullySelected ? "Unselect subject" : "Select subject"}
                        </button>
                        <button
                          className="subject-expand-toggle"
                          type="button"
                          aria-label={isExpanded ? `Hide topics for ${subject.name}` : `Show topics for ${subject.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleSubjectExpanded(subject.id);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "7px 13px",
                            borderRadius: "9px",
                            border: "1px solid var(--line)",
                            background: isExpanded ? "var(--green-soft)" : "var(--surface-soft)",
                            color: isExpanded ? "var(--green-dark)" : "var(--ink)",
                            fontSize: "11px",
                            fontWeight: 650,
                            cursor: "pointer",
                            whiteSpace: "nowrap"
                          }}
                        >
                          <span className="subject-expand-label" style={{ fontSize: "11px", fontWeight: 650 }}>
                            {isExpanded ? "Hide topics" : "Show topics"}
                          </span>
                          <svg
                            className="subject-expand-icon"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            style={{
                              flexShrink: 0,
                              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform 0.22s ease",
                              color: isExpanded ? "var(--green)" : "var(--muted)"
                            }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div
                      id={`flashcard-subject-topics-${subject.id}`}
                      className={`subject-topics-collapse ${isExpanded ? "expanded" : ""}`}
                      style={!isExpanded ? { display: "none" } : undefined}
                      aria-hidden={!isExpanded}
                    >
                      <div className="subject-topics-content">
                        <div className="subject-topics-inner">
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
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          ))}
          {!visibleSubjects.length && (
            <div className="library-empty-state">
              <h2>No subjects found</h2>
              <p>Try another subject or topic name.</p>
              <button className="text-button" type="button" onClick={() => setSubjectSearch("")}>Clear search</button>
            </div>
          )}
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
