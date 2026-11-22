import { headers } from "next/headers";
import { notFound } from "next/navigation";
import AdminDashboard from "../../admin/AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "RevIT — Synthetic Admin Preview", robots: { index: false, follow: false } };
export default async function AdminPreview() {
  // Preview is not an admin role. Production always 404; no API accepts a preview flag.
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) notFound();
  return <AdminDashboard preview />;
}
