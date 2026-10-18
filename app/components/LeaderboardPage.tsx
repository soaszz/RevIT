"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewerBook, Subject } from "../content/reviewerContent";
import type { QuestionAttempt } from "../lib/domain";
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
import { levelForXp, levelTitle } from "../lib/xpConfig";
import { MorphingInfinity } from "./loading-ui/morphing-infinity";
import styles from "./LeaderboardPage.module.css";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R";
}

function Avatar({
  name,
  url,
  size = "medium",
}: {
  name: string;
  url: string | null;
  size?: "small" | "medium" | "large" | "xlarge";
}) {
  const sizeClass =
    size === "small"
      ? styles.avatarSmall
      : size === "large"
      ? styles.avatarLarge
      : size === "xlarge"
      ? styles.avatarXLarge
      : "";

  return (
    <span
      className={`${styles.avatar} ${sizeClass} ${url ? styles.avatarPhoto : ""}`}
      style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}
      aria-hidden="true"
    >
      {url ? "" : initials(name)}
    </span>
  );
}

function MedalRibbonIcon({
  rank,
  size = 28,
}: {
  rank: 1 | 2 | 3 | "gold" | "silver" | "bronze";
  size?: number;
}) {
  const isGold = rank === 1 || rank === "gold";
  const isSilver = rank === 2 || rank === "silver";

  const mainColor = isGold ? "#f59e0b" : isSilver ? "#94a3b8" : "#ea580c";
  const lightColor = isGold ? "#fef08a" : isSilver ? "#f1f5f9" : "#ffedd5";
  const darkColor = isGold ? "#b45309" : isSilver ? "#64748b" : "#9a3412";

  return (
    <svg
      width={size}
      height={Math.round(size * 1.25)}
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      {/* Ribbon tails */}
      <path d="M10 18L6 37L12 32L15 37L14 20" fill={darkColor} opacity="0.9" />
      <path d="M22 18L26 37L20 32L17 37L18 20" fill={mainColor} />

      {/* Outer circular medal disk */}
      <circle cx="16" cy="14" r="12" fill={lightColor} stroke={mainColor} strokeWidth="2" />
      <circle cx="16" cy="14" r="8.5" fill={mainColor} />

      {/* Inner rank number or star */}
      {typeof rank === "number" ? (
        <text
          x="16"
          y="18"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="10"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
        >
          {rank}
        </text>
      ) : (
        <polygon
          points="16,8.5 17.6,12.5 21.8,12.7 18.5,15.2 19.8,19.2 16,16.7 12.2,19.2 13.5,15.2 10.2,12.7 14.4,12.5"
          fill="#ffffff"
        />
      )}
    </svg>
  );
}

function getLearnerLevel(metricValue: number, answeredCount: number, metric: LeaderboardMetric) {
  let xp = 0;
  if (metric === "study_xp") {
    xp = Math.max(0, metricValue);
  } else if (metric === "questions") {
    xp = Math.max(0, metricValue * 8);
  } else {
    xp = Math.max(0, answeredCount * 12);
  }
  const level = levelForXp(xp);
  const title = levelTitle(level);
  const tier: "gold" | "silver" | "bronze" = level >= 5 ? "gold" : level >= 3 ? "silver" : "bronze";
  return { level, title, tier, xp };
}

function CurrentPosition({
  position,
  metric,
  period,
  onOpenSettings,
}: {
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
        <div>
          <p>Your position</p>
          <h2 id="your-position-title">{position.rank ? `#${position.rank.toLocaleString()}` : "Not ranked yet"}</h2>
        </div>
        {position.rank && position.percentile ? (
          <span className={styles.positionPercentile}>Top {position.percentile}%</span>
        ) : null}
      </div>
      <div className={styles.positionIdentity}>
        <Avatar name={position.displayName} url={position.avatarUrl} size="medium" />
        <div>
          <strong>{position.displayName}</strong>
          <small>{formatLeaderboardMetric(metric, position.metricValue)}</small>
        </div>
      </div>
      {accuracyPending ? (
        <div className={styles.progressNotice}>
          <strong>
            {position.answeredCount.toLocaleString()} / {position.minimumRequired.toLocaleString()} eligible questions
          </strong>
          <span>{accuracyRequirementMessage(position, period)}</span>
        </div>
      ) : noMetricActivity ? (
        <p className={styles.positionNote}>
          {metric === "questions"
            ? "Complete an eligible question to enter this ranking."
            : "Earn leaderboard-eligible study XP to enter this ranking."}
        </p>
      ) : !position.optedIn ? (
        <p className={styles.positionNote}>Your private statistics are available, but participation is turned off.</p>
      ) : (
        <p className={styles.positionNote}>
          {position.participantCount.toLocaleString()} eligible participant
          {position.participantCount === 1 ? "" : "s"} in this ranking.
        </p>
      )}
      {!position.optedIn && (
        <button className={styles.settingsButton} type="button" onClick={onOpenSettings}>
          Open privacy settings
        </button>
      )}
    </section>
  );
}

