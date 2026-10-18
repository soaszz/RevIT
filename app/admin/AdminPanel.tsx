"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import ProActivationModal, { type ActivationSource } from "../components/ProActivationModal";
import styles from "./AdminPanel.module.css";

export type AdminUserItem = {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  plan: "free" | "pro";
  proStartedAt: string | null;
  proExpiresAt: string | null;
  proNote: string | null;
  createdAt: string;
  isEffectivePro: boolean;
};

export type HistoryItem = {
  id: string;
  userId: string;
  eventType: string;
  source: string;
  previousPlan: string;
  newPlan: string;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
  adminId: string | null;
  customMessage: string | null;
  createdAt: string;
};

export default function AdminPanel({
  adminUserId,
  adminEmail,
}: {
  adminUserId: string;
  adminEmail: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<AdminUserItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userHistory, setUserHistory] = useState<HistoryItem[]>([]);
  const [summaryNote, setSummaryNote] = useState("");

  // Subscription action state
  const [actionType, setActionType] = useState<"activate" | "extend" | "modify_expiration" | "revoke">("activate");
  const [durationPreset, setDurationPreset] = useState<"1m" | "2m" | "3m" | "custom">("1m");
  const [customDays, setCustomDays] = useState(30);
  const [customDate, setCustomDate] = useState("");
  const [activationSource, setActivationSource] = useState<ActivationSource>("purchased");
  const [customRecipientMessage, setCustomRecipientMessage] = useState("");

  // Modals state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [activeProWarningModalOpen, setActiveProWarningModalOpen] = useState(false);
  const [shortenConfirmed, setShortenConfirmed] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Admin note state
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteStatus, setNoteStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search handler
  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (searchLoading) return;

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError("Please enter an email, name, or user ID to search.");
      setHasSearched(false);
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    setHasSearched(true);

    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`);

      let data: any = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        const text = await res.text().catch(() => "");
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = null;
          }
        }
      }

      if (!res.ok) {
        const errorMsg =
          data?.error ||
          (res.status === 401
            ? "Authentication required. Please sign in."
            : res.status === 403
            ? "Access denied. Administrator privileges required."
            : `Search failed with status ${res.status}.`);
        throw new Error(errorMsg);
      }

      if (!data || typeof data !== "object") {
        throw new Error("Invalid response received from server.");
      }

      setSearchResults(Array.isArray(data.users) ? data.users : []);
    } catch (err: any) {
      setSearchError(err.message || "Could not complete search.");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  // Select user handler
  async function handleSelectUser(u: AdminUserItem) {
    setUserLoading(true);
    setSelectedUser(u);
    setActionMessage(null);
    setNoteStatus(null);
    setNoteContent(u.proNote || "");

    if (u.isEffectivePro) {
      setActionType("extend");
    } else {
      setActionType("activate");
    }

    try {
      const res = await fetch(`/api/admin/user?userId=${encodeURIComponent(u.id)}`);
      let data: any = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (res.ok && data?.user) {
        setSelectedUser(data.user);
        setUserHistory(Array.isArray(data.history) ? data.history : []);
        setSummaryNote(data.summaryNote || "");
        setNoteContent(data.user.proNote || "");
      }
    } catch {
      // Non-blocking fallback to current item
    } finally {
      setUserLoading(false);
    }
  }

  // Helper to add exact calendar months (e.g. Oct 9 -> Nov 9)
  function addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const targetMonth = result.getMonth() + months;
    result.setMonth(targetMonth);
    // Handle month rollover clipping (e.g. Aug 31 -> Sep 30, Jan 31 -> Feb 28)
    if (result.getMonth() !== ((targetMonth % 12) + 12) % 12) {
      result.setDate(0);
    }
    return result;
  }

  // Calculate extension target (adds duration to current expiration if future, else from now)
  function calculateExtension(): { date: Date; dateStr: string; days: number } {
    const now = new Date();
    let base = now;
    if (selectedUser?.isEffectivePro && selectedUser.proExpiresAt) {
      const existing = new Date(selectedUser.proExpiresAt);
      if (existing > now) base = existing;
    }

    if (durationPreset === "custom") {
      if (customDate) {
        const target = new Date(customDate);
        if (customDate.length === 10) target.setHours(23, 59, 59, 999);
        const diffMs = target.getTime() - now.getTime();
        return {
          date: target,
          dateStr: target.toISOString(),
          days: Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24))),
        };
      }
      const targetDate = new Date(base.getTime() + Math.max(1, customDays) * 24 * 60 * 60 * 1000);
      return {
        date: targetDate,
        dateStr: targetDate.toISOString(),
        days: Math.max(1, customDays),
      };
    }

    const monthsToAdd = durationPreset === "1m" ? 1 : durationPreset === "2m" ? 2 : 3;
    const targetDate = addMonths(base, monthsToAdd);
    const diffMs = targetDate.getTime() - now.getTime();
    return {
      date: targetDate,
      dateStr: targetDate.toISOString(),
      days: Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24))),
    };
  }

  // Calculate replacement target (starts fresh from current moment)
  function calculateReplacement(): { date: Date; dateStr: string; days: number } {
    const now = new Date();
    if (durationPreset === "custom") {
      if (customDate) {
        const target = new Date(customDate);
        if (customDate.length === 10) target.setHours(23, 59, 59, 999);
        const diffMs = target.getTime() - now.getTime();
        return {
          date: target,
          dateStr: target.toISOString(),
          days: Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24))),
        };
      }
      const targetDate = new Date(now.getTime() + Math.max(1, customDays) * 24 * 60 * 60 * 1000);
      return {
        date: targetDate,
        dateStr: targetDate.toISOString(),
        days: Math.max(1, customDays),
      };
    }

    const monthsToAdd = durationPreset === "1m" ? 1 : durationPreset === "2m" ? 2 : 3;
    const targetDate = addMonths(now, monthsToAdd);
    const diffMs = targetDate.getTime() - now.getTime();
    return {
      date: targetDate,
      dateStr: targetDate.toISOString(),
      days: Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24))),
    };
  }

  // Calculate target expiration date according to current action
  function getCalculatedExpiration(): { date: Date; dateStr: string; days: number } {
    if (actionType === "extend") {
      return calculateExtension();
    }
    return calculateReplacement();
  }

  // Handle Apply Subscription button click with proactive checks
  function handleApplyClick() {
    if (!selectedUser || actionPending) return;
    setActionMessage(null);

    const calc = getCalculatedExpiration();
    const isInvalid = actionType !== "revoke" && (isNaN(calc.date.getTime()) || calc.date.getTime() <= Date.now());
    if (isInvalid) {
      setActionMessage({ type: "error", text: "Please enter a valid expiration date in the future." });
      return;
    }

    const isNoOp = Boolean(
      (actionType === "revoke" && selectedUser.plan === "free" && !selectedUser.isEffectivePro) ||
      (actionType === "modify_expiration" &&
        selectedUser.proExpiresAt &&
        Math.abs(calc.date.getTime() - new Date(selectedUser.proExpiresAt).getTime()) < 60_000)
    );
    if (isNoOp) {
      setActionMessage({ type: "error", text: "No changes detected. The user already has this subscription status." });
      return;
    }

    // Intercept when granting Pro to already active Pro user
    if (actionType === "activate" && selectedUser.isEffectivePro) {
      setActiveProWarningModalOpen(true);
      return;
    }

    setShortenConfirmed(false);
    setConfirmModalOpen(true);
  }

  // Confirm and execute subscription change
  async function handleConfirmSubscriptionChange() {
    if (!selectedUser || actionPending) return;
    setActionPending(true);
    setActionMessage(null);

    const calc = getCalculatedExpiration();
    const isShorteningAccess = Boolean(
      selectedUser.isEffectivePro &&
      selectedUser.proExpiresAt &&
      actionType === "modify_expiration" &&
      calc.date.getTime() < new Date(selectedUser.proExpiresAt).getTime() - 60_000
    );

    if (isShorteningAccess && !shortenConfirmed) {
      setActionMessage({ type: "error", text: "Please acknowledge that the user will lose remaining Pro access." });
      setActionPending(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          action: actionType,
          source: activationSource,
          durationDays: calc.days,
          customExpiresAt: actionType === "revoke" ? null : calc.dateStr,
          customMessage: customRecipientMessage.trim() || null,
          expectedExpiresAt: selectedUser.proExpiresAt,
          allowShorten: Boolean(isShorteningAccess && shortenConfirmed),
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      let data: any = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (!res.ok || !data || data.error) {
        if (data?.code === "CONFLICT_ACTIVE_PRO" || data?.code === "CONFLICT_STALE_STATE") {
          await handleSelectUser(selectedUser);
        }
        throw new Error(data?.error || `Subscription update failed (${res.status}).`);
      }

      setActionMessage({
        type: "success",
        text: data?.deduplicated
          ? "Subscription change was already completed (deduplicated)."
          : actionType === "revoke"
          ? "RevIT Pro access has been revoked."
          : actionType === "extend"
          ? "RevIT Pro subscription successfully extended."
          : actionType === "modify_expiration"
          ? "Expiration date successfully updated."
          : "RevIT Pro subscription successfully activated.",
      });

      setConfirmModalOpen(false);
      setActiveProWarningModalOpen(false);

      await handleSelectUser(selectedUser);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to update subscription." });
    } finally {
      setActionPending(false);
    }
  }

  // Save admin note
  async function handleSaveNote() {
    if (!selectedUser || noteSaving) return;
    setNoteSaving(true);
    setNoteStatus(null);

    try {
      const res = await fetch("/api/admin/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          note: noteContent,
        }),
      });

      let data: any = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (!res.ok || !data || data.error) {
        throw new Error(data?.error || `Failed to save note (${res.status}).`);
      }

      setNoteStatus({ type: "success", text: "Admin note saved." });
      setSelectedUser((prev) => (prev ? { ...prev, proNote: noteContent } : null));
    } catch (err: any) {
      setNoteStatus({ type: "error", text: err.message || "Failed to save note." });
    } finally {
      setNoteSaving(false);
    }
  }

  const calculated = getCalculatedExpiration();
  const extendCalculated = calculateExtension();
  const replaceCalculated = calculateReplacement();

  const isActivePro = Boolean(selectedUser && selectedUser.isEffectivePro);
  const isRenewal = Boolean(selectedUser && !selectedUser.isEffectivePro && selectedUser.proExpiresAt);
  const isShortening = Boolean(
    selectedUser?.isEffectivePro &&
      selectedUser.proExpiresAt &&
      actionType === "modify_expiration" &&
      calculated.date.getTime() < new Date(selectedUser.proExpiresAt).getTime() - 60_000
  );
  const isInvalidDate = Boolean(
    actionType !== "revoke" &&
      (isNaN(calculated.date.getTime()) || calculated.date.getTime() <= Date.now())
  );
  const isNoChange = Boolean(
    (actionType === "revoke" && selectedUser?.plan === "free" && !selectedUser?.isEffectivePro) ||
      (actionType === "modify_expiration" &&
        selectedUser?.proExpiresAt &&
        Math.abs(calculated.date.getTime() - new Date(selectedUser.proExpiresAt).getTime()) < 60_000)
  );
  const isNoteUnchanged = Boolean(!selectedUser || noteContent === (selectedUser.proNote || ""));

  const periodStats = (() => {
    if (!selectedUser) {
      return { totalPeriods: 0, breakdownText: "" };
    }
    if (!userHistory || userHistory.length === 0) {
      return {
        totalPeriods: selectedUser.isEffectivePro ? 1 : 0,
        breakdownText: selectedUser.isEffectivePro ? "Current active period" : "",
      };
    }

    const activations = userHistory.filter(
      (h) => h.eventType === "activated" || h.eventType === "renewed" || h.eventType === "extended"
    );
    const purchased = activations.filter((h) => h.source === "purchased").length;
    const gifted = activations.filter((h) => h.source === "gift").length;
    const prize = activations.filter((h) => h.source === "prize").length;

    const parts: string[] = [];
    if (purchased > 0) parts.push(`${purchased} purchased`);
    if (gifted > 0) parts.push(`${gifted} gifted`);
    if (prize > 0) parts.push(`${prize} won as prize`);

    return {
      totalPeriods: activations.length,
      breakdownText: parts.join(" · "),
    };
  })();

  const expirationDisplay = (() => {
    if (!selectedUser) {
      return { label: "Pro access", value: "—", status: "" };
    }

    if (!selectedUser.proExpiresAt) {
      return {
        label: "Pro access",
        value: "None",
        status: "Never activated",
      };
    }

    const expDate = new Date(selectedUser.proExpiresAt);
    const formatted = expDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    if (selectedUser.isEffectivePro) {
      return {
        label: "Pro access expires",
        value: formatted,
        status: "Active",
      };
    }

    return {
      label: "Last Pro access",
      value: formatted,
      status: "Expired",
    };
  })();

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Image
            src="/revit-frog.png"
            alt="RevIT"
            width={34}
            height={34}
            className={styles.headerLogo}
            unoptimized
          />
          <div className={styles.headerTitles}>
            <h1 className={styles.headerTitle}>RevIT Admin Control</h1>
            <span className={styles.adminIndicator}>
              Admin: {adminEmail || adminUserId.slice(0, 8)}
            </span>
          </div>
        </div>

        <div className={styles.headerRight}>
          <Link href="/overview" className={styles.backLink}>
            Back to RevIT
          </Link>
        </div>
      </header>

      {/* Main Workspace */}
      <main className={styles.workspace}>
        {/* Left Column: User Search */}
        <section className={styles.searchSection}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Find User</h2>
            <span className={styles.cardSubtitle}>Search by email, name, or UUID</span>
          </div>

          <form onSubmit={handleSearch} className={styles.searchForm}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. learner@example.com or username"
              className={styles.searchInput}
              autoComplete="off"
              disabled={searchLoading}
            />
            <button
              type="submit"
              className={styles.searchBtn}
              disabled={searchLoading || !searchQuery.trim()}
            >
              {searchLoading ? "Searching..." : "Search"}
            </button>
          </form>

          {searchError && (
            <div className={styles.errorBanner}>{searchError}</div>
          )}

          {/* Results List */}
          <div className={styles.resultsList}>
            {hasSearched && searchResults.length === 0 && !searchLoading && !searchError && (
              <div className={styles.emptyState}>No users matched your query.</div>
            )}

            {searchResults.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              return (
                <div
                  key={u.id}
                  className={`${styles.resultCard} ${isSelected ? styles.resultSelected : ""}`}
                >
                  <div className={styles.resultInfo}>
                    <span className={styles.resultName}>
                      {u.firstName || u.username || "Unnamed Learner"}
                    </span>
                    <span className={styles.resultEmail}>{u.email || "No email"}</span>
                    <div className={styles.resultMeta}>
                      <span className={u.isEffectivePro ? styles.statusPro : styles.statusFree}>
                        {u.isEffectivePro ? "Active Pro" : "Free Plan"}
                      </span>
                      {u.proExpiresAt && (
                        <span className={styles.expirySnippet}>
                          Exp: {new Date(u.proExpiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.manageBtn}
                    onClick={() => handleSelectUser(u)}
                  >
                    {isSelected ? "Selected" : "Manage"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column: Selected User Management Workspace */}
        <section className={styles.detailsSection}>
          {!selectedUser ? (
            <div className={styles.placeholderState}>
              <p>Select a user from search results to manage subscription and view history.</p>
            </div>
          ) : (
            <div className={styles.userWorkspace}>
              {/* User Overview Card */}
              <div className={styles.sectionCard}>
                <div className={styles.userOverviewHeader}>
                  <div className={styles.userHeadRow}>
                    <div className={styles.userInfoCol}>
                      <h2 className={styles.cardTitle}>
                        {selectedUser.firstName || selectedUser.username || "Learner Details"}
                      </h2>
                      <span className={styles.cardSubtitle}>{selectedUser.email}</span>
                    </div>
                    <span className={selectedUser.isEffectivePro ? styles.statusPro : styles.statusFree}>
                      {selectedUser.isEffectivePro ? "RevIT Pro" : "Free Plan"}
                    </span>
                  </div>
                </div>

                {userLoading && <div className={styles.loadingSnippet}>Refreshing details...</div>}

                {/* Structured Subscription Summary */}
                <div className={styles.summarySection}>
                  <div className={styles.summarySectionHeader}>
                    <svg
                      className={styles.summaryHeaderIcon}
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M12 7v5l4 2" />
                    </svg>
                    <span className={styles.summarySectionTitle}>Subscription Summary</span>
                  </div>

                  <div className={styles.metricsGrid}>
                    <div className={styles.metricCard}>
                      <span className={styles.metricLabel}>
                        {selectedUser.isEffectivePro ? "Total Pro periods" : "Previous Pro periods"}
                      </span>
                      <div className={styles.metricValue}>{periodStats.totalPeriods}</div>
                      {periodStats.breakdownText && (
                        <div className={styles.metricSubtext}>{periodStats.breakdownText}</div>
                      )}
                    </div>

                    <div className={styles.metricCard}>
                      <span className={styles.metricLabel}>{expirationDisplay.label}</span>
                      <div className={styles.metricValueDate}>{expirationDisplay.value}</div>
                      {expirationDisplay.status && (
                        <div
                          className={
                            expirationDisplay.status === "Active"
                              ? styles.metricActiveStatus
                              : styles.metricExpiredStatus
                          }
                        >
                          {expirationDisplay.status}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.historySummarySection}>
                    <span className={styles.historySectionLabel}>Access History</span>
                    <div className={styles.historySummaryRow}>
                      <svg
                        className={styles.infoIcon}
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <span className={styles.historySummaryText}>
                        {summaryNote ||
                          (selectedUser.isEffectivePro
                            ? "Currently active on RevIT Pro."
                            : "Currently on the Free plan.")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription Controls Card */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Manage Subscription</h3>
                  <span className={styles.cardSubtitle}>Upgrade, extend, modify, or revoke</span>
                </div>

                {actionMessage && (
                  <div className={actionMessage.type === "success" ? styles.successBanner : styles.errorBanner}>
                    {actionMessage.text}
                  </div>
                )}

                {/* Contextual Warning and Conflict Banners */}
                {isActivePro && actionType === "activate" && (
                  <div className={styles.warningBanner}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>
                      User already has an active Pro subscription expiring on{" "}
                      <strong>
                        {selectedUser?.proExpiresAt
                          ? new Date(selectedUser.proExpiresAt).toLocaleDateString("en-US", { dateStyle: "long" })
                          : "an active date"}
                      </strong>
                      . Clicking Apply will prompt you to <strong>Extend</strong> or <strong>Replace</strong> expiration to prevent duplicate entries.
                    </span>
                  </div>
                )}

                {isShortening && (
                  <div className={styles.warningBanner}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>
                      Caution: Selected expiration date is earlier than user&apos;s current expiration (
                      {selectedUser?.proExpiresAt
                        ? new Date(selectedUser.proExpiresAt).toLocaleDateString("en-US", { dateStyle: "long" })
                        : ""}
                      ). This will shorten remaining Pro time.
                    </span>
                  </div>
                )}

                {!isActivePro && isRenewal && actionType === "activate" && (
                  <div className={styles.infoBanner}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>
                      User previously had Pro (expired{" "}
                      {selectedUser?.proExpiresAt
                        ? new Date(selectedUser.proExpiresAt).toLocaleDateString("en-US", { dateStyle: "long" })
                        : "previously"}
                      ). Activating now will start a fresh renewal period from today.
                    </span>
                  </div>
                )}

                {isNoChange && (
                  <div className={styles.infoBanner}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>No changes detected. The user already holds this subscription status.</span>
                  </div>
                )}

                {isInvalidDate && (
                  <div className={styles.errorBanner}>
                    Selected expiration date is invalid or in the past. Please select a valid future date.
                  </div>
                )}

                <div className={styles.controlGrid}>
                  {/* Action Selector */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Action</label>
                    <select
                      className={styles.selectInput}
                      value={actionType}
                      onChange={(e) => setActionType(e.target.value as any)}
                    >
                      <option value="activate">Activate Pro</option>
                      <option value="extend">Extend Current Pro</option>
                      <option value="modify_expiration">Change Expiration Date</option>
                      <option value="revoke">Revoke Pro (Return to Free)</option>
                    </select>
                  </div>

                  {actionType !== "revoke" && (
                    <>
                      {/* Source Selector */}
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Activation Source</label>
                        <select
                          className={styles.selectInput}
                          value={activationSource}
                          onChange={(e) => setActivationSource(e.target.value as ActivationSource)}
                        >
                          <option value="purchased">Purchased (Standard Payment)</option>
                          <option value="gift">Gift (Complimentary Access)</option>
                          <option value="prize">Prize (Giveaway / Contest Winner)</option>
                        </select>
                      </div>

                      {/* Duration Presets */}
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Duration</label>
                        <div className={styles.durationOptions}>
                          {([
                            { id: "1m", label: "1 Month" },
                            { id: "2m", label: "2 Months" },
                            { id: "3m", label: "3 Months" },
                            { id: "custom", label: "Custom" },
                          ] as const).map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              className={`${styles.presetBtn} ${durationPreset === d.id ? styles.presetActive : ""}`}
                              onClick={() => setDurationPreset(d.id)}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {durationPreset === "custom" && (
                        <div className={styles.fieldGroup}>
                          <label className={styles.fieldLabel}>Custom Expiration Date</label>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                          />
                        </div>
                      )}

                      {/* Optional Recipient Message */}
                      <div className={styles.fieldGroupFull}>
                        <label className={styles.fieldLabel}>
                          Personal Recipient Message (Optional)
                        </label>
                        <input
                          type="text"
                          className={styles.textInput}
                          placeholder="e.g. Thanks for being one of our early testers!"
                          value={customRecipientMessage}
                          onChange={(e) => setCustomRecipientMessage(e.target.value)}
                          maxLength={300}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Expiration Preview Calculation */}
                {actionType !== "revoke" && (
                  <div className={styles.calcPreviewRow}>
                    <span className={styles.calcLabel}>Calculated New Expiration:</span>
                    <strong className={styles.calcValue}>
                      {calculated.date.toLocaleDateString("en-US", { dateStyle: "long" })} ({calculated.days} days)
                    </strong>
                  </div>
                )}

                {/* Actions Row */}
                <div className={styles.actionsBar}>
                  {actionType !== "revoke" && (
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => setPreviewModalOpen(true)}
                    >
                      Preview User Modal
                    </button>
                  )}

                  <button
                    type="button"
                    className={actionType === "revoke" ? styles.dangerBtn : styles.primaryBtn}
                    onClick={handleApplyClick}
                    disabled={actionPending || isNoChange || isInvalidDate}
                  >
                    {actionPending
                      ? "Applying..."
                      : actionType === "revoke"
                      ? "Confirm Revoke Pro"
                      : "Apply Subscription"}
                  </button>
                </div>
              </div>

              {/* Private Admin Notes */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Private Admin Note</h3>
                  <span className={styles.cardSubtitle}>Internal only · Never shown to user</span>
                </div>

                {noteStatus && (
                  <div className={noteStatus.type === "success" ? styles.successBanner : styles.errorBanner}>
                    {noteStatus.text}
                  </div>
                )}

                <textarea
                  className={styles.noteTextarea}
                  rows={3}
                  placeholder="Private notes (e.g., GCash ref 123456, gifted for contest, support issue)..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  maxLength={2000}
                />

                <div className={styles.noteFooter}>
                  <span className={styles.charCount}>{noteContent.length} / 2000</span>
                  <button
                    type="button"
                    className={styles.saveNoteBtn}
                    onClick={handleSaveNote}
                    disabled={noteSaving || noteContent === (selectedUser.proNote || "")}
                  >
                    {noteSaving ? "Saving..." : "Save Note"}
                  </button>
                </div>
              </div>

              {/* Subscription History Card */}
              <div className={styles.sectionCard}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Subscription History</h3>
                  <span className={styles.cardSubtitle}>Append-only audit trail</span>
                </div>

                {userHistory.length === 0 ? (
                  <div className={styles.emptyHistory}>No recorded history events yet.</div>
                ) : (
                  <div className={styles.historyList}>
                    {userHistory.map((h) => (
                      <div key={h.id} className={styles.historyItem}>
                        <div className={styles.historyTopRow}>
                          <span className={styles.historyEvent}>{h.eventType}</span>
                          <span className={styles.historySource}>[{h.source}]</span>
                          <span className={styles.historyDate}>
                            {new Date(h.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className={styles.historyDetails}>
                          <span>
                            {h.previousPlan} &rarr; {h.newPlan}
                          </span>
                          {h.newExpiresAt && (
                            <span className={styles.historyExp}>
                              Exp: {new Date(h.newExpiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {h.customMessage && (
                          <div className={styles.historyMsg}>&ldquo;{h.customMessage}&rdquo;</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Active Pro Conflict Warning Dialog */}
      {activeProWarningModalOpen && selectedUser && (
        <div className={styles.modalBackdrop}>
          <div className={styles.warningCard}>
            <div className={styles.warningModalHeader}>
              <div className={styles.warningIconBadge}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className={styles.warningModalTitle}>User Already Has RevIT Pro</h3>
                <span className={styles.warningModalSubtitle}>Active subscription conflict detected</span>
              </div>
            </div>

            <p className={styles.warningExplainer}>
              <strong>{selectedUser.email || selectedUser.username}</strong> already holds an active RevIT Pro subscription expiring on{" "}
              <strong>
                {selectedUser.proExpiresAt
                  ? new Date(selectedUser.proExpiresAt).toLocaleDateString("en-US", { dateStyle: "long" })
                  : "an active date"}
              </strong>
              . Activating a new subscription from scratch would silently overwrite remaining time. Choose how you want to handle this:
            </p>

            <div className={styles.conflictOptionsList}>
              {/* Option 1: Extend */}
              <div className={styles.conflictOptionCard}>
                <div className={styles.conflictOptionHead}>
                  <span className={styles.conflictOptionTitle}>Extend subscription</span>
                  <span className={styles.recommendedBadge}>Recommended</span>
                </div>
                <p className={styles.conflictOptionDesc}>
                  Add the selected duration ({durationPreset === "custom" ? `${calculated.days} days` : durationPreset === "1m" ? "1 Month" : durationPreset === "2m" ? "2 Months" : "3 Months"}) to their current expiration date. Preserves all remaining active days.
                </p>
                <div className={styles.conflictDateRow}>
                  <span>Current: {selectedUser.proExpiresAt ? new Date(selectedUser.proExpiresAt).toLocaleDateString("en-US", { dateStyle: "short" }) : "—"}</span>
                  <span>&rarr;</span>
                  <strong>New: {extendCalculated.date.toLocaleDateString("en-US", { dateStyle: "short" })} ({extendCalculated.days} total days remaining)</strong>
                </div>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => {
                    setActionType("extend");
                    setActiveProWarningModalOpen(false);
                    setShortenConfirmed(false);
                    setConfirmModalOpen(true);
                  }}
                >
                  Extend Subscription
                </button>
              </div>

              {/* Option 2: Replace */}
              <div className={styles.conflictOptionCard}>
                <div className={styles.conflictOptionHead}>
                  <span className={styles.conflictOptionTitle}>Replace expiration</span>
                </div>
                <p className={styles.conflictOptionDesc}>
                  Explicitly set a new expiration date calculated from today, overriding their current end date.
                </p>
                <div className={styles.conflictDateRow}>
                  <span>Current: {selectedUser.proExpiresAt ? new Date(selectedUser.proExpiresAt).toLocaleDateString("en-US", { dateStyle: "short" }) : "—"}</span>
                  <span>&rarr;</span>
                  <strong>New: {replaceCalculated.date.toLocaleDateString("en-US", { dateStyle: "short" })} ({replaceCalculated.days} days from today)</strong>
                </div>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setActionType("modify_expiration");
                    setActiveProWarningModalOpen(false);
                    setShortenConfirmed(false);
                    setConfirmModalOpen(true);
                  }}
                >
                  Replace Expiration
                </button>
              </div>
            </div>

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setActiveProWarningModalOpen(false)}
              >
                Cancel — Make No Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && selectedUser && (
        <div className={styles.modalBackdrop}>
          <div className={styles.confirmCard}>
            <h3 className={styles.confirmTitle}>
              {actionType === "revoke"
                ? "Confirm Subscription Revocation"
                : actionType === "extend"
                ? "Confirm Subscription Extension"
                : actionType === "modify_expiration"
                ? "Confirm Expiration Date Change"
                : "Confirm Pro Activation"}
            </h3>

            {actionType === "revoke" && (
              <div className={styles.errorBanner} style={{ marginTop: "12px", marginBottom: "16px" }}>
                <strong>Destructive Action:</strong> Pro access will be revoked immediately and this user will return to the Free plan. A revocation audit record will be logged.
              </div>
            )}

            {isShortening && (
              <div className={styles.warningBanner} style={{ marginTop: "12px", marginBottom: "16px" }}>
                <div>
                  <strong>Notice:</strong> This new expiration date (
                  {calculated.date.toLocaleDateString("en-US", { dateStyle: "long" })}) is earlier than their current active expiration (
                  {selectedUser.proExpiresAt
                    ? new Date(selectedUser.proExpiresAt).toLocaleDateString("en-US", { dateStyle: "long" })
                    : ""}
                  ). The user will lose some remaining Pro access.
                </div>
                <label className={styles.checkboxRow} style={{ marginTop: "10px" }}>
                  <input
                    type="checkbox"
                    checked={shortenConfirmed}
                    onChange={(e) => setShortenConfirmed(e.target.checked)}
                  />
                  <span>I understand this will shorten the user&apos;s remaining Pro access and wish to proceed.</span>
                </label>
              </div>
            )}

            <div className={styles.confirmDetails}>
              <div><strong>User:</strong> {selectedUser.email || selectedUser.username}</div>
              <div><strong>Current Plan:</strong> {selectedUser.plan} ({selectedUser.isEffectivePro ? "Active Pro" : "Free"})</div>
              <div><strong>New Plan:</strong> {actionType === "revoke" ? "free" : "pro"}</div>
              <div><strong>Action Type:</strong> {actionType === "extend" ? "Extend Subscription" : actionType === "modify_expiration" ? "Set Custom Expiration" : actionType === "revoke" ? "Revoke Access" : "Activate Pro"}</div>
              {actionType !== "revoke" && (
                <>
                  <div><strong>Activation Source:</strong> {activationSource}</div>
                  <div><strong>Duration:</strong> {durationPreset === "custom" ? `${calculated.days} days` : durationPreset === "1m" ? "1 Month" : durationPreset === "2m" ? "2 Months" : "3 Months"} ({calculated.days} days)</div>
                  <div>
                    <strong>Expiration Change:</strong>{" "}
                    {selectedUser.proExpiresAt
                      ? `${new Date(selectedUser.proExpiresAt).toLocaleDateString("en-US", { dateStyle: "short" })} → `
                      : ""}
                    {calculated.date.toLocaleDateString("en-US", { dateStyle: "long" })}
                  </div>
                  {customRecipientMessage && <div><strong>Custom Message:</strong> {customRecipientMessage}</div>}
                </>
              )}
            </div>

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setConfirmModalOpen(false)}
                disabled={actionPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={actionType === "revoke" ? styles.dangerBtn : styles.primaryBtn}
                onClick={handleConfirmSubscriptionChange}
                disabled={actionPending || (isShortening && !shortenConfirmed)}
              >
                {actionPending
                  ? "Applying..."
                  : actionType === "revoke"
                  ? "Confirm Revoke Pro"
                  : actionType === "extend"
                  ? "Confirm Extension"
                  : "Confirm Subscription Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Activation Modal Preview */}
      {previewModalOpen && selectedUser && (
        <ProActivationModal
          isOpen={previewModalOpen}
          username={selectedUser.username || selectedUser.firstName || selectedUser.email.split("@")[0]}
          source={activationSource}
          durationDays={calculated.days}
          expiresAt={calculated.dateStr}
          customMessage={customRecipientMessage}
          isExtension={actionType === "extend"}
          onClose={() => setPreviewModalOpen(false)}
          isPreview={true}
        />
      )}
    </div>
  );
}
