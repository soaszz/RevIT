import "server-only";
import { authorizePrivateReviewer, PRIVATE_REVIEWER_HEADERS, privateReviewerError } from "../../../../../lib/server/privateReviewerAccess";
import { readPrivateReviewerSource } from "../../../../../lib/server/privateReviewerSource";
import pins from "../../../../../../docs/private-reviewers/pins.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ book: string; asset: string }> }) {
  const { book, asset } = await context.params;
  if ((book !== "boc" && book !== "elsevier") || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(asset)) return privateReviewerError(404);
  const source = `public/reviewer-assets/${book === "boc" ? "boc-7e" : "elsevier-1e"}/${asset}`;
  if (!pins.files.some(file => file.path === source)) return privateReviewerError(404);
  const denied = await authorizePrivateReviewer(book === "boc" ? "BOC" : "Elsevier");
  if (denied) return denied;
  try {
    const bytes = readPrivateReviewerSource(source);
    return new Response(new Uint8Array(bytes), { headers: { ...PRIVATE_REVIEWER_HEADERS, "Content-Type": "image/png" } });
  } catch {
    return privateReviewerError(503);
  }
}
