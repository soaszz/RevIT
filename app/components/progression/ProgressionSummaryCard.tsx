"use client";

import React from "react";
import type { ProgressionSnapshotData } from "../../lib/progression/types";
import styles from "./ProgressionSummaryCard.module.css";

export default function ProgressionSummaryCard({
  progression,
  onOpenMissions,
}: {
  progression: ProgressionSnapshotData;
  onOpenMissions: () => void;
}) {
  const currentXpInLevel = Math.max(0, progression.totalXp - progression.currentLevelXp);
  const neededXpInLevel = Math.max(1, progression.nextLevelXp - progression.currentLevelXp);

  return (
    <div className={styles.compactCard} aria-label="Level Progress and Daily Missions">
      <div className={styles.levelRow}>
        <div className={styles.levelInfo}>
          <span className={styles.levelNumber}>Lv. {progression.level}</span>
          <span className={styles.levelTitle}>{progression.levelTitle}</span>
        </div>
        <span className={styles.xpText}>
          {currentXpInLevel.toLocaleString()} / {neededXpInLevel.toLocaleString()} XP
        </span>
      </div>

      <div className={styles.xpTrack}>
        <div
          className={styles.xpFill}
          style={{ width: `${Math.min(100, Math.max(0, progression.progressPercent))}%` }}
        />
      </div>

      <div className={styles.missionsRow}>
        <span className={styles.missionsCount}>
          {progression.completedDailyCount} / {progression.totalDailyCount} missions today
        </span>
        <button
          type="button"
          className={styles.viewMissionsBtn}
          onClick={onOpenMissions}
        >
          View missions →
        </button>
      </div>
    </div>
  );
}
