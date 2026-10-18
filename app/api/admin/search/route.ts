import "server-only";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../lib/admin/adminAuth";
import { searchUsers } from "../../../lib/admin/adminService";

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
    const q = (searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const offset = (page - 1) * limit;

    const result = await searchUsers(q, limit, offset);
    if (result.error) {
      return NextResponse.json({ error: result.error, users: [] }, { status: 500 });
    }

    return NextResponse.json({
      users: result.users || [],
      page,
      limit,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error occurred while searching users.", users: [] },
      { status: 500 }
    );
  }
}
