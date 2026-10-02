"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";

export type View = "overview" | "library" | "progress" | "leaderboards" | "weakness" | "planner" | "grades" | "assistant";

type MobileNavDockProps = {
  activeView: View;
  onSelectView: (view: View) => void;
  gradesEnabled: boolean;
  onOpenFeedback: () => void;
  onOpenProfile: () => void;
  wrongCount?: number;
  unreadCount?: number;
};

const LEFT_TABS: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Home", icon: "/icons/neu/overview.png" },
  { id: "library", label: "Review", icon: "/icons/neu/review-library.png" },
];

const RIGHT_TABS: Array<{ id: View; label: string; icon: string }> = [
  { id: "progress", label: "Progress", icon: "/icons/neu/progress.png" },
  { id: "leaderboards", label: "Rankings", icon: "/icons/neu/leaderboards.png" },
];

export default function MobileNavDock({
  activeView,
  onSelectView,
  gradesEnabled,
  onOpenFeedback,
  onOpenProfile,
  wrongCount = 0,
  unreadCount = 0,
}: MobileNavDockProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const isMoreActive = ["weakness", "planner", "grades", "assistant"].includes(activeView);

  const moreItems: Array<{ id: View; label: string; icon: string; desc: string; badge?: string | number }> = [
    {
      id: "weakness",
      label: "Weakness Analytics",
      icon: "/icons/neu/weakness.png",
      desc: "Mistake bank & prioritized study",
      badge: wrongCount > 0 ? `${wrongCount} missed` : undefined,
    },
    {
      id: "planner",
      label: "Study Planner",
      icon: "/icons/neu/study-planner.png",
      desc: "Daily study targets & exam calendar",
    },
    ...(gradesEnabled
      ? [
          {
            id: "grades" as View,
            label: "Grades & Simulator",
            icon: "/icons/neu/grades.png",
            desc: "Assessment records & MTAP target grade",
          },
        ]
      : []),
    {
      id: "assistant",
      label: "RevIT AI",
      icon: "/icons/neu/revit-ai.png",
      desc: "AI powered study explanations",
    },
  ];

  return (
    <>
      <nav className="mobile-dock" aria-label="Mobile Navigation">
        <div className="mobile-dock-inner">
          {LEFT_TABS.map((tab) => {
            const isActive = activeView === tab.id && !sheetOpen;
            return (
              <motion.button
                key={tab.id}
                type="button"
                className={`mobile-dock-item ${isActive ? "is-active" : ""}`}
                onClick={() => {
                  setSheetOpen(false);
                  onSelectView(tab.id);
                }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 450, damping: 25 }}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobileActivePill"
                    className="mobile-dock-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <span className="mobile-dock-icon">
                  <Image src={tab.icon} alt="" width={512} height={512} unoptimized />
                </span>
                <span className="mobile-dock-label">{tab.label}</span>
              </motion.button>
            );
          })}

          <motion.button
            type="button"
            className={`mobile-dock-item ${isMoreActive || sheetOpen ? "is-active" : ""}`}
            onClick={() => setSheetOpen((prev) => !prev)}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 450, damping: 25 }}
            aria-label="More navigation options"
            aria-expanded={sheetOpen}
          >
            {(isMoreActive || sheetOpen) && (
              <motion.span
                layoutId="mobileActivePill"
                className="mobile-dock-pill"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <span className="mobile-dock-icon mobile-dock-more-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="1.8" fill="currentColor" />
                <circle cx="18" cy="6" r="1.8" fill="currentColor" />
                <circle cx="6" cy="18" r="1.8" fill="currentColor" />
                <circle cx="18" cy="18" r="1.8" fill="currentColor" />
              </svg>
              {wrongCount > 0 && <span className="mobile-dock-dot" />}
            </span>
            <span className="mobile-dock-label">More</span>
          </motion.button>

          {RIGHT_TABS.map((tab) => {
            const isActive = activeView === tab.id && !sheetOpen;
            return (
              <motion.button
                key={tab.id}
                type="button"
                className={`mobile-dock-item ${isActive ? "is-active" : ""}`}
                onClick={() => {
                  setSheetOpen(false);
                  onSelectView(tab.id);
                }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 450, damping: 25 }}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobileActivePill"
                    className="mobile-dock-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <span className="mobile-dock-icon">
                  <Image src={tab.icon} alt="" width={512} height={512} unoptimized />
                </span>
                <span className="mobile-dock-label">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      </nav>

      {/* Emil Kowalski Vaul-style Spring Bottom Sheet */}
      <AnimatePresence>
        {sheetOpen && (
          <div className="mobile-sheet-portal">
            <motion.div
              className="mobile-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              className="mobile-sheet-content"
              role="dialog"
              aria-modal="true"
              aria-label="More features menu"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="mobile-sheet-handle-wrap" onClick={() => setSheetOpen(false)}>
                <span className="mobile-sheet-handle" />
              </div>

              <div className="mobile-sheet-header">
                <div>
                  <p className="eyebrow" style={{ margin: 0 }}>Navigation</p>
                  <h3 style={{ margin: "2px 0 0", fontSize: "17px", fontWeight: 780 }}>All Study Features</h3>
                </div>
                <button
                  type="button"
                  className="mobile-sheet-close"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>

              <div className="mobile-sheet-list">
                {moreItems.map((item) => {
                  const isCurrent = activeView === item.id;
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      className={`mobile-sheet-item ${isCurrent ? "is-selected" : ""}`}
                      onClick={() => {
                        onSelectView(item.id);
                        setSheetOpen(false);
                      }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="mobile-sheet-item-icon">
                        <Image src={item.icon} alt="" width={512} height={512} unoptimized />
                      </span>
                      <div className="mobile-sheet-item-copy">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <strong>{item.label}</strong>
                          {item.badge && <span className="mobile-sheet-item-badge">{item.badge}</span>}
                        </div>
                        <small>{item.desc}</small>
                      </div>
                      <span className="mobile-sheet-arrow" aria-hidden="true">›</span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="mobile-sheet-secondary">
                <a
                  href="/support"
                  className="mobile-sheet-sub-button"
                  onClick={() => setSheetOpen(false)}
                >
                  <span className="mobile-sheet-sub-icon">
                    <Image src="/icons/neu/support.png" alt="" width={512} height={512} unoptimized />
                  </span>
                  <span>Support RevIT</span>
                </a>
                <button
                  type="button"
                  className="mobile-sheet-sub-button"
                  onClick={() => {
                    setSheetOpen(false);
                    onOpenFeedback();
                  }}
                >
                  <span className="mobile-sheet-sub-icon">✉</span>
                  <span>Send Feedback</span>
                </button>
                <button
                  type="button"
                  className="mobile-sheet-sub-button"
                  onClick={() => {
                    setSheetOpen(false);
                    onOpenProfile();
                  }}
                >
                  <span className="mobile-sheet-sub-icon">⚙</span>
                  <span>Account & Profile</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
