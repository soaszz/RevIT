import "server-only";
import { activeHarrQuestions } from "../harrQuestionPool";
import { CIULLA_TOTAL_QUESTIONS } from "../../content/ciullaMetadata";
import { RODAK_TOTAL_QUESTIONS } from "../../content/rodakMetadata";
import { STRASINGER_TOTAL_QUESTIONS } from "../../content/strasingerMetadata";
import { bocSubjectQuestionCounts } from "../../content/bocMetadata";
import { ELSEVIER_TOTAL_QUESTIONS } from "../../content/elsevierMetadata";
import type { ReviewerBook } from "../../content/reviewerContent";
import { getPublicReviewerBooks, type PublicQuestionCounts } from "../publicReviewerBooks";
import { QUESTION_BANKS } from "../entitlements";

const questionCounts: Record<ReviewerBook, number> = {
  Harr: activeHarrQuestions.length,
  Ciulla: CIULLA_TOTAL_QUESTIONS,
  Rodak: RODAK_TOTAL_QUESTIONS,
  Strasinger: STRASINGER_TOTAL_QUESTIONS,
  BOC: Object.values(bocSubjectQuestionCounts).reduce((sum, count) => sum + count, 0),
  Elsevier: ELSEVIER_TOTAL_QUESTIONS,
};

// Static server metadata only; no reviewer answer payload or database request reaches public clients.
export function getPublicQuestionCounts(registry: Parameters<typeof getPublicReviewerBooks>[0] = QUESTION_BANKS): PublicQuestionCounts {
  const { books, freeBooks, proBooks } = getPublicReviewerBooks(registry);
  const sum = (entries: typeof books) => entries.reduce((total, book) => total + questionCounts[book.label], 0);
  return { free: sum(freeBooks), proOnly: sum(proBooks), total: sum(books) };
}
