import "server-only";
import { NextResponse } from "next/server";
import { authorizePrivateReviewer, PRIVATE_REVIEWER_HEADERS, privateReviewerError } from "../../../lib/server/privateReviewerAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await authorizePrivateReviewer("BOC");
  if (denied) return denied;
  try {
    const { getBocServerPayload } = await import("../../../lib/server/bocServerContent");
    return NextResponse.json(getBocServerPayload(), { headers: PRIVATE_REVIEWER_HEADERS });
  } catch {
    return privateReviewerError(503);
  }
}
