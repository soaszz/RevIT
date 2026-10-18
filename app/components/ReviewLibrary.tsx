"use client";

import React, { useState, useMemo } from "react";
import styles from "./ReviewLibrary.module.css";
import type { ReviewerBook, Subject, Topic, ReviewerQuestion } from "../content/reviewerContent";
import type { UserPreferences } from "../lib/domain";
import type { ReviewTimerDuration } from "../lib/reviewTimer";
import type { ReviewLibraryMode } from "./ReviewModeSwitch";
import ReviewModeSwitch from "./ReviewModeSwitch";
import Flashcards from "./Flashcards";
import CollectionHeader from "./CollectionHeader";
import {
  ALL_MAJORS_CATEGORY,
  MTAP_1_CATEGORY,
  OTHER_MAJORS_CATEGORY,
  type UnifiedSubject,
  type SubjectSection,
} from "../lib/reviewerLibrary";

type ReviewLibraryProps = {
  preferences: UserPreferences;
  libraryMode: ReviewLibraryMode;
  onLibraryModeChange: (mode: ReviewLibraryMode) => void;
  selectedBook: ReviewerBook | "all";
  onSelectBook: (book: ReviewerBook | "all") => void;
  proActive: boolean;
  subjectSearch: string;
  onSubjectSearchChange: (search: string) => void;
  visibleSubjects: UnifiedSubject[];
  subjectSections: SubjectSection[];
  allAvailableSubjects: Subject[];
  allAvailableTopics: Topic[];
  questions: ReviewerQuestion[];
  selectedTopicIds: string[];
  onToggleTopic: (topicId: string) => void;
  onToggleSubject: (subjectId: string, topicIds: string[]) => void;
  onSelectAllTopics: (topicIds: string[]) => void;
  onClearAllTopics: () => void;
  wrongAnswersOnly: boolean;
  onWrongAnswersOnlyChange: (wrongOnly: boolean) => void;
  wrongTopicIds: string[];
  onSelectAllWrongAnswers: () => void;
  sessionSize: string;
  onSessionSizeChange: (size: string) => void;
  timerEnabled: boolean;
  onTimerEnabledChange: (enabled: boolean) => void;
  timerDuration: ReviewTimerDuration;
  onTimerDurationChange: (duration: ReviewTimerDuration) => void;
  onStartSession: () => void;
  sessionQuestions: ReviewerQuestion[];
  ciullaTopicQuestionCounts?: Record<string, number>;
  rodakTopicQuestionCounts?: Record<string, number>;
  strasingerTopicQuestionCounts?: Record<string, number>;
  onOpenProModal: () => void;
  onRequestConfirm: (title: string, message: string, confirmLabel: string, onConfirm: () => void) => void;
};

