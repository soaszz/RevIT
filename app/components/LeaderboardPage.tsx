"use client";

import { useCallback, useEffect, useState } from "react";
import type { Subject } from "../content/reviewerContent";
import {
  accuracyRequirementMessage,
  formatLeaderboardMetric,
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIODS,
  metricHeading,
  periodLabel,
  type CurrentLeaderboardPosition,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type LeaderboardRow,
} from "../lib/leaderboard";
import { loadLeaderboard } from "../lib/leaderboardService";
import { createClient } from "../lib/supabase/client";
import { MorphingInfinity } from "./loading-ui/morphing-infinity";
import styles from "./LeaderboardPage.module.css";

const PAGE_SIZE = 50;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R";
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return (
    <span
      className={`${styles.avatar} ${url ? styles.avatarPhoto : ""}`}
      style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}
      aria-hidden="true"
    >
      {url ? "" : initials(name)}
    </span>
  );
}

function CurrentPosition({ position, metric, period, onOpenSettings }: {
  position: CurrentLeaderboardPosition;
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  onOpenSettings: () => void;
}) {
  const accuracyPending = metric === "accuracy" && !position.eligible;
  const noMetricActivity = metric !== "accuracy" && !position.eligible;

  return (
    <section className={styles.positionCard} aria-labelledby="your-position-title">
      <div className={styles.cardHeading}>
        <div><p>Your position</p><h2 id="your-position-title">{position.rank ? `#${position.rank.toLocaleString()}` : "Not ranked yet"}</h2></div>
        {position.rank && position.percentile ? <span>Top {position.percentile}%</span> : null}
      </div>
      <div className={styles.positionIdentity}>
        <Avatar name={position.displayName} url={position.avatarUrl} />
        <div><strong>{position.displayName}</strong><small>{formatLeaderboardMetric(metric, position.metricValue)}</small></div>
      </div>
      {accuracyPending ? (
        <div className={styles.progressNotice}>
          <strong>{position.answeredCount.toLocaleString()} / {position.minimumRequired.toLocaleString()} eligible questions</strong>
          <span>{accuracyRequirementMessage(position, period)}</span>
        </div>
      ) : noMetricActivity ? (
        <p className={styles.positionNote}>{metric === "questions" ? "Complete an eligible question to enter this ranking." : "Earn leaderboard-eligible study XP to enter this ranking."}</p>
      ) : !position.optedIn ? (
        <p className={styles.positionNote}>Your private statistics are available, but participation is turned off.</p>
      ) : (
        <p className={styles.positionNote}>{position.participantCount.toLocaleString()} eligible participant{position.participantCount === 1 ? "" : "s"} in this ranking.</p>
      )}
      {!position.optedIn && <button className={styles.settingsButton} type="button" onClick={onOpenSettings}>Open privacy settings</button>}
    </section>
  );
}

