"use client";

import { useEffect, useMemo, useState } from "react";
import { questionById, subjectById, subjects, topics } from "../content/reviewerContent";
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
  return value === null ? "Not available" : `${value}%`;
}

function relativeDate(value: string | null, referenceNow: number) {
  if (!value) return "Never";
  const elapsed = referenceNow - new Date(value).getTime();
  const days = Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function trendText(topic: TopicMastery) {
  if (topic.trend.direction === "insufficient" || topic.trend.delta === null) return "Not enough data";
  if (topic.trend.direction === "stable") return "Stable";
  return `${topic.trend.direction === "up" ? "Up" : "Down"} ${Math.abs(topic.trend.delta)}%`;
}

function recommendation(topic: TopicMastery) {
  if (topic.status === "weak") return "Review now";
  if (topic.status === "developing") return "Practice 10 questions";
  if (topic.status === "strong") return "Maintain mastery";
  return `Answer ${Math.max(0, 5 - topic.uniqueQuestions)} more`;
}

export default function WeaknessDashboard({
  attempts,
  loading,
  historyAvailable,
  cloudEnabled,
  onOpenReviewer,
  onReviewWithAi,
  onPractice,
  onViewMistakes,
}: WeaknessDashboardProps) {
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("weakest");
  const [search, setSearch] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [referenceNow] = useState(() => Date.now());

  const topicMasteries = useMemo(() => {
    const knownTopicIds = new Set(topics.map((topic) => topic.id));
    const builtIn = topics.map((topic) => calculateTopicMastery(
      attempts.filter((attempt) => attempt.topicId === topic.id),
      {
        topicId: topic.id,
        topicName: topic.name,
        subjectId: topic.subjectId,
        subjectName: subjectById.get(topic.subjectId)?.name ?? "Uncategorized",
      },
    ));
    const legacyGroups = new Map<string, QuestionAttempt[]>();
    for (const attempt of attempts.filter((item) => !knownTopicIds.has(item.topicId))) {
      const key = `${attempt.subjectId}:${attempt.topicId}`;
      const current = legacyGroups.get(key) ?? [];
      current.push(attempt);
      legacyGroups.set(key, current);
    }
    const uncategorized = [...legacyGroups.values()].map((items) => calculateTopicMastery(items));
    return [...builtIn, ...uncategorized];
  }, [attempts]);

  const reliable = topicMasteries.filter((topic) => topic.status !== "insufficient");
  const overallMastery = reliable.length
    ? Math.round(reliable.reduce((sum, topic) => sum + (topic.mastery ?? 0) * topic.uniqueQuestions, 0)
      / reliable.reduce((sum, topic) => sum + topic.uniqueQuestions, 0))
    : null;
  const weakTopics = reliable.filter((topic) => topic.status === "weak");
  const improvingTopics = reliable.filter((topic) => topic.trend.direction === "up");
  const weekAgo = referenceNow - 7 * 24 * 60 * 60 * 1000;
  const questionsThisWeek = attempts.filter((attempt) => new Date(attempt.timestamp).getTime() >= weekAgo).length;
  const developingTopics = reliable.filter((topic) => topic.status === "developing");
  const recommendedMinutes = weakTopics.length
    ? Math.min(30, 15 + Math.max(0, weakTopics.length - 1) * 5)
    : developingTopics.length ? 10 : reliable.length ? 5 : 0;
  const weakestReliable = [...reliable].sort((a, b) => (a.mastery ?? 101) - (b.mastery ?? 101))[0];

  const filteredTopics = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = topicMasteries.filter((topic) => (
      (subjectFilter === "all" || topic.subjectId === subjectFilter)
      && (statusFilter === "all" || topic.status === statusFilter)
      && (!needle || `${topic.topicName} ${topic.subjectName}`.toLowerCase().includes(needle))
    ));
    return matching.sort((a, b) => {
      if (sortMode === "strongest") return (b.mastery ?? -1) - (a.mastery ?? -1) || b.uniqueQuestions - a.uniqueQuestions;
      if (sortMode === "recent") return (b.lastReviewedAt ?? "").localeCompare(a.lastReviewedAt ?? "");
      if (sortMode === "least-recent") return (a.lastReviewedAt ?? "").localeCompare(b.lastReviewedAt ?? "");
      return (a.mastery ?? 101) - (b.mastery ?? 101) || b.uniqueQuestions - a.uniqueQuestions;
    });
  }, [search, sortMode, statusFilter, subjectFilter, topicMasteries]);

  const selectedTopic = topicMasteries.find((topic) => topic.topicId === selectedTopicId) ?? null;
  const selectedAttempts = selectedTopic
    ? attempts.filter((attempt) => attempt.topicId === selectedTopic.topicId)
    : [];
  const history = selectedTopic ? buildAccuracyHistory(selectedAttempts) : [];
  const missedSubtopics = selectedTopic ? mostMissedSubtopics(selectedAttempts).slice(0, 5) : [];
  const repeatedWrong = selectedTopic ? repeatedlyWrongQuestions(selectedAttempts).slice(0, 5) : [];
  const difficulty = selectedTopic ? performanceByDifficulty(selectedAttempts) : [];
  const latestSelected = new Map<string, QuestionAttempt>();
  for (const attempt of [...selectedAttempts].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) latestSelected.set(attempt.questionId, attempt);
  const selectedMistakes = [...latestSelected.values()].filter((attempt) => !attempt.correct).length;

  useEffect(() => {
    if (!selectedTopic) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedTopicId(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedTopic]);

  return (
    <div className="weakness-dashboard">
      {loading && <div className="weakness-notice" role="status"><span className="history-loader" />Loading your saved answer history…</div>}
      {cloudEnabled && !historyAvailable && !loading && (
        <div className="weakness-notice warning" role="status">
          <div><strong>Supabase setup is required for cross-device history.</strong><p>Your current browser answers still work. Apply the Weakness Dashboard migration to start cloud syncing.</p></div>
        </div>
      )}

      <section className="weakness-summary" aria-label="Weakness summary">
        <article className="weakness-metric primary"><span>Overall mastery</span><strong>{overallMastery === null ? "—" : `${overallMastery}%`}</strong><small>{reliable.length ? `${reliable.length} reliable topic${reliable.length === 1 ? "" : "s"}` : "Needs more answers"}</small></article>
        <article className="weakness-metric"><span>Weak topics</span><strong>{weakTopics.length}</strong><small>Below 60% mastery</small></article>
        <article className="weakness-metric"><span>Topics improving</span><strong>{improvingTopics.length}</strong><small>Two comparable windows</small></article>
        <article className="weakness-metric"><span>Questions this week</span><strong>{questionsThisWeek}</strong><small>Last 7 days</small></article>
        <article className="weakness-metric"><span>Study today</span><strong>{recommendedMinutes ? `${recommendedMinutes} min` : "—"}</strong><small>Deterministic recommendation</small></article>
      </section>

      <section className={`daily-focus ${weakestReliable ? `status-${weakestReliable.status}` : ""}`}>
        <div>
          <p className="eyebrow">Today&apos;s recommendation</p>
          <h2>{weakestReliable ? `Focus on ${weakestReliable.topicName}` : "Unlock your weakness analysis"}</h2>
          <p>{weakestReliable
            ? `Your current mastery is ${weakestReliable.mastery}%. Review for ${recommendedMinutes} minutes, then answer 10 focused questions.${weakestReliable.trend.direction === "down" && weakestReliable.trend.previousAccuracy !== null && weakestReliable.trend.currentAccuracy !== null ? ` Your recent unique-question accuracy changed from ${weakestReliable.trend.previousAccuracy}% to ${weakestReliable.trend.currentAccuracy}%.` : ""}`
            : "Answer at least five unique questions from a topic to unlock a reliable weakness classification."}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => weakestReliable ? onPractice(weakestReliable) : onOpenReviewer()}>{weakestReliable ? "Practice 10 questions" : "Open QnA"}</button>
      </section>

      <section className="weakness-list-card">
        <div className="weakness-list-heading">
          <div><p className="eyebrow">Topic mastery</p><h2>Ranked learning priorities</h2><p>Scores use unique questions and delayed retention, not raw retry totals.</p></div>
          <label className="weakness-search"><span className="sr-only">Search topics</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a topic" /></label>
        </div>

        <div className="weakness-controls">
          <label><span>Subject</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>
          <label><span>Sort</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="weakest">Weakest first</option><option value="strongest">Strongest first</option><option value="recent">Recently reviewed</option><option value="least-recent">Least recently reviewed</option></select></label>
        </div>

        <div className="weakness-tabs" role="tablist" aria-label="Mastery status filter">
          {(["all", "weak", "developing", "strong", "insufficient"] as StatusFilter[]).map((status) => (
            <button type="button" role="tab" aria-selected={statusFilter === status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)} key={status}>
              {status === "all" ? "All" : statusLabels[status]} <span>{status === "all" ? topicMasteries.length : topicMasteries.filter((topic) => topic.status === status).length}</span>
            </button>
          ))}
        </div>

        <div className="weakness-table-wrap">
          <table className="weakness-table">
            <thead><tr><th>Subject &amp; topic</th><th>Mastery</th><th>Trend</th><th>Questions</th><th>Last reviewed</th><th>Recommended action</th></tr></thead>
            <tbody>
              {filteredTopics.map((topic) => (
                <tr key={topic.topicId}>
                  <td><button className="topic-detail-link" type="button" onClick={() => setSelectedTopicId(topic.topicId)}><small>{topic.subjectName}</small><strong>{topic.topicName}</strong></button></td>
                  <td><span className={`mastery-badge status-${topic.status}`}><i aria-hidden="true" />{topic.mastery === null ? "—" : `${topic.mastery}%`} · {statusLabels[topic.status]}</span></td>
                  <td><span className={`trend-label trend-${topic.trend.direction}`}>{trendText(topic)}</span></td>
                  <td>{topic.uniqueQuestions} unique</td>
                  <td>{relativeDate(topic.lastReviewedAt, referenceNow)}</td>
                  <td><button className="table-action" type="button" onClick={() => topic.status === "insufficient" ? onOpenReviewer() : onPractice(topic)}>{recommendation(topic)}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredTopics.length && <div className="weakness-empty"><h3>No topics match these filters</h3><p>Try another subject, status, or search term.</p><button className="text-button" type="button" onClick={() => { setSubjectFilter("all"); setStatusFilter("all"); setSearch(""); }}>Clear filters</button></div>}
        </div>
      </section>

      {selectedTopic && (
        <div className="weakness-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTopicId(null); }}>
          <section className="weakness-detail" role="dialog" aria-modal="true" aria-labelledby="weakness-detail-title">
            <div className="weakness-detail-header">
              <div><p className="eyebrow">{selectedTopic.subjectName}</p><h2 id="weakness-detail-title">{selectedTopic.topicName}</h2><span className={`mastery-badge status-${selectedTopic.status}`}><i aria-hidden="true" />{metric(selectedTopic.mastery)} · {statusLabels[selectedTopic.status]}</span></div>
              <button className="modal-close" type="button" onClick={() => setSelectedTopicId(null)} aria-label="Close topic details">×</button>
            </div>

            <div className="detail-metrics">
              <div><span>Recent unique</span><strong>{metric(selectedTopic.recentUniqueAccuracy)}</strong><small>Latest answer per question</small></div>
              <div><span>First attempt</span><strong>{metric(selectedTopic.firstAttemptAccuracy)}</strong><small>First-ever answers</small></div>
              <div><span>Difficulty adjusted</span><strong>{metric(selectedTopic.difficultyAdjustedAccuracy)}</strong><small>Known difficulty only</small></div>
              <div><span>Retention</span><strong>{metric(selectedTopic.retentionAccuracy)}</strong><small>{selectedTopic.retentionQuestions} delayed question{selectedTopic.retentionQuestions === 1 ? "" : "s"}</small></div>
            </div>

            <div className="detail-grid">
              <section className="detail-panel history-panel"><div className="detail-panel-heading"><h3>Accuracy history</h3><span>{selectedTopic.uniqueQuestions} unique · {relativeDate(selectedTopic.lastReviewedAt, referenceNow)}</span></div><div className="history-bars">{history.map((point) => <div key={point.label} title={`${point.accuracy}% from ${point.questions} unique questions`}><span><i style={{ height: `${point.questions ? Math.max(point.accuracy, 5) : 2}%` }} /></span><small>{point.label}</small><b>{point.questions ? `${point.accuracy}%` : "—"}</b></div>)}</div></section>
              <section className="detail-panel"><div className="detail-panel-heading"><h3>Performance by difficulty</h3><span>Latest unique answers</span></div><div className="difficulty-list">{difficulty.map((item) => <div key={item.difficulty}><span>{item.difficulty}</span><div><i style={{ width: `${item.questions ? Math.max(item.accuracy, 3) : 0}%` }} /></div><strong>{item.questions ? `${item.accuracy}%` : "—"}</strong><small>{item.questions} Q</small></div>)}</div></section>
              <section className="detail-panel"><div className="detail-panel-heading"><h3>Most missed subtopics</h3><span>Incorrect attempts</span></div>{missedSubtopics.length ? <ol className="missed-list">{missedSubtopics.map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.incorrectAttempts} misses · {item.uniqueQuestions} Q</strong></li>)}</ol> : <p className="detail-empty">No missed subtopics yet.</p>}</section>
              <section className="detail-panel"><div className="detail-panel-heading"><h3>Repeatedly incorrect</h3><span>Two or more misses</span></div>{repeatedWrong.length ? <ol className="wrong-question-list">{repeatedWrong.map((item) => <li key={item.questionId}><span>{questionById.get(item.questionId)?.prompt ?? "Uncategorized question"}</span><strong>{item.incorrectAttempts} misses</strong></li>)}</ol> : <p className="detail-empty">No repeatedly missed questions.</p>}</section>
            </div>

            <div className="detail-next-step"><strong>Recommended next step</strong><p>{selectedTopic.status === "insufficient" ? `Answer ${Math.max(0, 5 - selectedTopic.uniqueQuestions)} more unique questions in this topic.` : selectedTopic.status === "weak" ? "Review the key concept, then complete a focused ten-question session." : selectedTopic.status === "developing" ? "Practice ten questions and revisit missed subtopics after three days." : "Maintain this topic with a short spaced review."}</p></div>
            <div className="weakness-actions">
              <button className="primary-button" type="button" onClick={() => onReviewWithAi(selectedTopic)}>Review with AI</button>
              <button className="secondary-button" type="button" onClick={() => onPractice(selectedTopic)}>Practice 10 Questions</button>
              <button className="secondary-button" type="button" disabled title="Flashcards are coming soon">Create Flashcards <small>Coming soon</small></button>
              <button className="text-button" type="button" disabled={!selectedMistakes} onClick={() => onViewMistakes(selectedTopic)}>View Mistakes{selectedMistakes ? ` (${selectedMistakes})` : ""}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
