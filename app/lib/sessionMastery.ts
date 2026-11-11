type Answer = { questionId: string; correct: boolean };

export function allQuestionIds(poolIds: readonly string[], targetCount: number) {
  const unique = [...new Set(poolIds)];
  return targetCount >= unique.length ? unique : null;
}

export function sessionMastery(questionIds: readonly string[], answers: readonly Answer[]) {
  const states = new Map([...new Set(questionIds)].map(id => [id, { seen: false, retry: false, streak: 0, complete: false }]));
  for (const answer of answers) {
    const state = states.get(answer.questionId);
    if (!state || state.complete) continue;
    if (!state.seen) {
      state.seen = true;
      state.retry = !answer.correct;
      state.complete = answer.correct;
    } else {
      state.streak = answer.correct ? state.streak + 1 : 0;
      state.complete = state.streak === 2;
    }
  }
  const values = [...states.values()];
  return {
    states,
    unique: states.size,
    completed: values.filter(state => state.complete).length,
    awaitingRetry: values.filter(state => state.retry && !state.complete).length,
    done: states.size > 0 && values.every(state => state.complete),
  };
}

export function queueAfterAnswer(questionIds: readonly string[], index: number, answers: readonly Answer[]) {
  const id = questionIds[index];
  const state = sessionMastery(questionIds, answers).states.get(id);
  if (!state || state.complete || questionIds.slice(index + 1).includes(id)) return [...questionIds];
  return [...questionIds, id];
}

export function firstSessionAnswers<T extends Answer>(answers: readonly T[]): T[] {
  const seen = new Set<string>();
  return answers.filter(answer => {
    if (seen.has(answer.questionId)) return false;
    seen.add(answer.questionId);
    return true;
  });
}

// Older snapshots may have stopped repeating after one correct answer.
// Retain their answered prefix and queue every still-unmastered question once.
export function upgradeMasteryQueue(questionIds: readonly string[], index: number, answers: readonly Answer[]) {
  const mastery = sessionMastery(questionIds, answers);
  const prefix = questionIds.slice(0, index);
  const completed = [...new Set(questionIds.slice(index).filter(id => mastery.states.get(id)?.complete && !prefix.includes(id)))];
  const pending = [...new Set(questionIds.slice(index).filter(id => !mastery.states.get(id)?.complete))];
  for (const [id, state] of mastery.states) if (!state.complete && !pending.includes(id)) pending.push(id);
  return [...prefix, ...completed, ...pending];
}
