import type { ReviewerQuestion } from "../content/reviewerContent";

export function encodeMatchingAnswers(answers: number[], optionCount: number): number | null {
  if (!optionCount || !answers.length || Array.from({ length: answers.length }, (_, index) => answers[index]).some((answer) => !Number.isInteger(answer) || answer < 0 || answer >= optionCount)) return null;
  return answers.reduce((encoded, answer) => encoded * optionCount + answer, 0);
}

export function isQuestionAnswerCorrect(question: ReviewerQuestion, selectedAnswer: number | null): boolean {
  if (selectedAnswer === null) return false;
  if (!question.matching) return selectedAnswer === question.correctAnswer;
  const { answerKey, items } = question.matching;
  const optionCount = question.choices.length;
  if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0 || selectedAnswer >= optionCount ** items.length) return false;
  return encodeMatchingAnswers(answerKey, optionCount) === selectedAnswer;
}

export function parseMatchingChoice(choice: string, index: number) {
  const trimmed = choice.trim();
  const mParen = trimmed.match(/^([A-Za-z0-9]+)\s*[):]\s*(.*)$/);
  if (mParen) {
    return {
      id: index,
      label: mParen[1],
      text: mParen[2].trim(),
    };
  }
  const mBracket = trimmed.match(/^([A-Za-z0-9]+)\s*\((.*?)\)$/);
  if (mBracket) {
    return {
      id: index,
      label: mBracket[1],
      text: mBracket[2].trim(),
    };
  }
  return {
    id: index,
    label: String.fromCharCode(65 + index),
    text: trimmed,
  };
}
