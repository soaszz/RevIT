import { QUESTION_BANKS } from "./entitlements";
import type { ReviewerBook } from "../content/reviewerContent";

type PublicReviewer = { id: string; label: ReviewerBook; requiredPlan: "free" | "pro"; published?: boolean };
export function getPublicReviewerBooks(registry: Readonly<Record<string, PublicReviewer>> = QUESTION_BANKS) {
  const books = Object.values(registry).filter(book => book.published !== false);
  const freeBooks = books.filter(book => book.requiredPlan === "free");
  const proBooks = books.filter(book => book.requiredPlan === "pro");
  return { books, freeBooks, proBooks, freeNames: freeBooks.map(book => book.label).join(", "), proNames: proBooks.map(book => book.label).join(", ") };
}
export function getUpcomingReviewerNames(registry: Readonly<Record<string, PublicReviewer>> = QUESTION_BANKS) {
  const titles: Record<string, string> = { boc: "BOC Study Guide 7th Edition", elsevier: "Elsevier's MLS Examination Review" };
  return Object.values(registry).filter(book => book.published === false && titles[book.id]).map(book => titles[book.id]).join(" and ");
}
export const PUBLIC_REVIEWERS = getPublicReviewerBooks();
export type PublicQuestionCounts = { free: number; proOnly: number; total: number };
