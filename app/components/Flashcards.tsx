"use client";

import { useEffect, useMemo, useState } from "react";
import {
  questions as freeQuestions,
  subjects as freeSubjects,
  topics as freeTopics,
  type ReviewerBook,
  type ReviewerQuestion,
  type Subject,
  type Topic,
} from "../content/reviewerContent";
import { buildFlashcardDeck, shuffleFlashcards, type Flashcard } from "../lib/flashcards";
import {
  ALL_MAJORS_CATEGORY,
  buildSubjectSections,
  filterSubjectsBySearch,
  getUnifiedSubjects,
  MTAP_1_CATEGORY,
  OTHER_MAJORS_CATEGORY,
  type UnifiedSubject,
} from "../lib/reviewerLibrary";
import reviewerStyles from "./Flashcards.module.css";
import styles from "./ReviewLibrary.module.css";
import CollectionHeader from "./CollectionHeader";
import { QUESTION_BANKS } from "../lib/entitlements";

function isBookLocked(book: ReviewerBook, proActive: boolean): boolean {
  const bank = QUESTION_BANKS[book.toLowerCase() as Lowercase<ReviewerBook>];
  return (bank ? bank.requiredPlan === "pro" : book !== "Harr") && !proActive;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function getBookBadgeStyle(book: "Harr" | "Ciulla" | "Rodak" | "Strasinger" | string, extraStyle?: React.CSSProperties): React.CSSProperties {
  const lower = book.toLowerCase();
  const color = lower === "strasinger" ? "#38bdf8" : lower === "rodak" ? "#fbbf24" : lower === "ciulla" ? "#92e06b" : "#66d0b2";
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: 0,
    borderRadius: 0,
    fontSize: "8.5px",
    fontWeight: 750,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
    flexShrink: 0,
    lineHeight: 1.2,
    border: "none",
    color,
    background: "transparent",
    boxSizing: "border-box",
    ...extraStyle,
  };
}

