import "server-only";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../../lib/admin/adminAuth";
import { applySubscriptionChange } from "../../../../lib/admin/adminService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { userId, action, source, durationDays, customExpiresAt, customMessage } = body;

  if (!userId || !action) {
    return NextResponse.json({ error: "userId and action are required." }, { status: 400 });
  }

  if (!["activate", "extend", "modify_expiration", "revoke"].includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  if (source && !["purchased", "gift", "prize"].includes(source)) {
    return NextResponse.json({ error: "Invalid activation source." }, { status: 400 });
  }

  try {
    const result = await applySubscriptionChange({
      userId,
      action,
      source: source || "purchased",
      durationDays: typeof durationDays === "number" ? durationDays : 30,
      customExpiresAt: customExpiresAt || null,
      adminId: auth.user.id,
      customMessage: typeof customMessage === "string" ? customMessage.slice(0, 500) : null,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update subscription." }, { status: 500 });
  }
}
