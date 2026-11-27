import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import AppearanceSettings from "../../components/AppearanceSettings";
import styles from "../../components/AppearanceSettings.module.css";

// Same controls as Account Settings, with no account, backend or reviewer content.
export default async function AppearancePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) notFound();
  return <main className={styles.preview}>
    <h1>Appearance preview</h1>
    <p>Local development only. Choices stay in this browser and apply to the local app. No account or database connection.</p>
    <AppearanceSettings />
    <Link prefetch={false} className="primary-button" href="/offline">Open the local app</Link>
  </main>;
}