export default function Flashcards({
  isNuRevit,
  selectedBook: controlledBook,
  proActive = false,
  subjects = freeSubjects,
  topics = freeTopics,
  questions = freeQuestions,
  onSelectBook,
  onReviewingChange,
  onRequestConfirm,
  onUpgradePro,
}: {
  isNuRevit: boolean;
  selectedBook?: ReviewerBook | "all";
  proActive?: boolean;
  subjects?: Subject[];
  topics?: Topic[];
  questions?: ReviewerQuestion[];
  onSelectBook?: (book: ReviewerBook | "all") => void;
  onReviewingChange?: (reviewing: boolean, topics?: string[]) => void;
  onRequestConfirm?: (title: string, message: string, confirmLabel: string, action: () => void) => void;
  onUpgradePro?: () => void;
}) {
  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);

  const [internalBook] = useState<ReviewerBook | "all">(() => {
    if (typeof window === "undefined") return "Harr";
    try {
      const saved = localStorage.getItem("revit-selected-book-v1");
      if (saved === "Harr" || saved === "Ciulla" || saved === "Rodak" || saved === "Strasinger" || saved === "all") return saved;
    } catch {}
    return "Harr";
  });
  const selectedBook = controlledBook ?? internalBook;

  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(new Set());
  const [activeEditionBySubject, setActiveEditionBySubject] = useState<Record<string, ReviewerBook>>({});
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);

  const unifiedSubjects = useMemo(() => {
    return getUnifiedSubjects("all", subjects, topics);
  }, [subjects, topics]);

  const visibleSubjects = useMemo(() => {
    return filterSubjectsBySearch(unifiedSubjects, topics, subjectSearch);
  }, [unifiedSubjects, topics, subjectSearch]);

  const subjectSections = useMemo(() => {
    return buildSubjectSections(visibleSubjects, isNuRevit);
  }, [visibleSubjects, isNuRevit]);

  const topicQuestionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of questions) {
      counts.set(question.topicId, (counts.get(question.topicId) ?? 0) + 1);
    }
    return counts;
  }, [questions]);

  const availableCards = useMemo(
    () => selectedTopicIds.reduce((total, topicId) => total + (topicQuestionCounts.get(topicId) ?? 0), 0),
    [selectedTopicIds, topicQuestionCounts],
  );

  const sourceCounts = useMemo(() => {
    let harr = 0;
    let ciulla = 0;
    let rodak = 0;
    let strasinger = 0;
    const topicMap = new Map(topics.map((t) => [t.id, t]));
    for (const id of selectedTopicIds) {
      const topic = topicMap.get(id);
      const b = topic?.book ?? "Harr";
      if (b === "Strasinger") {
        strasinger += 1;
      } else if (b === "Rodak") {
        rodak += 1;
      } else if (b === "Ciulla") {
        ciulla += 1;
      } else {
        harr += 1;
      }
    }
    return { harr, ciulla, rodak, strasinger };
  }, [selectedTopicIds, topics]);

  const isSearchActive = subjectSearch.trim().length > 0;
  const isMtap1Active = subjectSearch.trim().toLowerCase() === MTAP_1_CATEGORY.toLowerCase();
  const isOtherMajorsActive = subjectSearch.trim().toLowerCase() === OTHER_MAJORS_CATEGORY.toLowerCase();
  const isAllSubjectsActive = !isSearchActive || subjectSearch.trim().toLowerCase() === ALL_MAJORS_CATEGORY.toLowerCase();

  const currentCard = deck[cardIndex];
  const reviewing = deck.length > 0;

  useEffect(() => {
    onReviewingChange?.(reviewing, reviewing ? selectedTopicIds : []);
  }, [reviewing, selectedTopicIds, onReviewingChange]);

  function toggleSubjectExpand(subjectId: string) {
    setExpandedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  }

  function setSubjectEditionTab(subjectId: string, book: ReviewerBook) {
    setActiveEditionBySubject((prev) => ({
      ...prev,
      [subjectId]: book,
    }));
  }

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((current) =>
      current.includes(topicId)
        ? current.filter((id) => id !== topicId)
        : [...current, topicId],
    );
  }

  function toggleSubject(topicIds: string[], isCurrentlyFullySelected: boolean) {
    if (isCurrentlyFullySelected) {
      setSelectedTopicIds((current) => current.filter((id) => !topicIds.includes(id)));
    } else {
      setSelectedTopicIds((current) => [...new Set([...current, ...topicIds])]);
    }
  }

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
    const cardBook = currentCard.book ?? topicById.get(currentCard.topicId)?.book;

    return (
      <div className={`${reviewerStyles.reviewerShell} flashcard-session-active`}>
        <div className={reviewerStyles.sessionToolbar}>
          <div>
            <p className="eyebrow">Passive review{selectedBook !== "all" ? ` · ${selectedBook}` : " · All Books"}</p>
            <strong>{deck.length} cards from {selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"}</strong>
          </div>
          <div className={reviewerStyles.toolbarActions}>
            <button className="text-button" type="button" onClick={shuffleDeck}>Shuffle</button>
            <button className="secondary-button" type="button" onClick={changeTopics}>Exit session</button>
          </div>
        </div>

        <div key={cardIndex}>
          <div className={`${reviewerStyles.cardStage} ${flipped ? reviewerStyles.flipped : ""}`} aria-live="polite">
            <article className={`${reviewerStyles.cardFace} ${reviewerStyles.cardFront}`} aria-hidden={flipped}>
              <button
                className={reviewerStyles.cardHitArea}
                type="button"
                tabIndex={flipped ? -1 : 0}
                aria-label={`Show answer for: ${currentCard.prompt}`}
                onClick={toggleCard}
              />
              <div className={reviewerStyles.cardTopline}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <p className={reviewerStyles.subjectLabel}>{subjectName}</p>
                    {cardBook && (
                      <span className={`topic-book-badge topic-book-${cardBook.toLowerCase()}`} style={getBookBadgeStyle(cardBook, { fontSize: "9px", padding: 0, margin: 0 })}>
                        {cardBook}
                      </span>
                    )}
                  </div>
                  <p className={reviewerStyles.topicLabel}>{topicName}</p>
                </div>
                <span>{cardIndex + 1} / {deck.length}</span>
              </div>
              <div className={reviewerStyles.questionArea}>
                <h2>{currentCard.prompt}</h2>
                {currentCard.choices && currentCard.choices.length > 0 && (
                  <div className={reviewerStyles.horizontalChoices} role="list" aria-label="Question choices">
                    {currentCard.choices.map((choice, index) => {
                      const cleanChoice = choice.trim().replace(/^[A-D](?:[.):])\s+/, "");
                      const choiceLetter = String.fromCharCode(65 + index);
                      return (
                        <div className={reviewerStyles.horizontalChoiceItem} key={index} role="listitem">
                          <span className={reviewerStyles.choiceLetter}>{choiceLetter}</span>
                          <span className={reviewerStyles.choiceText}>{cleanChoice}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                className={`${reviewerStyles.flipControl} primary-button`}
                type="button"
                tabIndex={flipped ? -1 : 0}
                onClick={toggleCard}
              >
                Flip card
              </button>
            </article>

            <article className={`${reviewerStyles.cardFace} ${reviewerStyles.cardBack}`} aria-hidden={!flipped}>
              <button
                className={reviewerStyles.cardHitArea}
                type="button"
                tabIndex={flipped ? 0 : -1}
                aria-label={`Show question. Answer: ${currentCard.answer}`}
                onClick={toggleCard}
              />
              <div className={reviewerStyles.answerBlock}>
                <p className={reviewerStyles.sideLabel}>Answer</p>
                <h2>{currentCard.answer}</h2>
              </div>
              <div className={reviewerStyles.explanationBlock}>
                <p className={reviewerStyles.sideLabel}>Explanation</p>
                <p>{currentCard.explanation}</p>
              </div>
              <button
                className={`${reviewerStyles.flipControl} secondary-button`}
                type="button"
                tabIndex={flipped ? 0 : -1}
                onClick={toggleCard}
              >
                Flip back
              </button>
            </article>
          </div>
        </div>

        <div className={reviewerStyles.navigation} aria-label="Flashcard navigation">
          <button
            className="secondary-button"
            type="button"
            onClick={() => moveCard(-1)}
            disabled={cardIndex === 0}
          >
            <span aria-hidden="true">←</span> Previous
          </button>
          <span aria-live="polite">Card {cardIndex + 1} of {deck.length}</span>
          <button
            className="primary-button"
            type="button"
            onClick={() => moveCard(1)}
            disabled={cardIndex === deck.length - 1}
          >
            Next <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className={reviewerStyles.keyboardHint}>Tip: use Space to flip and the arrow keys to move between cards.</p>
      </div>
    );
  }

  return (
    <>
      {/* Search & Category Filter Toolbar */}
      <div className={styles.searchToolbar} role="search">
        <div className={styles.searchInputWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            id="flashcard-library-search"
            className={styles.searchInput}
            type="search"
            placeholder="Search subjects or topics..."
            value={subjectSearch}
            onChange={(e) => setSubjectSearch(e.target.value)}
          />
          {subjectSearch.trim().length > 0 && (
            <button
              type="button"
              className={styles.searchClearBtn}
              onClick={() => setSubjectSearch("")}
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Filter Chips */}
        {isNuRevit ? (
          <div className={styles.categoryChips} role="group" aria-label="Filter library by category">
            <button
              type="button"
              className={`${styles.categoryChipBtn} ${isAllSubjectsActive ? styles.active : ""}`}
              onClick={() => setSubjectSearch("")}
            >
              All Subjects
            </button>
            <button
              type="button"
              className={`${styles.categoryChipBtn} ${isMtap1Active ? styles.active : ""}`}
              onClick={() => setSubjectSearch(MTAP_1_CATEGORY)}
            >
              MTAP 1
            </button>
            <button
              type="button"
              className={`${styles.categoryChipBtn} ${isOtherMajorsActive ? styles.active : ""}`}
              onClick={() => setSubjectSearch(OTHER_MAJORS_CATEGORY)}
            >
              Other Majors
            </button>
          </div>
        ) : (
          <div className={styles.categoryChips} role="group" aria-label="Filter library by category">
            <button
              type="button"
              className={`${styles.categoryChipBtn} ${styles.active}`}
              onClick={() => setSubjectSearch("")}
            >
              All Majors
            </button>
          </div>
        )}
      </div>

      {/* Two-Column Desktop / One-Column Mobile Layout */}
      <div className={styles.libraryLayout}>
        {/* Left Column: Subjects */}
        <div className={styles.subjectList}>
          {subjectSections.map((section) => (
            <div className={styles.subjectCategory} key={section.id}>
              {section.title && (
                <CollectionHeader
                  kicker={isNuRevit ? "NU RevIT collection" : "Standard RevIT collection"}
                  title={section.title}
                  description={section.description}
                />
              )}

              {section.subjects.map((subject: UnifiedSubject) => {
                const subjectTopics = topics.filter((t) =>
                  subject.topicIds ? subject.topicIds.includes(t.id) : t.subjectId === subject.id,
                );
                const harrTopics = subjectTopics.filter((t) => (t.book ?? "Harr") === "Harr");
                const ciullaTopics = subjectTopics.filter((t) => t.book === "Ciulla");
                const rodakTopics = subjectTopics.filter((t) => t.book === "Rodak");
                const strasingerTopics = subjectTopics.filter((t) => t.book === "Strasinger");

                const preferredBook: ReviewerBook =
                  activeEditionBySubject[subject.id] ?? (selectedBook === "Strasinger" ? "Strasinger" : selectedBook === "Ciulla" ? "Ciulla" : selectedBook === "Rodak" ? "Rodak" : "Harr");

                const activeBook: ReviewerBook =
                  preferredBook === "Strasinger"
                    ? (strasingerTopics.length > 0 ? "Strasinger" : (rodakTopics.length > 0 ? "Rodak" : (ciullaTopics.length > 0 ? "Ciulla" : "Harr")))
                    : preferredBook === "Rodak"
                      ? (rodakTopics.length > 0 ? "Rodak" : (strasingerTopics.length > 0 ? "Strasinger" : (ciullaTopics.length > 0 ? "Ciulla" : "Harr")))
                      : preferredBook === "Ciulla"
                        ? (ciullaTopics.length > 0 ? "Ciulla" : (strasingerTopics.length > 0 ? "Strasinger" : (rodakTopics.length > 0 ? "Rodak" : "Harr")))
                        : (harrTopics.length > 0 ? "Harr" : (strasingerTopics.length > 0 ? "Strasinger" : (rodakTopics.length > 0 ? "Rodak" : (ciullaTopics.length > 0 ? "Ciulla" : "Harr"))));

                const currentEditionTopics =
                  activeBook === "Strasinger"
                    ? strasingerTopics
                    : activeBook === "Rodak"
                      ? rodakTopics
                      : activeBook === "Ciulla"
                        ? ciullaTopics
                        : harrTopics;

                const subjectTopicIds = subjectTopics.map((t) => t.id);
                const selectedInSubjectCount = subjectTopics.filter((t) => selectedTopicIds.includes(t.id)).length;
                const isSubjectFullySelected = subjectTopics.length > 0 && selectedInSubjectCount === subjectTopics.length;

                const currentEditionTopicIds = currentEditionTopics.map((t) => t.id);
                const selectedInEditionCount = currentEditionTopics.filter((t) => selectedTopicIds.includes(t.id)).length;
                const isEditionFullySelected = currentEditionTopics.length > 0 && selectedInEditionCount === currentEditionTopics.length;

                const totalSubjectCards = subjectTopics.reduce((sum, t) => sum + (topicQuestionCounts.get(t.id) ?? 0), 0);
                const activeEditionCards = currentEditionTopics.reduce((sum, t) => sum + (topicQuestionCounts.get(t.id) ?? 0), 0);

                const query = subjectSearch.trim().toLowerCase();
                const isCategoryMatch = query === MTAP_1_CATEGORY.toLowerCase() || query === OTHER_MAJORS_CATEGORY.toLowerCase() || query === ALL_MAJORS_CATEGORY.toLowerCase();
                const matchesSubjectOrTopics = isSearchActive && !isCategoryMatch && (
                  subject.name.toLowerCase().includes(query) ||
                  subjectTopics.some((t) => t.name.toLowerCase().includes(query))
                );

                const isExpanded = matchesSubjectOrTopics || expandedSubjectIds.has(subject.id);

                const editionsAvailable = [];
                if (harrTopics.length > 0) editionsAvailable.push("Harr");
                if (ciullaTopics.length > 0) editionsAvailable.push("Ciulla");
                if (rodakTopics.length > 0) editionsAvailable.push("Rodak");
                if (strasingerTopics.length > 0) editionsAvailable.push("Strasinger");
                const editionsLabel = editionsAvailable.join(" + ");

                const isEditionActiveAndLocked = isBookLocked(activeBook, proActive);

                return (
                  <section
                    className={`${styles.subjectCard} ${isExpanded ? styles.isExpanded : ""}`}
                    key={subject.id}
                  >
                    <div
                      className={styles.subjectCardHeader}
                      onClick={() => toggleSubjectExpand(subject.id)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-controls={`flashcard-subject-topics-${subject.id}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleSubjectExpand(subject.id);
                        }
                      }}
                    >
                      <div className={styles.subjectHeaderLeft}>
                        <h3 className={styles.subjectTitle}>{subject.name}</h3>
                        <div className={styles.subjectMetaRow}>
                          <span className={styles.subjectMeta}>
                            {totalSubjectCards.toLocaleString()} flashcards · {subjectTopics.length} topics {editionsLabel ? `· ${editionsLabel}` : ""}
                          </span>
                          {selectedInSubjectCount > 0 && (
                            <span className={`${styles.subjectSelectionBadge} ${isSubjectFullySelected ? styles.allSelected : ""}`}>
                              {isSubjectFullySelected ? "All selected" : `${selectedInSubjectCount}/${subjectTopics.length} selected`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.subjectHeaderActions}>
                        <button
                          type="button"
                          className={styles.selectSubjectBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSubject(subjectTopicIds, isSubjectFullySelected);
                          }}
                        >
                          {isSubjectFullySelected ? "Unselect subject" : "Select subject"}
                        </button>
                        <div className={`${styles.expandChevron} ${isExpanded ? styles.expanded : ""}`} aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={styles.subjectBody} id={`flashcard-subject-topics-${subject.id}`}>
                        {editionsAvailable.length > 1 && (
                          <div className={styles.editionNavStrip}>
                            <div className={styles.editionTabs} role="tablist">
                              {harrTopics.length > 0 && (
                                <button
                                  type="button"
                                  role="tab"
                                  aria-selected={activeBook === "Harr"}
                                  className={`${styles.editionTabBtn} ${activeBook === "Harr" ? styles.active : ""}`}
                                  onClick={() => setSubjectEditionTab(subject.id, "Harr")}
                                >
                                  Harr · <span className={styles.editionTabCount}>{harrTopics.length}</span>
                                </button>
                              )}
                              {ciullaTopics.length > 0 && (
                                <button
                                  type="button"
                                  role="tab"
                                  aria-selected={activeBook === "Ciulla"}
                                  className={`${styles.editionTabBtn} ${activeBook === "Ciulla" ? styles.active : ""}`}
                                  onClick={() => setSubjectEditionTab(subject.id, "Ciulla")}
                                >
                                  Ciulla · <span className={styles.editionTabCount}>{ciullaTopics.length}</span>
                                  {!proActive && <span className={styles.editionProPill}>Pro</span>}
                                </button>
                              )}
                              {rodakTopics.length > 0 && (
                                <button
                                  type="button"
                                  role="tab"
                                  aria-selected={activeBook === "Rodak"}
                                  className={`${styles.editionTabBtn} ${activeBook === "Rodak" ? styles.active : ""}`}
                                  onClick={() => setSubjectEditionTab(subject.id, "Rodak")}
                                >
                                  Rodak · <span className={styles.editionTabCount}>{rodakTopics.length}</span>
                                  {!proActive && <span className={styles.editionProPill}>Pro</span>}
                                </button>
                              )}
                              {strasingerTopics.length > 0 && (
                                <button
                                  type="button"
                                  role="tab"
                                  aria-selected={activeBook === "Strasinger"}
                                  className={`${styles.editionTabBtn} ${activeBook === "Strasinger" ? styles.active : ""}`}
                                  onClick={() => setSubjectEditionTab(subject.id, "Strasinger")}
                                >
                                  Strasinger · <span className={styles.editionTabCount}>{strasingerTopics.length}</span>
                                  {!proActive && <span className={styles.editionProPill}>Pro</span>}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className={styles.editionSubheader}>
                          <p className={styles.editionAvailableText}>
                            {activeEditionCards.toLocaleString()} flashcards available
                          </p>
                          {!isEditionActiveAndLocked && (
                            <button
                              type="button"
                              className={styles.selectAllEditionBtn}
                              onClick={() => toggleSubject(currentEditionTopicIds, isEditionFullySelected)}
                            >
                              {isEditionFullySelected ? `Unselect all ${activeBook}` : `Select all ${activeBook}`}
                            </button>
                          )}
                        </div>

                        {isEditionActiveAndLocked && (
                          <div className={styles.proLockBanner}>
                            <p>{activeBook} Flashcards are exclusive to RevIT Pro.</p>
                            <button
                              type="button"
                              className={styles.proUpgradeBtn}
                              onClick={() => onUpgradePro ? onUpgradePro() : window.location.assign("/pricing")}
                            >
                              Unlock Pro →
                            </button>
                          </div>
                        )}

                        <div className={styles.topicList}>
                          {currentEditionTopics.map((topic) => {
                            const isSelected = selectedTopicIds.includes(topic.id);
                            const cardCount = topicQuestionCounts.get(topic.id) ?? 0;
                            const isLocked = isBookLocked((topic.book ?? "Harr") as ReviewerBook, proActive);

                            return (
                              <label
                                key={topic.id}
                                className={`${styles.topicRow} ${isLocked ? styles.topicRowLocked : ""}`}
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).tagName !== "INPUT") {
                                    if (isLocked) {
                                      if (onUpgradePro) onUpgradePro();
                                      else window.location.assign("/pricing");
                                    } else {
                                      toggleTopic(topic.id);
                                    }
                                  }
                                }}
                              >
                                <div className={styles.topicRowLeft}>
                                  <input
                                    type="checkbox"
                                    className={styles.topicCheckbox}
                                    checked={isSelected}
                                    disabled={isLocked}
                                    onChange={() => {
                                      if (isLocked) {
                                        if (onUpgradePro) onUpgradePro();
                                      } else {
                                        toggleTopic(topic.id);
                                      }
                                    }}
                                    aria-label={`Select topic ${topic.name}`}
                                  />
                                  <div className={styles.topicInfo}>
                                    <h4 className={styles.topicName}>{topic.name}</h4>
                                    <p className={styles.topicQuestionsCount}>
                                      {cardCount} card{cardCount === 1 ? "" : "s"}
                                    </p>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ))}

          {!visibleSubjects.length && (
            <div className="library-empty-state">
              <h2>No subjects found</h2>
              <p>Try searching for another subject or topic name.</p>
              <button className="text-button" type="button" onClick={() => setSubjectSearch("")}>
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Desktop Sticky Session Setup Sidebar */}
        <aside className={styles.sessionSidebar} aria-label="Deck setup">
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarHeaderTop}>
              <span className={styles.setupKicker}>Session Setup</span>
              {availableCards > 0 && (
                <span className={styles.readyIndicator}>
                  <span className={styles.readyDot} aria-hidden="true" />
                  Ready
                </span>
              )}
            </div>
            <h2 className={styles.sidebarTitle}>
              {selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"} selected
            </h2>
          </div>

          {/* Selected Sources */}
          <div className={styles.sourcesBlock}>
            <div className={styles.sourceBadges}>
              {sourceCounts.harr > 0 && (
                <span className={styles.sourceTag}>Harr · {sourceCounts.harr}</span>
              )}
              {sourceCounts.ciulla > 0 && (
                <span className={styles.sourceTag}>Ciulla · {sourceCounts.ciulla}</span>
              )}
              {sourceCounts.rodak > 0 && (
                <span className={styles.sourceTag}>Rodak · {sourceCounts.rodak}</span>
              )}
              {sourceCounts.strasinger > 0 && (
                <span className={styles.sourceTag}>Strasinger · {sourceCounts.strasinger}</span>
              )}
              {selectedTopicIds.length === 0 && (
                <span className={styles.sourceNone}>No topics selected</span>
              )}
            </div>
            <span className={styles.availableQuestionsText}>
              {availableCards} {availableCards === 1 ? "card" : "cards"} available
            </span>
          </div>

          {/* Selection Actions */}
          <div className={styles.selectionActionsRow}>
            <button
              type="button"
              className={styles.selectionTextBtn}
              onClick={() => {
                const selectable = topics.filter((t) => proActive || (t.book ?? "Harr") === "Harr");
                setSelectedTopicIds(selectable.map((t) => t.id));
              }}
            >
              Select all
            </button>
            <button
              type="button"
              className={`${styles.selectionTextBtn} ${styles.quiet}`}
              onClick={() => setSelectedTopicIds([])}
              disabled={selectedTopicIds.length === 0}
            >
              Clear
            </button>
          </div>

          <div className={styles.setupDivider} />

          {/* Flashcard Session Info */}
          <div className={styles.setupRow}>
            <div className={styles.setupRowLabel}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.setupIcon}>
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <span>Passive Flashcard Deck</span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--green)" }}>
              {availableCards} cards
            </span>
          </div>

          <div className={styles.setupDivider} />

          <button
            type="button"
            className={styles.startReviewBtn}
            onClick={startReviewing}
            disabled={!availableCards}
          >
            <span>Start reviewing</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </aside>
      </div>

      {/* Sticky Mobile Review Bar */}
      <div className={styles.mobileStickyBar} role="region" aria-label="Mobile session action bar">
        <div className={styles.mobileBarInfo}>
          <div className={styles.mobileBarHeaderRow}>
            <span className={styles.mobileBarTopicCount}>
              {selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"}
            </span>
            {availableCards > 0 && (
              <span className={styles.mobileReadyBadge}>
                <span className={styles.readyDot} aria-hidden="true" />
                Ready
              </span>
            )}
          </div>
          <div className={styles.mobileBarSubtext}>
            {(() => {
              const labels: string[] = [];
              if (sourceCounts.harr > 0) labels.push(`Harr · ${sourceCounts.harr}`);
              if (sourceCounts.ciulla > 0) labels.push(`Ciulla · ${sourceCounts.ciulla}`);
              if (sourceCounts.rodak > 0) labels.push(`Rodak · ${sourceCounts.rodak}`);
              if (sourceCounts.strasinger > 0) labels.push(`Strasinger · ${sourceCounts.strasinger}`);
              return labels.length > 0 ? (
                <span>{labels.join(", ")} ({availableCards} cards)</span>
              ) : (
                <span>Select topics above ({availableCards} cards)</span>
              );
            })()}
          </div>
        </div>
        <div className={styles.mobileBarActions}>
          <button
            type="button"
            className={styles.mobileSetupBtn}
            onClick={() => setBottomSheetOpen(true)}
            aria-label="Open session setup"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span>Setup</span>
          </button>
          <button
            type="button"
            className={styles.mobileStartReviewBtn}
            onClick={startReviewing}
            disabled={!availableCards}
          >
            <span>Start</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {/* Mobile Session Setup Bottom Sheet */}
      {bottomSheetOpen && (
        <div
          className={styles.bottomSheetOverlay}
          onClick={() => setBottomSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-flashcard-setup-title"
        >
          <div
            className={styles.bottomSheetContainer}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.bottomSheetHeader}>
              <div className={styles.bottomSheetTitleBlock}>
                <div className={styles.bottomSheetTitleRow}>
                  <span className={styles.setupKicker}>Session Setup</span>
                  {availableCards > 0 && (
                    <span className={styles.readyIndicator}>
                      <span className={styles.readyDot} aria-hidden="true" />
                      Ready
                    </span>
                  )}
                </div>
                <h3 className={styles.bottomSheetTitle} id="mobile-flashcard-setup-title">
                  {selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"} selected
                </h3>
              </div>
              <button
                type="button"
                className={styles.bottomSheetCloseBtn}
                onClick={() => setBottomSheetOpen(false)}
                aria-label="Close session setup"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={styles.bottomSheetBody}>
              <div className={styles.sourcesBlock}>
                <div className={styles.sourceBadges}>
                  {sourceCounts.harr > 0 && (
                    <span className={styles.sourceTag}>Harr · {sourceCounts.harr}</span>
                  )}
                  {sourceCounts.ciulla > 0 && (
                    <span className={styles.sourceTag}>Ciulla · {sourceCounts.ciulla}</span>
                  )}
                  {sourceCounts.rodak > 0 && (
                    <span className={styles.sourceTag}>Rodak · {sourceCounts.rodak}</span>
                  )}
                  {sourceCounts.strasinger > 0 && (
                    <span className={styles.sourceTag}>Strasinger · {sourceCounts.strasinger}</span>
                  )}
                  {selectedTopicIds.length === 0 && (
                    <span className={styles.sourceNone}>No topics selected</span>
                  )}
                </div>
                <span className={styles.availableQuestionsText}>
                  {availableCards} {availableCards === 1 ? "card" : "cards"} available
                </span>
              </div>

              <div className={styles.selectionActionsRow}>
                <button
                  type="button"
                  className={styles.selectionTextBtn}
                  onClick={() => {
                    const selectable = topics.filter((t) => proActive || (t.book ?? "Harr") === "Harr");
                    setSelectedTopicIds(selectable.map((t) => t.id));
                  }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={`${styles.selectionTextBtn} ${styles.quiet}`}
                  onClick={() => setSelectedTopicIds([])}
                  disabled={selectedTopicIds.length === 0}
                >
                  Clear
                </button>
              </div>

              <div className={styles.setupDivider} />

              <div className={styles.setupRow}>
                <div className={styles.setupRowLabel}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.setupIcon}>
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <span>Passive Flashcard Deck</span>
                </div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--green)" }}>
                  {availableCards} cards
                </span>
              </div>
            </div>

            <div className={styles.bottomSheetFooter}>
              <button
                type="button"
                className={styles.sheetClearBtn}
                onClick={() => setSelectedTopicIds([])}
                disabled={selectedTopicIds.length === 0}
              >
                Clear selections
              </button>
              <button
                type="button"
                className={styles.sheetStartBtn}
                onClick={() => {
                  setBottomSheetOpen(false);
                  startReviewing();
                }}
                disabled={!availableCards}
              >
                <span>Start reviewing</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
