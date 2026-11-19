"use client";

import { useEffect, useRef } from "react";
import ThemeSymbols from "./ThemeSymbols";
import styles from "./PublicThemeToggle.module.css";

export default function PublicThemeToggle({ className = "", iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!iconOnly) return;
    const root = document.documentElement;
    const syncLabel = () => {
      const label = root.dataset.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
      buttonRef.current?.setAttribute("aria-label", label);
      buttonRef.current?.setAttribute("title", label);
    };
    syncLabel();
    const observer = new MutationObserver(syncLabel);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [iconOnly]);
  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    localStorage.setItem("revit-theme", nextTheme);
  }

  return (
    <button
      ref={buttonRef}
      className={`theme-toggle public-theme-toggle ${className} ${iconOnly ? styles.iconOnly : ""}`.trim()}
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      {iconOnly ? <ThemeSymbols /> : <>
        <span className="theme-symbol light-symbol" aria-hidden="true">☼</span>
        <span className="theme-symbol dark-symbol" aria-hidden="true">☾</span>
        <span>Theme</span>
      </>}
    </button>
  );
}
