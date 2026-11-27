"use client";

import { confirmedIssueTone, manilaStamp, recordedAmountText, type ReportingSummary } from "../../lib/admin/adminReportingCore";
import styles from "../AdminDashboard.module.css";

const EXPIRING_DAYS = [3, 7, 14, 30];

export default function OverviewSection({
  stats,
  days,
  onDaysChange,
  loading,
  lastRefreshed,
  onOpenBilling,
  onOpenReview,
}: {
  stats: ReportingSummary | null;
  days: number;
  onDaysChange: (value: number) => void;
  loading: boolean;
  lastRefreshed: string | null;
  onOpenBilling: () => void;
  onOpenReview: () => void;
}) {
  return (
    <section className={styles.tabPanel} aria-label="Overview">
      <div>
        <h2>Overview</h2>
        <p className={styles.muted}>Subscription access, administrator-recorded billing and access-consistency checks in one place. Recorded amounts are separate from independently verified payments.</p>
      </div>

      <section className={styles.group} aria-label="Subscription overview">
        <h3>Subscription overview</h3>
        <div className={styles.metrics} aria-busy={loading}>
          <div className={styles.metric}>
            <span>Total registered users</span>
            <strong>{stats?.totalSubscribers ?? "—"}</strong>
            <small>Profile records available to admin reporting.</small>
          </div>
          <div className={`${styles.metric} ${styles.metricLead}`}>
            <span className={styles.statusText} data-tone="positive">Active Pro</span>
            <strong>{stats?.activePro ?? "—"}</strong>
            <small>Database-time entitlement.</small>
          </div>
          <div className={`${styles.metric} ${styles.metricLead}`}>
            <span className={styles.statusText} data-tone="warning">Expiring soon</span>
            <strong>{stats?.expiringSoon ?? "—"}</strong>
            <label>
              Within
              <select aria-label="Expiring soon window" value={days} onChange={event => onDaysChange(Number(event.target.value))}>
                {EXPIRING_DAYS.map(value => <option key={value} value={value}>{value} days</option>)}
              </select>
            </label>
          </div>
          <div className={styles.metric}>
            <span className={styles.statusText} data-tone="negative">Expired Pro</span>
            <strong>{stats?.expired ?? "—"}</strong>
            <small>Recorded natural expirations.</small>
          </div>
          <div className={styles.metric}>
            <span className={styles.statusText} data-tone="neutral">Former Pro</span>
            <strong>{stats?.formerPro ?? "—"}</strong>
            <small>Previously subscribed, not currently Pro.</small>
          </div>
        </div>
      </section>

      <section className={styles.group} aria-label="Sales and billing summary">
        <h3>Sales &amp; billing summary</h3>
        <div className={styles.metrics} aria-busy={loading}>
          <div className={styles.metric}>
            <span>Admin-confirmed sales</span>
            <strong>{recordedAmountText(stats?.recordedBilling)}</strong>
            <small>Recorded billing total. Unreconciled and not independently verified revenue.</small>
            <button type="button" className={styles.inlineAction} onClick={onOpenBilling}>Open monthly breakdown</button>
          </div>
          <div className={styles.metric}>
            <span>Verified revenue</span>
            <strong>Unknown</strong>
            <small>Independent payment evidence unavailable.</small>
          </div>
          <div className={styles.metric}>
            <span>Total paid orders</span>
            <strong>Unknown</strong>
            <small>Unique payment references unavailable.</small>
          </div>
        </div>
      </section>

      {stats?.consistency && (
        <section className={styles.consistency} aria-label="Subscription access consistency">
          <div className={styles.toolbar}>
            <div>
              <h3>Subscription Access Consistency</h3>
              <p className={styles.muted}>Compare effective subscription access with recorded grant history.</p>
            </div>
            <button type="button" onClick={onOpenReview}>Review accounts</button>
          </div>
          <div className={styles.consistencyMetrics}>
            <div className={styles.consistencyMetric}>
              <span className={styles.statusText} data-tone={stats.consistency.reviewNeeded > 0 ? "warning" : "neutral"}>Accounts needing review</span>
              <strong>{stats.consistency.reviewNeeded}</strong>
            </div>
            <div className={styles.consistencyMetric}>
              <span>Confirmed access issues</span>
              <strong className={styles.statusText} data-tone={confirmedIssueTone(stats.consistency.verified, stats.consistency.confirmedMismatch)}>{stats.consistency.verified ? stats.consistency.confirmedMismatch : "Not verified"}</strong>
              <small>{stats.consistency.verified ? "Authoritative per-account decision." : "No authoritative per-account check has run."}</small>
            </div>
            <div className={styles.consistencyMetric}>
              <span className={styles.statusText} data-tone="positive">Consistent active Pro</span>
              <strong>{stats.consistency.activeConsistent}</strong>
            </div>
          </div>
          <dl className={styles.consistencyGrid}>
            <div><dt>Active Pro without matching recorded grant</dt><dd><span className={styles.statusText} data-tone={stats.consistency.activeNoRecord > 0 ? "warning" : "neutral"}>{stats.consistency.activeNoRecord}</span></dd></div>
            <div><dt>Recorded active grant but effective Free access</dt><dd><span className={styles.statusText} data-tone={stats.consistency.potentialAccessIssue > 0 ? "warning" : "neutral"}>{stats.consistency.potentialAccessIssue}</span></dd></div>
            <div><dt>Pro account missing expiration</dt><dd><span className={styles.statusText} data-tone={stats.consistency.missingExpiryPro > 0 ? "warning" : "neutral"}>{stats.consistency.missingExpiryPro}</span></dd></div>
            <div><dt>Expired subscription still labelled Pro</dt><dd><span className={styles.statusText} data-tone={stats.consistency.staleProLabel > 0 ? "warning" : "neutral"}>{stats.consistency.staleProLabel}</span></dd></div>
          </dl>
          <p className={styles.muted}>Potential classifications only. Active Pro without a matching recorded grant is a metadata gap, not proof of unauthorized access; no account is revoked or altered here.</p>
          <p className={styles.muted}>Last checked {manilaStamp(stats.asOf)}. This is the reporting snapshot time, not a fresh authoritative entitlement verification.</p>
        </section>
      )}

      <section className={styles.group} aria-label="Recent subscription activity">
        <h3>Recent subscription activity</h3>
        <p className={styles.muted}>Recorded grant events only. Complimentary grants are not sales, and renewals are separate recorded events.</p>
        <dl className={styles.secondary}>
          <div><dt>Recorded purchase events</dt><dd>{stats?.recordedPurchases ?? "—"}</dd></div>
          <div><dt>Renewal sales</dt><dd>{stats?.renewalSales ?? "—"}</dd></div>
          <div><dt>Complimentary grants</dt><dd>{stats?.manualGrants ?? "—"}</dd></div>
          <div><dt>Last successful refresh</dt><dd>{manilaStamp(lastRefreshed)}</dd></div>
        </dl>
      </section>

      <p className={styles.muted}>{stats ? `Summary as of ${manilaStamp(stats.asOf)}. Only this section's summary is cached, for up to 10 minutes.` : "Summary not loaded."}</p>
    </section>
  );
}
