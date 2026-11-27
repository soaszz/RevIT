"use client";

import { billingEvidence, billingTone, EVENT_TYPES, eventTone, expirationTone, human, manilaDate, recordedAmountText, recordedDuration, recordedExpiry, recordedFactTone, recordedSource, sourceTone, type HistoryRow, type ReportingFilters, type ReportingResult } from "../../lib/admin/adminReportingCore";
import styles from "../AdminDashboard.module.css";

export function SubscriptionHistoryTable({ rows = [], loading = false, onOpenSubscriber }: { rows?: ReportingResult["history"]; loading?: boolean; onOpenSubscriber?: (row: HistoryRow) => void }) {
  return (
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Recorded subscription events" aria-busy={loading}>
      <table>
        <thead><tr>
          <th scope="col">Subscriber</th><th scope="col">Event / source</th><th scope="col">Recorded date</th>
          <th scope="col">Duration</th><th scope="col">Recorded amount</th><th scope="col">Billing evidence</th><th scope="col">Expiration</th>
        </tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.id}>
            <td data-label="Subscriber">
              {onOpenSubscriber ? (
                <button
                  type="button"
                  className={styles.inlineButton}
                  aria-label={`Open subscriber details for ${row.username || "this account"}`}
                  onClick={() => onOpenSubscriber(row)}
                >
                  <span className={styles.statusText} data-tone={row.username ? "neutral" : "muted"}>{row.username || "Account unavailable"}</span>
                </button>
              ) : (
                <span className={styles.statusText} data-tone={row.username ? "neutral" : "muted"}>{row.username || "Account unavailable"}</span>
              )}
              {!row.username && <small>Ref {row.userId.slice(0, 8)}</small>}
            </td>
            <td data-label="Event / source">
              <span className={styles.statusText} data-tone={eventTone(row.eventType)}>{human(row.eventType)}</span>
              <small className={styles.statusText} data-tone={sourceTone(row.source)}>{recordedSource(row.source)}</small>
            </td>
            <td data-label="Recorded date">{manilaDate(row.createdAt)}</td>
            <td data-label="Duration"><span className={styles.statusText} data-tone={recordedFactTone(row.planMonths)}>{recordedDuration(row.planMonths)}</span></td>
            <td data-label="Recorded amount"><span className={styles.statusText} data-tone={recordedFactTone(row.amountPhp)}>{recordedAmountText(row.amountPhp)}</span></td>
            <td data-label="Billing evidence"><span className={styles.statusText} data-tone={billingTone(row.billingStatus)}>{billingEvidence(row.billingStatus)}</span></td>
            <td data-label="Expiration"><span className={styles.statusText} data-tone={expirationTone(row.newExpiresAt, undefined)}>{recordedExpiry(row.newExpiresAt)}</span></td>
          </tr>
        ))}</tbody>
      </table>
      {!loading && rows.length === 0 && <p className={styles.empty}>No recorded events.</p>}
    </div>
  );
}

export default function HistorySection({
  transactions,
  busy,
  range,
  onRangeChange,
  filters,
  onFilter,
  page,
  onPage,
  exporting,
  onDownload,
  onOpenSubscriber,
}: {
  transactions: ReportingResult | null;
  busy: string[];
  range: { from: string; to: string };
  onRangeChange: (range: { from: string; to: string }) => void;
  filters: ReportingFilters;
  onFilter: (key: keyof ReportingFilters, value: string | number) => void;
  page: number;
  onPage: (page: number) => void;
  exporting: boolean;
  onDownload: (kind: "recorded") => void;
  onOpenSubscriber?: (row: HistoryRow) => void;
}) {
  return (
    <section className={styles.tabPanel} aria-label="Subscription history">
      <div className={styles.toolbar}>
        <div>
          <h2>Subscription History</h2>
          <p className={styles.muted}>Every recorded grant, purchase, renewal, extension, revocation and expiration, newest first. Event IDs are not payment IDs. Subscriber names appear when the event is matched to an account; otherwise a neutral label and account reference are shown. Missing durations and amounts stay Not recorded and are never backfilled.</p>
        </div>
        <button type="button" disabled={exporting || !transactions} onClick={() => onDownload("recorded")}>Export recorded CSV</button>
      </div>
      <div className={styles.filters}>
        <label>Recorded from<input type="date" value={range.from} onChange={event => onRangeChange({ ...range, from: event.target.value })} /></label>
        <label>Recorded through<input type="date" value={range.to} onChange={event => onRangeChange({ ...range, to: event.target.value })} /></label>
        <label>Event type<select value={filters.event} onChange={event => onFilter("event", event.target.value)}>{EVENT_TYPES.map(value => <option key={value} value={value}>{human(value)}</option>)}</select></label>
      </div>
      {busy.includes("transactions") && <p role="status">Loading history...</p>}
      <SubscriptionHistoryTable rows={transactions?.history} loading={busy.includes("transactions")} onOpenSubscriber={onOpenSubscriber} />
      <div className={styles.toolbar}>
        <button type="button" disabled={page === 1 || busy.includes("transactions")} onClick={() => onPage(page - 1)}>Previous events</button>
        <span>Page {page}</span>
        <button type="button" disabled={!transactions?.hasMore || busy.includes("transactions")} onClick={() => onPage(page + 1)}>Next events</button>
      </div>
    </section>
  );
}
