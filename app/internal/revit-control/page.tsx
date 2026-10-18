import "server-only";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DeprecatedInternalAdminRoute() {
  redirect("/admin");
}
