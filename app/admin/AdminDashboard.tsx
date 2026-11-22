"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  csvText,
  EMPTY_FILTERS,
  EXPORT_LIMIT,
  manilaStamp,
  reportingParams,
  SEARCH_DELAY,
  type ReportingFilters,
  type ReportingMode,
  type ReportingResult,
  type SubscriberRow,
  type HistoryRow,
} from "../lib/admin/adminReportingCore";
import type { AdminUserItem } from "./AdminPanel";
import styles from "./AdminDashboard.module.css";
import OverviewSection from "./sections/OverviewSection";
import SubscribersSection from "./sections/SubscribersSection";
import SalesBillingSection from "./sections/SalesBillingSection";
import HistorySection from "./sections/HistorySection";
import { createSalesPreview } from "./salesPreviewTransport";

type DashboardTab = "overview" | "subscribers" | "billing" | "history";
type ExportKind = "subscribers" | "history" | "recorded" | "monthly";

export default function AdminDashboard({ preview = false, adminUserId = "", adminEmail = "" }: { preview?: boolean; adminUserId?: string; adminEmail?: string }) {
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [simulation] = useState(() => process.env.NODE_ENV === "development" && preview ? createSalesPreview() : null);
  const [filters, setFilters] = useState<ReportingFilters>({ ...EMPTY_FILTERS });
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<ReportingResult | null>(null);
  const [directory, setDirectory] = useState<ReportingResult | null>(null);
  const [monthly, setMonthly] = useState<ReportingResult | null>(null);
  const [transactions, setTransactions] = useState<ReportingResult | null>(null);
  const [selected, setSelected] = useState<SubscriberRow | null>(null);
  const [managementUser, setManagementUser] = useState<AdminUserItem | null>(null);
  const [lookup, setLookup] = useState(false);
  const [transactionPage, setTransactionPage] = useState(1);
  const [range, setRange] = useState({ from: "", to: "" });
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<string[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const exportingRef = useRef(false);
  const freshOnce = useRef(false);
  const loads = useRef(new Map<string, AbortController>());

  const request = useCallback(async (mode: ReportingMode, next: ReportingFilters, signal?: AbortSignal): Promise<ReportingResult> => {
    const fresh = freshOnce.current;
    freshOnce.current = false;
    if (simulation) return simulation.read(mode, next);
    const params = reportingParams(next);
    if (fresh) params.set("fresh", "1");
    const path = mode === "transactions" ? "/api/admin/history" : "/api/admin/sales";
    if (mode !== "transactions") params.set("mode", mode);
    const response = await fetch(`${path}?${params}`, { signal, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Report unavailable.");
    return data;
  }, [simulation]);

  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.q === search.trim() ? previous : ({ ...previous, q: search.trim(), page: 1 })), SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback((key: string, mode: ReportingMode, next: ReportingFilters, accept: (value: ReportingResult) => void) => {
    const controller = new AbortController();
    loads.current.set(key, controller);
    setBusy(previous => [...new Set([...previous, key])]);
    request(mode, next, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      accept(value);
      setError("");
      setLastRefreshed(new Date().toISOString());
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Report unavailable.");
    }).finally(() => {
      if (loads.current.get(key) === controller) {
        loads.current.delete(key);
        setBusy(previous => previous.filter(value => value !== key));
      }
    });
    return () => {
      controller.abort();
      if (loads.current.get(key) === controller) {
        loads.current.delete(key);
        setBusy(previous => previous.filter(value => value !== key));
      }
    };
  }, [request]);

  useEffect(() => {
    if (tab !== "overview") return;
    return load("summary", "summary", { ...EMPTY_FILTERS, days: filters.days }, setSummary);
  }, [tab, filters.days, revision, load]);
  useEffect(() => {
    if (tab !== "subscribers" || (filters.q.length > 0 && filters.q.length < 2)) return;
    setDirectory(null);
    return load("directory", "subscribers", filters, value => {
      setDirectory(value);
      setSelected(previous => previous ? value.subscribers?.find(row => row.id === previous.id) ?? previous : null);
    });
  }, [tab, filters, revision, load]);
  useEffect(() => {
    if (tab !== "billing" || Boolean(range.from) !== Boolean(range.to)) return;
    setMonthly(null);
    return load("monthly", "monthly", { ...EMPTY_FILTERS, ...range }, setMonthly);
  }, [tab, range, revision, load]);
  useEffect(() => {
    if (tab !== "history" || Boolean(range.from) !== Boolean(range.to)) return;
    setTransactions(null);
    return load("transactions", "transactions", { ...EMPTY_FILTERS, ...range, event: filters.event, page: transactionPage }, setTransactions);
  }, [tab, range, transactionPage, filters.event, revision, load]);

  const filter = (key: keyof ReportingFilters, value: string | number) => {
    setFilters(previous => ({ ...previous, [key]: value, ...(key === "page" ? {} : { page: 1 }) }));
    if (key !== "page") setSelected(null);
    setError("");
  };

  async function download(kind: ExportKind) {
    if (exportingRef.current) return;
    exportingRef.current = true; setExporting(true); setExportMessage("");
    try {
      const next = kind === "subscribers" ? filters : kind === "history" ? { ...EMPTY_FILTERS, userId: selected?.id ?? "" } : { ...EMPTY_FILTERS, ...range };
      let blob: Blob;
      let truncated = false;
      if (process.env.NODE_ENV === "development" && simulation) {
        const { syntheticExport } = await import("./salesPreviewData");
        const result = syntheticExport(kind, next, simulation.snapshot());
        blob = new Blob([csvText(result.headers, result.rows)], { type: "text/csv;charset=utf-8" });
        truncated = result.truncated;
      } else {
        const params = reportingParams(next); params.set("kind", kind);
        const response = await fetch(`/api/admin/export?${params}`, { cache: "no-store", signal: AbortSignal.timeout(35000) });
        if (!response.ok) throw new Error("Export unavailable. No file saved.");
        truncated = response.headers.get("X-Export-Truncated") === "true";
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `revit-${preview ? "synthetic-" : ""}${kind}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage(truncated ? `Export capped at ${EXPORT_LIMIT} rows. Narrow filters for remaining records.` : "CSV downloaded. No server file saved.");
    } catch (reason) { setExportMessage(reason instanceof Error ? reason.message : "Export unavailable."); }
    finally { exportingRef.current = false; setExporting(false); }
  }

  const managementRequest = useCallback<typeof globalThis.fetch>(async (input, init) => {
    const response = await (simulation?.request ?? globalThis.fetch)(input, init);
    if (String(input) === "/api/admin/subscription" && init?.method === "POST" && response.ok) setRevision(value => value + 1);
    return response;
  }, [simulation]);

  const selectSubscriber = (row: SubscriberRow) => {
    setLookup(false);
    setSelected(row);
    setManagementUser({ ...row, plan: row.plan === "pro" ? "pro" : "free", email: "", firstName: row.username, proNote: null, createdAt: row.proStartedAt ?? "", isEffectivePro: row.status === "active" });
  };
  const toggleLookup = () => { setLookup(value => !value); setSelected(null); setManagementUser(null); };

  // Reuse the existing management panel for a recorded event. Only the explicit click triggers the
  // existing details lookup; nothing is prefetched and no subscription data is written.
  const openHistorySubscriber = (row: HistoryRow) => {
    setLookup(false);
    setSelected({
      id: row.userId, username: row.username ?? null, plan: "", proStartedAt: null,
      proExpiresAt: null, recordedExpiresAt: row.newExpiresAt, status: "",
      planMonths: row.planMonths, amountPhp: row.amountPhp, billingStatus: row.billingStatus,
      source: row.source, consistency: null,
    });
    setManagementUser({
      id: row.userId, email: "", username: row.username ?? null, firstName: row.username ?? null,
      plan: "free", proStartedAt: null, proExpiresAt: null, proNote: null, createdAt: "",
      isEffectivePro: false,
    });
    setTab("subscribers");
  };

  const tabs = [["overview", "Overview"], ["subscribers", "Subscribers"], ["billing", "Sales & Billing"], ["history", "History"]] as const;
  const navigate = (value: DashboardTab) => { setError(""); setTab(value); };
  // Manual refresh forces the active section to read live data (bypasses the 10-minute summary
  // cache for one call); it never polls and never touches other sections.
  const refresh = () => { freshOnce.current = true; setError(""); setRevision(value => value + 1); };

  return (
    <main className={styles.root}>
      <header className={styles.dashboardHeader}>
        <div>
          <p className={styles.eyebrow}>RevIT administration</p>
          <h1>Subscriptions &amp; Sales</h1>
          <p className={styles.muted}>Monitor access, manage subscriptions and review recorded billing.</p>
        </div>
        <span className={styles.hint}>{preview ? "Local simulation" : adminEmail}</span>
      </header>
      {preview && <p className={styles.preview}>Synthetic preview only. Grant, revoke, customization and notes are simulations in disposable memory. Reload resets changes. No real admin API access.</p>}
      <nav className={styles.navigation} aria-label="Admin dashboard sections">
        {tabs.map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => navigate(value)}>{label}</button>)}
      </nav>
      <div className={styles.toolbar}>
        <p className={styles.muted}>Only the selected section loads data. Summary updates are cached for 10 minutes. Last refreshed: {manilaStamp(lastRefreshed)}.</p>
        <button type="button" disabled={busy.length > 0} onClick={refresh}>Refresh current section</button>
      </div>
      {error && <p role="alert" className={styles.notice}>{error}</p>}
      {tab === "overview" && (
        <OverviewSection
          stats={summary?.summary ?? null}
          days={filters.days}
          onDaysChange={value => filter("days", value)}
          loading={busy.includes("summary")}
          lastRefreshed={lastRefreshed}
          onOpenBilling={() => navigate("billing")}
          onOpenReview={() => { setSearch(""); setFilters({ ...EMPTY_FILTERS, status: "review" }); navigate("subscribers"); }}
        />
      )}
      {tab === "subscribers" && (
        <SubscribersSection
          adminUserId={adminUserId}
          adminEmail={adminEmail}
          preview={preview}
          filters={filters}
          search={search}
          onSearch={setSearch}
          onFilter={filter}
          directory={directory}
          selected={selected}
          busy={busy}
          exporting={exporting}
          lookup={lookup}
          onToggleLookup={toggleLookup}
          onSelect={selectSubscriber}
          onCloseSelected={() => { setSelected(null); setManagementUser(null); }}
          onDownload={download}
          managementUser={managementUser}
          managementRequest={managementRequest}
        />
      )}
      {tab === "billing" && (
        <SalesBillingSection
          monthly={monthly}
          busy={busy}
          range={range}
          onRangeChange={next => { setRange(next); setTransactionPage(1); }}
          exporting={exporting}
          onDownload={download}
        />
      )}
      {tab === "history" && (
        <HistorySection
          transactions={transactions}
          busy={busy}
          range={range}
          onRangeChange={next => { setRange(next); setTransactionPage(1); }}
          filters={filters}
          onFilter={filter}
          page={transactionPage}
          onPage={setTransactionPage}
          exporting={exporting}
          onDownload={download}
          onOpenSubscriber={openHistorySubscriber}
        />
      )}
      {exportMessage && <p role="status" className={styles.notice}>{exportMessage}</p>}
    </main>
  );
}
