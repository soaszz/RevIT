"use client";

import React, { useState } from "react";
import type { MilestoneCategory, ProgressionSnapshotData } from "../../lib/progression/types";
import type { Achievement } from "../../lib/domain";
import styles from "./MissionsModal.module.css";

type Tab = "daily" | "weekly" | "milestones" | "achievements";

export default function MissionsModal({
  isOpen,
  onClose,
  progression,
  achievementsCatalog = [],
  unlockedAchievements = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  progression: ProgressionSnapshotData;
  achievementsCatalog?: Achievement[];
  unlockedAchievements?: { achievement_id: string; unlocked_at: string }[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("daily");
  const [selectedMilestoneCat, setSelectedMilestoneCat] = useState<MilestoneCategory | "all">("all");

  if (!isOpen) return null;

  const currentXpInLevel = Math.max(0, progression.totalXp - progression.currentLevelXp);
  const neededXpInLevel = Math.max(1, progression.nextLevelXp - progression.currentLevelXp);

  const unlockedIdSet = new Set(unlockedAchievements.map((u) => u.achievement_id));

  const filteredMilestones = selectedMilestoneCat === "all"
    ? progression.milestones
    : progression.milestones.filter((m) => m.category === selectedMilestoneCat);

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="missions-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.titleArea}>
              <span className={styles.eyebrow}>Gamified Study Progression</span>
              <h2 id="missions-title" className={styles.title}>Missions &amp; Progression</h2>
            </div>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close dialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Level & Streaks Progression Banner */}
          <div className={styles.progressionBanner}>
            <div className={styles.levelInfo}>
              <div className={styles.levelTagRow}>
                <span className={styles.levelTag}>Level {progression.level}</span>
                <strong className={styles.levelTitle}>{progression.levelTitle}</strong>
              </div>
              <div className={styles.xpBarTrack}>
                <div
                  className={styles.xpBarFill}
                  style={{ width: `${Math.min(100, Math.max(0, progression.progressPercent))}%` }}
                />
              </div>
              <span className={styles.xpNumeric}>
                {currentXpInLevel.toLocaleString()} / {neededXpInLevel.toLocaleString()} XP ({progression.xpNeeded.toLocaleString()} XP to Level {progression.level + 1})
              </span>
            </div>

            <div className={styles.streakStatus}>
              <span className={styles.streakValue}>{progression.currentStreak} Day Streak</span>
              <span className={styles.streakBest}>Best: {progression.bestStreak} days</span>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className={styles.tabs} aria-label="Progression tabs">
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "daily" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("daily")}
          >
            Today's Missions ({progression.completedDailyCount}/{progression.totalDailyCount})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "weekly" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("weekly")}
          >
            Weekly Missions
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "milestones" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("milestones")}
          >
            Milestones
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "achievements" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("achievements")}
          >
            Achievements ({unlockedAchievements.length}/{achievementsCatalog.length})
          </button>
        </nav>

        {/* Tab Body */}
        <div className={styles.body}>
          {/* TAB 1: Today's Missions */}
          {activeTab === "daily" && (
            <div className={styles.missionList}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Assigned Daily Missions</span>
                <span className={styles.timeRemaining}>Resets at midnight</span>
              </div>
              {progression.dailyMissions.map((m) => {
                const percent = Math.min(100, Math.round((m.current / m.target) * 100));
                return (
                  <div key={m.missionId} className={`${styles.missionItem} ${m.completed ? styles.missionItemCompleted : ""}`}>
                    <div className={styles.missionTop}>
                      <div className={styles.missionMeta}>
                        <div className={styles.missionTitleRow}>
                          <strong className={styles.missionTitle}>{m.title}</strong>
                        </div>
                        <span className={styles.missionDesc}>{m.description}</span>
                      </div>
                      <div className={styles.missionRewardBadge}>
                        {m.completed ? (
                          <div className={styles.completedCheck} aria-label="Completed">✓</div>
                        ) : (
                          <span>+{m.xpReward} XP</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.missionProgressRow}>
                      <div className={styles.progressBarTrack}>
                        <div className={styles.progressBarFill} style={{ width: `${percent}%` }} />
                      </div>
                      <span className={styles.progressNumbers}>
                        {m.current} / {m.target} {m.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: Weekly Missions */}
          {activeTab === "weekly" && (
            <div className={styles.missionList}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Weekly Challenges</span>
                <span className={styles.timeRemaining}>{progression.daysLeftInWeek} days remaining</span>
              </div>
              {progression.weeklyMissions.map((m) => {
                const percent = Math.min(100, Math.round((m.current / m.target) * 100));
                return (
                  <div key={m.missionId} className={`${styles.missionItem} ${m.completed ? styles.missionItemCompleted : ""}`}>
                    <div className={styles.missionTop}>
                      <div className={styles.missionMeta}>
                        <div className={styles.missionTitleRow}>
                          <strong className={styles.missionTitle}>{m.title}</strong>
                        </div>
                        <span className={styles.missionDesc}>{m.description}</span>
                      </div>
                      <div className={styles.missionRewardBadge}>
                        {m.completed ? (
                          <div className={styles.completedCheck} aria-label="Completed">✓</div>
                        ) : (
                          <span>+{m.xpReward} XP</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.missionProgressRow}>
                      <div className={styles.progressBarTrack}>
                        <div className={styles.progressBarFill} style={{ width: `${percent}%` }} />
                      </div>
                      <span className={styles.progressNumbers}>
                        {m.current} / {m.target} {m.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: Milestones */}
          {activeTab === "milestones" && (
            <div className={styles.missionList}>
              <div className={styles.categoryPills}>
                {(["all", "mcqs", "correct", "flashcards", "weakness", "streaks", "library"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`${styles.catBtn} ${selectedMilestoneCat === cat ? styles.catBtnActive : ""}`}
                    onClick={() => setSelectedMilestoneCat(cat)}
                  >
                    {cat === "all" ? "All Milestones" : cat.toUpperCase()}
                  </button>
                ))}
              </div>

              {filteredMilestones.map((m) => {
                const percent = Math.min(100, Math.round((m.current / m.target) * 100));
                return (
                  <div key={m.milestoneId} className={`${styles.missionItem} ${m.completed ? styles.missionItemCompleted : ""}`}>
                    <div className={styles.missionTop}>
                      <div className={styles.missionMeta}>
                        <strong className={styles.missionTitle}>{m.title}</strong>
                        <span className={styles.missionDesc}>{m.description}</span>
                      </div>
                      <div className={styles.missionRewardBadge}>
                        {m.completed ? (
                          <div className={styles.completedCheck} aria-label="Unlocked">✓</div>
                        ) : (
                          <span>+{m.xpReward} XP</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.missionProgressRow}>
                      <div className={styles.progressBarTrack}>
                        <div className={styles.progressBarFill} style={{ width: `${percent}%` }} />
                      </div>
                      <span className={styles.progressNumbers}>
                        {m.current.toLocaleString()} / {m.target.toLocaleString()} {m.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: Achievements */}
          {activeTab === "achievements" && (
            <div className={styles.missionList}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Permanent Achievements</span>
                <span className={styles.timeRemaining}>{unlockedAchievements.length} Unlocked</span>
              </div>
              {achievementsCatalog.map((a) => {
                const isUnlocked = unlockedIdSet.has(a.id);
                return (
                  <div key={a.id} className={`${styles.missionItem} ${isUnlocked ? styles.missionItemCompleted : ""}`} style={{ opacity: isUnlocked ? 1 : 0.65 }}>
                    <div className={styles.missionTop}>
                      <div className={styles.missionMeta}>
                        <strong className={styles.missionTitle}>{a.name}</strong>
                        <span className={styles.missionDesc}>{a.description}</span>
                      </div>
                      <div className={styles.missionRewardBadge}>
                        {isUnlocked ? (
                          <div className={styles.completedCheck} aria-label="Unlocked">✓</div>
                        ) : (
                          <span>+{a.xp_reward} XP</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
