"use client";

import type { ProgressionSnapshot, ProgressMetrics } from "../lib/domain";
import { levelProgress, metricForCondition } from "../lib/xpConfig";

export function XpProgress({ totalXp, compact = false }: { totalXp: number; compact?: boolean }) {
  const progress = levelProgress(totalXp);
  return (
    <div className={`xp-progress ${compact ? "compact" : ""}`}>
      <div className="xp-progress-copy">
        <span>{progress.totalXp} / {progress.nextLevelXp} XP</span>
        {!compact && <small>{progress.xpNeeded} XP to Level {progress.level + 1}</small>}
      </div>
      <div className="xp-meter" role="progressbar" aria-label={`Level ${progress.level} XP progress`} aria-valuemin={0} aria-valuemax={progress.nextLevelXp} aria-valuenow={progress.totalXp}>
        <span style={{ width: `${progress.progressPercent}%` }} />
      </div>
    </div>
  );
}

export default function AchievementModal({ progression, metrics, onClose }: {
  progression: ProgressionSnapshot;
  metrics: ProgressMetrics;
  onClose: () => void;
}) {
  const level = levelProgress(progression.totalXp);
  const unlockedIds = new Set(progression.unlocked.map((item) => item.achievement_id));
  const unlocked = progression.achievements.filter((achievement) => unlockedIds.has(achievement.id));
  const locked = progression.achievements.filter((achievement) => !unlockedIds.has(achievement.id));
  const completeMetrics = { ...metrics, studySessions: progression.studySessions };

  return (
    <div className="achievement-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="achievement-modal" role="dialog" aria-modal="true" aria-labelledby="achievement-title">
        <div className="achievement-heading">
          <div><p className="eyebrow">Your progression</p><h2 id="achievement-title">Level {level.level} · {level.title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close achievements">×</button>
        </div>
        <XpProgress totalXp={progression.totalXp} />
        <div className="achievement-count"><strong>{unlocked.length} / {progression.achievements.length}</strong><span>achievements unlocked</span></div>

        <div className="achievement-section">
          <div className="achievement-section-title"><h3>Unlocked</h3><span>{unlocked.length}</span></div>
          {unlocked.length ? <div className="achievement-list">{unlocked.map((achievement) => (
            <article className="achievement-row unlocked" key={achievement.id}>
              <span className="achievement-icon" aria-hidden="true">{achievement.icon ?? "✦"}</span>
              <div><strong>{achievement.name}</strong><p>{achievement.description}</p></div>
              <b>+{achievement.xp_reward} XP</b>
            </article>
          ))}</div> : <p className="achievement-empty">Your first achievement is one answered question away.</p>}
        </div>

        <div className="achievement-section">
          <div className="achievement-section-title"><h3>Locked</h3><span>{locked.length}</span></div>
          <div className="achievement-list">{locked.map((achievement) => {
            const current = metricForCondition(achievement.condition_type, completeMetrics);
            return (
              <article className="achievement-row locked" key={achievement.id}>
                <span className="achievement-icon" aria-hidden="true">○</span>
                <div><strong>{achievement.name}</strong><p>{achievement.description}</p><small>{Math.min(current, achievement.condition_value)} / {achievement.condition_value}</small></div>
                <b>+{achievement.xp_reward} XP</b>
              </article>
            );
          })}</div>
        </div>
      </section>
    </div>
  );
}