export default function LeaderboardPage({ cloudEnabled, leaderboardOptIn, subjects, onOpenSettings }: {
  cloudEnabled: boolean;
  leaderboardOptIn: boolean;
  subjects: Subject[];
  onOpenSettings: () => void;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const [metric, setMetric] = useState<LeaderboardMetric>("questions");
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [position, setPosition] = useState<CurrentLeaderboardPosition | null>(null);
  const [loading, setLoading] = useState(cloudEnabled);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const selectPeriod = (value: LeaderboardPeriod) => { setPeriod(value); setOffset(0); };
  const selectMetric = (value: LeaderboardMetric) => { setMetric(value); setOffset(0); };
  const selectSubject = (value: string | null) => { setSubjectId(value); setOffset(0); };
  const retry = useCallback(() => setReloadKey((current) => current + 1), []);

  useEffect(() => {
    if (!cloudEnabled) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await loadLeaderboard(createClient(), { period, metric, subjectId, limit: PAGE_SIZE, offset });
        if (cancelled) return;
        setRows(result.rows);
        setPosition(result.currentPosition);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "The leaderboard could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [cloudEnabled, leaderboardOptIn, metric, offset, period, reloadKey, subjectId]);

  const selectedSubject = subjects.find((subject) => subject.id === subjectId) ?? null;
  const timezone = position?.periodTimezone ?? rows[0]?.periodTimezone ?? "Asia/Manila";
  const rangeStart = offset + 1;
  const rangeEnd = offset + rows.length;

  if (!cloudEnabled) {
    return (
      <section className={styles.unavailable}>
        <span aria-hidden="true">↗</span>
        <h2>Connect your account to view rankings</h2>
        <p>Global leaderboards use protected Supabase aggregates and are not calculated from local browser totals.</p>
        <a href="/auth">Connect account</a>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.controlCard} aria-label="Leaderboard filters">
        <div className={styles.filterGroup}>
          <span>Time period</span>
          <div className={styles.segmented} role="group" aria-label="Leaderboard time period">
            {LEADERBOARD_PERIODS.map((option) => <button type="button" key={option.id} className={period === option.id ? styles.active : ""} aria-pressed={period === option.id} onClick={() => selectPeriod(option.id)}>{option.label}</button>)}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span>Category</span>
          <div className={styles.segmented} role="group" aria-label="Leaderboard category">
            {LEADERBOARD_METRICS.map((option) => <button type="button" key={option.id} className={metric === option.id ? styles.active : ""} aria-pressed={metric === option.id} onClick={() => selectMetric(option.id)}>{option.label}</button>)}
          </div>
        </div>
        <div className={styles.scopeGroup}>
          <span>Subject scope</span>
          <div className={styles.scopes} role="group" aria-label="Leaderboard subject">
            <button type="button" className={subjectId === null ? styles.activeScope : ""} aria-pressed={subjectId === null} onClick={() => selectSubject(null)}>Overall</button>
            {subjects.map((subject) => <button type="button" key={subject.id} className={subjectId === subject.id ? styles.activeScope : ""} aria-pressed={subjectId === subject.id} onClick={() => selectSubject(subject.id)}>{subject.name}</button>)}
          </div>
        </div>
        <p className={styles.timezoneNote}>Daily and weekly boundaries use {timezone}; weeks begin Monday.</p>
      </section>

      {!position?.optedIn && !loading && !error && (
        <aside className={styles.privacyBanner}>
          <div><strong>Leaderboard participation is turned off.</strong><span>You can still browse rankings and see your private progress.</span></div>
          <button type="button" onClick={onOpenSettings}>Review privacy</button>
        </aside>
      )}

      <div className={styles.grid}>
        <section className={styles.boardCard} aria-labelledby="leaderboard-list-title" aria-busy={loading}>
          <div className={styles.boardHeading}>
            <div><p>{selectedSubject?.name ?? "Overall"} · {periodLabel(period)}</p><h2 id="leaderboard-list-title">{metricHeading(metric)}</h2></div>
            <span>{offset === 0 ? "Top 50" : `Ranks ${rangeStart}–${Math.max(rangeStart, rangeEnd)}`}</span>
          </div>

          {loading ? (
            <div className={styles.loadingState} role="status"><MorphingInfinity /><strong>Loading rankings…</strong><span>Your filters will stay in place.</span></div>
          ) : error ? (
            <div className={styles.errorState} role="alert"><strong>Rankings are unavailable right now.</strong><p>{error}</p><button type="button" onClick={retry}>Try again</button></div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}><strong>{subjectId ? "No ranked activity for this subject yet." : "No rankings yet."}</strong><p>Only opted-in learners with eligible activity appear here.</p></div>
          ) : (
            <div className={styles.rows} role="list" aria-label={`${metricHeading(metric)} rankings`}>
              {rows.map((row) => (
                <article className={`${styles.row} ${row.rank <= 3 ? styles.topRow : ""} ${row.isCurrentUser ? styles.currentRow : ""}`} key={`${row.rank}-${row.displayName}`} role="listitem">
                  <strong className={styles.rank}>#{row.rank}</strong>
                  <Avatar name={row.displayName} url={row.avatarUrl} />
                  <div className={styles.identity}><strong>{row.displayName}</strong>{row.isCurrentUser && <small>You</small>}</div>
                  <strong className={styles.value}>{formatLeaderboardMetric(metric, row.metricValue)}</strong>
                </article>
              ))}
            </div>
          )}

          {!loading && !error && (offset > 0 || rows.length === PAGE_SIZE) && (
            <div className={styles.pagination}>
              <button type="button" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>Previous 50</button>
              <span>{rows.length ? `${rangeStart}–${rangeEnd}` : "No more results"}</span>
              <button type="button" disabled={rows.length < PAGE_SIZE} onClick={() => setOffset((current) => current + PAGE_SIZE)}>Next 50</button>
            </div>
          )}
        </section>

        {position && !loading && !error ? <CurrentPosition position={position} metric={metric} period={period} onOpenSettings={onOpenSettings} /> : (
          <section className={styles.positionCard}><div className={styles.cardHeading}><div><p>Your position</p><h2>{loading ? "Loading…" : "Unavailable"}</h2></div></div><p className={styles.positionNote}>{error ? "Retry the ranking query to load your private position." : "Your rank is calculated separately from the Top 50 list."}</p></section>
        )}
      </div>
    </div>
  );
}
