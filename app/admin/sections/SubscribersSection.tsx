"use client";

import AdminPanel, { type AdminUserItem } from "../AdminPanel";
import { billingEvidence, billingTone, CONSISTENCY_REASONS, consistencyTone, duration, expirationTone, human, recordedAmountText, recordedFactTone, recordedSource, sourceTone, subscriberDuration, subscriberExpiration, subscriberStarted, subscriberStatusText, subscriberStatusTone, type ReportingFilters, type ReportingResult, type SubscriberRow } from "../../lib/admin/adminReportingCore";
import styles from "../AdminDashboard.module.css";

type SubscriberExport = "subscribers" | "history" | "recorded" | "monthly";

export default function SubscribersSection({
  adminUserId,
  adminEmail,
  preview,
  filters,
  search,
  onSearch,
  onFilter,
  directory,
  selected,
  busy,
  exporting,
  lookup,
  onToggleLookup,
  onSelect,
  onCloseSelected,
  onDownload,
  managementUser,
  managementRequest,
}: {
  adminUserId: string;
  adminEmail: string;
  preview: boolean;
  filters: ReportingFilters;
  search: string;
  onSearch: (value: string) => void;
  onFilter: (key: keyof ReportingFilters, value: string | number) => void;
  directory: ReportingResult | null;
  selected: SubscriberRow | null;
  busy: string[];
  exporting: boolean;
  lookup: boolean;
  onToggleLookup: () => void;
  onSelect: (row: SubscriberRow) => void;
  onCloseSelected: () => void;
  onDownload: (kind: SubscriberExport) => void;
  managementUser: AdminUserItem | null;
  managementRequest: typeof globalThis.fetch;
}) {
  return (
    <section className={styles.tabPanel} aria-label="Subscribers workspace">
      <section className={styles.panel} aria-labelledby="subscriber-title">
        <div className={styles.toolbar}>
          <h2 id="subscriber-title">Subscriber directory</h2>
          <button type="button" disabled={exporting || !directory} onClick={() => onDownload("subscribers")}>Export filtered CSV</button>
        </div>
        <div className={styles.filters}>
          <label>Username<input type="search" value={search} maxLength={80} placeholder="At least 2 characters" onChange={event => onSearch(event.target.value)} /></label>
          <label>Status<select value={filters.status} onChange={event => onFilter("status", event.target.value)}>{["all", "active", "expiring", "expired", "former", "free", "review"].map(value => <option key={value} value={value}>{value === "review" ? "Needs review" : human(value)}</option>)}</select></label>
          <label>Recorded duration<select value={filters.months} onChange={event => onFilter("months", event.target.value)}><option value="all">All durations</option>{[1, 3, 6].map(value => <option key={value} value={value}>{duration(value)}</option>)}<option value="unknown">Unknown</option></select></label>
          <label>Grant source<select value={filters.source} onChange={event => onFilter("source", event.target.value)}><option value="all">All sources</option><option value="purchased">Recorded purchase (unverified)</option><option value="manual">Gift / prize</option><option value="unknown">Unknown</option></select></label>
          <label>Expiration from<input type="date" value={filters.expiresFrom} onChange={event => onFilter("expiresFrom", event.target.value)} /></label>
          <label>Expiration through<input type="date" value={filters.expiresTo} onChange={event => onFilter("expiresTo", event.target.value)} /></label>
        </div>
        <p className={styles.muted}>25 per page. No automatic total-count query. Source and duration use the latest recorded grant, not assumed pricing.</p>
        {search.trim().length === 1 && <p role="status">Enter at least two characters.</p>}
        <div className={styles.tableWrap} aria-busy={busy.includes("directory")} tabIndex={0} role="region" aria-label="Subscribers">
          <table>
            <thead><tr><th scope="col">Subscriber</th><th scope="col">Status</th><th scope="col">Started date</th><th scope="col">Expiration</th><th scope="col">Recorded duration</th><th scope="col">Source</th><th scope="col">Access check</th><th scope="col">Details</th></tr></thead>
            <tbody>{directory?.subscribers?.map(row => (
              <tr key={row.id}>
                <td data-label="Subscriber">{row.username || "Unnamed subscriber"}</td>
                <td data-label="Status"><span className={styles.statusText} data-tone={subscriberStatusTone(row.status)}>{subscriberStatusText(row.status)}</span></td>
                <td data-label="Started date"><span className={styles.statusText} data-tone={recordedFactTone(row.proStartedAt, row.status)}>{subscriberStarted(row.proStartedAt, row.status)}</span></td>
                <td data-label="Expiration"><span className={styles.statusText} data-tone={expirationTone(row.proExpiresAt, row.status)}>{subscriberExpiration(row.proExpiresAt, row.status)}</span></td>
                <td data-label="Recorded duration"><span className={styles.statusText} data-tone={recordedFactTone(row.planMonths, row.status)}>{subscriberDuration(row.planMonths, row.status)}</span></td>
                <td data-label="Source"><span className={styles.statusText} data-tone={recordedFactTone(row.source, row.status) === "muted" ? "muted" : sourceTone(row.source)}>{recordedSource(row.source, row.status)}</span></td>
                <td data-label="Access check">
                  <span className={styles.statusText} data-tone={consistencyTone(row.consistency)}>{row.consistency ? "Needs review" : "Consistent"}</span>
                  {row.consistency && <small>{CONSISTENCY_REASONS[row.consistency] ?? human(row.consistency)}</small>}
                </td>
                <td data-label="Manage"><button type="button" aria-label={`View ${row.username || "subscriber"} subscription`} onClick={() => onSelect(row)}>Manage subscription</button></td>
              </tr>
            ))}</tbody>
          </table>
          {busy.includes("directory") ? <p role="status" className={styles.empty}>Loading subscribers...</p> : directory && !directory.subscribers?.length && <p className={styles.empty}>No subscribers match these filters.</p>}
        </div>
        <div className={styles.toolbar}>
          <button type="button" disabled={filters.page === 1 || busy.includes("directory")} onClick={() => onFilter("page", filters.page - 1)}>Previous subscribers</button>
          <span>Page {filters.page}</span>
          <button type="button" disabled={!directory?.hasMore || busy.includes("directory")} onClick={() => onFilter("page", filters.page + 1)}>Next subscribers</button>
        </div>
      </section>

      <section className={styles.management} aria-label="Subscriber management">
        <div className={styles.toolbar}>
          <div>
            <h2>Subscriber management</h2>
            <p className={styles.muted}>Current subscription · Manage / Customize · Grant / Revoke · Notes · History</p>
          </div>
          <button type="button" aria-expanded={lookup} onClick={onToggleLookup}>Advanced account lookup</button>
          {selected && <button type="button" onClick={onCloseSelected}>Close subscriber</button>}
        </div>
        {!selected && !lookup && <p className={styles.empty}>Choose Manage subscription in the directory to open all existing subscription controls.</p>}
        <div hidden={!selected && !lookup}>
          {selected && !lookup && (
            <>
              <p className={styles.notice}>Latest recorded billing: {selected.status === "free" ? "Not applicable" : recordedAmountText(selected.amountPhp)} · {subscriberDuration(selected.planMonths, selected.status)} · <span className={styles.statusText} data-tone={selected.status === "free" ? "muted" : billingTone(selected.billingStatus)}>{selected.status === "free" ? "Not applicable" : billingEvidence(selected.billingStatus)}</span>. This is not independent payment verification.</p>
              <dl className={styles.secondary}>
                <div><dt>Stored start date</dt><dd><span className={styles.statusText} data-tone={recordedFactTone(selected.proStartedAt, selected.status)}>{subscriberStarted(selected.proStartedAt, selected.status)}</span></dd></div>
                <div><dt>Stored expiration</dt><dd><span className={styles.statusText} data-tone={expirationTone(selected.proExpiresAt, selected.status)}>{subscriberExpiration(selected.proExpiresAt, selected.status)}</span></dd></div>
                <div><dt>Recorded source</dt><dd><span className={styles.statusText} data-tone={recordedFactTone(selected.source, selected.status) === "muted" ? "muted" : sourceTone(selected.source)}>{recordedSource(selected.source, selected.status)}</span></dd></div>
              </dl>
            </>
          )}
          <AdminPanel
            embedded
            showLookup={lookup}
            adminUserId={preview ? "synthetic-admin" : adminUserId}
            adminEmail={preview ? "simulation@example.invalid" : adminEmail}
            selectedSubscriber={managementUser}
            request={managementRequest}
          />
          {selected && <button type="button" disabled={exporting} onClick={() => onDownload("history")}>Export selected history CSV</button>}
        </div>
      </section>
    </section>
  );
}
