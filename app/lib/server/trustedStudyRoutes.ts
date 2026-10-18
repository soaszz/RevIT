import "server-only";
import { createClient } from "../supabase/server";
import { createStudySession, commitStudyBatch, completeStudySession } from "./trustedStudyPersistence";
import { requireTrustedStudyWriter, trustedStudyTransportEnabled } from "./trustedStudyGate";

const headers = { "Cache-Control": "private, no-store" };
const fail = (code: string, status: number) => Response.json({ code, error: "Trusted study request could not be completed." }, { status, headers });

export async function handleTrustedStudyRequest(request: Request, operation: "session" | "attempts" | "completion") {
  if (!trustedStudyTransportEnabled()) return fail("TRUSTED_STUDY_DISABLED", 503);
  try {
    // Cookie-authenticated writes require same-origin requests, including during local tests.
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("ORIGIN_REQUIRED", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return fail("INVALID_INPUT", 400);
    const limit = operation === "completion" ? 524288 : operation === "session" ? 262144 : 65536;
    if (Number(request.headers.get("content-length")) > limit) return fail("INPUT_TOO_LARGE", 413);
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return fail("AUTH_REQUIRED", 401);
    // Account header is a precondition, never identity authority. Cookies determine the owner.
    if (request.headers.get("x-revit-account") !== data.user.id) return fail("ACCOUNT_CHANGED", 409);
    const reader = request.body?.getReader();
    if (!reader) return fail("INVALID_INPUT", 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) { await reader.cancel(); return fail("INPUT_TOO_LARGE", 413); }
      chunks.push(chunk.value);
    }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return fail("INVALID_INPUT", 400); }
    const writer = await requireTrustedStudyWriter();
    if (operation === "session") {
      const session = await createStudySession(input, writer);
      return Response.json({ id: session.id, userId: data.user.id, expiresAt: session.expires_at,
        questionPool: session.question_pool, nextSlot: 0, slotLimit: 10000 }, { headers });
    }
    if (operation === "completion") return Response.json(await completeStudySession(input, writer), { headers });
    const rows = await commitStudyBatch(input, writer);
    return Response.json({ acknowledgments: rows.map(row => ({ id: row.id, questionId: row.question_id,
      sessionId: row.session_id, slot: row.session_slot, contentVersion: row.content_version,
      status: row.status, verified_at: row.verified_at })) }, { headers });
  } catch (error) {
    const code = error instanceof Error ? ("code" in error && typeof error.code === "string" ? error.code : error.message) : "PERSISTENCE_UNAVAILABLE";
    if (code === "AUTH_REQUIRED") return fail(code, 401);
    if (["PRO_REQUIRED", "STRASINGER_DISABLED"].includes(code)) return fail(code, 403);
    if (["ATTEMPT_CONFLICT", "SESSION_CONFLICT"].includes(code)) return fail(code, 409);
    if (code === "SESSION_EXPIRED") return fail(code, 410);
    if (code.startsWith("INVALID_") || code === "UNKNOWN_QUESTION") return fail("INVALID_INPUT", 400);
    if (["UNSUPPORTED_VERSION", "SESSION_UNAVAILABLE"].includes(code)) return fail(code, 422);
    return fail("TRUSTED_STUDY_DISABLED", 503);
  }
}
