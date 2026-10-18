"use client";

import { useEffect, useMemo, useState } from "react";
import { type ReviewerBook, type ReviewerQuestion, type Subject, type Topic } from "../content/reviewerContent";
import type { QuestionAttempt } from "../lib/domain";
import {
  buildAccuracyHistory,
  calculateTopicMastery,
  mostMissedSubtopics,
  performanceByDifficulty,
  repeatedlyWrongQuestions,
  type MasteryStatus,
  type TopicMastery,
} from "../lib/weaknessAnalytics";

type StatusFilter = "all" | MasteryStatus;
type SortMode = "weakest" | "strongest" | "recent" | "least-recent";

type WeaknessDashboardProps = {
  attempts: QuestionAttempt[];
  loading: boolean;
  historyAvailable: boolean;
  cloudEnabled: boolean;
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
  onOpenReviewer: () => void;
  onReviewWithAi: (topic: TopicMastery) => void;
  onPractice: (topic: TopicMastery) => void;
  onViewMistakes: (topic: TopicMastery) => void;
};

const statusLabels: Record<MasteryStatus, string> = {
  weak: "Weak",
  developing: "Developing",
  strong: "Strong",
  insufficient: "Insufficient data",
};

function metric(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function relativeDate(value: string | null, referenceNow: number) {
  if (!value) return "Never";
  const elapsed = referenceNow - new Date(value).getTime();
  const days = Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function trendText(topic: TopicMastery) {
  if (topic.trend.direction === "insufficient" || topic.trend.delta === null) return "No trend";
  if (topic.trend.direction === "stable") return "Stable";
  return `${topic.trend.direction === "up" ? "Up" : "Down"} ${Math.abs(topic.trend.delta)}%`;
}

function recommendation(topic: TopicMastery) {
  if (topic.status === "weak") return "Review now";
  if (topic.status === "developing") return "Practice 10";
  if (topic.status === "strong") return "Maintain";
  return `Answer ${Math.max(0, 5 - topic.uniqueQuestions)} more`;
}

export default function WeaknessDashboard({
  attempts,
  loading,
  historyAvailable,
  cloudEnabled,
  subjects,
  topics,
  questions,
  onOpenReviewer,
  onReviewWithAi,
  onPractice,
  onViewMistakes,
}: WeaknessDashboardProps) {
  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  
  const [bookFilter, setBookFilter] = useState<ReviewerBook | "all">("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("weakest");
  const [search, setSearch] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [referenceNow] = useState(() => Date.now());

  // Mobile-specific interactive states
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(() => new Set());
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(20);

  const topicMasteries = useMemo(() => {
    const knownTopicIds = new Set(topics.map((topic) => topic.id));
    const builtIn = topics.map((topic) =>
      calculateTopicMastery(
        attempts.filter((attempt) => attempt.topicId === topic.id),
        {
          topicId: topic.id,
          topicName: topic.name,
          subjectId: topic.subjectId,
          subjectName: subjectById.get(topic.subjectId)?.name ?? "Uncategorized",
          book: topic.book,
        }
      )
    );
    const legacyGroups = new Map<string, QuestionAttempt[]>();
    for (const attempt of attempts.filter((item) => !knownTopicIds.has(item.topicId))) {
      const key = `${attempt.subjectId}:${attempt.topicId}`;
      const current = legacyGroups.get(key) ?? [];
      current.push(attempt);
      legacyGroups.set(key, current);
    }
    const uncategorized = [...legacyGroups.values()].map((items) => calculateTopicMastery(items));
    return [...builtIn, ...uncategorized];
  }, [attempts, subjectById, topics]);

  const bookMasteries = useMemo(() => {
    if (bookFilter === "all") return topicMasteries;
    return topicMasteries.filter((topic) => topic.book === bookFilter);
  }, [bookFilter, topicMasteries]);

  const reliable = bookMasteries.filter((topic) => topic.status !== "insufficient");
  const overallMastery = reliable.length
    ? Math.round(
        reliable.reduce((sum, topic) => sum + (topic.mastery ?? 0) * topic.uniqueQuestions, 0) /
          reliable.reduce((sum, topic) => sum + topic.uniqueQuestions, 0)
      )
    : null;
  const weakTopics = reliable.filter((topic) => topic.status === "weak");
  const improvingTopics = reliable.filter((topic) => topic.trend.direction === "up");
  const weekAgo = referenceNow - 7 * 24 * 60 * 60 * 1000;
  const validTopicIds = useMemo(() => new Set(bookMasteries.map((t) => t.topicId)), [bookMasteries]);
  const questionsThisWeek = attempts.filter(
    (attempt) => validTopicIds.has(attempt.topicId) && new Date(attempt.timestamp).getTime() >= weekAgo
  ).length;
  const developingTopics = reliable.filter((topic) => topic.status === "developing");
  const recommendedMinutes = weakTopics.length
    ? Math.min(30, 15 + Math.max(0, weakTopics.length - 1) * 5)
    : developingTopics.length
    ? 10
    : reliable.length
    ? 5
    : 0;
  const weakestReliable = [...reliable].sort((a, b) => (a.mastery ?? 101) - (b.mastery ?? 101))[0];

  const availableSubjects = useMemo(() => {
    if (bookFilter === "all") return subjects;
    return subjects.filter((s) => s.book === bookFilter);
  }, [bookFilter, subjects]);

  const filteredTopics = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = bookMasteries.filter(
      (topic) =>
        (subjectFilter === "all" || topic.subjectId === subjectFilter) &&
        (statusFilter === "all" || topic.status === statusFilter) &&
        (!needle || `${topic.topicName} ${topic.subjectName} ${topic.book ?? ""}`.toLowerCase().includes(needle))
    );
    return matching.sort((a, b) => {
      if (sortMode === "strongest")
        return (b.mastery ?? -1) - (a.mastery ?? -1) || b.uniqueQuestions - a.uniqueQuestions;
      if (sortMode === "recent") return (b.lastReviewedAt ?? "").localeCompare(a.lastReviewedAt ?? "");
      if (sortMode === "least-recent") return (a.lastReviewedAt ?? "").localeCompare(b.lastReviewedAt ?? "");
      return (a.mastery ?? 101) - (b.mastery ?? 101) || b.uniqueQuestions - a.uniqueQuestions;
    });
  }, [bookMasteries, search, sortMode, statusFilter, subjectFilter]);

  // Reset pagination when filters or search change
  useEffect(() => {
    setMobileVisibleCount(20);
  }, [search, statusFilter, subjectFilter, bookFilter, sortMode]);

  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0;
    if (bookFilter !== "all") count++;
    if (subjectFilter !== "all") count++;
    if (sortMode !== "weakest") count++;
    return count;
  }, [bookFilter, subjectFilter, sortMode]);

  const toggleTopicExpand = (topicId: string) => {
    setExpandedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const selectedTopic = topicMasteries.find((topic) => topic.topicId === selectedTopicId) ?? null;
  const selectedAttempts = selectedTopic
    ? attempts.filter((attempt) => attempt.topicId === selectedTopic.topicId)
    : [];
  const history = selectedTopic ? buildAccuracyHistory(selectedAttempts) : [];
  const missedSubtopics = selectedTopic ? mostMissedSubtopics(selectedAttempts).slice(0, 5) : [];
  const repeatedWrong = selectedTopic ? repeatedlyWrongQuestions(selectedAttempts).slice(0, 5) : [];
  const difficulty = selectedTopic ? performanceByDifficulty(selectedAttempts) : [];
  const latestSelected = new Map<string, QuestionAttempt>();
  for (const attempt of [...selectedAttempts].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    latestSelected.set(attempt.questionId, attempt);
  }
  const selectedMistakes = [...latestSelected.values()].filter((attempt) => !attempt.correct).length;

  useEffect(() => {
    if (!selectedTopic) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTopicId(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedTopic]);

  const visibleMobileTopics = useMemo(() => {
    return filteredTopics.slice(0, mobileVisibleCount);
  }, [filteredTopics, mobileVisibleCount]);

  return (
    <div className="weakness-dashboard">
      {loading && (
        <div className="weakness-notice" role="status">
          <span className="history-loader" />Loading your saved answer history…
        </div>
      )}
      {cloudEnabled && !historyAvailable && !loading && (
        <div className="weakness-notice warning" role="status">
          <div>
            <strong>Supabase setup is required for cross-device history.</strong>
            <p>Your current browser answers still work. Apply the Weakness Dashboard migration to start cloud syncing.</p>
          </div>
        </div>
      )}

      {/* ====================================================================
          1. SUMMARY METRICS (Adaptive 5-Card on Desktop, 3+2 on Mobile)
          ==================================================================== */}
      <section className="weakness-summary" aria-label="Weakness summary">
        <article className="weakness-metric primary">
          <span>Mastery</span>
          <strong>{overallMastery === null ? "—" : `${overallMastery}%`}</strong>
          <small>{reliable.length ? `${reliable.length} reliable topics` : "Needs more answers"}</small>
        </article>
        <article className="weakness-metric metric-weak">
          <span>Weak topics</span>
          <strong>{weakTopics.length}</strong>
          <small>Below 60% mastery</small>
        </article>
        <article className="weakness-metric metric-improving">
          <span>Improving</span>
          <strong>{improvingTopics.length}</strong>
          <small>Upward trend</small>
        </article>
        <article className="weakness-metric metric-week">
          <span>This week</span>
          <strong>{questionsThisWeek}</strong>
          <small>Questions answered</small>
        </article>
        <article className="weakness-metric metric-study">
          <span>Study today</span>
          <strong>{recommendedMinutes ? `${recommendedMinutes}m` : "—"}</strong>
          <small>Suggested session</small>
        </article>
      </section>

      {/* ====================================================================
          2. TODAY'S PRIORITY RECOMMENDATION
          ==================================================================== */}
      <section className={`daily-focus ${weakestReliable ? `status-${weakestReliable.status}` : ""}`}>
        <div className="daily-focus-body">
          <div className="daily-focus-kicker">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            <span>TODAY&apos;S PRIORITY</span>
          </div>
          <h2>{weakestReliable ? weakestReliable.topicName : "Unlock your weakness analysis"}</h2>
          <p>
            {weakestReliable
              ? `${weakestReliable.mastery ?? 0}% mastery · ${recommendedMinutes}-minute review${
                  weakestReliable.trend.direction === "down" && weakestReliable.trend.delta !== null
                    ? ` · Down ${Math.abs(weakestReliable.trend.delta)}% recently`
                    : ""
                }`
              : "Answer at least 5 unique questions from any topic to unlock reliable weakness analytics."}
          </p>
        </div>
        <button
          className="primary-button daily-focus-action"
          type="button"
          onClick={() => (weakestReliable ? onPractice(weakestReliable) : onOpenReviewer())}
        >
          {weakestReliable ? "Practice 10 questions →" : "Open QnA →"}
        </button>
      </section>

      {/* ====================================================================
          3. TOPIC MASTERY ANALYTICS (Desktop Table + Mobile Responsive Cards)
          ==================================================================== */}
      <section className="weakness-list-card">
        {/* Section Heading */}
        <div className="weakness-list-heading">
          <div>
            <p className="eyebrow">Topic mastery</p>
            <h2>Ranked learning priorities</h2>
          </div>
          <span className="weakness-topic-counter">{filteredTopics.length} topics</span>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="weakness-toolbar">
          <div className="weakness-search-row">
            <div className="weakness-search-wrap">
              <svg className="weakness-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search topics…"
                aria-label="Search topics"
              />
              {search && (
                <button
                  type="button"
                  className="weakness-search-clear"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Mobile Filter Toggle Button */}
            <button
              type="button"
              className={`weakness-mobile-filter-btn ${activeAdvancedFilterCount > 0 ? "has-filters" : ""}`}
              onClick={() => setFilterSheetOpen(true)}
              aria-label="Open topic filters"
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
              {activeAdvancedFilterCount > 0 && <span className="filter-count-badge">{activeAdvancedFilterCount}</span>}
            </button>
          </div>

          {/* Desktop Filter Dropdowns (hidden on narrow screens) */}
          <div className="weakness-controls-desktop">
            <label>
              <span>Book</span>
              <select
                value={bookFilter}
                onChange={(event) => {
                  setBookFilter(event.target.value as ReviewerBook | "all");
                  setSubjectFilter("all");
                }}
              >
                <option value="all">All Books</option>
                <option value="Harr">Harr</option>
                <option value="Ciulla">Ciulla</option>
                <option value="Rodak">Rodak</option>
                <option value="Strasinger">Strasinger</option>
              </select>
            </label>
            <label>
              <span>Subject</span>
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                <option value="all">All subjects</option>
                {availableSubjects.map((subject) => (
                  <option value={subject.id} key={subject.id}>
                    {subject.name}
                    {bookFilter === "all" && subject.book ? ` (${subject.book})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="weakest">Weakest first</option>
                <option value="strongest">Strongest first</option>
                <option value="recent">Recently reviewed</option>
                <option value="least-recent">Least recently reviewed</option>
              </select>
            </label>
          </div>
        </div>

        {/* Status Chips Tabs */}
        <div className="weakness-status-chips" role="tablist" aria-label="Mastery status filter">
          {(["all", "weak", "developing", "strong", "insufficient"] as StatusFilter[]).map((status) => {
            const count = status === "all" ? bookMasteries.length : bookMasteries.filter((t) => t.status === status).length;
            const label = status === "all" ? "All" : statusLabels[status];
            return (
              <button
                type="button"
                role="tab"
                aria-selected={statusFilter === status}
                className={`weakness-chip-btn ${statusFilter === status ? "active" : ""}`}
                onClick={() => setStatusFilter(status)}
                key={status}
              >
                <span>{label}</span>
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Empty State */}
        {!filteredTopics.length && (
          <div className="weakness-empty">
            <h3>No topics match these filters</h3>
            <p>Try resetting filters or adjusting your search term.</p>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setBookFilter("all");
                setSubjectFilter("all");
                setStatusFilter("all");
                setSearch("");
                setSortMode("weakest");
              }}
            >
              Reset all filters
            </button>
          </div>
        )}

        {/* ─── DESKTOP FULL ANALYTICS TABLE (Shown on screens > 820px) ─── */}
        {filteredTopics.length > 0 && (
          <div className="weakness-desktop-table-container">
            <table className="weakness-table">
              <thead>
                <tr>
                  <th>Topic &amp; Subject</th>
                  <th>Book</th>
                  <th>Mastery</th>
                  <th>Trend</th>
                  <th>Questions</th>
                  <th>Last Reviewed</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map((topic) => {
                  const masteryPercent = topic.mastery ?? 0;
                  return (
                    <tr key={topic.topicId}>
                      <td>
                        <button
                          className="topic-detail-link"
                          type="button"
                          onClick={() => setSelectedTopicId(topic.topicId)}
                          title={`View detailed analytics for ${topic.topicName}`}
                        >
                          <strong>{topic.topicName}</strong>
                          <small>{topic.subjectName}</small>
                        </button>
                      </td>
                      <td>
                        <span className={`weakness-book-tag weakness-book-${(topic.book ?? "none").toLowerCase()}`}>
                          {topic.book ?? "—"}
                        </span>
                      </td>
                      <td>
                        <div className="table-mastery-cell">
                          <div className="table-mastery-text">
                            <strong>{topic.mastery === null ? "—" : `${topic.mastery}%`}</strong>
                            <small className={`status-text-${topic.status}`}>{statusLabels[topic.status]}</small>
                          </div>
                          <div className="table-mastery-meter">
                            <span
                              style={{
                                width: `${topic.status === "insufficient" ? 0 : masteryPercent}%`,
                              }}
                              className={`bar-fill-${topic.status}`}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`trend-label trend-${topic.trend.direction}`}>
                          {trendText(topic)}
                        </span>
                      </td>
                      <td>
                        <span className="table-questions-text">{topic.uniqueQuestions} unique</span>
                      </td>
                      <td>
                        <span className="table-date-text">{relativeDate(topic.lastReviewedAt, referenceNow)}</span>
                      </td>
                      <td>
                        <button
                          className="table-action-btn"
                          type="button"
                          onClick={() => (topic.status === "insufficient" ? onOpenReviewer() : onPractice(topic))}
                        >
                          {recommendation(topic)} ↗
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── MOBILE & TABLET CARD-BASED ANALYTICS (Shown on screens <= 820px) ─── */}
        {filteredTopics.length > 0 && (
          <div className="weakness-card-list-container">
            <div className="weakness-card-grid">
              {visibleMobileTopics.map((topic) => {
                const isExpanded = expandedTopicIds.has(topic.topicId);
                const masteryPercent = topic.mastery ?? 0;
                const bookName = topic.book ? topic.book.toUpperCase() : "GENERAL";

                return (
                  <article
                    key={topic.topicId}
                    className={`topic-card-unit ${isExpanded ? "is-expanded" : ""} status-${topic.status}`}
                  >
                    {/* Top Row: Subject on Left, Book Edition on Right */}
                    <div className="topic-card-top-row">
                      <span className="topic-card-subject">{topic.subjectName}</span>
                      <span className={`topic-card-book topic-book-${(topic.book ?? "none").toLowerCase()}`}>
                        {bookName}
                      </span>
                    </div>

                    {/* Middle Row: Topic Name + Expand Chevron Button */}
                    <div className="topic-card-middle-row" onClick={() => toggleTopicExpand(topic.topicId)}>
                      <h4 className="topic-card-name">{topic.topicName}</h4>
                      <button
                        type="button"
                        className="topic-card-expand-btn"
                        aria-expanded={isExpanded}
                        aria-label={`Expand details for ${topic.topicName}`}
                      >
                        <svg
                          className={`chevron-icon ${isExpanded ? "open" : ""}`}
                          width="16"
                          height="16"
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
                      </button>
                    </div>

                    {/* Subtext: Questions Count & Status/Trend */}
                    <div className="topic-card-subtext" onClick={() => toggleTopicExpand(topic.topicId)}>
                      <span>
                        {topic.uniqueQuestions} unique question{topic.uniqueQuestions === 1 ? "" : "s"} ·{" "}
                        {topic.status === "insufficient" ? "Insufficient data" : statusLabels[topic.status]}
                      </span>
                    </div>

                    {/* Bottom Row: Thin Mastery Progress Bar + Mastery % */}
                    <div className="topic-card-progress-row" onClick={() => toggleTopicExpand(topic.topicId)}>
                      <div className="topic-card-meter-track">
                        <div
                          className={`topic-card-meter-bar bar-fill-${topic.status}`}
                          style={{
                            width: topic.status === "insufficient" ? "0%" : `${Math.max(masteryPercent, 3)}%`,
                          }}
                        />
                      </div>
                      <span className="topic-card-mastery-num">
                        {topic.mastery === null ? "0%" : `${topic.mastery}%`}
                      </span>
                    </div>

                    {/* Expandable Details Panel */}
                    {isExpanded && (
                      <div className="topic-card-expanded-panel">
                        <div className="expanded-stats-grid">
                          <div className="expanded-stat-item">
                            <small>Trend</small>
                            <strong className={`trend-val trend-${topic.trend.direction}`}>{trendText(topic)}</strong>
                          </div>
                          <div className="expanded-stat-item">
                            <small>Last reviewed</small>
                            <strong>{relativeDate(topic.lastReviewedAt, referenceNow)}</strong>
                          </div>
                          <div className="expanded-stat-item">
                            <small>Recent accuracy</small>
                            <strong>{metric(topic.recentUniqueAccuracy)}</strong>
                          </div>
                          <div className="expanded-stat-item">
                            <small>Delayed retention</small>
                            <strong>{metric(topic.retentionAccuracy)}</strong>
                          </div>
                        </div>

                        <div className="expanded-recommendation-box">
                          <small>Recommended action</small>
                          <p>
                            {topic.status === "insufficient"
                              ? `Answer ${Math.max(0, 5 - topic.uniqueQuestions)} more unique questions to establish reliable mastery.`
                              : topic.status === "weak"
                              ? "Core weakness detected. Review concepts and practice 10 focused questions."
                              : topic.status === "developing"
                              ? "Developing foundation. Complete 10 questions to reach proficiency."
                              : "Solid mastery. Keep sharp with regular spaced review."}
                          </p>
                        </div>

                        <div className="expanded-action-buttons">
                          <button
                            type="button"
                            className="primary-button mobile-card-practice-btn"
                            onClick={() => (topic.status === "insufficient" ? onOpenReviewer() : onPractice(topic))}
                          >
                            {topic.status === "insufficient" ? "Practice questions →" : "Practice 10 questions →"}
                          </button>
                          <button
                            type="button"
                            className="text-button mobile-card-detail-btn"
                            onClick={() => setSelectedTopicId(topic.topicId)}
                          >
                            View full analytics ↗
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Pagination Load More Button */}
            {filteredTopics.length > mobileVisibleCount && (
              <div className="weakness-pagination-row">
                <button
                  type="button"
                  className="secondary-button weakness-load-more-btn"
                  onClick={() => setMobileVisibleCount((prev) => prev + 20)}
                >
                  Show more topics ({filteredTopics.length - mobileVisibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ====================================================================
          4. MOBILE ADVANCED FILTER MODAL / BOTTOM SHEET
          ==================================================================== */}
      {filterSheetOpen && (
        <div className="weakness-filter-sheet-backdrop" onClick={() => setFilterSheetOpen(false)}>
          <div
            className="weakness-filter-sheet-content"
            role="dialog"
            aria-modal="true"
            aria-label="Filter Topic Mastery"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="filter-sheet-header">
              <h3>Filter Topics</h3>
              <button
                type="button"
                className="filter-sheet-close"
                onClick={() => setFilterSheetOpen(false)}
                aria-label="Close filters"
              >
                ×
              </button>
            </div>

            <div className="filter-sheet-body">
              <label className="filter-sheet-field">
                <span>Book Edition</span>
                <select
                  value={bookFilter}
                  onChange={(e) => {
                    setBookFilter(e.target.value as ReviewerBook | "all");
                    setSubjectFilter("all");
                  }}
                >
                  <option value="all">All Books (Combined)</option>
                  <option value="Harr">Harr</option>
                  <option value="Ciulla">Ciulla</option>
                  <option value="Rodak">Rodak</option>
                  <option value="Strasinger">Strasinger</option>
                </select>
              </label>

              <label className="filter-sheet-field">
                <span>Subject</span>
                <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                  <option value="all">All Subjects</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {bookFilter === "all" && s.book ? ` (${s.book})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter-sheet-field">
                <span>Sort By</span>
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="weakest">Weakest first</option>
                  <option value="strongest">Strongest first</option>
                  <option value="recent">Recently reviewed</option>
                  <option value="least-recent">Least recently reviewed</option>
                </select>
              </label>
            </div>

            <div className="filter-sheet-footer">
              <button
                type="button"
                className="text-button quiet"
                onClick={() => {
                  setBookFilter("all");
                  setSubjectFilter("all");
                  setSortMode("weakest");
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => setFilterSheetOpen(false)}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          5. DETAILED TOPIC MODAL (Desktop & Expanded Drill-down)
          ==================================================================== */}
      {selectedTopic && (
        <div
          className="weakness-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedTopicId(null);
          }}
        >
          <section className="weakness-detail" role="dialog" aria-modal="true" aria-labelledby="weakness-detail-title">
            <div className="weakness-detail-header">
              <div>
                <p className="eyebrow">
                  {selectedTopic.subjectName}
                  {selectedTopic.book ? ` · ${selectedTopic.book} Edition` : ""}
                </p>
                <h2 id="weakness-detail-title">{selectedTopic.topicName}</h2>
                <span className={`topic-detail-status-tag status-text-${selectedTopic.status}`}>
                  {metric(selectedTopic.mastery)} · {statusLabels[selectedTopic.status]}
                </span>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setSelectedTopicId(null)}
                aria-label="Close topic details"
              >
                ×
              </button>
            </div>

            <div className="detail-metrics">
              <div>
                <span>Recent unique</span>
                <strong>{metric(selectedTopic.recentUniqueAccuracy)}</strong>
                <small>Latest answer per question</small>
              </div>
              <div>
                <span>First attempt</span>
                <strong>{metric(selectedTopic.firstAttemptAccuracy)}</strong>
                <small>First-ever answers</small>
              </div>
              <div>
                <span>Difficulty adjusted</span>
                <strong>{metric(selectedTopic.difficultyAdjustedAccuracy)}</strong>
                <small>Known difficulty only</small>
              </div>
              <div>
                <span>Retention</span>
                <strong>{metric(selectedTopic.retentionAccuracy)}</strong>
                <small>
                  {selectedTopic.retentionQuestions} delayed question
                  {selectedTopic.retentionQuestions === 1 ? "" : "s"}
                </small>
              </div>
            </div>

            <div className="detail-grid">
              <section className="detail-panel history-panel">
                <div className="detail-panel-heading">
                  <h3>Accuracy history</h3>
                  <span>
                    {selectedTopic.uniqueQuestions} unique · {relativeDate(selectedTopic.lastReviewedAt, referenceNow)}
                  </span>
                </div>
                <div className="history-bars">
                  {history.map((point) => (
                    <div
                      key={point.label}
                      title={`${point.accuracy}% from ${point.questions} unique questions`}
                    >
                      <span>
                        <i style={{ height: `${point.questions ? Math.max(point.accuracy, 5) : 2}%` }} />
                      </span>
                      <small>{point.label}</small>
                      <b>{point.questions ? `${point.accuracy}%` : "—"}</b>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-panel">
                <div className="detail-panel-heading">
                  <h3>Performance by difficulty</h3>
                  <span>Latest unique answers</span>
                </div>
                <div className="difficulty-list">
                  {difficulty.map((item) => (
                    <div key={item.difficulty}>
                      <span>{item.difficulty}</span>
                      <div>
                        <i style={{ width: `${item.questions ? Math.max(item.accuracy, 3) : 0}%` }} />
                      </div>
                      <strong>{item.questions ? `${item.accuracy}%` : "—"}</strong>
                      <small>{item.questions} Q</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-panel">
                <div className="detail-panel-heading">
                  <h3>Most missed subtopics</h3>
                  <span>Incorrect attempts</span>
                </div>
                {missedSubtopics.length ? (
                  <ol className="missed-list">
                    {missedSubtopics.map((item) => (
                      <li key={item.name}>
                        <span>{item.name}</span>
                        <strong>
                          {item.incorrectAttempts} misses · {item.uniqueQuestions} Q
                        </strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="detail-empty">No missed subtopics yet.</p>
                )}
              </section>

              <section className="detail-panel">
                <div className="detail-panel-heading">
                  <h3>Repeatedly incorrect</h3>
                  <span>Two or more misses</span>
                </div>
                {repeatedWrong.length ? (
                  <ol className="wrong-question-list">
                    {repeatedWrong.map((item) => (
                      <li key={item.questionId}>
                        <span>{questionById.get(item.questionId)?.prompt ?? "Uncategorized question"}</span>
                        <strong>{item.incorrectAttempts} misses</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="detail-empty">No repeatedly missed questions.</p>
                )}
              </section>
            </div>

            <div className="detail-next-step">
              <strong>Recommended next step</strong>
              <p>
                {selectedTopic.status === "insufficient"
                  ? `Answer ${Math.max(0, 5 - selectedTopic.uniqueQuestions)} more unique questions in this topic.`
                  : selectedTopic.status === "weak"
                  ? "Review the key concept, then complete a focused ten-question session."
                  : selectedTopic.status === "developing"
                  ? "Practice ten questions and revisit missed subtopics after three days."
                  : "Maintain this topic with a short spaced review."}
              </p>
            </div>

            <div className="weakness-actions">
              <button className="primary-button" type="button" onClick={() => onReviewWithAi(selectedTopic)}>
                Review with AI
              </button>
              <button className="secondary-button" type="button" onClick={() => onPractice(selectedTopic)}>
                Practice 10 Questions
              </button>
              <button
                className="text-button"
                type="button"
                disabled={!selectedMistakes}
                onClick={() => onViewMistakes(selectedTopic)}
              >
                View Mistakes{selectedMistakes ? ` (${selectedMistakes})` : ""}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
