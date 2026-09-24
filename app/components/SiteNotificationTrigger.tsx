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
    >
      <span className="site-notification-icon-wrap">
        <Notification3 size={size === "compact" ? 18 : 20} />
        {unreadCount > 0 && (
          <span className="site-notification-badge" aria-hidden="true">
            {displayCount}
          </span>
        )}
      </span>
      <span className="site-notification-label">Updates</span>
    </button>
  );
}
