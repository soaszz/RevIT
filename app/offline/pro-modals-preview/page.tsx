import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { QUESTION_BANKS } from "../../lib/entitlements";
import { getPublicReviewerBooks } from "../../lib/publicReviewerBooks";
import ProModalsPreview from "./ProModalsPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "RevIT — Local Pro Modal Preview", robots: { index: false, follow: false } };

// Preview metadata only. The unpublished flags are overridden in memory so the modal shows the
// production-equivalent edition list; no question bank, asset or entitlement is unlocked, and the
// override never reaches the real catalog or any request.
const PRODUCTION_EQUIVALENT_BANKS = {
  ...QUESTION_BANKS,
  boc: { ...QUESTION_BANKS.boc, published: true },
  elsevier: { ...QUESTION_BANKS.elsevier, published: true },
};

export default async function ProModalsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  // Development-only and loopback-only; production always 404.
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) notFound();

  const { view } = await searchParams;
  return (
    <ProModalsPreview
      view={view === "expired" ? "expired" : "activation"}
      reviewers={getPublicReviewerBooks(PRODUCTION_EQUIVALENT_BANKS)}
    />
  );
}
