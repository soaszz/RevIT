"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Notification3 from "./Notification3";
import { SITE_UPDATES, type SiteUpdate, type UpdateType } from "../data/siteUpdates";

const STORAGE_KEY = "revit-read-updates-v1";
const POPUP_DISMISSED_KEY = "revit-updates-popup-dismissed-v1";

export interface SiteUpdatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  readIds: Set<string>;
  onMarkAllRead: () => void;
  onToggleRead: (id: string) => void;
}

export default function SiteUpdatesModal({
  isOpen,
  onClose,
  readIds,
  onMarkAllRead,
  onToggleRead,
}: SiteUpdatesModalProps) {
  const [filter, setFilter] = useState<"all" | UpdateType>("all");

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const majorCount = useMemo(() => SITE_UPDATES.filter((u) => u.type === "major").length, []);
  const minorCount = useMemo(() => SITE_UPDATES.filter((u) => u.type === "minor").length, []);

  const filteredUpdates = useMemo(() => {
    if (filter === "all") return SITE_UPDATES;
    return SITE_UPDATES.filter((u) => u.type === filter);
  }, [filter]);

  const unreadCount = useMemo(() => {
    return SITE_UPDATES.filter((u) => !readIds.has(u.id)).length;
  }, [readIds]);

  if (!isOpen) return null;

  return (
    <div
      className="updates-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-updates-title"
    >
      <div className="updates-card">
        {/* Header */}
        <header className="updates-header">
          <div className="updates-header-main">
            <div className="updates-header-icon-wrap" aria-hidden="true">
              <Notification3 size={24} />
            </div>
            <div>
              <div className="updates-title-row">
                <h2 id="site-updates-title">What&apos;s New in RevIT</h2>
                {unreadCount > 0 && (
                  <span className="updates-unread-pill">
                    {unreadCount} new update{unreadCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="updates-subtitle">
                Track major releases, reviewer additions, and minor system improvements.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="updates-close-btn"
            onClick={onClose}
            aria-label="Close updates dialog"
          >
            &times;
          </button>
        </header>

        {/* Filter Bar & Quick Actions */}
        <div className="updates-toolbar">
          <div className="updates-filter-tabs" role="tablist" aria-label="Filter updates by release type">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={`updates-tab-btn ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All Updates
              <span className="tab-count">{SITE_UPDATES.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "major"}
              className={`updates-tab-btn major ${filter === "major" ? "active" : ""}`}
              onClick={() => setFilter("major")}
            >
              Major Releases
              <span className="tab-count">{majorCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "minor"}
              className={`updates-tab-btn minor ${filter === "minor" ? "active" : ""}`}
              onClick={() => setFilter("minor")}
            >
              Minor Improvements
              <span className="tab-count">{minorCount}</span>
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              className="updates-mark-read-btn"
              onClick={onMarkAllRead}
              title="Mark all notifications as read"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mark all as read
            </button>
          )}
        </div>

        {/* Updates Timeline List */}
        <div className="updates-list">
          {filteredUpdates.map((update) => {
            const isUnread = !readIds.has(update.id);
            return (
              <article
                key={update.id}
                className={`update-item ${update.type} ${isUnread ? "is-unread" : ""}`}
                onClick={() => onToggleRead(update.id)}
              >
                <div className="update-meta-row">
                  <div className="update-type-cluster">
                    <span className={`update-badge ${update.type}`}>
                      {update.type === "major" ? "★ Major Release" : "• Minor Update"}
                    </span>
                    <span className="update-version">{update.version}</span>
                  </div>
                  <div className="update-meta-right">
                    <time className="update-date">{update.date}</time>
                    {isUnread ? (
                      <span className="update-dot" title="Unread update" />
                    ) : (
                      <span className="update-read-status" title="Marked as read">Read</span>
                    )}
                  </div>
                </div>

                <h3 className="update-item-title">{update.title}</h3>
                <p className="update-item-summary">{update.summary}</p>

                {update.highlights && update.highlights.length > 0 && (
                  <ul className="update-highlights">
                    {update.highlights.map((highlight, index) => (
                      <li key={index}>
                        <span className="highlight-bullet" aria-hidden="true">›</span>
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {update.tags && update.tags.length > 0 && (
                  <div className="update-tags">
                    {update.tags.map((tag) => (
                      <span key={tag} className="update-tag-pill">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* Footer */}
        <footer className="updates-footer">
          <div className="updates-footer-copy">
            <span>RevIT Platform v1.4.0</span>
            <span className="footer-dot">•</span>
            <span>Continuously updated for Philippine MTAP &amp; Board review</span>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Hook to manage notification read status and unread count
 */
export function useSiteNotifications() {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setReadIds(new Set(parsed));
        }
      } else {
        // First-time visitor: mark older updates as read, leaving latest 3 unread for discovery
        const defaultRead = SITE_UPDATES.slice(3).map((u) => u.id);
        setReadIds(new Set(defaultRead));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultRead));
      }
    } catch {
      // Fallback
    } finally {
      setHasLoaded(true);
    }
  }, []);

  const unreadCount = useMemo(() => {
    if (!hasLoaded) return 3; // sensible preview count
    return SITE_UPDATES.filter((u) => !readIds.has(u.id)).length;
  }, [readIds, hasLoaded]);

  const markAllRead = () => {
    const allIds = SITE_UPDATES.map((u) => u.id);
    setReadIds(new Set(allIds));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allIds));
    } catch {}
  };

  const toggleRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Auto-popup: show modal once per login when there are updates newer than last dismissed
  const latestUpdateId = SITE_UPDATES[0]?.id ?? "";
  const hasNewForPopup = useMemo(() => {
    if (!hasLoaded || !latestUpdateId) return false;
    try {
      const dismissed = localStorage.getItem(POPUP_DISMISSED_KEY);
      return dismissed !== latestUpdateId;
    } catch {
      return false;
    }
  }, [hasLoaded, latestUpdateId]);

  const dismissPopup = useCallback(() => {
    try {
      localStorage.setItem(POPUP_DISMISSED_KEY, latestUpdateId);
    } catch {}
  }, [latestUpdateId]);

  return {
    readIds,
    unreadCount,
    markAllRead,
    toggleRead,
    hasNewForPopup,
    dismissPopup,
  };
}
