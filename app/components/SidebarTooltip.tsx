"use client";

import React, { useState, useRef, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";

interface SidebarTooltipProps {
  label: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export default function SidebarTooltip({
  label,
  disabled = false,
  children,
  className,
}: SidebarTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const target = (triggerRef.current.firstElementChild as HTMLElement) || triggerRef.current;
    const rect = target.getBoundingClientRect();
    const left = Math.round(rect.right + 10);
    const rawTop = Math.round(rect.top + rect.height / 2);
    // Boundary collision detection to prevent tooltip clipping near viewport edges
    const clampedTop = Math.max(20, Math.min(window.innerHeight - 20, rawTop));
    setCoords({ left, top: clampedTop });
  };

  const handleShow = () => {
    if (disabled) return;
    updatePosition();
    setVisible(true);
  };

  const handleHide = () => {
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) return;

    const handleUpdate = () => updatePosition();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleHide();
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible]);

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocus={handleShow}
      onBlur={handleHide}
      style={{ display: "contents" }}
    >
      {children}
      {mounted && visible && !disabled && coords && createPortal(
        <div
          role="tooltip"
          className="sidebar-floating-tooltip"
          style={{
            position: "fixed",
            left: `${coords.left}px`,
            top: `${coords.top}px`,
            transform: "translateY(-50%)",
            zIndex: 99999,
          }}
        >
          {label}
        </div>,
        document.body,
      )}
    </div>
  );
}
