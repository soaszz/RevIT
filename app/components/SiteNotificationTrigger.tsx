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
        padding: size === "compact" ? "0" : "7px 12px 7px 10px",
        borderRadius: "10px",
        border: "none",
        outline: "none",
        background: size === "compact" ? "transparent" : "var(--paper)",
        color: "var(--ink)",
        fontSize: "11px",
        fontWeight: 700,
        cursor: "pointer",
        lineHeight: 1,
        whiteSpace: "nowrap",
        boxShadow: "none",
        width: size === "compact" ? "36px" : "auto",
        height: size === "compact" ? "36px" : "auto",
        minWidth: size === "compact" ? "36px" : "auto",
        minHeight: size === "compact" ? "36px" : "auto",
        boxSizing: "border-box",
        justifyContent: "center"
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
        <Notification3 size={20} />
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
