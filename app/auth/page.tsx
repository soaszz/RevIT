import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AuthPanel from "./AuthPanel";
import PublicThemeToggle from "../components/PublicThemeToggle";
import LandingMcqDemo from "../components/LandingMcqDemo";
import LandingFlashcardDemo from "../components/LandingFlashcardDemo";
import { isSupabaseConfigured } from "../lib/supabase/config";
import { createClient } from "../lib/supabase/server";
import { AI_LIMITS, QUESTION_BANKS } from "../lib/entitlements";
import { retryAuthRequest } from "../lib/supabase/retryAuth";
import styles from "./Landing.module.css";

const proContact = "https://www.facebook.com/revithoroughly";

export const metadata: Metadata = {
  title: "Focused MedTech Review",
  description: "Review It Thoroughly. Structured Medical Technology practice, flashcards, study planning, and RevIT AI. Explore RevIT Free and Pro, or sign in to continue.",
};

const features = [
  ["Structured Reviewer Practice", "Practice Medical Technology questions by subject and topic. Build a session around what you need to review."],
  ["Progress & Performance", "Keep track of your review activity and see how your performance changes over time."],
  ["Flashcards", "Work through reviewer questions and official answers at your own pace."],
  ["Study Organization", "Plan study sessions, track grades, explore your Grade Simulator, and keep exams on your calendar."],
  ["RevIT AI", "Get focused educational explanations while keeping official reviewer answers separate from AI content."],
  ["Weakness Analytics", "Find repeated mistakes and topics that need more attention. Make your next session more focused."],
];

// Display the same limits used by the application; authorization stays server-side.
const comparison = [
  ["Reviewer questions", `${QUESTION_BANKS.harr.label} library`, "Full library"],
  ["Future book editions", "Not included", "Included in Pro"],
  ["MCQ practice", "Included", "Included"],
  ["Flashcards", "Free content", "Full library"],
  ["Progress tracking", "Basic", "Advanced analytics"],
  ["Weakness Analytics", "Not included", "Included"],
  ["Study recommendations", "Not included", "Advanced"],
  ["Grades & Grade Simulator", "Included", "Included"],
  ["Planner & Calendar", "Included", "Included"],
  ["XP, Levels & Achievements", "Included", "Included"],
  ["RevIT AI messages", `${AI_LIMITS.free.dailyRequests} per day`, `${AI_LIMITS.pro.dailyRequests} per day`],
];

