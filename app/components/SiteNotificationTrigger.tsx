"use client";

import Notification3 from "./Notification3";

export interface SiteNotificationTriggerProps {
  unreadCount: number;
  onClick: () => void;
  className?: string;
  size?: "default" | "compact";
}

export default function SiteNotificationTrigger({
  unreadCount,
  onClick,
  className = "",
  size = "default",
}: SiteNotificationTriggerProps) {
  const displayCount = unreadCount > 9 ? "9+" : unreadCount;

  return (
    <button
      type="button"
      className={`site-notification-btn ${size === "compact" ? "is-compact" : ""} ${className}`.trim()}
      onClick={onClick}
      aria-label={`View site updates (${unreadCount} unread notification${unreadCount === 1 ? "" : "s"})`}
      title="What's new in RevIT"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: size === "compact" ? "6px" : "7px 12px 7px 10px",
        borderRadius: size === "compact" ? "50%" : "99px",
        border: "1px solid var(--line)",
        background: "var(--paper)",
        color: "var(--ink)",
        fontSize: "11px",
        fontWeight: 700,
        cursor: "pointer",
        lineHeight: 1,
        whiteSpace: "nowrap",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.06)",
        width: size === "compact" ? "34px" : "auto",
        height: size === "compact" ? "34px" : "auto",
        justifyContent: size === "compact" ? "center" : "flex-start"
      }}
    >
      <span
        className="site-notification-icon-wrap"
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--green)",
          flexShrink: 0
        }}
      >
        <Notification3 size={size === "compact" ? 18 : 20} />
        {unreadCount > 0 && (
          <span
            className="site-notification-badge"
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "-7px",
              right: "-9px",
              display: "grid",
              placeItems: "center",
              minWidth: "16px",
              height: "16px",
              padding: "0 4px",
              borderRadius: "99px",
              background: "#e11d48",
              color: "#ffffff",
              fontSize: "9px",
              fontWeight: 800,
              lineHeight: 1,
              border: "2px solid var(--paper)"
            }}
          >
            {displayCount}
          </span>
        )}
      </span>
      <span className="site-notification-label" style={size === "compact" ? { display: "none" } : undefined}>
        Updates
      </span>
    </button>
  );
}
