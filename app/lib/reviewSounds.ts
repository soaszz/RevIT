export type ReviewSound = "correct" | "incorrect" | "timeout";

let reviewAudioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  reviewAudioContext ??= new window.AudioContext();
  return reviewAudioContext;
}

export async function unlockReviewSounds() {
  try {
    const context = getAudioContext();
    if (context?.state === "suspended") await context.resume();
  } catch {
    // Some browsers do not expose Web Audio until after a supported user gesture.
  }
}

function scheduleTone(
  context: AudioContext,
  frequency: number,
  startsAt: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.015);
}

export async function playReviewSound(sound: ReviewSound) {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") await context.resume();
    const now = context.currentTime + 0.01;
    if (sound === "correct") {
      scheduleTone(context, 523.25, now, 0.14, 0.028);
      scheduleTone(context, 659.25, now + 0.085, 0.17, 0.024);
      return;
    }
    if (sound === "timeout") {
      scheduleTone(context, 293.66, now, 0.16, 0.021, "triangle");
      scheduleTone(context, 246.94, now + 0.1, 0.18, 0.018, "triangle");
      return;
    }
    scheduleTone(context, 220, now, 0.2, 0.022, "sine");
    scheduleTone(context, 174.61, now + 0.075, 0.19, 0.016, "sine");
  } catch {
    // Audio feedback is optional and must never interrupt a review session.
  }
}
