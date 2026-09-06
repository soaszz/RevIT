import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PublicThemeToggle from "../components/PublicThemeToggle";
import SupportQr from "./SupportQr";
import styles from "./SupportPage.module.css";

export const metadata: Metadata = {
  title: "Support RevIT",
  description: "Optional support for the continued development and operation of RevIT.",
};

export default function SupportPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/overview" aria-label="Return to RevIT">
          <span className={styles.wordmark} aria-hidden="true"><Image src="/revit-logo.png" alt="" width={1376} height={768} priority /></span>
          <span>Review It Thoroughly.</span>
        </Link>
        <PublicThemeToggle />
      </header>

      <div className={styles.page}>
        <section className={styles.intro} aria-labelledby="support-title">
          <span className={styles.heroFrog} aria-hidden="true"><Image src="/revit-frog.png" alt="" width={2000} height={2000} sizes="150px" priority /></span>
          <p className="eyebrow">Optional contribution</p>
          <h1 id="support-title">Support RevIT</h1>
          <p className={styles.lead}><strong>RevIT is currently free to use.</strong> If RevIT has been helpful to your studies and you would like to support its continued development and operating costs, you may make a voluntary contribution.</p>
          <div className={styles.accessPromise}>
            <strong>Your access never depends on support.</strong>
            <p>Support is completely optional and does not unlock additional features, increase limits, create a subscription, or affect your access to RevIT.</p>
          </div>
          <Link className={styles.backLink} href="/overview">← Return to your study workspace</Link>
        </section>

        <section className={styles.qrCard} aria-labelledby="support-qr-title">
          <p className="eyebrow">Voluntary support only</p>
          <h2 id="support-qr-title">Scan to support</h2>
          <p className={styles.paymentMethod}><span>Payment method</span><strong>InstaPay</strong></p>
          <SupportQr />
          <p className={styles.providerDisclaimer}>RevIT is not affiliated with, sponsored by, or endorsed by InstaPay.</p>
        </section>

        <section className={styles.details} aria-label="What voluntary support means">
          <article>
            <p className="eyebrow">The same RevIT for everyone</p>
            <h2>Study access stays unchanged</h2>
            <p>Every normal RevIT feature remains available whether or not you contribute. There is no supporter status, paid membership, premium functionality, ranking benefit, XP reward, or special access.</p>
          </article>
          <article>
            <p className="eyebrow">External payment service</p>
            <h2>RevIT does not collect payment credentials</h2>
            <p>Any contribution is completed through the third-party payment service associated with the QR. RevIT does not ask for card details, banking credentials, PINs, or one-time passcodes, and does not record who contributes.</p>
          </article>
        </section>
      </div>

      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} RevIT · Review It Thoroughly.</p>
        <nav aria-label="Support and legal links"><Link href="/terms">Terms of Service</Link><Link href="/privacy">Privacy Policy</Link></nav>
      </footer>
    </main>
  );
}
