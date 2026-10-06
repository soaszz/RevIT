import type { ReviewerQuestion, Subject, Topic } from "../content/reviewerContent";

export type PremiumReviewerPayload = {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};

export type FetchCiullaResult =
  | { status: "success"; data: PremiumReviewerPayload }
  | { status: "pro_required" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

let cachedCiulla: PremiumReviewerPayload | null = null;
let inFlightFetch: Promise<FetchCiullaResult> | null = null;

export async function fetchCiullaReviewer(): Promise<FetchCiullaResult> {
  if (cachedCiulla) return { status: "success", data: cachedCiulla };
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = (async (): Promise<FetchCiullaResult> => {
    try {
      const response = await fetch("/api/reviewer/ciulla", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (response.status === 401) {
        return { status: "unauthenticated" };
      }
      if (response.status === 403) {
        return { status: "pro_required" };
      }
      if (!response.ok) {
        return { status: "error", message: `Server returned ${response.status}` };
      }
      const data = (await response.json()) as PremiumReviewerPayload;
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        cachedCiulla = data;
        return { status: "success", data };
      }
      return { status: "error", message: "Invalid payload from server" };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : "Fetch failed" };
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

export function getCachedCiullaReviewer(): PremiumReviewerPayload | null {
  return cachedCiulla;
}

export function clearCiullaReviewerCache(): void {
  cachedCiulla = null;
}
