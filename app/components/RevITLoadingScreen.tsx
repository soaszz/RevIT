import Image from "next/image";
import { MorphingInfinity } from "./loading-ui/morphing-infinity";

export default function RevITLoadingScreen() {
  return (
    <main className="revit-loading-screen" aria-busy="true" aria-label="RevIT is preparing your study space">
      <div className="revit-loading-content">
        <span className="revit-loading-wordmark" role="img" aria-label="RevIT">
          <Image src="/revit-logo.png" alt="" width={1376} height={768} priority />
        </span>

        <MorphingInfinity className="revit-loading-animation" aria-label="Initializing RevIT" />

        <span className="revit-loading-frog" aria-hidden="true">
          <Image src="/revit-frog.png" alt="" width={2000} height={2000} sizes="54px" priority />
        </span>

        <p>Preparing your study space...</p>
      </div>
    </main>
  );
}
