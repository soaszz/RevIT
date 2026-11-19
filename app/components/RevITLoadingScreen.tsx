import Image from "next/image";
import { MorphingInfinity } from "./loading-ui/morphing-infinity";

export default function RevITLoadingScreen({ error = false, onRetry }: { error?: boolean; onRetry?: () => void }) {
  return (
    <main className="revit-loading-screen" aria-busy={!error} aria-label={error ? "RevIT access needs attention" : "RevIT is preparing your study space"}>
      <div className="revit-loading-content">
        <div className="revit-loading-brand">
          <span className="revit-loading-wordmark" role="img" aria-label="RevIT">
            <Image src="/icons/neu/revit-wordmark.png" alt="" width={1086} height={362} priority />
          </span>
          {!error && <MorphingInfinity className="revit-loading-animation" aria-label="Initializing RevIT" />}
        </div>

        <p role={error ? "alert" : undefined}><strong>Review It Thoroughly.</strong><span>{error ? "We could not verify your access. Reconnect and try again." : "Preparing your study space…"}</span></p>
        {error && onRetry && <button className="primary-button" type="button" onClick={onRetry}>Try again</button>}
      </div>
    </main>
  );
}
