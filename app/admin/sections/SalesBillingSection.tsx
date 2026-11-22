"use client";

import { duration, human, recordedAmountText, recordedFactTone, PAYMENT_LIMITATION, type ReportingResult } from "../../lib/admin/adminReportingCore";
import { PRO_PLAN_SUMMARY } from "../../lib/proPlans";
import styles from "../AdminDashboard.module.css";

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

  return (
    <section className={styles.tabPanel} aria-label="Sales and billing">
      <section className={styles.panel} aria-labelledby="revenue-title">
        <h2 id="revenue-title">Monthly admin-confirmed billing</h2>
        <p className={styles.muted}>Advertised plans: {PRO_PLAN_SUMMARY}. Each sale stores the amount confirmed by the administrator when it was recorded; current prices are never applied to older events.</p>
        <p className={styles.notice}>{PAYMENT_LIMITATION}</p>
        <div className={styles.filters}>
          <label>Recorded from<input type="date" value={range.from} onChange={event => onRangeChange({ ...range, from: event.target.value })} /></label>
          <label>Recorded through<input type="date" value={range.to} onChange={event => onRangeChange({ ...range, to: event.target.value })} /></label>
          <button type="button" disabled={exporting || !monthly} onClick={() => onDownload("monthly")}>Export monthly CSV</button>
        </div>
        <p className={styles.muted}>Default: current Manila month and previous 11 months. Dates use Asia/Manila; event dates are not payment settlement dates.</p>
        <dl className={styles.secondary}>
          <div><dt>Recorded billing total</dt><dd>{recordedAmountText(hasRecorded ? recordedTotal : null)}</dd></div>
          <div><dt>Recorded purchase count</dt><dd>{monthly ? recordedEvents : "—"}</dd></div>
          <div><dt>Historical unknown amounts</dt><dd>{monthly ? unknownAmounts : "—"}</dd></div>
        </dl>
        {busy.includes("monthly") && <p role="status">Loading admin-confirmed billing...</p>}
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Monthly admin-confirmed billing">
          <table>
            <thead><tr><th scope="col">Month</th><th scope="col">Admin-confirmed PHP</th><th scope="col">Admin-confirmed events</th><th scope="col">Unknown amounts</th></tr></thead>
            <tbody>{monthly?.months?.map(row => (
              <tr key={row.month}>
                <td data-label="Month">{row.month}</td>
                <td data-label="Admin-confirmed PHP"><span className={styles.statusText} data-tone={recordedFactTone(row.recordedAmount)}>{recordedAmountText(row.recordedAmount)}</span></td>
                <td data-label="Recorded events">{row.recordedEvents}</td>
                <td data-label="Unknown amounts">{row.unknownAmounts}</td>
              </tr>
            ))}</tbody>
          </table>
          {monthly && !monthly.months?.length && <p className={styles.empty}>No admin-confirmed billing in this range. Verified revenue remains Unknown.</p>}
        </div>
        <h3>Recorded billing by duration</h3>
        <ul className={styles.planList}>{monthly?.plans?.map(row => <li key={row.months ?? "unknown"}>{row.months == null ? "Custom duration" : duration(row.months)}: {recordedAmountText(row.recordedAmount)} · {row.recordedEvents} recorded events</li>)}</ul>
        {monthly && !monthly.plans?.length && <p className={styles.muted}>No admin-confirmed paid durations in this range.</p>}
        <h3>Renewal sales</h3>
        <p className={styles.muted}>{monthly ? (monthly.renewalSales == null ? "Renewal sales were not reported by this response." : `${monthly.renewalSales} recorded renewal sale(s) in this range. Renewals are separate recorded events, not verified payments.`) : "Load recorded billing to see renewals."}</p>
        <h3>Recorded source breakdown</h3>
        <ul className={styles.planList}>{monthly?.sources?.map(row => <li key={row.source}>{human(row.source)}: {row.recordedAmount == null && (row.source === "gift" || row.source === "prize") ? "Complimentary" : recordedAmountText(row.recordedAmount)} · {row.events} recorded event(s)</li>)}</ul>
        {monthly && !monthly.sources?.length && <p className={styles.muted}>No recorded grant events in this range.</p>}
      </section>
    </section>
  );
}
