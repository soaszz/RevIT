import VerifyPanel from "./VerifyPanel";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";

export default async function VerifyPage() {
  let email = "";
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? "";
  }
  return <main className="auth-shell"><VerifyPanel email={email} /></main>;
}
