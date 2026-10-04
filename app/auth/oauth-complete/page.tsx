import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import OAuthCompleteClient from "./OAuthCompleteClient";

export default async function OAuthCompletePage() {
  const cookieStore = await cookies();
  if (cookieStore.get("revit-google-oauth")?.value !== "success") {
    redirect("/auth?oauth_error=invalid_completion");
  }
  return <OAuthCompleteClient />;
}