import { PRO_PLANS, PRO_CONTACT_URL } from "../lib/proPlans";
import { PUBLIC_REVIEWERS } from "../lib/publicReviewerBooks";
import { AI_LIMITS } from "../lib/entitlements";
import styles from "../pricing/PricingPage.module.css";

export default function ProPlanCards({ renew = false }: { renew?: boolean }) {
  return (
      <section className={styles.plansGrid} aria-label="Prepaid RevIT Pro plans">
        {PRO_PLANS.map(plan => {
          const savings = PRO_PLANS[0].price * plan.months - plan.price;
          return <article key={plan.months} className={styles.prepaidCard} data-best-value={plan.months === 6 ? "true" : undefined}>
            <p className={styles.planLabel}>{plan.months === 6 ? "Best Value" : "RevIT Pro"}</p>
            <h3>{plan.months} {plan.months === 1 ? "month" : "months"}</h3>
            <p className={styles.upfrontPrice}>₱{plan.price}</p>
            <p className={styles.paymentTerm}>One upfront payment</p>
            <p className={styles.equivalent}>₱{(plan.price / plan.months).toFixed(2)} per month equivalent</p>
            <p className={styles.savings}>{savings ? `Save ₱${savings} versus monthly purchases` : "Standard monthly price"}</p>
            <ul className={styles.prepaidFeatures}>
              <li>Access to all {PUBLIC_REVIEWERS.books.length} published reviewer editions and Flashcards</li>
              <li>Weakness Analytics and advanced Progress</li>
              <li>{AI_LIMITS.pro.dailyRequests} RevIT AI messages per day</li>
              <li>All Free features included</li>
            </ul>
            <a className={styles.prepaidCta} href={PRO_CONTACT_URL} target="_blank" rel="noopener noreferrer">{renew ? "Renew" : "Get"} {plan.months}-month Pro<span className="sr-only"> on Instagram (opens in a new tab)</span></a>
          </article>;
        })}
      </section>
  );
}
