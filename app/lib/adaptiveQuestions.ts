export type ReinforcementLevels = Record<string, number>;

export const MAX_REINFORCEMENT_LEVEL = 3;
export const MIN_REINFORCEMENT_GAP = 3;
export const REINFORCEMENT_DRAW_CHANCE = 0.4;

function clampRandom(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 0.999999999);
}

export function reinforcementLevelAfterAnswer(currentLevel: number, correct: boolean) {
  if (correct) return 0;
  return Math.min(MAX_REINFORCEMENT_LEVEL, Math.max(0, currentLevel) + 1);
}

export function reinforcementAfterAnswer(
  current: ReinforcementLevels,
  questionId: string,
  correct: boolean,
) {
  if (correct && !current[questionId]) return current;
  const next = { ...current };
  const level = reinforcementLevelAfterAnswer(current[questionId] ?? 0, correct);
  if (level === 0) delete next[questionId];
  else next[questionId] = level;
  return next;
}

function weightedPick(
  candidates: string[],
  reinforcement: ReinforcementLevels,
  random: () => number,
) {
  const weights = candidates.map((id) => Math.min(4, 1 + (reinforcement[id] ?? 0)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = clampRandom(random()) * total;
  for (let index = 0; index < candidates.length; index += 1) {
    target -= weights[index];
    if (target < 0) return candidates[index];
  }
  return candidates.at(-1) ?? null;
}

export function chooseAdaptiveQuestion(
  poolIds: string[],
  reinforcement: ReinforcementLevels,
  history: string[],
  random: () => number = Math.random,
) {
  const pool = [...new Set(poolIds)];
  if (!pool.length) return null;

  const gap = Math.min(MIN_REINFORCEMENT_GAP, Math.max(0, pool.length - 1));
  const recent = new Set(history.slice(-gap));
  let eligible = pool.filter((id) => !recent.has(id));

  if (!eligible.length) {
    const last = history.at(-1);
    eligible = pool.filter((id) => id !== last);
  }
  if (!eligible.length) eligible = pool;

  const reinforced = eligible.filter((id) => (reinforcement[id] ?? 0) > 0);
  const normal = eligible.filter((id) => (reinforcement[id] ?? 0) === 0);

  let candidates = eligible;
  if (reinforced.length && normal.length) {
    candidates = clampRandom(random()) < REINFORCEMENT_DRAW_CHANCE ? reinforced : normal;
  }

  const unseen = candidates.filter((id) => !history.includes(id));
  if (!reinforced.includes(candidates[0]) && unseen.length) candidates = unseen;

  return weightedPick(candidates, reinforcement, random);
}
