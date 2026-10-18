import "server-only";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../lib/admin/adminAuth";
import { applySubscriptionChange } from "../../../lib/admin/adminService";

export const dynamic = "force-dynamic";

// In-memory idempotency cache for deduplication (60-second sliding window)
const idempotencyCache = new Map<string, { timestamp: number; result: any }>();

function cleanupIdempotencyCache() {
  const cutoff = Date.now() - 60_000;
  for (const [key, entry] of idempotencyCache.entries()) {
    if (entry.timestamp < cutoff) {
      idempotencyCache.delete(key);
    }
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAdminSession();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error || "Authentication required." }, { status: 401 });
    }
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error || "Access denied. Administrator privileges required." }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const {
      userId,
      action,
      source,
      durationDays,
      customExpiresAt,
      customMessage,
      expectedExpiresAt,
      allowShorten,
      idempotencyKey,
    } = body;

    if (!userId || typeof userId !== "string" || !action) {
      return NextResponse.json({ error: "userId and action are required." }, { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId.trim())) {
      return NextResponse.json({ error: "Invalid user identifier format." }, { status: 400 });
    }

    if (!["activate", "extend", "modify_expiration", "revoke"].includes(action)) {
      return NextResponse.json({ error: "Invalid subscription action specified." }, { status: 400 });
    }

    if (source && !["purchased", "gift", "prize"].includes(source)) {
      return NextResponse.json({ error: "Invalid activation source." }, { status: 400 });
    }

    // Server-side check for invalid past date when action is not revoke
    if (action !== "revoke" && customExpiresAt) {
      const expDate = new Date(customExpiresAt);
      if (isNaN(expDate.getTime())) {
        return NextResponse.json({ error: "Invalid expiration date format." }, { status: 400 });
      }
      if (expDate.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Expiration date must be in the future." }, { status: 400 });
      }
    }

    // Idempotency check: prevent duplicate submits / rapid double-clicks
    cleanupIdempotencyCache();
    const effectiveKey = typeof idempotencyKey === "string" && idempotencyKey.trim().length > 0
      ? idempotencyKey.trim()
      : `${auth.user.id}:${userId}:${action}:${customExpiresAt || durationDays}`;

    const cached = idempotencyCache.get(effectiveKey);
    if (cached && Date.now() - cached.timestamp < 15_000) {
      return NextResponse.json({ success: true, result: cached.result, deduplicated: true });
    }

    const result = await applySubscriptionChange({
      userId: userId.trim(),
      action,
      source: source || "purchased",
      durationDays: typeof durationDays === "number" ? durationDays : 30,
      customExpiresAt: customExpiresAt || null,
      adminId: auth.user.id,
      customMessage: typeof customMessage === "string" ? customMessage.slice(0, 500) : null,
      expectedExpiresAt: expectedExpiresAt || null,
      allowShorten: Boolean(allowShorten),
    });

    idempotencyCache.set(effectiveKey, { timestamp: Date.now(), result });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    const rawMessage: string = err.message || "";

    // Map database conflict codes to user-friendly structured responses
    if (rawMessage.includes("CONFLICT_ACTIVE_PRO")) {
      return NextResponse.json(
        {
          error: "User already has an active RevIT Pro subscription. Please choose 'Extend' to add time or 'Replace' to set a new date.",
          code: "CONFLICT_ACTIVE_PRO",
        },
        { status: 409 }
      );
    }

    if (rawMessage.includes("CONFLICT_STALE_STATE")) {
      return NextResponse.json(
        {
          error: "User subscription was modified by another session. Please refresh the learner details.",
          code: "CONFLICT_STALE_STATE",
        },
        { status: 409 }
      );
    }

    if (rawMessage.includes("WARNING_SHORTEN_ACCESS")) {
      return NextResponse.json(
        {
          error: "The chosen expiration date is earlier than the user's current expiration. User would lose active access.",
          code: "WARNING_SHORTEN_ACCESS",
        },
        { status: 400 }
      );
    }

    if (rawMessage.includes("NO_CHANGE")) {
      return NextResponse.json(
        {
          error: "No changes detected. The user's subscription is already in this state.",
          code: "NO_CHANGE",
        },
        { status: 400 }
      );
    }

    if (rawMessage.includes("INVALID_EXPIRATION")) {
      return NextResponse.json(
        {
          error: "Expiration date must be in the future.",
          code: "INVALID_EXPIRATION",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update subscription. Please check details and try again." },
      { status: 500 }
    );
  }
}
