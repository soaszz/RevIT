import Image from "next/image";
import { MorphingInfinity } from "./loading-ui/morphing-infinity";

export default function RevITLoadingScreen() {
  return (
    <main className="revit-loading-screen" aria-busy="true" aria-label="RevIT is preparing your study space">
      <div className="revit-loading-content">
        <div className="revit-loading-brand">
          <span className="revit-loading-wordmark" role="img" aria-label="RevIT">
            <Image src="/icons/neu/revit-wordmark.png" alt="" width={1086} height={362} priority />
          </span>
          <MorphingInfinity className="revit-loading-animation" aria-label="Initializing RevIT" />
        </div>

        <p><strong>Review It Thoroughly.</strong><span>Preparing your study space…</span></p>
      </div>
    </main>
  );
}