function ProductPreview({ name, alt, caption, width, height, hero = false, isPro = false }: {
  name: string; alt: string; caption: string; width: number; height: number; hero?: boolean; isPro?: boolean;
}) {
  return (
    <figure className={`${styles.preview} ${hero ? styles.heroPreview : ""}`}>
      <div className={styles.previewLabel}>
        <span>RevIT / {caption} {isPro && <span className={styles.proBadge}>Pro</span>}</span>
        <span>Inside your workspace</span>
      </div>
      <div className={styles.previewCrop}>
        {/* Unoptimized serves the crisp lossless WebP screenshot without downsampling artifacts. */}
        <Image
          className={styles.lightPreview}
          src={`/landing/${name}-light.webp`}
          alt={alt}
          width={width}
          height={height}
          priority={hero}
          unoptimized
        />
        <Image
          className={styles.darkPreview}
          src={`/landing/${name}-dark.webp`}
          alt={alt}
          width={width}
          height={height}
          priority={hero}
          unoptimized
        />
      </div>
      <figcaption>{hero ? "Your review, your schedule, one place to begin." : "Actual RevIT Weakness Analytics, identifying weak topics and study priorities."}</figcaption>
    </figure>
  );
}

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string; clear_session?: string; session_unavailable?: string; oauth_error?: string }> }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const recovering = params.clear_session === "true" || params.session_unavailable === "true" || params.oauth_error !== undefined;
  const client = configured && !recovering ? await createClient() : null;
  const userResult = client ? await retryAuthRequest(() => client.auth.getUser()).catch(() => null) : null;
  const signedIn = Boolean(userResult?.data.user);
  const mode = params.mode === "register" ? "register" : "login";
  const authHref = (targetMode: "login" | "register") => {
    const query = new URLSearchParams({ mode: targetMode });
    if (params.next) query.set("next", params.next);
    return `/auth?${query}#account`;
  };
  const startHref = signedIn ? "/overview" : authHref("register");

  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#main" aria-label="RevIT — Review It Thoroughly"><Image src="/icons/neu/revit-wordmark.png" alt="RevIT" width={132} height={44} /></a>
          <nav className={styles.navigation} aria-label="Public navigation"><a href="#features">Features</a><a href="#plans">Plans</a></nav>
          <div className={styles.headerActions}><PublicThemeToggle />{!signedIn && <a className={styles.signIn} href={authHref("login")}>Sign In</a>}<a className={`primary-button ${styles.primary}`} href={startHref}>{signedIn ? "Open RevIT" : "Get Started"}<span aria-hidden="true">↗</span></a></div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {recovering && <p className={styles.recoveryNotice}>Continue to <a href="#account">your account</a> for sign-in and recovery details.</p>}
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Your study space</p>
            <h1 id="hero-title">Review It<br /><span>Thoroughly.</span></h1>
            <p className={styles.heroLead}>Everything important,<br />in one place.</p>
            <p className={styles.body}>A study space for Medical Technology students. See your review activity, progress, upcoming study plans, and the areas that need your attention.</p>
            <div className={styles.actions}><a className={`primary-button ${styles.primary}`} href={startHref}>{signedIn ? "Open RevIT" : "Start Reviewing"}<span aria-hidden="true">↗</span></a><a className={styles.textLink} href="#mcq-demo">Try Sample Question <span aria-hidden="true">↓</span></a></div>
            <p className={styles.heroNote}>Built for Medical Technology / Medical Laboratory Science.</p>
          </div>
          <ProductPreview name="overview" width={1024} height={530} hero alt="RevIT Overview showing performance summary, today's study plan, and the study calendar." caption="Overview" />
        </section>
        <div className={styles.subjectStrip} aria-label="Medical Technology subjects"><span>Made for your subjects</span><p>Clinical Chemistry <i aria-hidden="true">/</i> Hematology <i aria-hidden="true">/</i> Microbiology <i aria-hidden="true">/</i> And the connections between them.</p></div>
        <section id="features" className={styles.section} aria-labelledby="features-title">
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>Your study toolkit</p><h2 id="features-title">Less scattered.<br />More thoroughly reviewed.</h2><p>From your first question to your next exam, keep the important parts of studying connected.</p></div>
          <ol className={styles.featureList}>{features.map(([title, description], index) => <li key={title}><span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}{index === 5 && <span className={styles.proBadge}>Pro</span>}</h3><p>{description}</p></div></li>)}</ol>
        </section>
        <section id="mcq-demo" className={`${styles.section} ${styles.showcaseSection}`} aria-labelledby="mcq-demo-title">
          <div className={styles.showcaseCopy}>
            <p className={styles.eyebrow}>Try a RevIT question</p>
            <h2 id="mcq-demo-title">Practice with real<br />board-style MCQs.</h2>
            <p>Experience how RevIT provides immediate rationales and reinforces concepts with zero friction.</p>
            <ul>
              <li>Curated MedTech board exam questions</li>
              <li>Instant feedback with official rationales</li>
              <li>Focused, distraction-free study layout</li>
            </ul>
            <a className={styles.textLink} href={startHref}>Start reviewing free <span aria-hidden="true">↗</span></a>
          </div>
          <div className={styles.showcaseInteractive}>
            <LandingMcqDemo startHref={startHref} />
          </div>
        </section>

        <section id="weakness-analytics" className={`${styles.section} ${styles.productSection} ${styles.analyticsSection}`} aria-labelledby="weakness-title">
          <div className={styles.productCopy}>
            <p className={styles.eyebrow}>Know where to focus <span className={styles.proBadge}>Pro</span></p>
            <h2 id="weakness-title">Turn review activity<br />into clearer priorities.</h2>
            <p>RevIT Pro identifies weaker topics, repeated mistakes, and high-yield areas that may need more review.</p>
            <p>See where you need more practice—and give those topics your attention.</p>
            <a className={styles.textLink} href="#plans">Explore RevIT Pro <span aria-hidden="true">↓</span></a>
          </div>
          <ProductPreview name="analytics" width={1024} height={557} alt="RevIT Weakness Analytics showing topic mastery, repeated mistakes, and study recommendations." caption="Weakness Analytics" isPro />
        </section>

        <section id="flashcard-demo" className={`${styles.section} ${styles.showcaseSection} ${styles.reverse}`} aria-labelledby="flashcard-demo-title">
          <div className={styles.showcaseInteractive}>
            <LandingFlashcardDemo />
          </div>
          <div className={styles.showcaseCopy}>
            <p className={styles.eyebrow}>Active recall flashcards</p>
            <h2 id="flashcard-demo-title">Flip. Recall.<br />Master.</h2>
            <p>Test your conceptual memory before looking at choices. Smooth front-to-back spatial flip designed for fast, distraction-free study.</p>
            <ul>
              <li>Question-only front to enforce pure active recall</li>
              <li>Comprehensive explanation revealed on flip</li>
              <li>Seamless, interruptible flip interaction</li>
            </ul>
            <a className={styles.textLink} href={startHref}>Explore flashcards <span aria-hidden="true">↗</span></a>
          </div>
        </section>
        <section id="plans" className={`${styles.section} ${styles.plans}`} aria-labelledby="plans-title">
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>RevIT Free & RevIT Pro</p><h2 id="plans-title">Choose how you review.</h2><p>Start with RevIT Free and upgrade when you want deeper analytics, more reviewer content, and higher RevIT AI limits.</p></div>
          <div className={styles.planGrid}>
            <article className={styles.plan}>
              <p className={styles.planKicker}>Your starting point</p>
              <h3>RevIT Free</h3>
              <p>The core tools you need to start reviewing.</p>
              <div className={styles.planPriceBlock}>
                <div className={styles.planPriceRow}>
                  <span className={styles.planPriceAmount}>₱0</span>
                  <span className={styles.planPricePeriod}>/ Free forever</span>
                </div>
                <p className={styles.planPriceNote}>Core review features always free</p>
              </div>
              <ul>
                <li>{QUESTION_BANKS.harr.label} question library & MCQ Review</li>
                <li>Flashcards for Free content & Basic Progress</li>
                <li>Grades & Grade Simulator</li>
                <li>Study Planner & Calendar</li>
                <li>XP, Levels & Achievements</li>
                <li><strong>{AI_LIMITS.free.dailyRequests} RevIT AI messages per day</strong></li>
              </ul>
              <a className={`secondary-button ${styles.secondary}`} href={startHref}>
                {signedIn ? "Open RevIT" : "Get Started Free"}<span aria-hidden="true">↗</span>
              </a>
            </article>

            <article className={`${styles.plan} ${styles.proPlan}`}>
              <p className={styles.planKicker}>A deeper review <span className={styles.proBadge}>Pro</span></p>
              <h3>RevIT Pro</h3>
              <p>Expanded review resources and deeper insights for students who want more from RevIT.</p>
              <div className={styles.planPriceBlock}>
                <div className={styles.planPriceRow}>
                  <span className={styles.planPriceAmount}>₱49</span>
                  <span className={styles.planPricePeriod}>/ Early Access</span>
                </div>
                <p className={styles.planPriceNote}>Introductory price · Subject to change</p>
              </div>
              <ul>
                <li>Everything in Free, plus:</li>
                <li>Full reviewer & Flashcard libraries</li>
                <li>More book editions added in future updates</li>
                <li>Weakness Analytics</li>
                <li>Advanced Progress Analytics</li>
                <li>Advanced study recommendations</li>
                <li><strong>{AI_LIMITS.pro.dailyRequests} RevIT AI messages per day</strong></li>
              </ul>
              <a className={`primary-button ${styles.primary}`} href={proContact} target="_blank" rel="noopener noreferrer" aria-label="Learn About Pro on Facebook (opens in a new tab)">
                Subscribe on Facebook <span aria-hidden="true">↗</span>
              </a>
              <p className={styles.contactNote}>
                Want to see the full breakdown? <Link href="/pricing">View complete plan comparison →</Link>
              </p>
            </article>
          </div>
          <details className={styles.comparison}><summary>Compare what’s included <span aria-hidden="true">+</span></summary><table><caption>RevIT Free and Pro at a glance</caption><thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Pro</th></tr></thead><tbody>{comparison.map(([feature, free, pro]) => <tr key={feature}><th scope="row">{feature}</th><td>{free}</td><td>{pro}</td></tr>)}</tbody></table></details>
        </section>
        <section id="account" className={`${styles.section} ${styles.account}`} aria-label="Your RevIT account" tabIndex={-1}>
          <div className={styles.productCopy}><p className={styles.eyebrow}>One focused session at a time</p><h2>Your next review<br />starts here.</h2><p>Choose a topic. Make a little progress. Come back with a clearer idea of what to study next.</p><p className={styles.motto}>RevIT. Review It Thoroughly.</p></div>
          {signedIn ? <div className={styles.signedIn}><h2>You’re signed in.</h2><p>Your study workspace is ready.</p><Link className={`primary-button ${styles.primary}`} href="/overview">Open RevIT <span aria-hidden="true">↗</span></Link></div>
            : <div className={styles.accountForm}>
              {!configured && <p className={styles.localNotice}>Account sign-in isn’t available in this local preview. <Link href="/overview">Continue locally</Link> to try the reviewer on this device.</p>}
              <AuthPanel key={mode} initialMode={mode} next={params.next} turnstileSiteKey={configured ? (process.env.VITE_TURNSTILE_SITE_KEY ?? "") : ""} />
            </div>}
        </section>
      </main>
      <footer className={styles.footer}><div><strong>RevIT</strong><span>Review It Thoroughly.</span></div><nav aria-label="Legal and subscription links"><Link href="/terms">Terms of Service</Link><Link href="/privacy">Privacy Policy</Link><a href={proContact} target="_blank" rel="noopener noreferrer">Pro enquiries<span className="sr-only"> on Facebook (opens in a new tab)</span></a></nav><small>© {new Date().getFullYear()} RevIT</small></footer>
    </div>
  );
}