export default function LeaderboardPage({
  cloudEnabled,
  leaderboardOptIn,
  subjects,
  attempts,
  currentUserLevel,
  onOpenSettings,
  onToggleOptIn,
}: {
  cloudEnabled: boolean;
  leaderboardOptIn: boolean;
  subjects: Subject[];
  attempts?: QuestionAttempt[];
  currentUserLevel?: { level: number; title: string; totalXp: number };
  onOpenSettings: () => void;
  onToggleOptIn?: (enabled: boolean) => Promise<void> | void;
}) {
  const [selectedBook, setSelectedBook] = useState<ReviewerBook | "all">("all");
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const [metric, setMetric] = useState<LeaderboardMetric>("questions");
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [position, setPosition] = useState<CurrentLeaderboardPosition | null>(null);
  const [loading, setLoading] = useState(cloudEnabled);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const learnerLevelsCache = useRef<Map<string, { level: number; title: string; tier: "gold" | "silver" | "bronze"; xp: number }>>(new Map());

  const selectPeriod = (value: LeaderboardPeriod) => setPeriod(value);
  const selectMetric = (value: LeaderboardMetric) => setMetric(value);
  const selectSubject = (value: string | null) => setSubjectId(value);
  const retry = useCallback(() => setReloadKey((current) => current + 1), []);

  const availableSubjects = useMemo(() => {
    if (selectedBook === "all") return [];
    return subjects.filter((subject) => subject.book === selectedBook);
  }, [selectedBook, subjects]);

  useEffect(() => {
    if (selectedBook === "all" && subjectId !== null) {
      setSubjectId(null);
    }
  }, [selectedBook, subjectId]);

  useEffect(() => {
    if (!cloudEnabled) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await loadLeaderboard(createClient(), {
          period,
          metric,
          subjectId,
          book: selectedBook,
          attempts,
        });
        if (cancelled) return;
        setRows(result.rows);
        setPosition(result.currentPosition);
      } catch {
        if (!cancelled) setError("The leaderboard could not be loaded. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempts, cloudEnabled, leaderboardOptIn, metric, period, reloadKey, selectedBook, subjectId]);

  const selectedSubject = subjects.find((subject) => subject.id === subjectId) ?? null;
  const timezone = position?.periodTimezone ?? rows[0]?.periodTimezone ?? "Asia/Manila";

  const row1 = rows.find((r) => r.rank === 1) || rows[0];
  const row2 = rows.find((r) => r.rank === 2) || rows[1];
  const row3 = rows.find((r) => r.rank === 3) || rows[2];

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
      {/* Filter Control Card */}
      <section className={styles.controlCard} aria-label="Leaderboard filters">
        <div className={styles.filterGroup}>
          <span>Book edition</span>
          <div className={styles.segmented} role="group" aria-label="Leaderboard book edition">
            <button
              type="button"
              className={selectedBook === "all" ? styles.active : ""}
              aria-pressed={selectedBook === "all"}
              onClick={() => {
                setSelectedBook("all");
                setSubjectId(null);
              }}
            >
              All Books
            </button>
            <button
              type="button"
              className={selectedBook === "Harr" ? styles.active : ""}
              aria-pressed={selectedBook === "Harr"}
              onClick={() => {
                setSelectedBook("Harr");
                setSubjectId(null);
              }}
            >
              Harr
            </button>
            <button
              type="button"
              className={selectedBook === "Ciulla" ? styles.active : ""}
              aria-pressed={selectedBook === "Ciulla"}
              onClick={() => {
                setSelectedBook("Ciulla");
                setSubjectId(null);
              }}
            >
              Ciulla
            </button>
            <button
              type="button"
              className={selectedBook === "Rodak" ? styles.active : ""}
              aria-pressed={selectedBook === "Rodak"}
              onClick={() => {
                setSelectedBook("Rodak");
                setSubjectId(null);
              }}
            >
              Rodak
            </button>
            <button
              type="button"
              className={selectedBook === "Strasinger" ? styles.active : ""}
              aria-pressed={selectedBook === "Strasinger"}
              onClick={() => {
                setSelectedBook("Strasinger");
                setSubjectId(null);
              }}
            >
              Strasinger
            </button>
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span>Category</span>
          <div className={styles.segmented} role="group" aria-label="Leaderboard category">
            {LEADERBOARD_METRICS.map((option) => (
              <button
                type="button"
                key={option.id}
                className={metric === option.id ? styles.active : ""}
                aria-pressed={metric === option.id}
                onClick={() => selectMetric(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.scopeGroup}>
          <span>Subject scope</span>
          <div className={styles.scopes} role="group" aria-label="Leaderboard subject">
            <button
              type="button"
              className={subjectId === null ? styles.activeScope : ""}
              aria-pressed={subjectId === null}
              onClick={() => selectSubject(null)}
            >
              Overall
            </button>
            {availableSubjects.map((subject) => (
              <button
                type="button"
                key={subject.id}
                className={subjectId === subject.id ? styles.activeScope : ""}
                aria-pressed={subjectId === subject.id}
                onClick={() => selectSubject(subject.id)}
              >
                {subject.name}
                {selectedBook === "all" && subject.book ? ` (${subject.book})` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.optInChoiceRow}>
          <div className={styles.optInChoiceInfo}>
            <span className={styles.optInChoiceEyebrow}>Public Participation</span>
            <strong>Appear in leaderboards</strong>
            <p>
              {leaderboardOptIn
                ? "Your rank, display name, and avatar appear in public rankings."
                : "You are currently hidden from public rankings. Your stats remain private."}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.optInChoiceBtn} ${leaderboardOptIn ? styles.optInChoiceBtnActive : ""}`}
            aria-pressed={leaderboardOptIn}
            onClick={() => onToggleOptIn?.(!leaderboardOptIn)}
          >
            <span className={styles.optInChoiceIcon} aria-hidden="true">
              {leaderboardOptIn ? "✓" : "○"}
            </span>
            <span>{leaderboardOptIn ? "Appearing in leaderboards" : "Appear in leaderboards"}</span>
          </button>
        </div>

        <p className={styles.timezoneNote}>Daily and weekly boundaries use {timezone}; weeks begin Monday.</p>
      </section>

      {!position?.optedIn && !loading && !error && (
        <aside className={styles.privacyBanner}>
          <div>
            <strong>Leaderboard participation is turned off.</strong>
            <span>You can still browse rankings and see your private progress.</span>
          </div>
          <button type="button" onClick={onOpenSettings}>
            Review privacy
          </button>
        </aside>
      )}

      <div className={styles.grid}>
        <section className={styles.boardCard} aria-labelledby="leaderboard-list-title" aria-busy={loading}>
          {/* 3D Podium Hero Stage: controls always available, stage hidden if no rows */}
          <div className={`${styles.podiumHero} ${!(rows.length > 0 && !loading && !error) ? styles.podiumHeroNoStage : ""}`}>
              <div className={styles.podiumHeroHeader}>
                <div className={styles.heroPeriodToggle} role="group" aria-label="Quick period toggle">
                  {LEADERBOARD_PERIODS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`${styles.heroPeriodBtn} ${period === opt.id ? styles.heroPeriodBtnActive : ""}`}
                      onClick={() => selectPeriod(opt.id)}
                      aria-pressed={period === opt.id}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {position && (
                  <div className={styles.heroCurrentUserCard} onClick={onOpenSettings} title="Your ranking status">
                    <Avatar name={position.displayName} url={position.avatarUrl} size="small" />
                    <div className={styles.heroCurrentUserInfo}>
                      <span className={styles.heroCurrentUserName}>{position.displayName}</span>
                      <span className={styles.heroCurrentUserScore}>
                        {formatLeaderboardMetric(metric, position.metricValue)}
                      </span>
                    </div>
                    <div className={styles.heroCurrentUserRank}>
                      <span>{position.rank ? `#${position.rank}` : "—"}</span>
                    </div>
                  </div>
                )}
              </div>

              {rows.length > 0 && !loading && !error && (
                <div className={styles.podiumStage}>
                {/* 2nd Place (Left) */}
                {row2 ? (
                  <div className={`${styles.podiumCol} ${styles.podiumColSilver}`}>
                    <div className={styles.podiumUserInfo}>
                      <div className={`${styles.podiumAvatarWrap} ${styles.avatarWrapSilver}`}>
                        <Avatar name={row2.displayName} url={row2.avatarUrl} size="large" />
                      </div>
                      <strong className={styles.podiumUserName} title={row2.displayName}>
                        {row2.displayName}
                      </strong>
                      <span className={styles.podiumUserHandle}>
                        {row2.username || `@${row2.displayName.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 15)}`}
                      </span>
                      <span className={styles.podiumScore}>
                        {formatLeaderboardMetric(metric, row2.metricValue)}
                      </span>
                    </div>
                    <div className={`${styles.pedestal} ${styles.pedestalSilver}`}>
                      <div className={styles.pedestalTop} />
                      <div className={styles.pedestalBody}>
                        <div className={styles.pedestalMedal}>
                          <MedalRibbonIcon rank={2} size={30} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`${styles.podiumCol} ${styles.podiumEmptyCol}`} />
                )}

                {/* 1st Place (Center) */}
                {row1 ? (
                  <div className={`${styles.podiumCol} ${styles.podiumColGold}`}>
                    <div className={styles.podiumUserInfo}>
                      <div className={`${styles.podiumAvatarWrap} ${styles.avatarWrapGold}`}>
                        <Avatar name={row1.displayName} url={row1.avatarUrl} size="xlarge" />
                      </div>
                      <strong className={styles.podiumUserName} title={row1.displayName}>
                        {row1.displayName}
                      </strong>
                      <span className={styles.podiumUserHandle}>
                        {row1.username || `@${row1.displayName.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 15)}`}
                      </span>
                      <span className={styles.podiumScore}>
                        {formatLeaderboardMetric(metric, row1.metricValue)}
                      </span>
                    </div>
                    <div className={`${styles.pedestal} ${styles.pedestalGold}`}>
                      <div className={styles.pedestalTop} />
                      <div className={styles.pedestalBody}>
                        <div className={styles.pedestalMedal}>
                          <MedalRibbonIcon rank={1} size={36} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* 3rd Place (Right) */}
                {row3 ? (
                  <div className={`${styles.podiumCol} ${styles.podiumColBronze}`}>
                    <div className={styles.podiumUserInfo}>
                      <div className={`${styles.podiumAvatarWrap} ${styles.avatarWrapBronze}`}>
                        <Avatar name={row3.displayName} url={row3.avatarUrl} size="large" />
                      </div>
                      <strong className={styles.podiumUserName} title={row3.displayName}>
                        {row3.displayName}
                      </strong>
                      <span className={styles.podiumUserHandle}>
                        {row3.username || `@${row3.displayName.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 15)}`}
                      </span>
                      <span className={styles.podiumScore}>
                        {formatLeaderboardMetric(metric, row3.metricValue)}
                      </span>
                    </div>
                    <div className={`${styles.pedestal} ${styles.pedestalBronze}`}>
                      <div className={styles.pedestalTop} />
                      <div className={styles.pedestalBody}>
                        <div className={styles.pedestalMedal}>
                          <MedalRibbonIcon rank={3} size={28} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`${styles.podiumCol} ${styles.podiumEmptyCol}`} />
                )}
                </div>
              )}
            </div>

          {/* Heading Info */}
          <div className={styles.boardHeading}>
            <div>
              <p>
                {selectedSubject
                  ? `${selectedSubject.name}${selectedBook === "all" && selectedSubject.book ? ` (${selectedSubject.book})` : ""}`
                  : "Overall"}{" "}
                · {selectedBook === "all" ? "All Books" : `${selectedBook} Edition`} · {periodLabel(period)}
              </p>
              <h2 id="leaderboard-list-title">{metricHeading(metric)}</h2>
            </div>
            <span className={styles.boardTopCount}>Top 10</span>
          </div>

          {loading ? (
            <div className={styles.loadingState} role="status">
              <MorphingInfinity />
              <strong>Loading rankings…</strong>
              <span>Your filters will stay in place.</span>
            </div>
          ) : error ? (
            <div className={styles.errorState} role="alert">
              <strong>Rankings are unavailable right now.</strong>
              <p>{error}</p>
              <button type="button" onClick={retry}>
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>{subjectId ? "No ranked activity for this subject yet." : "No rankings yet."}</strong>
              <p>Only opted-in learners with eligible activity appear here.</p>
            </div>
          ) : (
            <div className={styles.rows} role="list" aria-label={`${metricHeading(metric)} rankings`}>
              {/* eslint-disable-next-line react-hooks/refs -- Existing render-time level cache requires a separate state cleanup. */}
              {rows.map((row) => {
                const username =
                  row.username ||
                  `@${row.displayName.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 15) || "scholar"}`;

                let levelInfo: { level: number; title: string; tier: "gold" | "silver" | "bronze"; xp: number };

                if (row.isCurrentUser && currentUserLevel) {
                  levelInfo = {
                    level: currentUserLevel.level,
                    title: currentUserLevel.title,
                    tier: currentUserLevel.level >= 5 ? ("gold" as const) : currentUserLevel.level >= 3 ? ("silver" as const) : ("bronze" as const),
                    xp: currentUserLevel.totalXp,
                  };
                  learnerLevelsCache.current.set(row.displayName, levelInfo);
                  learnerLevelsCache.current.set(username, levelInfo);
                } else if (row.totalXp != null) {
                  const lvl = levelForXp(row.totalXp);
                  const title = levelTitle(lvl);
                  const tier = lvl >= 5 ? ("gold" as const) : lvl >= 3 ? ("silver" as const) : ("bronze" as const);
                  levelInfo = { level: lvl, title, tier, xp: row.totalXp };
                  learnerLevelsCache.current.set(row.displayName, levelInfo);
                  learnerLevelsCache.current.set(username, levelInfo);
                } else if (learnerLevelsCache.current.has(username)) {
                  levelInfo = learnerLevelsCache.current.get(username)!;
                } else if (learnerLevelsCache.current.has(row.displayName)) {
                  levelInfo = learnerLevelsCache.current.get(row.displayName)!;
                } else {
                  levelInfo = getLearnerLevel(row.metricValue, row.answeredCount, metric);
                  learnerLevelsCache.current.set(username, levelInfo);
                  learnerLevelsCache.current.set(row.displayName, levelInfo);
                }
                const metricFormatted = formatLeaderboardMetric(metric, row.metricValue);

                return (
                  <article
                    className={`${styles.row} ${row.rank <= 3 ? styles.topRow : ""} ${
                      row.isCurrentUser ? styles.currentRow : ""
                    }`}
                    key={`${row.rank}-${row.displayName}`}
                    role="listitem"
                  >
                    {/* Rank Indicator */}
                    <div
                      className={`${styles.rankBadge} ${
                        row.rank === 1
                          ? styles.rankGold
                          : row.rank === 2
                          ? styles.rankSilver
                          : row.rank === 3
                          ? styles.rankBronze
                          : styles.rankNeutral
                      }`}
                    >
                      <span>{row.rank}</span>
                    </div>

                    {/* Avatar */}
                    <Avatar name={row.displayName} url={row.avatarUrl} size="medium" />

                    {/* Bold Name & Username */}
                    <div className={styles.identity}>
                      <div className={styles.identityNameRow}>
                        <strong className={styles.displayName}>{row.displayName}</strong>
                        {row.isCurrentUser && <span className={styles.youIndicator}>You</span>}
                      </div>
                      <span className={styles.usernameText}>{username}</span>

                      {/* Inline level for small mobile screens */}
                      <div className={styles.mobileLevelInfo}>
                        <MedalRibbonIcon rank={levelInfo.tier} size={14} />
                        <span>Level {levelInfo.level} · {levelInfo.title}</span>
                      </div>
                    </div>

                    {/* Level Column (Desktop & Tablet) */}
                    <div className={styles.levelColumn}>
                      <div className={styles.levelIconWrap}>
                        <MedalRibbonIcon rank={levelInfo.tier} size={18} />
                      </div>
                      <span className={styles.levelTitleText}>Level {levelInfo.level} · {levelInfo.title}</span>
                    </div>

                    {/* Metric Score */}
                    <div className={styles.valueColumn}>
                      <strong className={styles.value}>{metricFormatted}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {position && !loading && !error ? (
          <CurrentPosition
            position={position}
            metric={metric}
            period={period}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <section className={styles.positionCard}>
            <div className={styles.cardHeading}>
              <div>
                <p>Your position</p>
                <h2>{loading ? "Loading…" : "Unavailable"}</h2>
              </div>
            </div>
            <p className={styles.positionNote}>
              {error
                ? "Retry the ranking query to load your private position."
                : "Your rank is shown separately from the Top 10 list."}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
