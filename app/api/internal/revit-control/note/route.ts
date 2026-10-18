import "server-only";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../../lib/admin/adminAuth";
import { savePrivateAdminNote } from "../../../../lib/admin/adminService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { userId, note } = body;
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  try {
    await savePrivateAdminNote(userId, typeof note === "string" ? note : "");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to save note." }, { status: 500 });
  }
}
