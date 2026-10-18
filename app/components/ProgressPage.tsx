"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import styles from "./ProgressPage.module.css";
import type { ReviewerBook, Subject, Topic } from "../content/reviewerContent";
import type { QuestionAttempt, UserPreferences } from "../lib/domain";
import { canAccessFeature as canAccessSubscriptionFeature, type SubscriptionEntitlement } from "../lib/entitlements";
import {
  ALL_MAJORS_CATEGORY,
  MTAP_1_CATEGORY,
  OTHER_MAJORS_CATEGORY,
  type UnifiedSubject,
} from "../lib/reviewerLibrary";

type TopicStat = Topic & {
  attempts: number;
  correct: number;
  accuracy: number;
};

type ProgressPageProps = {
  progressBook: ReviewerBook | "all";
  setProgressBook: (book: ReviewerBook | "all") => void;
  proActive: boolean;
  entitlement: SubscriptionEntitlement;
  progressAttempts: QuestionAttempt[];
  progressOverallAccuracy: number;
  progressOverallCorrect: number;
  progressStrongestTopic?: TopicStat;
  progressWeakestTopic?: TopicStat;
  progressSubjectStats: Array<{ name: string; attempts: number; correct: number; accuracy: number }>;
  progressTopicStats: TopicStat[];
  visibleProgressSubjects: Subject[];
  progressSearch: string;
  setProgressSearch: (query: string) => void;
  cloudEnabled: boolean;
  preferences: UserPreferences;
  onStartReview: () => void;
  availableBooks?: ReviewerBook[];
};

type TrendPeriod = "7D" | "30D" | "all";

