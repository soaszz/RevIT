import type { ReviewerQuestion } from "../content/reviewerContent";
import { encodeMatchingAnswers, isQuestionAnswerCorrect } from "./matchingQuestion";

export type ReviewerAnswerResponse = { kind: "single_choice"; choiceIndex: number }
  | { kind: "matching"; selections: number[] } | { kind: "timeout" };

const matchingShapes: Record<string, [number, number]> = {
  "elsevier-ch02-044":[4,4], "elsevier-ch02-048":[4,4],
  "elsevier-ch10-007":[3,1], "elsevier-ch10-008":[3,1], "elsevier-ch10-009":[3,1],
};
export function compatibleReviewerBook(questionId: string) {
  if (/^boc-7e-ch0[1-8]-\d{3}$/.test(questionId)) return "BOC" as const;
  if (/^elsevier-(?:ch\d{2}|mock)-\d{3}$/.test(questionId)) return "Elsevier" as const;
  return null;
}
export function reviewerResponseFromLocal(questionId: string, selectedAnswer: number | null): ReviewerAnswerResponse {
  if (!compatibleReviewerBook(questionId)) throw new Error("INVALID_BOOK");
  if (selectedAnswer === null) return {kind:"timeout"};
  const shape=matchingShapes[questionId];
  if (!shape) {
    if (!Number.isSafeInteger(selectedAnswer) || selectedAnswer<0 || selectedAnswer>4) throw new Error("INVALID_RESPONSE");
    return {kind:"single_choice",choiceIndex:selectedAnswer};
  }
  const [choices,items]=shape;
  if (!Number.isSafeInteger(selectedAnswer)||selectedAnswer<0||selectedAnswer>=choices**items) throw new Error("INVALID_RESPONSE");
  const selections=Array<number>(items);let value=selectedAnswer;
  for(let i=items-1;i>=0;i--){selections[i]=value%choices;value=Math.floor(value/choices)}
  return {kind:"matching",selections};
}
export function reviewerHistoryAnswer(questionId: string, scalar: number | null, response?: ReviewerAnswerResponse | null) {
  if (!compatibleReviewerBook(questionId)) return scalar;
  if (!response) return scalar; // Preserve old local/history records; never reconstruct missing vectors.
  const shape=matchingShapes[questionId];
  if (response.kind==='matching' && (!shape || response.selections.length!==shape[1])) throw new Error("INVALID_RESPONSE");
  if (response.kind==='single_choice' && shape) throw new Error("INVALID_RESPONSE");
  return reviewerSelectedAnswer(response,shape?.[0]??5);
}

// Publication-independent validation. Callers must separately enforce publication and Pro.
export function prepareReviewerResponse(question: ReviewerQuestion, book: string, response: ReviewerAnswerResponse) {
  if (!((book === "BOC" && /^boc-7e-ch0[1-8]-\d{3}$/.test(question.id))
    || (book === "Elsevier" && /^elsevier-(?:ch\d{2}|mock)-\d{3}$/.test(question.id)))
    || question.book !== book) throw new Error("INVALID_BOOK");
  let selected: number | null = null;
  if (response.kind === "single_choice") {
    if (question.matching || !Number.isSafeInteger(response.choiceIndex) || response.choiceIndex < 0
      || response.choiceIndex >= question.choices.length) throw new Error("INVALID_RESPONSE");
    selected = response.choiceIndex;
  } else if (response.kind === "matching") {
    if (!question.matching || response.selections.length !== question.matching.items.length
      || response.selections.some(i => !Number.isSafeInteger(i) || i < 0 || i >= question.choices.length)) throw new Error("INVALID_RESPONSE");
    selected = encodeMatchingAnswers(response.selections, question.choices.length);
  } else if (response.kind !== "timeout") throw new Error("INVALID_RESPONSE");
  return { response, selectedAnswer: response.kind === "single_choice" ? selected : null,
    localSelectedAnswer: selected, isCorrect: isQuestionAnswerCorrect(question, selected),
    choiceCount: question.choices.length, matchingItems: question.matching?.items.length ?? 0 };
}

// Restore the original local matching encoding while retaining the exact stored vector.
export function reviewerSelectedAnswer(response: ReviewerAnswerResponse, choiceCount: number): number | null {
  if (!Number.isSafeInteger(choiceCount) || choiceCount < 2) throw new Error("INVALID_RESPONSE");
  if (response.kind === "timeout") return null;
  if (response.kind === "matching") {
    const encoded = encodeMatchingAnswers(response.selections, choiceCount);
    if (encoded === null || !Number.isSafeInteger(encoded)) throw new Error("INVALID_RESPONSE");
    return encoded;
  }
  if (!Number.isSafeInteger(response.choiceIndex) || response.choiceIndex < 0 || response.choiceIndex >= choiceCount) throw new Error("INVALID_RESPONSE");
  return response.choiceIndex;
}
