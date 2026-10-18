import "server-only";
import { handleTrustedStudyRequest } from "../../../lib/server/trustedStudyRoutes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleTrustedStudyRequest(request, "completion");
}
