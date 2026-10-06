import "server-only";
import { NextResponse } from "next/server";
import { getCiullaServerPayload } from "../../../lib/server/ciullaServerContent";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Reviewer content service is unavailable." },
      { status: 503 },
    );
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json(
      { error: "Authentication service unavailable." },
      { status: 503 },
    );
  }

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    return NextResponse.json(
      { error: "Authentication required to access premium reviewer content." },
      { status: 401 },
    );
  }

  const { data: entitlementRows, error: profileError } = await supabase.rpc("get_my_entitlement");
  const entitlement = Array.isArray(entitlementRows) ? entitlementRows[0] : entitlementRows;

  if (profileError || !entitlement) {
    return NextResponse.json(
      { error: "Account profile could not be loaded." },
      { status: 500 },
    );
  }

  if (entitlement.effective_plan !== "pro") {
    return NextResponse.json(
      {
        error: "Active RevIT Pro subscription required.",
        code: "PRO_REQUIRED",
      },
      { status: 403 },
    );
  }

  const payload = getCiullaServerPayload();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