export default function ReviewLibrary({
  preferences,
  libraryMode,
  onLibraryModeChange,
  selectedBook,
  onSelectBook,
  proActive,
  subjectSearch,
  onSubjectSearchChange,
  visibleSubjects,
  subjectSections,
  allAvailableSubjects,
  allAvailableTopics,
  questions,
  selectedTopicIds,
  onToggleTopic,
  onToggleSubject,
  onSelectAllTopics,
  onClearAllTopics,
  wrongAnswersOnly,
  onWrongAnswersOnlyChange,
  wrongTopicIds,
  onSelectAllWrongAnswers,
  sessionSize,
  onSessionSizeChange,
  timerEnabled,
  onTimerEnabledChange,
  timerDuration,
  onTimerDurationChange,
  onStartSession,
  sessionQuestions,
  ciullaTopicQuestionCounts = {},
  rodakTopicQuestionCounts = {},
  strasingerTopicQuestionCounts = {},
  onOpenProModal,
  onRequestConfirm,
}: ReviewLibraryProps) {
  // Collapsed / Expanded state per subject
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(() => new Set());
  // Active navigation tab per subject: "Harr" | "Ciulla" (default "Harr")
  const [activeEditionBySubject, setActiveEditionBySubject] = useState<Record<string, ReviewerBook>>({});
  // Mobile Session Setup Bottom Sheet open state
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);

  // If search query is non-empty, auto-expand subjects matching query
  const isSearchActive = subjectSearch.trim().length > 0;
  const isMtap1Active = subjectSearch.trim() === MTAP_1_CATEGORY;
  const isOtherMajorsActive = subjectSearch.trim() === OTHER_MAJORS_CATEGORY;
  const isAllSubjectsActive = !isMtap1Active && !isOtherMajorsActive && subjectSearch.trim() === "";

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

  // Pre-calculate questions per topic
  const topicQuestionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      counts.set(q.topicId, (counts.get(q.topicId) ?? 0) + 1);
    }
    // Include Ciulla counts if provided
    for (const [tId, cCount] of Object.entries(ciullaTopicQuestionCounts)) {
      if (!counts.has(tId) || counts.get(tId) === 0) {
        counts.set(tId, cCount);
      }
    }
    // Include Rodak counts if provided
    for (const [tId, rCount] of Object.entries(rodakTopicQuestionCounts)) {
      if (!counts.has(tId) || counts.get(tId) === 0) {
        counts.set(tId, rCount);
      }
    }
    // Include Strasinger counts if provided
    for (const [tId, sCount] of Object.entries(strasingerTopicQuestionCounts)) {
      if (!counts.has(tId) || counts.get(tId) === 0) {
        counts.set(tId, sCount);
      }
    }
    return counts;
  }, [questions, ciullaTopicQuestionCounts, rodakTopicQuestionCounts, strasingerTopicQuestionCounts]);

  // Selected sources count (Harr vs Ciulla vs Rodak vs Strasinger topics)
  const sourceCounts = useMemo(() => {
    let harr = 0;
    let ciulla = 0;
    let rodak = 0;
    let strasinger = 0;
    const topicMap = new Map(allAvailableTopics.map((t) => [t.id, t]));
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
  }, [selectedTopicIds, allAvailableTopics]);

  // Track active flashcard review session to hide top control strip when reviewing
  const [isFlashcardReviewing, setIsFlashcardReviewing] = useState(false);

  // If in Flashcards mode, render Flashcards component directly
  if (libraryMode === "flashcards") {
    return (
      <div className={styles.libraryShell}>
        {!isFlashcardReviewing && (
          <div className={styles.topControlStrip}>
            <div className={styles.modeSwitcherWrapper}>
              <ReviewModeSwitch mode={libraryMode} onChange={onLibraryModeChange} />
            </div>
          </div>
        )}
        <Flashcards
          isNuRevit={preferences.mtap_features_enabled}
          selectedBook={selectedBook}
          proActive={proActive}
          subjects={allAvailableSubjects}
          topics={allAvailableTopics}
          questions={questions}
          onSelectBook={onSelectBook}
          onReviewingChange={setIsFlashcardReviewing}
          onRequestConfirm={onRequestConfirm}
          onUpgradePro={onOpenProModal}
        />
      </div>
    );
  }

  return (
    <div className={styles.libraryShell}>
      {/* ─── Top Control Strip: Mode Selector ─── */}
      <div className={styles.topControlStrip}>
        <div className={styles.modeSwitcherWrapper}>
          <ReviewModeSwitch mode={libraryMode} onChange={onLibraryModeChange} />
        </div>
      </div>

      {/* ─── Search & Category Filter Toolbar ─── */}
      <div className={styles.searchToolbar} role="search">
        <div className={styles.searchInputWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            id="review-library-search"
            className={styles.searchInput}
            type="search"
            placeholder="Search subjects or topics..."
            value={subjectSearch}
            onChange={(e) => onSubjectSearchChange(e.target.value)}
          />
          {subjectSearch.trim().length > 0 && (
            <button
              type="button"
              className={styles.searchClearBtn}
              onClick={() => onSubjectSearchChange("")}
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Filter Chips */}
        {preferences.mtap_features_enabled ? (
          <div className={styles.categoryChips} role="group" aria-label="Filter library by category">
            <button
              type="button"
              className={`${styles.categoryChipBtn} ${isAllSubjectsActive ? styles.active : ""}`}
              onClick={() => onSubjectSearchChange("")}
            >
              All Subjects
            </button>
            <button
              type="button"
              className={`${styles.categoryChipBtn} ${isMtap1Active ? styles.active : ""}`}
              onClick={() => onSubjectSearchChange(MTAP_1_CATEGORY)}
            >
              MTAP 1
            </button>
            <button
              type="button"
              className={`${styles.categoryChipBtn} ${isOtherMajorsActive ? styles.active : ""}`}
              onClick={() => onSubjectSearchChange(OTHER_MAJORS_CATEGORY)}
            >
              Other Majors
            </button>
          </div>
        ) : (
          <div className={styles.categoryChips} role="group" aria-label="Filter library by category">
            <button
              type="button"
              className={`${styles.categoryChipBtn} ${styles.active}`}
              onClick={() => onSubjectSearchChange("")}
            >
              All Majors
            </button>
          </div>
        )}
      </div>

      {/* ─── Two-Column Desktop / One-Column Mobile Layout ─── */}
      <div className={styles.libraryLayout}>
        {/* Left Column: Subjects */}
        <div className={styles.subjectList}>
          {subjectSections.map((section) => (
            <div className={styles.subjectCategory} key={section.id}>
              {section.title && (
                <CollectionHeader
                  kicker={preferences.mtap_features_enabled ? "NU RevIT collection" : "Standard RevIT collection"}
                  title={section.title}
                  description={section.description}
                />
              )}

              {section.subjects.map((subject: UnifiedSubject) => {
                // Get all topics for this subject
                const subjectTopics = allAvailableTopics.filter((t) =>
                  subject.topicIds ? subject.topicIds.includes(t.id) : t.subjectId === subject.id,
                );
                const harrTopics = subjectTopics.filter((t) => (t.book ?? "Harr") === "Harr");
                const ciullaTopics = subjectTopics.filter((t) => t.book === "Ciulla");
                const rodakTopics = subjectTopics.filter((t) => t.book === "Rodak");
                const strasingerTopics = subjectTopics.filter((t) => t.book === "Strasinger");

                // Check active edition tab for this subject
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

                // Selection calculations
                const subjectTopicIds = subjectTopics.map((t) => t.id);
                const selectedInSubjectCount = subjectTopics.filter((t) => selectedTopicIds.includes(t.id)).length;
                const isSubjectFullySelected = subjectTopics.length > 0 && selectedInSubjectCount === subjectTopics.length;

                const currentEditionTopicIds = currentEditionTopics.map((t) => t.id);
                const selectedInEditionCount = currentEditionTopics.filter((t) => selectedTopicIds.includes(t.id)).length;
                const isEditionFullySelected = currentEditionTopics.length > 0 && selectedInEditionCount === currentEditionTopics.length;

                // Total question count for this subject
                const totalSubjectMcqs = subjectTopics.reduce((sum, t) => sum + (topicQuestionCounts.get(t.id) ?? 0), 0);
                const activeEditionMcqs = currentEditionTopics.reduce((sum, t) => sum + (topicQuestionCounts.get(t.id) ?? 0), 0);

                // Auto-expand if active search matches
                const query = subjectSearch.trim().toLowerCase();
                const isCategoryMatch = query === MTAP_1_CATEGORY.toLowerCase() || query === OTHER_MAJORS_CATEGORY.toLowerCase() || query === ALL_MAJORS_CATEGORY.toLowerCase();
                const matchesSubjectOrTopics = isSearchActive && !isCategoryMatch && (
                  subject.name.toLowerCase().includes(query) ||
                  subjectTopics.some((t) => t.name.toLowerCase().includes(query))
                );

                const isExpanded = matchesSubjectOrTopics || expandedSubjectIds.has(subject.id);

                // Book edition label
                const editionsAvailable = [];
                if (harrTopics.length > 0) editionsAvailable.push("Harr");
                if (ciullaTopics.length > 0) editionsAvailable.push("Ciulla");
                if (rodakTopics.length > 0) editionsAvailable.push("Rodak");
                if (strasingerTopics.length > 0) editionsAvailable.push("Strasinger");
                const editionsLabel = editionsAvailable.join(" + ");

                return (
                  <section
                    className={`${styles.subjectCard} ${isExpanded ? styles.isExpanded : ""}`}
                    key={subject.id}
                  >
                    {/* Collapsed / Header Card */}
                    <div
                      className={styles.subjectCardHeader}
                      onClick={() => toggleSubjectExpand(subject.id)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-controls={`mcq-subject-topics-${subject.id}`}
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
                            {totalSubjectMcqs.toLocaleString()} MCQs · {subjectTopics.length} topics {editionsLabel ? `· ${editionsLabel}` : ""}
                          </span>
                          {selectedInSubjectCount > 0 && (
                            <span className={`${styles.subjectSelectionBadge} ${isSubjectFullySelected ? styles.allSelected : ""}`}>
                              {isSubjectFullySelected ? "All selected" : `${selectedInSubjectCount}/${subjectTopics.length} selected`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.subjectHeaderRight}>
                        <button
                          type="button"
                          className={styles.selectSubjectBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSubject(subject.id, subjectTopicIds);
                          }}
                        >
                          {isSubjectFullySelected ? "Unselect subject" : "Select subject"}
                        </button>
                        <span className={`${styles.chevronIcon} ${isExpanded ? styles.open : ""}`} aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {/* Expanded Subject Content (Image 1) */}
                    {isExpanded && (
                      <div className={styles.subjectBody} id={`mcq-subject-topics-${subject.id}`}>
                        {/* Edition Navigation Tabs (Harr · 10, Ciulla · 12) */}
                        {editionsAvailable.length > 1 && (
                          <div className={styles.editionNavRow}>
                            <div className={styles.editionTabs} role="tablist" aria-label={`Choose edition for ${subject.name}`}>
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
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Subheader: Questions available & Select all for active edition */}
                        <div className={styles.editionSubheader}>
                          <p className={styles.editionAvailableText}>
                            {activeEditionMcqs.toLocaleString()} questions available
                          </p>
                          <button
                            type="button"
                            className={styles.selectAllEditionBtn}
                            onClick={() => onToggleSubject(subject.id, currentEditionTopicIds)}
                          >
                            {isEditionFullySelected ? `Unselect all ${activeBook}` : `Select all ${activeBook}`}
                          </button>
                        </div>

                        {/* Topic Rows */}
                        <div className={styles.topicList}>
                          {currentEditionTopics.map((topic) => {
                            const isSelected = selectedTopicIds.includes(topic.id);
                            const qCount = topicQuestionCounts.get(topic.id) ?? 0;
                            return (
                              <label
                                key={topic.id}
                                className={styles.topicRow}
                                onClick={(e) => {
                                  // Avoid double toggle on checkbox click
                                  if ((e.target as HTMLElement).tagName !== "INPUT") {
                                    onToggleTopic(topic.id);
                                  }
                                }}
                              >
                                <div className={styles.topicRowLeft}>
                                  <input
                                    type="checkbox"
                                    className={styles.topicCheckbox}
                                    checked={isSelected}
                                    onChange={() => onToggleTopic(topic.id)}
                                    aria-label={`Select topic ${topic.name}`}
                                  />
                                  <div className={styles.topicInfo}>
                                    <h4 className={styles.topicName}>{topic.name}</h4>
                                    <p className={styles.topicQuestionsCount}>
                                      {qCount} question{qCount === 1 ? "" : "s"}
                                    </p>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {/* Bottom Action Bar of Subject Card */}
                        <div className={styles.subjectBottomRow}>
                          <p className={styles.subjectSelectedCountText}>
                            {selectedInSubjectCount} topic{selectedInSubjectCount === 1 ? "" : "s"} selected
                          </p>
                          <button
                            type="button"
                            className={styles.selectAllSubjectBtn}
                            onClick={() => onToggleSubject(subject.id, subjectTopicIds)}
                          >
                            {isSubjectFullySelected ? "Unselect all" : "Select all"}
                          </button>
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
              <button className="text-button" type="button" onClick={() => onSubjectSearchChange("")}>
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* ─── Right Column: Desktop Sticky Session Setup Sidebar ─── */}
        <aside className={styles.sessionSidebar} aria-label="Session setup">
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarHeaderTop}>
              <span className={styles.setupKicker}>Session Setup</span>
              {sessionQuestions.length > 0 && (
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
              {sessionQuestions.length} {sessionQuestions.length === 1 ? "question" : "questions"} available
            </span>
          </div>

          {/* Selection Actions */}
          <div className={styles.selectionActionsRow}>
            <button
              type="button"
              className={styles.selectionTextBtn}
              onClick={() => onSelectAllTopics(allAvailableTopics.map((t) => t.id))}
            >
              Select all
            </button>
            {wrongTopicIds.length > 0 && (
              <button
                type="button"
                className={styles.selectionTextBtn}
                onClick={onSelectAllWrongAnswers}
              >
                All wrong ({wrongTopicIds.length})
              </button>
            )}
            <button
              type="button"
              className={`${styles.selectionTextBtn} ${styles.quiet}`}
              onClick={onClearAllTopics}
              disabled={selectedTopicIds.length === 0}
            >
              Clear
            </button>
          </div>

          <div className={styles.setupDivider} />

          {/* Wrong Answers Only */}
          <div className={styles.setupRow}>
            <div className={styles.setupRowLabel}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.setupIcon}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>Wrong answers only</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={wrongAnswersOnly}
              aria-label="Wrong answers only"
              className={`${styles.setupSwitch} ${wrongAnswersOnly ? styles.setupSwitchActive : ""}`}
              onClick={() => onWrongAnswersOnlyChange(!wrongAnswersOnly)}
            >
              <span className={styles.setupSwitchThumb} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.setupDivider} />

          {/* Questions this session */}
          <div className={styles.setupFormGroup}>
            <label className={styles.setupFieldLabel} htmlFor="desktop-session-size">
              Questions this session
            </label>
            <select
              id="desktop-session-size"
              className={styles.setupSelect}
              value={sessionSize}
              onChange={(e) => onSessionSizeChange(e.target.value)}
            >
              <option value="10">10 questions</option>
              <option value="20">20 questions</option>
              <option value="30">30 questions</option>
              <option value="40">40 questions</option>
              <option value="50">50 questions</option>
              <option value="all">All selected questions</option>
            </select>
          </div>

          <div className={styles.setupDivider} />

          {/* Question Timer */}
          <div className={styles.setupTimerBlock}>
            <div className={styles.setupRow}>
              <div className={styles.setupRowLabel}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.setupIcon}>
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
                <span>Question timer</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={timerEnabled}
                aria-label="Enable question timer"
                className={`${styles.setupSwitch} ${timerEnabled ? styles.setupSwitchActive : ""}`}
                onClick={() => onTimerEnabledChange(!timerEnabled)}
              >
                <span className={styles.setupSwitchThumb} aria-hidden="true" />
              </button>
            </div>
            {timerEnabled && (
              <div className={styles.segmentedControl} role="group" aria-label="Question timer duration">
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${timerDuration === 30 ? styles.segmentActive : ""}`}
                  onClick={() => onTimerDurationChange(30)}
                >
                  30 sec
                </button>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${timerDuration === 60 ? styles.segmentActive : ""}`}
                  onClick={() => onTimerDurationChange(60)}
                >
                  60 sec · 1 min
                </button>
              </div>
            )}
          </div>

          {/* Start Review Button */}
          <button
            type="button"
            className={styles.startReviewBtn}
            onClick={onStartSession}
            disabled={!sessionQuestions.length}
          >
            <span>Start review</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </aside>
      </div>

      {/* ─── Sticky Mobile Review Bar ─── */}
      <div className={styles.mobileStickyBar} role="region" aria-label="Mobile session action bar">
        <div className={styles.mobileBarInfo}>
          <div className={styles.mobileBarHeaderRow}>
            <span className={styles.mobileBarTopicCount}>
              {selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"}
            </span>
            {sessionQuestions.length > 0 && (
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
                <span>{labels.join(", ")} ({sessionQuestions.length} Qs)</span>
              ) : (
                <span>Select topics above ({sessionQuestions.length} Qs)</span>
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
            onClick={onStartSession}
            disabled={!sessionQuestions.length}
          >
            <span>Start</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {/* ─── Mobile Session Setup Bottom Sheet ─── */}
      {bottomSheetOpen && (
        <div
          className={styles.bottomSheetOverlay}
          onClick={() => setBottomSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-session-setup-title"
        >
          <div
            className={styles.bottomSheetContainer}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className={styles.bottomSheetHeader}>
              <div className={styles.bottomSheetTitleBlock}>
                <div className={styles.bottomSheetTitleRow}>
                  <span className={styles.setupKicker}>Session Setup</span>
                  {sessionQuestions.length > 0 && (
                    <span className={styles.readyIndicator}>
                      <span className={styles.readyDot} aria-hidden="true" />
                      Ready
                    </span>
                  )}
                </div>
                <h3 className={styles.bottomSheetTitle} id="mobile-session-setup-title">
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

            {/* Sheet Body */}
            <div className={styles.bottomSheetBody}>
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
                  {sessionQuestions.length} {sessionQuestions.length === 1 ? "question" : "questions"} available
                </span>
              </div>

              {/* Selection Actions */}
              <div className={styles.selectionActionsRow}>
                <button
                  type="button"
                  className={styles.selectionTextBtn}
                  onClick={() => onSelectAllTopics(allAvailableTopics.map((t) => t.id))}
                >
                  Select all
                </button>
                {wrongTopicIds.length > 0 && (
                  <button
                    type="button"
                    className={styles.selectionTextBtn}
                    onClick={onSelectAllWrongAnswers}
                  >
                    All wrong ({wrongTopicIds.length})
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.selectionTextBtn} ${styles.quiet}`}
                  onClick={onClearAllTopics}
                  disabled={selectedTopicIds.length === 0}
                >
                  Clear
                </button>
              </div>

              <div className={styles.setupDivider} />

              {/* Wrong Answers Only */}
              <div className={styles.setupRow}>
                <div className={styles.setupRowLabel}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.setupIcon}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span>Wrong answers only</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={wrongAnswersOnly}
                  aria-label="Wrong answers only"
                  className={`${styles.setupSwitch} ${wrongAnswersOnly ? styles.setupSwitchActive : ""}`}
                  onClick={() => onWrongAnswersOnlyChange(!wrongAnswersOnly)}
                >
                  <span className={styles.setupSwitchThumb} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.setupDivider} />

              {/* Questions this session */}
              <div className={styles.setupFormGroup}>
                <label className={styles.setupFieldLabel} htmlFor="mobile-sheet-session-size">
                  Questions this session
                </label>
                <select
                  id="mobile-sheet-session-size"
                  className={styles.setupSelect}
                  value={sessionSize}
                  onChange={(e) => onSessionSizeChange(e.target.value)}
                >
                  <option value="10">10 questions</option>
                  <option value="20">20 questions</option>
                  <option value="30">30 questions</option>
                  <option value="40">40 questions</option>
                  <option value="50">50 questions</option>
                  <option value="all">All selected questions</option>
                </select>
              </div>

              <div className={styles.setupDivider} />

              {/* Question Timer */}
              <div className={styles.setupTimerBlock}>
                <div className={styles.setupRow}>
                  <div className={styles.setupRowLabel}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.setupIcon}>
                      <circle cx="12" cy="12" r="9" />
                      <polyline points="12 7 12 12 15 14" />
                    </svg>
                    <span>Question timer</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={timerEnabled}
                    aria-label="Enable question timer"
                    className={`${styles.setupSwitch} ${timerEnabled ? styles.setupSwitchActive : ""}`}
                    onClick={() => onTimerEnabledChange(!timerEnabled)}
                  >
                    <span className={styles.setupSwitchThumb} aria-hidden="true" />
                  </button>
                </div>
                {timerEnabled && (
                  <div className={styles.segmentedControl} role="group" aria-label="Question timer duration">
                    <button
                      type="button"
                      className={`${styles.segmentBtn} ${timerDuration === 30 ? styles.segmentActive : ""}`}
                      onClick={() => onTimerDurationChange(30)}
                    >
                      30 sec
                    </button>
                    <button
                      type="button"
                      className={`${styles.segmentBtn} ${timerDuration === 60 ? styles.segmentActive : ""}`}
                      onClick={() => onTimerDurationChange(60)}
                    >
                      60 sec · 1 min
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sheet Footer */}
            <div className={styles.bottomSheetFooter}>
              <button
                type="button"
                className={styles.startReviewBtn}
                onClick={() => {
                  setBottomSheetOpen(false);
                  onStartSession();
                }}
                disabled={!sessionQuestions.length}
              >
                <span>Start review</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
