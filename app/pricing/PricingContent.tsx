"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AI_LIMITS, isProActive, type SubscriptionEntitlement } from "../lib/entitlements";
import { createClient } from "../lib/supabase/client";
import styles from "./PricingPage.module.css";

type Props = {
  initialUser: { id: string; email?: string } | null;
  initialEntitlement: SubscriptionEntitlement | null;
};

const FACEBOOK_PRO_URL = "https://www.facebook.com/revithoroughly";

export default function PricingContent({ initialUser, initialEntitlement }: Props) {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(initialUser);
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | null>(initialEntitlement);
  const [loading, setLoading] = useState(initialUser === undefined && initialEntitlement === undefined);

  useEffect(() => {
    let cancelled = false;

    async function checkAuthAndEntitlement() {
      try {
        const client = createClient();
        const { data: userData, error: authError } = await client.auth.getUser();
        if (cancelled) return;

        if (authError || !userData?.user) {
          setUser(null);
          setEntitlement(null);
          setLoading(false);
          return;
        }

        setUser({ id: userData.user.id, email: userData.user.email });

        const { data: entitlementRows, error: rpcError } = await client.rpc("get_my_entitlement");
        if (cancelled) return;

        if (rpcError || !entitlementRows) {
          setEntitlement({
            storedPlan: "free",
            effectivePlan: "free",
            proStartedAt: null,
            proExpiresAt: null,
            serverNow: null,
          });
        } else {
          const row = Array.isArray(entitlementRows) ? entitlementRows[0] : entitlementRows;
          setEntitlement({
            storedPlan: row.stored_plan === "pro" ? "pro" : "free",
            effectivePlan: row.effective_plan === "pro" ? "pro" : "free",
            proStartedAt: typeof row.pro_started_at === "string" ? row.pro_started_at : null,
            proExpiresAt: typeof row.pro_expires_at === "string" ? row.pro_expires_at : null,
            serverNow: typeof row.server_now === "string" ? row.server_now : null,
          });
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setEntitlement(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void checkAuthAndEntitlement();

    return () => {
      cancelled = true;
    };
  }, []);

  const isPro = !loading && Boolean(user) && isProActive(entitlement);
  const isExpiredPro = !loading && Boolean(user) && !isPro && entitlement?.storedPlan === "pro";
  const isFreeUser = !loading && Boolean(user) && !isPro && !isExpiredPro;
  const isLoggedOut = !loading && !user;

  const formattedExpiry = entitlement?.proExpiresAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(entitlement.proExpiresAt))
    : "";

  return (
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
        {/* FREE CARD */}
        <article className={`${styles.planCard} ${isPro ? styles.freeCardDimmed : ""}`}>
          {isFreeUser && (
            <span className={styles.currentPlanBadge} aria-label="Current plan indicator">
              Current Plan
            </span>
          )}
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
            {loading ? (
              <div className={styles.skeletonCta} aria-hidden="true" />
            ) : isFreeUser ? (
              <Link className={styles.currentPlanCta} href="/overview">
                <span>Current Plan · Open RevIT →</span>
              </Link>
            ) : isPro ? (
              <Link className={styles.currentPlanCta} href="/overview">
                <span>Open RevIT Workspace →</span>
              </Link>
            ) : (
              <Link className={styles.secondaryCta} href="/overview">
                Continue with Free
              </Link>
            )}
          </div>
        </article>

        {/* PRO CARD */}
        <article className={`${styles.planCard} ${styles.proCard} ${isPro ? styles.proCardActive : ""}`}>
          {loading ? null : isPro ? (
            <span className={styles.activePlanBadge} aria-label="Subscription status: Active">
              <span className={styles.activePlanBadgeDot} aria-hidden="true" />
              Active Plan
            </span>
          ) : isExpiredPro ? (
            <span className={styles.expiredBadge} aria-label="Subscription status: Expired">
              Expired
            </span>
          ) : (
            <span className={styles.proBadge}>Recommended</span>
          )}

          <div className={styles.cardTop}>
            <span className={styles.sourcePill}>PRO ACCESS</span>
          </div>
          <h2 className={styles.planTitle}>RevIT Pro</h2>
          <p className={styles.planDesc}>Complete library access and deep weakness diagnostics for serious reviewers.</p>

          {/* DYNAMIC PRICE / STATUS BLOCK */}
          {loading ? (
            <div className={styles.skeletonPrice} aria-hidden="true" />
          ) : isPro ? (
            <div className={styles.activeStatusBlock} role="status">
              <div className={styles.activeStatusRow}>
                <span className={styles.activeStatusDot} aria-hidden="true" />
                <span>RevIT Pro is active</span>
              </div>
              <p className={styles.activeExpiryLabel}>Your Pro access is active until</p>
              <p className={styles.activeExpiryDate}>{formattedExpiry}</p>
            </div>
          ) : isExpiredPro ? (
            <div className={styles.expiredStatusBlock} role="status">
              <p className={styles.expiredNotice}>Your Pro access has expired</p>
              {formattedExpiry && <p className={styles.expiredDate}>Expired on {formattedExpiry}</p>}
              <div className={styles.priceRow} style={{ marginTop: "10px" }}>
                <span className={styles.priceAmount}>₱49</span>
                <span className={styles.pricePeriod}>/ Early Access</span>
              </div>
            </div>
          ) : (
            <div className={styles.priceBlock}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>₱49</span>
                <span className={styles.pricePeriod}>/ Early Access</span>
              </div>
              <p className={styles.priceNote}>Introductory price · Subject to change</p>
            </div>
          )}

          <ul className={styles.featureList}>
            <li className={styles.featureItem}>
              <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
              <strong>Everything included in RevIT Free</strong>
            </li>
            <li className={styles.featureItem}>
              <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
              <span>
                Full Harr &amp; Ciulla (4th Edition) question banks
                {isPro && <span className={styles.includedTag}>Included in your plan</span>}
              </span>
            </li>
            <li className={styles.featureItem}>
              <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
              <span>More book editions to be added in future updates</span>
            </li>
            <li className={styles.featureItem}>
              <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
              <span>
                Full flashcard decks across all book editions
                {isPro && <span className={styles.includedTag}>Included in your plan</span>}
              </span>
            </li>
            <li className={styles.featureItem}>
              <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
              <span>
                Weakness Analytics to target low-scoring subtopics
                {isPro && <span className={styles.includedTag}>Included in your plan</span>}
              </span>
            </li>
            <li className={styles.featureItem}>
              <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
              <span>
                Detailed topic trends and personalized recommendations
                {isPro && <span className={styles.includedTag}>Included in your plan</span>}
              </span>
            </li>
            <li className={styles.featureItem}>
              <span className={`${styles.checkIcon} ${styles.proCheckIcon}`} aria-hidden="true">✓</span>
              <span>
                RevIT AI: {AI_LIMITS.pro.dailyRequests} tutoring messages per day
                {isPro && <span className={styles.includedTag}>Included in your plan</span>}
              </span>
            </li>
          </ul>

          <div className={styles.cardAction}>
            {loading ? (
              <div className={styles.skeletonCta} aria-hidden="true" />
            ) : isPro ? (
              <a
                className={styles.activeRenewCta}
                href={FACEBOOK_PRO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Contact us to renew</span>
                <span className="sr-only"> on Facebook (opens in a new tab)</span>
                <span aria-hidden="true">↗</span>
              </a>
            ) : isExpiredPro ? (
              <a
                className={styles.primaryCta}
                href={FACEBOOK_PRO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Renew Pro via Facebook</span>
                <span className="sr-only"> (opens in a new tab)</span>
                <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <a
                className={styles.primaryCta}
                href={FACEBOOK_PRO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Subscribe via Facebook</span>
                <span className="sr-only"> (opens in a new tab)</span>
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </article>
      </section>

      {/* DETAILED COMPARISON TABLE */}
      <section className={styles.comparisonSection} aria-labelledby="comparison-heading">
        <div className={styles.comparisonHeader}>
          <p className="eyebrow">Side-by-side comparison</p>
          <h2 id="comparison-heading">Compare Free and Pro plan features</h2>
          <p>Everything you get in each tier with zero hidden limits or surprise charges.</p>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.compTable}>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">
                  RevIT Free
                  {isFreeUser && <span className={styles.tableActivePill}>Your Current Plan</span>}
                </th>
                <th scope="col">
                  RevIT Pro
                  {isPro && <span className={styles.tableActivePill}>Your Current Plan</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.compCategoryRow}>
                <td colSpan={3}>Reviewer Libraries &amp; Flashcards</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Harr Question Library</span>
                  <span className={styles.compFeatureDesc}>Complete Harr medical technology MCQs &amp; rationales</span>
                </td>
                <td className={styles.compCell}>999 MCQs</td>
                <td className={styles.compCellPro}>999 MCQs</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Ciulla Question Library</span>
                  <span className={styles.compFeatureDesc}>Ciulla 4th Edition board preparation question bank</span>
                </td>
                <td className={styles.compCell}><span className={styles.crossMark} aria-label="Not included">✕</span></td>
                <td className={styles.compCellPro}>1,884 MCQs</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Total Practice Questions</span>
                  <span className={styles.compFeatureDesc}>Full question pool across all board subjects</span>
                </td>
                <td className={styles.compCell}>999 Questions</td>
                <td className={styles.compCellPro}>2,883 Questions</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Digital Flashcards</span>
                  <span className={styles.compFeatureDesc}>Active recall flashcards with question timer and shuffle</span>
                </td>
                <td className={styles.compCell}>Harr only (999 cards)</td>
                <td className={styles.compCellPro}>Harr + Ciulla (2,883 cards)</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Combined Book Review</span>
                  <span className={styles.compFeatureDesc}>Practice all book editions together in one unified session</span>
                </td>
                <td className={styles.compCell}><span className={styles.crossMark} aria-label="Not included">✕</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Future Book Editions</span>
                  <span className={styles.compFeatureDesc}>New MedTech reviewer books added to your library as they release</span>
                </td>
                <td className={styles.compCell}><span className={styles.crossMark} aria-label="Not included">✕</span></td>
                <td className={styles.compCellPro}>Included in Pro</td>
              </tr>

              <tr className={styles.compCategoryRow}>
                <td colSpan={3}>Analytics &amp; Diagnostics</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Basic Progress Tracking</span>
                  <span className={styles.compFeatureDesc}>Subject-level accuracy percentages and overall attempt counts</span>
                </td>
                <td className={styles.compCell}><span className={styles.checkMark} aria-label="Included">✓</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Advanced Progress Analytics</span>
                  <span className={styles.compFeatureDesc}>Per-topic accuracy meters, attempt meters, and topic search</span>
                </td>
                <td className={styles.compCell}><span className={styles.crossMark} aria-label="Not included">✕</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Weakness Analytics</span>
                  <span className={styles.compFeatureDesc}>Automated detection of repeated mistakes and low-scoring topics</span>
                </td>
                <td className={styles.compCell}><span className={styles.crossMark} aria-label="Not included">✕</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Personalized Recommendations</span>
                  <span className={styles.compFeatureDesc}>AI-informed topic focus based on your weak areas</span>
                </td>
                <td className={styles.compCell}><span className={styles.crossMark} aria-label="Not included">✕</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>

              <tr className={styles.compCategoryRow}>
                <td colSpan={3}>RevIT AI Tutoring</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>AI Daily Message Allowance</span>
                  <span className={styles.compFeatureDesc}>Contextual rationales, mnemonic breakdowns, and concept tutoring</span>
                </td>
                <td className={styles.compCell}>{AI_LIMITS.free.dailyRequests} msgs / day</td>
                <td className={styles.compCellPro}>{AI_LIMITS.pro.dailyRequests} msgs / day</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>AI Rate Limit</span>
                  <span className={styles.compFeatureDesc}>Maximum chat bursts per minute</span>
                </td>
                <td className={styles.compCell}>{AI_LIMITS.free.minuteRequests} / min</td>
                <td className={styles.compCellPro}>{AI_LIMITS.pro.minuteRequests} / min</td>
              </tr>

              <tr className={styles.compCategoryRow}>
                <td colSpan={3}>Study Tools &amp; Community</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Grades &amp; Grade Simulator</span>
                  <span className={styles.compFeatureDesc}>Target grade tracking and MTLE passing probability calculator</span>
                </td>
                <td className={styles.compCell}><span className={styles.checkMark} aria-label="Included">✓</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Study Planner &amp; Calendar</span>
                  <span className={styles.compFeatureDesc}>Daily scheduled topic sessions and study habit tracking</span>
                </td>
                <td className={styles.compCell}><span className={styles.checkMark} aria-label="Included">✓</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Leaderboards &amp; XP Progression</span>
                  <span className={styles.compFeatureDesc}>Streaks, daily goals, level milestones, and opt-in rankings</span>
                </td>
                <td className={styles.compCell}><span className={styles.checkMark} aria-label="Included">✓</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>
              <tr>
                <td>
                  <span className={styles.compFeatureName}>Cloud Sync &amp; Backup</span>
                  <span className={styles.compFeatureDesc}>Automatic real-time sync across desktop, tablet, and mobile</span>
                </td>
                <td className={styles.compCell}><span className={styles.checkMark} aria-label="Included">✓</span></td>
                <td className={styles.compCellPro}><span className={styles.checkMark} aria-label="Included">✓</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* SAFETY NOTICE */}
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

      {/* FAQ */}
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
  );
}
