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

export type FetchRodakResult =
  | { status: "success"; data: PremiumReviewerPayload }
  | { status: "pro_required" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export type FetchStrasingerResult =
  | { status: "success"; data: PremiumReviewerPayload }
  | { status: "pro_required" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

let cachedCiulla: PremiumReviewerPayload | null = null;
let inFlightFetchCiulla: Promise<FetchCiullaResult> | null = null;

let cachedRodak: PremiumReviewerPayload | null = null;
let inFlightFetchRodak: Promise<FetchRodakResult> | null = null;

let cachedStrasinger: PremiumReviewerPayload | null = null;
let inFlightFetchStrasinger: Promise<FetchStrasingerResult> | null = null;

export async function fetchCiullaReviewer(): Promise<FetchCiullaResult> {
  if (cachedCiulla) return { status: "success", data: cachedCiulla };
  if (inFlightFetchCiulla) return inFlightFetchCiulla;

  inFlightFetchCiulla = (async (): Promise<FetchCiullaResult> => {
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
      inFlightFetchCiulla = null;
    }
  })();

  return inFlightFetchCiulla;
}

export function getCachedCiullaReviewer(): PremiumReviewerPayload | null {
  return cachedCiulla;
}

export function clearCiullaReviewerCache(): void {
  cachedCiulla = null;
}

export async function fetchRodakReviewer(): Promise<FetchRodakResult> {
  if (cachedRodak) return { status: "success", data: cachedRodak };
  if (inFlightFetchRodak) return inFlightFetchRodak;

  inFlightFetchRodak = (async (): Promise<FetchRodakResult> => {
    try {
      const response = await fetch("/api/reviewer/rodak", {
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
        cachedRodak = data;
        return { status: "success", data };
      }
      return { status: "error", message: "Invalid payload from server" };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : "Fetch failed" };
    } finally {
      inFlightFetchRodak = null;
    }
  })();

  return inFlightFetchRodak;
}

export function getCachedRodakReviewer(): PremiumReviewerPayload | null {
  return cachedRodak;
}

export function clearRodakReviewerCache(): void {
  cachedRodak = null;
}

export async function fetchStrasingerReviewer(): Promise<FetchStrasingerResult> {
  if (cachedStrasinger) return { status: "success", data: cachedStrasinger };
  if (inFlightFetchStrasinger) return inFlightFetchStrasinger;

  inFlightFetchStrasinger = (async (): Promise<FetchStrasingerResult> => {
    try {
      const response = await fetch("/api/reviewer/strasinger", {
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
        cachedStrasinger = data;
        return { status: "success", data };
      }
      return { status: "error", message: "Invalid payload from server" };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : "Fetch failed" };
    } finally {
      inFlightFetchStrasinger = null;
    }
  })();

  return inFlightFetchStrasinger;
}

export function getCachedStrasingerReviewer(): PremiumReviewerPayload | null {
  return cachedStrasinger;
}

export function clearStrasingerReviewerCache(): void {
  cachedStrasinger = null;
}
