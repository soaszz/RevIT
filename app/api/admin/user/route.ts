import "server-only";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../lib/admin/adminAuth";
import { getUserDetails } from "../../../lib/admin/adminService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminSession();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error || "Authentication required." }, { status: 401 });
    }
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Access denied. Administrator privileges required." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId parameter is required." }, { status: 400 });
    }

    const result = await getUserDetails(userId);
    if (result.error || !result.user) {
      return NextResponse.json({ error: result.error || "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      user: result.user,
      history: result.history || [],
      summaryNote: result.summaryNote || "",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
