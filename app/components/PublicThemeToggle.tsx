"use client";

export default function PublicThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    localStorage.setItem("revit-theme", nextTheme);
  }

  return (
    <button
      className={`theme-toggle public-theme-toggle ${className}`.trim()}
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <span className="theme-symbol light-symbol" aria-hidden="true">☼</span>
      <span className="theme-symbol dark-symbol" aria-hidden="true">☾</span>
      <span>Theme</span>
    </button>
  );
}
