export const REVIEW_TIMER_DURATIONS = [30, 60] as const;

export type ReviewTimerDuration = (typeof REVIEW_TIMER_DURATIONS)[number];
export type ReviewTimerVisualState = "normal" | "approaching" | "critical";

export function reviewTimerVisualState(
  remainingSeconds: number,
  durationSeconds: ReviewTimerDuration,
): ReviewTimerVisualState {
  if (remainingSeconds <= 5) return "critical";
  if (remainingSeconds <= durationSeconds * 0.25) return "approaching";
  return "normal";
}

export function reviewTimerProgress(remainingMilliseconds: number, durationSeconds: ReviewTimerDuration) {
  return Math.min(1, Math.max(0, remainingMilliseconds / (durationSeconds * 1000)));
}
