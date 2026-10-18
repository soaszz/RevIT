import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData?.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { notificationId } = body;
  if (!notificationId) {
    return NextResponse.json({ error: "notificationId is required." }, { status: 400 });
  }

  const { error } = await supabase
    .from("pro_activation_notifications")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userData.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
