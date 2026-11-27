"use client";

import {
  billingEvidence,
  billingTone,
  duration,
  human,
  manilaDate,
  planBucketLabel,
  PLAN_BUCKETS,
  recordedAmountText,
  recordedDuration,
  recordedExpiry,
  recordedFactTone,
  PAYMENT_LIMITATION,
  type ReportingResult,
} from "../../lib/admin/adminReportingCore";
import { PRO_PLAN_SUMMARY } from "../../lib/proPlans";
import styles from "../AdminDashboard.module.css";

// Section order follows the approved reading flow: Billing summary -> Current Pro breakdown ->
// Recent purchases -> Monthly sales -> Billing limitations. Everything below rides the one monthly
// reporting response the tab already requests, so this refinement adds no request and no polling.
export default function SalesBillingSection({
  monthly,
  busy,
  range,
  onRangeChange,
  exporting,
  onDownload,
}: {
  monthly: ReportingResult | null;
  busy: string[];
  range: { from: string; to: string };
  onRangeChange: (range: { from: string; to: string }) => void;
  exporting: boolean;
  onDownload: (kind: "monthly") => void;
}) {
  // Derived only from the one already-requested monthly response. No extra query.
  const months = monthly?.months ?? [];
  const hasRecorded = months.some(row => row.recordedAmount !== null);
  const recordedTotal = months.reduce((sum, row) => sum + (row.recordedAmount ?? 0), 0);
  const recordedEvents = months.reduce((sum, row) => sum + row.recordedEvents, 0);
  const unknownAmounts = months.reduce((sum, row) => sum + row.unknownAmounts, 0);

  // Current Pro breakdown and recent purchases were added by the guarded reporting proposal. Until
  // it is installed the response omits them, so the section states that plainly rather than guessing.
  const breakdown = monthly?.activePlanBreakdown ?? [];
  const hasBreakdown = Boolean(monthly && monthly.activePlanBreakdown);
  const activeProTotal = breakdown.reduce((sum, row) => sum + row.activePro, 0);
  const breakdownCount = (bucket: string) => breakdown.find(row => row.bucket === bucket)?.activePro ?? 0;

  const purchases = monthly?.recentPurchases ?? [];
  const hasPurchases = Boolean(monthly && monthly.recentPurchases);

  return (
    <section className={styles.tabPanel} aria-label="Sales and billing">
      <section className={styles.panel} aria-labelledby="billing-summary-title">
        <h2 id="billing-summary-title">Sales &amp; billing</h2>
        <p className={styles.muted}>Advertised plans: {PRO_PLAN_SUMMARY}. Each sale stores the amount confirmed by the administrator when it was recorded; current prices are never applied to older events.</p>
        <h3>Billing summary</h3>
        <dl className={styles.secondary}>
          <div><dt>Recorded billing total</dt><dd>{recordedAmountText(hasRecorded ? recordedTotal : null)}</dd></div>
          <div><dt>Recorded purchase count</dt><dd>{monthly ? recordedEvents : "—"}</dd></div>
          <div><dt>Historical unknown amounts</dt><dd>{monthly ? unknownAmounts : "—"}</dd></div>
          <div><dt>Recorded renewal sales</dt><dd>{monthly ? (monthly.renewalSales ?? "—") : "—"}</dd></div>
        </dl>
        <h3>Recorded billing by duration</h3>
        <ul className={styles.planList}>{monthly?.plans?.map(row => <li key={row.months ?? "unknown"}>{row.months == null ? "Custom duration" : duration(row.months)}: {recordedAmountText(row.recordedAmount)} · {row.recordedEvents} recorded events</li>)}</ul>
        {monthly && !monthly.plans?.length && <p className={styles.muted}>No admin-confirmed paid durations in this range.</p>}
        <h3>Recorded source breakdown</h3>
        <ul className={styles.planList}>{monthly?.sources?.map(row => <li key={row.source}>{human(row.source)}: {row.recordedAmount == null && (row.source === "gift" || row.source === "prize") ? "Complimentary" : recordedAmountText(row.recordedAmount)} · {row.events} recorded event(s)</li>)}</ul>
        {monthly && !monthly.sources?.length && <p className={styles.muted}>No recorded grant events in this range.</p>}
      </section>

      <section className={styles.panel} aria-labelledby="active-plan-title">
        <h3 id="active-plan-title">Current Pro breakdown by recorded duration</h3>
        <p className={styles.muted}>Accounts with effective Pro access at this snapshot, grouped by the duration stored on their most recent recorded grant. Duration is never derived from expiration dates or prices.</p>
        {hasBreakdown ? (
          <dl className={styles.consistencyGrid}>
            {PLAN_BUCKETS.map(bucket => (
              <div key={bucket}><dt>{planBucketLabel(bucket)}</dt><dd>{breakdownCount(bucket)}</dd></div>
            ))}
            <div><dt>Total effective Pro</dt><dd>{activeProTotal}</dd></div>
          </dl>
        ) : (
          <p className={styles.muted}>{monthly ? "This response does not report the duration breakdown. It appears once the reviewed reporting update is installed; no duration is estimated in the meantime." : "Load recorded billing to see the current Pro breakdown."}</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="recent-purchases-title">
        <h3 id="recent-purchases-title">Recent purchases</h3>
        <p className={styles.muted}>Genuine recorded purchases with a recorded amount, newest first and limited to the recorded-date range above. Gift and prize grants are excluded, and no payment reference is invented.</p>
        {hasPurchases ? (
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Recent recorded purchases">
            <table>
              <thead><tr>
                <th scope="col">Subscriber</th><th scope="col">Plan / recorded duration</th><th scope="col">Recorded amount</th>
                <th scope="col">Purchase date</th><th scope="col">Expiration</th><th scope="col">Billing classification</th>
              </tr></thead>
              <tbody>{purchases.map(row => (
                <tr key={row.id}>
                  <td data-label="Subscriber">{row.username || "Account unavailable"}</td>
                  <td data-label="Plan / recorded duration"><span className={styles.statusText} data-tone={recordedFactTone(row.planMonths)}>{recordedDuration(row.planMonths)}</span></td>
                  <td data-label="Recorded amount"><span className={styles.statusText} data-tone={recordedFactTone(row.amountPhp)}>{recordedAmountText(row.amountPhp)}</span></td>
                  <td data-label="Purchase date">{manilaDate(row.createdAt)}</td>
                  <td data-label="Expiration"><span className={styles.statusText} data-tone={recordedFactTone(row.newExpiresAt)}>{recordedExpiry(row.newExpiresAt)}</span></td>
                  <td data-label="Billing classification"><span className={styles.statusText} data-tone={billingTone(row.billingStatus)}>{billingEvidence(row.billingStatus)}</span></td>
                </tr>
              ))}</tbody>
            </table>
            {!purchases.length && <p className={styles.empty}>No recorded purchases in this range.</p>}
          </div>
        ) : (
          <p className={styles.muted}>{monthly ? "This response does not report recent purchases. They appear once the reviewed reporting update is installed; no purchase is inferred in the meantime." : "Load recorded billing to see recent purchases."}</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="monthly-sales-title">
        <h2 id="monthly-sales-title">Monthly sales</h2>
        <div className={styles.filters}>
          <label>Recorded from<input type="date" value={range.from} onChange={event => onRangeChange({ ...range, from: event.target.value })} /></label>
          <label>Recorded through<input type="date" value={range.to} onChange={event => onRangeChange({ ...range, to: event.target.value })} /></label>
          <button type="button" disabled={exporting || !monthly} onClick={() => onDownload("monthly")}>Export monthly CSV</button>
        </div>
        <p className={styles.muted}>Default: current Manila month and previous 11 months. Dates use Asia/Manila; event dates are not payment settlement dates.</p>
        {busy.includes("monthly") && <p role="status">Loading recorded billing...</p>}
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Monthly admin-confirmed billing">
          <table>
            <thead><tr><th scope="col">Month</th><th scope="col">Admin-confirmed PHP</th><th scope="col">Recorded purchases</th><th scope="col">Unknown amounts</th></tr></thead>
            <tbody>{monthly?.months?.map(row => (
              <tr key={row.month}>
                <td data-label="Month">{row.month}</td>
                <td data-label="Admin-confirmed PHP"><span className={styles.statusText} data-tone={recordedFactTone(row.recordedAmount)}>{recordedAmountText(row.recordedAmount)}</span></td>
                <td data-label="Recorded purchases">{row.recordedEvents}</td>
                <td data-label="Unknown amounts">{row.unknownAmounts}</td>
              </tr>
            ))}</tbody>
          </table>
          {monthly && !monthly.months?.length && <p className={styles.empty}>No admin-confirmed billing in this range. Verified revenue remains Unknown.</p>}
        </div>
        <h3>Recorded renewal sales</h3>
        <p className={styles.muted}>{monthly ? (monthly.renewalSales == null ? "Renewal sales were not reported by this response." : `${monthly.renewalSales} recorded renewal sale(s) in this range. Renewals are separate recorded events, not verified payments.`) : "Load recorded billing to see renewals."}</p>
      </section>

      <section className={styles.panel} aria-labelledby="billing-limits-title">
        <h3 id="billing-limits-title">Billing limitations and historical unknowns</h3>
        <p className={styles.notice}>{PAYMENT_LIMITATION}</p>
        <p className={styles.muted}>Historical events without a stored amount stay Unknown and are never counted as revenue. Current prices are never back-applied to older events, and recorded plan durations come only from stored grant metadata.</p>
      </section>
    </section>
  );
}
