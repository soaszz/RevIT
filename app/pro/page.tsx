import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PublicThemeToggle from "../components/PublicThemeToggle";
import { AI_LIMITS } from "../lib/entitlements";
import styles from "./ProPage.module.css";

export const metadata: Metadata = {
  title: "RevIT Free and Pro Plans | Review It Thoroughly",
  description: "Compare RevIT Free and RevIT Pro study features, question banks, and weakness analytics.",
};

export default function ProPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/overview" aria-label="Return to RevIT">
          <span className={styles.wordmark} aria-hidden="true">
            <Image src="/icons/neu/revit-wordmark.png" alt="" width={1086} height={362} priority />
          </span>
          <span>Review It Thoroughly.</span>
        </Link>
        <PublicThemeToggle />
      </header>

      <div className={styles.subHeaderNav}>
        <Link href="/library" className={styles.backLink}>
          ← Back to review
        </Link>
      </div>

      <div className={styles.content}>
        <section className={styles.hero} aria-labelledby="pricing-title">
          <p className="eyebrow">RevIT plans &amp; access</p>
          <h1 id="pricing-title">Choose the study access that fits you</h1>
          <p className={styles.heroLead}>
            RevIT Free keeps core study tools accessible for every medical technology learner.
            RevIT Pro adds the complete question library, diagnostic analytics, and expanded AI guidance.
          </p>
        </section>

        <section className={styles.plansGrid} aria-label="Subscription plan comparison">
          <article className={styles.planCard}>
            <div className={styles.cardTop}>
              <span className={styles.sourcePill}>FREE</span>
            </div>
            <h2 className={styles.planTitle}>RevIT Free</h2>
            <p className={styles.planDesc}>Essential tools for daily board exam practice and progress tracking.</p>
            <div className={styles.priceBlock}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>₱0</span>
                <span className={styles.pricePeriod}>/ Free forever</span>
              </div>
              <p className={styles.priceNote}>Core review features always free</p>
            </div>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <span className={styles.checkIcon} aria-hidden="true">✓</span>
                <span>Harr question library &amp; flashcards</span>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.checkIcon} aria-hidden="true">✓</span>
                <span>MCQ Review mode with customizable question timer</span>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.checkIcon} aria-hidden="true">✓</span>
                <span>Basic progress tracking &amp; subject mastery</span>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.checkIcon} aria-hidden="true">✓</span>
                <span>Grades, Grade Simulator, Planner, and Calendar</span>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.checkIcon} aria-hidden="true">✓</span>
                <span>XP, leveling system, streaks, and achievements</span>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.checkIcon} aria-hidden="true">✓</span>
                <span>RevIT AI: {AI_LIMITS.free.dailyRequests} tutoring messages per day</span>
              </li>
            </ul>
            <div className={styles.cardAction}>
              <Link className={styles.secondaryCta} href="/overview">
                Continue with Free
              </Link>
            </div>
          </article>

          <article className={`${styles.planCard} ${styles.proCard}`}>
            <span className={styles.proBadge}>Recommended</span>
            <div className={styles.cardTop}>
              <span className={styles.sourcePill}>PRO ACCESS</span>
            </div>
            <h2 className={styles.planTitle}>RevIT Pro</h2>
            <p className={styles.planDesc}>Complete library access and deep weakness diagnostics for serious reviewers.</p>
            <div className={styles.priceBlock}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>₱49</span>
                <span className={styles.pricePeriod}>/ Early Access</span>
              </div>
              <p className={styles.priceNote}>Introductory price · Subject to change</p>
            </div>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
                <strong>Everything included in RevIT Free</strong>
              </li>
              <li className={styles.featureItem}>
                <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
                <span>Full Harr &amp; Ciulla (4th Edition) question banks</span>
              </li>
              <li className={styles.featureItem}>
                <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
                <span>Full flashcard decks across all book editions</span>
              </li>
              <li className={styles.featureItem}>
                <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
                <span>Weakness Analytics to target low-scoring subtopics</span>
              </li>
              <li className={styles.featureItem}>
                <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
                <span>Detailed topic trends and personalized recommendations</span>
              </li>
              <li className={styles.featureItem}>
                <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
                <span>RevIT AI: {AI_LIMITS.pro.dailyRequests} tutoring messages per day</span>
              </li>
            </ul>
            <div className={styles.cardAction}>
              <a
                className={styles.primaryCta}
                href="https://www.facebook.com/revithoroughly"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Subscribe via Facebook</span>
                <span className="sr-only"> (opens in a new tab)</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        </section>

        <section className={styles.safetyNotice} aria-label="Subscription and payment security notice">
          <div className={styles.safetyIcon} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.16" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <strong>Manual Verification &amp; Account Protection</strong>
            <p>
              To subscribe, message our official Facebook page. Subscriptions are verified and activated manually by our team.
              RevIT never asks for or collects payment card details, bank credentials, OTPs, or wallet PINs.
            </p>
          </div>
        </section>

        <section className={styles.faqGrid} aria-label="Frequently asked questions about RevIT subscriptions">
          <article className={styles.faqCard}>
            <p className="eyebrow">Seamless Study</p>
            <h3>Do I lose my study data if I switch?</h3>
            <p>
              No. Your attempt history, flashcard bookmarks, scores, XP, and study analytics stay tied to your account and carry over uninterrupted.
            </p>
          </article>
          <article className={styles.faqCard}>
            <p className="eyebrow">Community &amp; Mission</p>
            <h3>What does RevIT Pro support?</h3>
            <p>
              Pro access directly funds medical question digitisation, server hosting, and AI compute to keep RevIT fast and dependable for all reviewers.
            </p>
          </article>
        </section>
      </div>

      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} RevIT · Review It Thoroughly.</p>
        <nav aria-label="Pro and legal links">
          <Link href="/library">Back to review</Link>
          <Link href="/overview">Study Workspace</Link>
          <Link href="/support">Support RevIT</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
      </footer>
    </main>
  );
}
