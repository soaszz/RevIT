"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./SupportPage.module.css";

const SUPPORT_QR_PATH = "/support-revit-qr.png";

export default function SupportQr() {
  const [qrAvailable, setQrAvailable] = useState(true);

  if (!qrAvailable) {
    return (
      <div className={styles.qrUnavailable} role="status">
        <span className={styles.qrFallbackFrog} aria-hidden="true">
          <Image src="/revit-frog.png" alt="" width={2000} height={2000} sizes="70px" />
        </span>
        <strong>Payment QR not configured</strong>
        <span>The owner-provided QR will appear here once it is added. RevIT remains free and fully available.</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.qrFrame}>
        <Image
        src={SUPPORT_QR_PATH}
          alt="InstaPay QR code for voluntarily supporting RevIT"
          width={1900}
          height={1896}
          sizes="(max-width: 700px) 72vw, 310px"
          className={styles.qrImage}
          onError={() => setQrAvailable(false)}
          unoptimized
          priority
        />
      </div>
      <p className={styles.scanCopy}>Scan using your supported payment app.</p>
      <p className={styles.mobileHint}>On the same phone? Open this page on another screen if your payment app requires camera scanning.</p>
    </>
  );
}