export default function ProgressPage({
  progressBook,
  setProgressBook,
  proActive,
  entitlement,
  progressAttempts,
  progressOverallAccuracy,
  progressOverallCorrect,
  progressStrongestTopic,
  progressWeakestTopic,
  progressSubjectStats,
  progressTopicStats,
  visibleProgressSubjects,
  progressSearch,
  setProgressSearch,
  cloudEnabled,
  preferences,
  onStartReview,
  availableBooks = ["Harr", "Ciulla", "Rodak", "Strasinger"],
}: ProgressPageProps) {
  // Collapsible Subject state
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(() => new Set());
  // Show all topics toggle per subject (default false, shows initial 5 topics)
  const [showAllTopicsSubjects, setShowAllTopicsSubjects] = useState<Set<string>>(() => new Set());
  // Trend Period state
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("7D");
  // Mobile filter drawer state
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Dynamic book options: All + available books
  const bookOptions: Array<ReviewerBook | "all"> = useMemo(() => {
    const list: Array<ReviewerBook | "all"> = ["all"];
    for (const b of availableBooks) {
      if (!list.includes(b)) list.push(b);
    }
    return list;
  }, [availableBooks]);

  const hasAdvancedAccess = canAccessSubscriptionFeature("advancedProgress", entitlement);
  const totalIncorrect = Math.max(0, progressAttempts.length - progressOverallCorrect);
  const incorrectPercentage = progressAttempts.length
    ? Math.round((totalIncorrect / progressAttempts.length) * 100)
    : 0;

  // Active category filter detection
  const isMtap1Active = progressSearch.trim() === MTAP_1_CATEGORY;
  const isOtherMajorsActive = progressSearch.trim() === OTHER_MAJORS_CATEGORY;
  const isAllSubjectsActive = !isMtap1Active && !isOtherMajorsActive && progressSearch.trim() === "";

  function handleCategoryFilter(val: string) {
    setProgressSearch(val);
  }

  function toggleSubjectExpanded(subjectId: string) {
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

  function toggleShowAllTopics(subjectId: string) {
    setShowAllTopicsSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  }

  function expandAllSubjects() {
    setExpandedSubjectIds(new Set(visibleProgressSubjects.map((s) => s.id)));
  }

  function collapseAllSubjects() {
    setExpandedSubjectIds(new Set());
  }

  // Calculate Daily Performance Trend Points from progressAttempts
  const trendData = useMemo(() => {
    if (!progressAttempts.length) return [];
    const dateMap = new Map<string, { total: number; correct: number; timestamp: number }>();

    for (const a of progressAttempts) {
      if (!a.timestamp) continue;
      const d = new Date(a.timestamp);
      if (isNaN(d.getTime())) continue;
      const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const cur = dateMap.get(iso) ?? { total: 0, correct: 0, timestamp: d.getTime() };
      cur.total += 1;
      cur.correct += a.correct ? 1 : 0;
      dateMap.set(iso, cur);
    }

    const sortedDates = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (!sortedDates.length) return [];

    let filtered = sortedDates;
    if (trendPeriod === "7D") {
      filtered = sortedDates.slice(-7);
    } else if (trendPeriod === "30D") {
      filtered = sortedDates.slice(-30);
    }

    return filtered.map(([iso, val]) => {
      const dateObj = new Date(iso + "T00:00:00");
      const label = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const accuracy = Math.round((val.correct / val.total) * 100);
      return {
        iso,
        label,
        total: val.total,
        correct: val.correct,
        accuracy,
      };
    });
  }, [progressAttempts, trendPeriod]);

  // SVG trend coordinate generation
  const chartCoordinates = useMemo(() => {
    if (trendData.length < 2) return null;
    const width = 500;
    const height = 120;
    const padX = 30;
    const padY = 16;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    const points = trendData.map((d, i) => {
      const x = padX + (i / (trendData.length - 1)) * innerW;
      const y = padY + (1 - d.accuracy / 100) * innerH;
      return { x, y, ...d };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

    return { points, linePath, areaPath, width, height };
  }, [trendData]);

  // Current book label for headings
  const currentBookLabel =
    progressBook === "all"
      ? "All Books (Combined)"
      : `${progressBook} Edition`;

  return (
    <div className={styles.progressShell}>
      {/* ─── Top Header Card ─── */}
      <section className={styles.headerCard}>
        <div className={styles.headerTopRow}>
          <div className={styles.headerTitleBlock}>
            <p className={styles.kicker}>PERFORMANCE ANALYTICS</p>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Progress</h1>
              <svg
                className={styles.mobileTitleIcon}
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 20V10" />
                <path d="M12 20V4" />
                <path d="M6 20v-6" />
              </svg>
            </div>
          </div>

          {/* Desktop Book Edition Tabs */}
          <div className={styles.desktopBookControl} role="group" aria-label="Book edition filter">
            <span className={styles.desktopBookLabel}>Book edition:</span>
            <div className={styles.desktopBookTabs}>
              {bookOptions.map((b) => {
                const isHarr = b === "Harr";
                const isDisabled = !isHarr && !proActive && b !== "all";
                const label = b === "all" ? "All Books" : `${b} Edition`;
                return (
                  <button
                    key={b}
                    type="button"
                    className={`${styles.desktopBookTabBtn} ${progressBook === b ? styles.active : ""}`}
                    onClick={() => {
                      if (b === "Harr" || b === "all" || proActive) setProgressBook(b);
                    }}
                    disabled={isDisabled}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile Book Edition Selector */}
        <div className={styles.mobileBookControl}>
          <span className={styles.mobileBookLabel}>Book edition</span>
          <div className={styles.mobileBookSelectWrap}>
            <select
              className={styles.mobileBookSelect}
              value={progressBook}
              onChange={(e) => {
                const val = e.target.value as ReviewerBook | "all";
                if (val === "Harr" || val === "all" || proActive) setProgressBook(val);
              }}
              aria-label="Select book edition"
            >
              {bookOptions.map((b) => (
                <option key={b} value={b} disabled={b !== "Harr" && b !== "all" && !proActive}>
                  {b === "all" ? "All Books (Combined)" : `${b} Edition`}
                </option>
              ))}
            </select>
            <svg
              className={styles.mobileBookSelectChevron}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* ─── Desktop Summary Statistics (Two Rows) ─── */}
        <div className={styles.desktopSummarySection}>
          {/* Row 1: Three Numerical Statistic Cards */}
          <div className={styles.desktopStatRowThree}>
            {/* Practice Accuracy */}
            <article className={styles.statCard}>
              <div className={styles.statCardHeader}>
                <span className={styles.statCardLabel}>Practice accuracy</span>
                <span className={styles.statCardIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </span>
              </div>
              <strong className={styles.statCardValue}>
                {progressAttempts.length ? `${progressOverallAccuracy}%` : "—"}
              </strong>
              <p className={styles.statCardSubtext}>
                {progressAttempts.length ? `${progressOverallCorrect} correct answers` : "No attempts yet"}
              </p>
            </article>

            {/* Questions Answered */}
            <article className={styles.statCard}>
              <div className={styles.statCardHeader}>
                <span className={styles.statCardLabel}>Questions answered</span>
                <span className={styles.statCardIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </span>
              </div>
              <strong className={styles.statCardValue}>{progressAttempts.length}</strong>
              <p className={styles.statCardSubtext}>Across practiced topics</p>
            </article>

            {/* Incorrect Answers */}
            <article className={styles.statCard}>
              <div className={styles.statCardHeader}>
                <span className={styles.statCardLabel}>Incorrect answers</span>
                <span className={styles.statCardIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </span>
              </div>
              <strong className={styles.statCardValue}>{totalIncorrect}</strong>
              <p className={styles.statCardSubtext}>
                {progressAttempts.length ? `${incorrectPercentage}% of attempts` : "Review these topics again"}
              </p>
            </article>
          </div>

          {/* Row 2: Two Topic Highlight Cards */}
          {hasAdvancedAccess && (
            <div className={styles.desktopHighlightRowTwo}>
              {/* Strongest Topic */}
              <article className={styles.highlightCard}>
                <div className={styles.highlightHeader}>
                  <span className={styles.highlightIcon} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                    </svg>
                  </span>
                  <span className={styles.highlightLabel}>Strongest topic</span>
                </div>
                <h3 className={styles.highlightTopicName}>
                  {progressStrongestTopic?.name ?? "Not enough data"}
                </h3>
                <p className={styles.highlightMeta}>
                  {progressStrongestTopic
                    ? `${progressStrongestTopic.accuracy}% accuracy · ${progressStrongestTopic.attempts} attempt${progressStrongestTopic.attempts === 1 ? "" : "s"}`
                    : "Complete your first review"}
                </p>
              </article>

              {/* Needs Review */}
              <article className={styles.highlightCard}>
                <div className={styles.highlightHeader}>
                  <span className={styles.highlightIconNeedsReview} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                      <polyline points="17 18 23 18 23 12" />
                    </svg>
                  </span>
                  <span className={styles.highlightLabel}>Needs review</span>
                </div>
                <h3 className={styles.highlightTopicName}>
                  {progressWeakestTopic?.name ?? "Not enough data"}
                </h3>
                <p className={styles.highlightMeta}>
                  {progressWeakestTopic
                    ? `${progressWeakestTopic.accuracy}% accuracy · ${progressWeakestTopic.attempts} attempt${progressWeakestTopic.attempts === 1 ? "" : "s"}`
                    : "Topic guidance appears after practice"}
                </p>
              </article>
            </div>
          )}
        </div>

        {/* ─── Mobile Summary Statistics ─── */}
        <div className={styles.mobileSummarySection}>
          {/* 3-Column Compact Row */}
          <div className={styles.mobileThreeColCard}>
            <div className={styles.mobileStatCol}>
              <strong className={styles.mobileStatValue}>
                {progressAttempts.length ? `${progressOverallAccuracy}%` : "—"}
              </strong>
              <span className={styles.mobileStatLabel}>Accuracy</span>
            </div>
            <div className={styles.mobileStatCol}>
              <strong className={styles.mobileStatValue}>{progressAttempts.length}</strong>
              <span className={styles.mobileStatLabel}>Answered</span>
            </div>
            <div className={styles.mobileStatCol}>
              <strong className={styles.mobileStatValue}>{totalIncorrect}</strong>
              <span className={styles.mobileStatLabel}>Incorrect</span>
            </div>
          </div>

          {/* 2 Compact Highlight Cards */}
          {hasAdvancedAccess && (
            <div className={styles.mobileHighlightGrid}>
              <div className={styles.mobileHighlightCard}>
                <div className={styles.mobileHighlightTop}>
                  <span className={styles.highlightIcon} aria-hidden="true">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                    </svg>
                  </span>
                  <span>Strongest</span>
                </div>
                <strong className={styles.mobileHighlightPercent}>
                  {progressStrongestTopic ? `${progressStrongestTopic.accuracy}%` : "—"}
                </strong>
                <p className={styles.mobileHighlightTopic}>
                  {progressStrongestTopic?.name ?? "No data yet"}
                </p>
                <p className={styles.mobileHighlightAttempts}>
                  {progressStrongestTopic ? `${progressStrongestTopic.attempts} attempts` : "0 attempts"}
                </p>
              </div>

              <div className={styles.mobileHighlightCard}>
                <div className={styles.mobileHighlightTop}>
                  <span className={styles.highlightIconNeedsReview} aria-hidden="true">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                      <polyline points="17 18 23 18 23 12" />
                    </svg>
                  </span>
                  <span>Needs review</span>
                </div>
                <strong className={styles.mobileHighlightPercent}>
                  {progressWeakestTopic ? `${progressWeakestTopic.accuracy}%` : "—"}
                </strong>
                <p className={styles.mobileHighlightTopic}>
                  {progressWeakestTopic?.name ?? "No data yet"}
                </p>
                <p className={styles.mobileHighlightAttempts}>
                  {progressWeakestTopic ? `${progressWeakestTopic.attempts} attempt${progressWeakestTopic.attempts === 1 ? "" : "s"}` : "0 attempts"}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Performance Trend Section (Section 7) ─── */}
      {hasAdvancedAccess && (
        <section className={styles.trendCard} aria-labelledby="trend-heading">
          <div className={styles.trendHeader}>
            <div className={styles.trendTitleBlock}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <div>
                <h3 id="trend-heading">Performance Trend</h3>
                <p className={styles.trendSubtitle}>Practice accuracy over time</p>
              </div>
            </div>

            <div className={styles.trendPeriodTabs} role="group" aria-label="Trend period">
              {(["7D", "30D", "all"] as TrendPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.trendPeriodBtn} ${trendPeriod === p ? styles.active : ""}`}
                  onClick={() => setTrendPeriod(p)}
                >
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>
          </div>

          {chartCoordinates ? (
            <div className={styles.trendChartWrapper}>
              <svg
                className={styles.trendSvg}
                viewBox={`0 0 ${chartCoordinates.width} ${chartCoordinates.height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Accuracy trend line chart"
              >
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--green)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Subtle horizontal baseline guides */}
                <line x1="30" y1="36" x2="470" y2="36" stroke="var(--line)" strokeDasharray="3 3" opacity="0.6" />
                <line x1="30" y1="76" x2="470" y2="76" stroke="var(--line)" strokeDasharray="3 3" opacity="0.6" />

                {/* Area under curve */}
                <path d={chartCoordinates.areaPath} fill="url(#trendGradient)" />

                {/* Main line */}
                <path
                  d={chartCoordinates.linePath}
                  fill="none"
                  stroke="var(--green)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data points */}
                {chartCoordinates.points.map((pt) => (
                  <g key={pt.iso}>
                    <circle cx={pt.x} cy={pt.y} r="3.5" fill="var(--green)" stroke="var(--paper)" strokeWidth="1.5">
                      <title>{`${pt.label}: ${pt.accuracy}% (${pt.correct}/${pt.total})`}</title>
                    </circle>
                  </g>
                ))}
              </svg>
            </div>
          ) : (
            <div className={styles.trendEmptyState}>
              <p>Practice across multiple sessions to see your accuracy trend over time.</p>
            </div>
          )}
        </section>
      )}

      {/* ─── Pro-locked state for Basic users ─── */}
      {!hasAdvancedAccess && (
        <>
          <section className="analytics-card" style={{ marginBottom: 20 }}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Basic subject performance</p>
                <h2>Performance by subject</h2>
              </div>
            </div>
            <div className="analytics-list">
              {progressSubjectStats.map((subject) => (
                <div className="analytics-row" key={subject.name}>
                  <div>
                    <strong>{subject.name}</strong>
                    <small>{subject.correct} of {subject.attempts} correct</small>
                  </div>
                  <span>{subject.accuracy}%</span>
                </div>
              ))}
              {!progressSubjectStats.length && <p>No subject activity yet.</p>}
            </div>
          </section>

          <section className="pro-locked-state" style={{ marginBottom: 20 }}>
            <span className="source-pill">PRO</span>
            <h2>Advanced Progress</h2>
            <p>Unlock detailed topic analytics, repeated-mistake insights, trends, and study recommendations.</p>
            <Link className="secondary-button" href="/pricing">Learn about RevIT Pro</Link>
          </section>
        </>
      )}

      {/* ─── Advanced Subject Performance (Pro Users) ─── */}
      {hasAdvancedAccess && (
        <>
          {/* Section Heading & Expand Controls */}
          <div className={styles.sectionHeaderBar}>
            <div className={styles.sectionHeaderLeft}>
              <h2 className={styles.sectionTitle}>Subject performance</h2>
              <span className={styles.sectionEditionBadge}>· {currentBookLabel}</span>
            </div>
            <div className={styles.sectionExpandControls}>
              <button
                type="button"
                className={styles.quietTextBtn}
                onClick={expandAllSubjects}
                title="Expand all subject sections"
              >
                Expand all
              </button>
              <span style={{ color: "var(--line)" }}>|</span>
              <button
                type="button"
                className={styles.quietTextBtn}
                onClick={collapseAllSubjects}
                title="Collapse all subject sections"
              >
                Collapse all
              </button>
            </div>
          </div>

          {/* Search and Category Filter Toolbar */}
          <div className={styles.searchToolbar} role="search">
            <div className={styles.searchInputWrap}>
              <span className={styles.searchIcon} aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                id="progress-search-input"
                className={styles.searchInput}
                type="search"
                placeholder="Search subjects or topics..."
                value={progressSearch}
                onChange={(e) => setProgressSearch(e.target.value)}
              />
              {progressSearch.trim().length > 0 && (
                <button
                  type="button"
                  className={styles.searchClearBtn}
                  onClick={() => setProgressSearch("")}
                  aria-label="Clear search"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Desktop Category Chips */}
            {preferences.mtap_features_enabled && (
              <div className={styles.desktopCategoryChips} role="group" aria-label="Filter subjects by category">
                <button
                  type="button"
                  className={`${styles.categoryChipBtn} ${isAllSubjectsActive ? styles.active : ""}`}
                  onClick={() => handleCategoryFilter("")}
                >
                  All Subjects
                </button>
                <button
                  type="button"
                  className={`${styles.categoryChipBtn} ${isMtap1Active ? styles.active : ""}`}
                  onClick={() => handleCategoryFilter(MTAP_1_CATEGORY)}
                >
                  MTAP 1
                </button>
                <button
                  type="button"
                  className={`${styles.categoryChipBtn} ${isOtherMajorsActive ? styles.active : ""}`}
                  onClick={() => handleCategoryFilter(OTHER_MAJORS_CATEGORY)}
                >
                  Other Majors
                </button>
              </div>
            )}

            {/* Mobile Filter Button (Slider Icon) */}
            {preferences.mtap_features_enabled && (
              <button
                type="button"
                className={`${styles.mobileFilterToggleBtn} ${!isAllSubjectsActive ? styles.hasFilter : ""}`}
                onClick={() => setMobileFilterOpen((v) => !v)}
                aria-label="Toggle category filter drawer"
                aria-expanded={mobileFilterOpen}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
              </button>
            )}
          </div>

          {/* Mobile Category Drawer */}
          {preferences.mtap_features_enabled && (
            <div className={`${styles.mobileCategoryDrawer} ${mobileFilterOpen ? styles.isOpen : ""}`}>
              <button
                type="button"
                className={`${styles.categoryChipBtn} ${isAllSubjectsActive ? styles.active : ""}`}
                onClick={() => {
                  handleCategoryFilter("");
                  setMobileFilterOpen(false);
                }}
              >
                All Subjects
              </button>
              <button
                type="button"
                className={`${styles.categoryChipBtn} ${isMtap1Active ? styles.active : ""}`}
                onClick={() => {
                  handleCategoryFilter(MTAP_1_CATEGORY);
                  setMobileFilterOpen(false);
                }}
              >
                MTAP 1
              </button>
              <button
                type="button"
                className={`${styles.categoryChipBtn} ${isOtherMajorsActive ? styles.active : ""}`}
                onClick={() => {
                  handleCategoryFilter(OTHER_MAJORS_CATEGORY);
                  setMobileFilterOpen(false);
                }}
              >
                Other Majors
              </button>
            </div>
          )}

          {/* ─── Collapsible Subject Card Grid ─── */}
          <div className={styles.subjectGrid}>
            {visibleProgressSubjects.map((subject) => {
              const unifiedSubj = subject as UnifiedSubject;
              const query = progressSearch.trim().toLowerCase();
              const isCategoryMatch =
                progressSearch.trim() === MTAP_1_CATEGORY ||
                progressSearch.trim() === OTHER_MAJORS_CATEGORY ||
                progressSearch.trim() === ALL_MAJORS_CATEGORY;

              const subjectMatches =
                query === "" ||
                isCategoryMatch ||
                subject.name.toLowerCase().includes(query) ||
                (subject.category && subject.category.toLowerCase().includes(query));

              const subjectTopicIds = subject.topicIds ?? [];
              const matchingTopics = progressTopicStats.filter(
                (t) =>
                  (subjectTopicIds.includes(t.id) || t.subjectId === subject.id) &&
                  (subjectMatches || t.name.toLowerCase().includes(query)),
              );

              const subjectAttemptsCount = progressAttempts.filter(
                (attempt) =>
                  subjectTopicIds.includes(attempt.topicId) || attempt.subjectId === subject.id,
              ).length;

              // Auto-expand if active search query matches topics or subject
              const isSearchActive = query.length > 0 && !isCategoryMatch;
              const isExpanded = isSearchActive || expandedSubjectIds.has(subject.id);

              // Topic pagination / truncation (show first 5 topics initially, unless expanded or searching)
              const showAllTopics = isSearchActive || showAllTopicsSubjects.has(subject.id);
              const visibleTopics = showAllTopics ? matchingTopics : matchingTopics.slice(0, 5);

              return (
                <section key={subject.id} className={styles.subjectCard}>
                  {/* Collapsible Header */}
                  <div
                    className={styles.subjectCardHeader}
                    onClick={() => toggleSubjectExpanded(subject.id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSubjectExpanded(subject.id);
                      }
                    }}
                  >
                    <div className={styles.subjectHeaderInfo}>
                      <h3 className={styles.subjectName}>{subject.name}</h3>
                      <p className={styles.subjectMeta}>
                        {subjectAttemptsCount} attempt{subjectAttemptsCount === 1 ? "" : "s"} · {visibleTopics.length} topic{visibleTopics.length === 1 ? "" : "s"} shown
                      </p>
                    </div>

                    <div className={styles.subjectHeaderRight}>
                      <button
                        type="button"
                        className={`${styles.subjectChevronBtn} ${isExpanded ? styles.open : ""}`}
                        aria-label={isExpanded ? `Collapse ${subject.name}` : `Expand ${subject.name}`}
                        tabIndex={-1}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Body */}
                  {isExpanded && (
                    <div className={styles.subjectBody}>
                      <div className={styles.topicList}>
                        {visibleTopics.map((topic) => {
                          const isPracticed = topic.attempts > 0;
                          return (
                            <div key={topic.id} className={styles.topicRow}>
                              {/* Desktop Horizontal Layout */}
                              <div className={styles.desktopTopicLayout}>
                                <div className={styles.desktopTopicInfo}>
                                  <strong className={styles.desktopTopicName}>{topic.name}</strong>
                                  <span className={styles.desktopTopicMeta}>
                                    {isPracticed
                                      ? `${topic.correct} of ${topic.attempts} correct`
                                      : "Not practiced yet"}
                                  </span>
                                </div>
                                <div className={styles.desktopTopicMeter}>
                                  <div
                                    className={`${styles.desktopTopicMeterFill} ${!isPracticed ? styles.unstarted : ""}`}
                                    style={{ width: isPracticed ? `${Math.max(topic.accuracy, 4)}%` : "0%" }}
                                  />
                                </div>
                                <span className={`${styles.desktopTopicPercent} ${!isPracticed ? styles.unstarted : ""}`}>
                                  {isPracticed ? `${topic.accuracy}%` : "—"}
                                </span>
                              </div>

                              {/* Mobile Stacked Layout */}
                              <div className={styles.mobileTopicLayout}>
                                <div className={styles.mobileTopicTopRow}>
                                  <span className={styles.mobileTopicName}>{topic.name}</span>
                                  <span className={`${styles.mobileTopicPercent} ${!isPracticed ? styles.unstarted : ""}`}>
                                    {isPracticed ? `${topic.accuracy}%` : "Not practiced"}
                                  </span>
                                </div>
                                <div className={styles.mobileTopicMeterTrack}>
                                  <div
                                    className={`${styles.mobileTopicMeterFill} ${!isPracticed ? styles.unstarted : ""}`}
                                    style={{ width: isPracticed ? `${Math.max(topic.accuracy, 4)}%` : "0%" }}
                                  />
                                </div>
                                <span className={styles.mobileTopicBottomMeta}>
                                  {isPracticed
                                    ? `${topic.correct} of ${topic.attempts} correct`
                                    : "0 attempts"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* View all topics / Show less toggle */}
                      {matchingTopics.length > 5 && !isSearchActive && (
                        <button
                          type="button"
                          className={styles.viewAllTopicsBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleShowAllTopics(subject.id);
                          }}
                        >
                          {showAllTopics
                            ? "Show less topics"
                            : `View all topics (${matchingTopics.length})`}
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ transform: showAllTopics ? "rotate(180deg)" : "none" }}
                            aria-hidden="true"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}

            {!visibleProgressSubjects.length && (
              <div className={styles.emptySubjects}>
                <h3>No subjects found</h3>
                <p>Try clearing your search query or adjusting the filters.</p>
                <button
                  type="button"
                  className={styles.quietTextBtn}
                  onClick={() => setProgressSearch("")}
                >
                  Reset search
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Zero attempts welcome state ─── */}
      {!progressAttempts.length && (
        <div className="empty-progress" style={{ marginTop: 24 }}>
          <h2>Your progress starts with one answer</h2>
          <p>
            Choose any topic combination. RevIT autosaves every answer{" "}
            {cloudEnabled ? "to your account" : "on this device"} and updates this page immediately.
          </p>
          <button className="primary-button" type="button" onClick={onStartReview}>
            Start a review
          </button>
        </div>
      )}
    </div>
  );
}
