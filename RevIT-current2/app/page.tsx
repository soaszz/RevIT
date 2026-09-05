import RevITApp from "./RevITApp";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./lib/supabase/config";
import { createClient } from "./lib/supabase/server";

export default async function Home() {
  if (!isSupabaseConfigured()) return <RevITApp cloudEnabled={false} />;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect("/auth");
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) redirect("/auth");
  return <RevITApp cloudEnabled initialUser={{
    id: userData.user.id,
    email: userData.user.email ?? "",
    username: typeof userData.user.user_metadata.username === "string" ? userData.user.user_metadata.username : undefined,
  }} />;
}
