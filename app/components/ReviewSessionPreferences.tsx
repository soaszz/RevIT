"use client";

import { useId, useState } from "react";
import type { ReviewTimerDuration } from "../lib/reviewTimer";
import styles from "./ReviewSessionPreferences.module.css";

type ReviewSessionPreferencesProps = {
  timerEnabled: boolean;
  timerDuration: ReviewTimerDuration;
  soundEffectsEnabled: boolean;
  onTimerEnabledChange: (enabled: boolean) => void;
  onTimerDurationChange: (duration: ReviewTimerDuration) => void;
  onSoundEffectsEnabledChange: (enabled: boolean) => void;
};

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.2 1.8" />
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 10v4h3l4 3.5v-11L8 10H5Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M17.8 6.7a7.2 7.2 0 0 1 0 10.6" />
    </svg>
  );
}

function PreferenceSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      className={`${styles.switch} ${checked ? styles.switchEnabled : ""}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchLabel} aria-hidden="true">{checked ? "On" : "Off"}</span>
      <span className={styles.switchThumb} aria-hidden="true" />
    </button>
  );
}

export default function ReviewSessionPreferences({
  timerEnabled,
  timerDuration,
  soundEffectsEnabled,
  onTimerEnabledChange,
  onTimerDurationChange,
  onSoundEffectsEnabledChange,
}: ReviewSessionPreferencesProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const preferencesId = useId();
  const timerSummary = timerEnabled ? `${timerDuration}-second timer` : "Timer off";
  const soundSummary = soundEffectsEnabled ? "sound on" : "sound off";

  return (
    <section className={styles.panel} aria-label="Review session preferences">
      <button
        className={styles.mobileSummary}
        type="button"
        aria-expanded={mobileExpanded}
        aria-controls={preferencesId}
        onClick={() => setMobileExpanded((expanded) => !expanded)}
      >
        <span className={styles.icon}><ClockIcon /></span>
        <span className={styles.copy}>
          <strong>Question timer &amp; sound effects</strong>
          <small>{timerSummary} · {soundSummary}</small>
        </span>
        <span className={`${styles.chevron} ${mobileExpanded ? styles.chevronExpanded : ""}`} aria-hidden="true">⌄</span>
      </button>

      <div id={preferencesId} className={`${styles.preferencesBody} ${mobileExpanded ? "" : styles.preferencesBodyCollapsed}`}>
        <div className={styles.preferenceHeader}>
          <span className={styles.icon}><ClockIcon /></span>
          <span className={styles.copy}>
            <strong>Question timer</strong>
            <small>Keep a steady pace for every question.</small>
          </span>
          <PreferenceSwitch checked={timerEnabled} label="Enable question timer" onChange={onTimerEnabledChange} />
        </div>

        <fieldset className={`${styles.durationFieldset} ${timerEnabled ? "" : styles.durationDisabled}`} disabled={!timerEnabled}>
          <legend>Time per question</legend>
          <div className={styles.durationOptions}>
            <label aria-label="30 seconds" className={`${styles.durationOption} ${timerDuration === 30 ? styles.durationSelected : ""}`} htmlFor="review-timer-duration-30">
              <input
                id="review-timer-duration-30"
                type="radio"
                name="review-timer-duration"
                value="30"
                checked={timerDuration === 30}
                disabled={!timerEnabled}
                onChange={() => onTimerDurationChange(30)}
              />
              <span><strong>30</strong><small>seconds</small></span>
              <i aria-hidden="true" />
            </label>
            <label aria-label="60 seconds" className={`${styles.durationOption} ${timerDuration === 60 ? styles.durationSelected : ""}`} htmlFor="review-timer-duration-60">
              <input
                id="review-timer-duration-60"
                type="radio"
                name="review-timer-duration"
                value="60"
                checked={timerDuration === 60}
                disabled={!timerEnabled}
                onChange={() => onTimerDurationChange(60)}
              />
              <span><strong>60</strong><small>seconds · 1 min</small></span>
              <i aria-hidden="true" />
            </label>
          </div>
        </fieldset>

        <div className={styles.divider} />

        <div className={styles.preferenceHeader}>
          <span className={styles.icon}><SoundIcon /></span>
          <span className={styles.copy}>
            <strong>Sound effects</strong>
            <small>Soft tones for answers and timeouts.</small>
          </span>
          <PreferenceSwitch checked={soundEffectsEnabled} label="Enable review sound effects" onChange={onSoundEffectsEnabledChange} />
        </div>
      </div>
    </section>
  );
}
