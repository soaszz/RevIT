"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { type DailyActivity } from "../lib/domain";
import { activityEffort, intensityFor, dateKeyInTimeZone } from "../lib/studyCalendar";

export interface StudyActivityHeatmapProps {
  activity: DailyActivity[];
  todayKey: string;
  timeZone: string;
  streak: { current: number; longest: number; activeDays: number };
  onViewFullCalendar: () => void;
}

interface HeatmapDay {
  key: string;
  dayOfMonth: number;
  monthIndex: number;
  dayOfWeek: number; // 0 = Sun, 6 = Sat
  isToday: boolean;
  isFuture: boolean;
  activity?: DailyActivity;
  effort: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

interface HeatmapWeek {
  weekIndex: number;
  days: HeatmapDay[];
}

interface MonthLabel {
  monthName: string;
  weekIndex: number;
}

const DAY_LABELS = [
  { row: 1, label: "Mon" },
  { row: 3, label: "Wed" },
  { row: 5, label: "Fri" },
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function StudyActivityHeatmap({
  activity,
  todayKey,
  timeZone,
  streak,
  onViewFullCalendar,
}: StudyActivityHeatmapProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<{
    day: HeatmapDay;
    x: number;
    y: number;
    isBelow?: boolean;
  } | null>(null);

  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1024px)");
    const update = () => setIsMobileOrTablet(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // Map of dateKey -> DailyActivity for O(1) lookups
  const activityByDate = useMemo(() => {
    const map = new Map<string, DailyActivity>();
    for (const record of activity) {
      map.set(record.activity_date, record);
    }
    return map;
  }, [activity]);

  // Compute calendar grid ending on the current week: 24 weeks (~6 months) on desktop, 13 weeks (3 months) on mobile & tablet
  const { weeks, monthLabels, yearQuestionsReviewed, yearActiveDays } = useMemo(() => {
    const [todayY, todayM, todayD] = todayKey.split("-").map(Number);
    const todayDate = new Date(Date.UTC(todayY, todayM - 1, todayD));
    const todayDayOfWeek = todayDate.getUTCDay(); // 0 = Sun, 6 = Sat

    // The end of the current week (Saturday)
    const endOfWeekMs = todayDate.getTime() + (6 - todayDayOfWeek) * 86_400_000;
    // 24 weeks (~6 months) on desktop; 13 weeks (3 months) for mobile and tablet
    const totalWeeks = isMobileOrTablet ? 13 : 24;
    const startOfGridMs = endOfWeekMs - (totalWeeks * 7 - 1) * 86_400_000;

    const generatedWeeks: HeatmapWeek[] = [];
    const rawMonthLabels: MonthLabel[] = [];
    let questionsCount = 0;
    let activeDaysCount = 0;

    for (const record of activity) {
      if (activityEffort(record) > 0) {
        activeDaysCount++;
        questionsCount += record.questions_answered || 0;
      }
    }

    for (let w = 0; w < totalWeeks; w++) {
      const days: HeatmapDay[] = [];

      for (let d = 0; d < 7; d++) {
        const cellTimeMs = startOfGridMs + (w * 7 + d) * 86_400_000;
        const cellDate = new Date(cellTimeMs);
        const cellYear = cellDate.getUTCFullYear();
        const cellMonth = cellDate.getUTCMonth();
        const cellDay = cellDate.getUTCDate();
        const cellKey = `${cellYear}-${String(cellMonth + 1).padStart(2, "0")}-${String(cellDay).padStart(2, "0")}`;

        const isToday = cellKey === todayKey;
        const isFuture = cellKey > todayKey;
        const record = !isFuture ? activityByDate.get(cellKey) : undefined;
        const effort = !isFuture ? activityEffort(record) : 0;
        const intensity = !isFuture ? intensityFor(record) : 0;

        days.push({
          key: cellKey,
          dayOfMonth: cellDay,
          monthIndex: cellMonth,
          dayOfWeek: d,
          isToday,
          isFuture,
          activity: record,
          effort,
          intensity,
        });
      }

      generatedWeeks.push({ weekIndex: w, days });
    }

    // Place month labels directly above the week containing the 1st of that month
    let lastLabeledWeek = -5;
    for (let w = 0; w < totalWeeks; w++) {
      const week = generatedWeeks[w];
      const firstDay = week.days.find((d) => d.dayOfMonth === 1);
      if (firstDay) {
        if (w - lastLabeledWeek >= 3) {
          rawMonthLabels.push({
            monthName: MONTH_NAMES[firstDay.monthIndex],
            weekIndex: w,
          });
          lastLabeledWeek = w;
        }
      } else if (w === 0 && totalWeeks > 0) {
        const startingMonth = week.days[0].monthIndex;
        const earlyFirst = generatedWeeks.slice(1, 4).some((gw) => gw.days.some((d) => d.dayOfMonth === 1));
        if (!earlyFirst) {
          rawMonthLabels.push({
            monthName: MONTH_NAMES[startingMonth],
            weekIndex: 0,
          });
          lastLabeledWeek = 0;
        }
      }
    }

    return {
      weeks: generatedWeeks,
      monthLabels: rawMonthLabels,
      yearQuestionsReviewed: questionsCount,
      yearActiveDays: activeDaysCount,
    };
  }, [todayKey, activityByDate, activity, isMobileOrTablet]);

  // Auto-scroll to the right (most recent activity) so left side is cut off when width shrinks
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const scrollToRight = () => {
      if (el.scrollWidth > el.clientWidth) {
        el.scrollLeft = el.scrollWidth;
      } else {
        el.scrollLeft = 0;
      }
    };

    scrollToRight();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        scrollToRight();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  // Format date readable
  const formatCellDate = useCallback((key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }, []);

  const updateActiveCellFromTarget = (target: HTMLButtonElement, day: HeatmapDay) => {
    if (day.isFuture) {
      setActiveCell(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const cardRect = cardRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1000 };
    const cellCenterX = rect.left - cardRect.left + rect.width / 2;
    const cellTopY = rect.top - cardRect.top;
    const isNearTop = cellTopY < 75;
    const clampedX = Math.max(95, Math.min(cardRect.width - 95, cellCenterX));

    setActiveCell({
      day,
      x: clampedX,
      y: isNearTop ? rect.bottom - cardRect.top : cellTopY,
      isBelow: isNearTop,
    });
  };

  const handleCellHover = (e: React.MouseEvent<HTMLButtonElement>, day: HeatmapDay) => {
    updateActiveCellFromTarget(e.currentTarget, day);
  };

  const handleCellFocus = (e: React.FocusEvent<HTMLButtonElement>, day: HeatmapDay) => {
    updateActiveCellFromTarget(e.currentTarget, day);
  };

  const handleCellBlur = () => {
    setActiveCell(null);
  };

  const handleCellTouch = (e: React.MouseEvent<HTMLButtonElement>, day: HeatmapDay) => {
    if (day.isFuture) return;
    if (activeCell?.day.key === day.key) {
      setActiveCell(null);
    } else {
      updateActiveCellFromTarget(e.currentTarget, day);
    }
  };

  return (
    <section className="activity-heatmap-card" ref={cardRef} aria-label="Study activity heatmap">
      {/* Header with Title, Summary Stats, and Direct Calendar Nav */}
      <div className="activity-heatmap-header">
        <div className="activity-heatmap-heading-row">
          <div className="activity-heatmap-title-with-icon">
            <span className="activity-heatmap-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <polyline points="9 16 12 13 15 16" />
              </svg>
            </span>
            <h2 className="activity-heatmap-title">Study Activity</h2>
          </div>
        </div>

        <div className="activity-heatmap-stats-row">
          <div className="activity-heatmap-stat-item">
            <div className="activity-heatmap-stat-num-row">
              <svg className="activity-streak-flame" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
              <strong>{streak.current}</strong>
            </div>
            <span>day streak</span>
          </div>

          <div className="activity-heatmap-stat-item">
            <strong>{yearActiveDays}</strong>
            <span>active days</span>
          </div>

          <div className="activity-heatmap-stat-item">
            <strong>{yearQuestionsReviewed.toLocaleString()}</strong>
            <span>questions</span>
          </div>
        </div>
      </div>

      {/* Scrollable Heatmap Body */}
      <div className="activity-heatmap-scroll-wrapper" ref={scrollContainerRef}>
        <div className="activity-heatmap-grid-layout" role="grid" aria-label={isMobileOrTablet ? "3-month study activity chart" : "6-month study activity chart"}>
          {/* Day of week labels on left (Mon, Wed, Fri) */}
          <div className="activity-heatmap-day-labels" aria-hidden="true">
            {DAY_LABELS.map(({ row, label }) => (
              <span
                key={label}
                className="activity-heatmap-day-label"
                style={{ gridRow: row + 1 }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Month labels along the top */}
          <div className="activity-heatmap-months" aria-hidden="true">
            {monthLabels.map(({ monthName, weekIndex }) => (
              <span
                key={`${monthName}-${weekIndex}`}
                className="activity-heatmap-month-label"
                style={{
                  left: `${weekIndex * (isMobileOrTablet ? 14.5 : 17.5)}px`,
                }}
              >
                {monthName}
              </span>
            ))}
          </div>

          {/* Week Columns */}
          <div className="activity-heatmap-weeks">
            {weeks.map((week) => (
              <div key={week.weekIndex} className="activity-heatmap-week-column" role="row">
                {week.days.map((day) => {
                  const hasActivity = !day.isFuture && day.effort > 0;
                  const ariaDescription = day.isFuture
                    ? `${formatCellDate(day.key)}: Upcoming`
                    : hasActivity
                    ? `${formatCellDate(day.key)}: ${day.activity?.questions_answered ?? 0} questions reviewed, ${day.activity?.correct_answers ?? 0} correct`
                    : `${formatCellDate(day.key)}: No study activity`;

                  return (
                    <button
                      key={day.key}
                      type="button"
                      role="gridcell"
                      aria-label={ariaDescription}
                      tabIndex={day.isFuture ? -1 : 0}
                      disabled={day.isFuture}
                      className={`activity-cell intensity-${day.intensity} ${
                        day.isToday ? "is-today" : ""
                      } ${day.isFuture ? "is-future" : ""}`}
                      onMouseEnter={(e) => handleCellHover(e, day)}
                      onMouseLeave={() => setActiveCell(null)}
                      onFocus={(e) => handleCellFocus(e, day)}
                      onBlur={handleCellBlur}
                      onClick={(e) => handleCellTouch(e, day)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer with Legend */}
      <div className="activity-heatmap-footer">
        <span className="activity-heatmap-caption">
          Reflects completed reviewer questions and study sessions.
        </span>
        <div className="activity-heatmap-legend" aria-label="Activity intensity scale">
          <span className="legend-label">Less</span>
          <span className="legend-cell intensity-0" title="No activity" />
          <span className="legend-cell intensity-1" title="Low activity" />
          <span className="legend-cell intensity-2" title="Moderate activity" />
          <span className="legend-cell intensity-3" title="High activity" />
          <span className="legend-cell intensity-4" title="Very high activity" />
          <span className="legend-label">More</span>
        </div>
      </div>

      {/* Floating Tooltip outside scroll wrapper to prevent clipping */}
      {activeCell && (
        <div
          className={`activity-heatmap-tooltip ${activeCell.isBelow ? "is-below" : ""}`}
          role="tooltip"
          style={{
            left: `${activeCell.x}px`,
            top: `${activeCell.y}px`,
          }}
        >
          <div className="activity-tooltip-date">
            {formatCellDate(activeCell.day.key)}
          </div>
          {activeCell.day.effort > 0 ? (
            <div className="activity-tooltip-stats">
              <div className="activity-tooltip-metric">
                <strong>{activeCell.day.activity?.questions_answered ?? 0}</strong> questions reviewed
              </div>
              {(activeCell.day.activity?.correct_answers ?? 0) > 0 && (
                <div className="activity-tooltip-sub">
                  {activeCell.day.activity?.correct_answers} correct ({Math.round(
                    ((activeCell.day.activity?.correct_answers ?? 0) /
                      Math.max(1, activeCell.day.activity?.questions_answered ?? 1)) *
                      100
                  )}% accuracy)
                </div>
              )}
              {(activeCell.day.activity?.review_count ?? 0) > 0 && (
                <div className="activity-tooltip-sub">
                  {activeCell.day.activity?.review_count} AI review session{activeCell.day.activity?.review_count === 1 ? "" : "s"}
                </div>
              )}
            </div>
          ) : (
            <div className="activity-tooltip-empty">
              No study activity recorded
            </div>
          )}
        </div>
      )}
    </section>
  );
}
