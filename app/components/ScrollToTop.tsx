"use client";

import { useEffect, useState } from "react";

type ScrollToTopProps = {
  view: string;
  aboveReviewBar: boolean;
  instant: boolean;
};

const radius = 19;
const circumference = 2 * Math.PI * radius;

export default function ScrollToTop({ view, aboveReviewBar, instant }: ScrollToTopProps) {
  const [scroll, setScroll] = useState({ progress: 0, visible: false });

  useEffect(() => {
    const update = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const top = window.scrollY;
      setScroll({
        progress: maxScroll ? Math.min(1, Math.max(0, top / maxScroll)) : 0,
        visible: maxScroll > 0 && top > 100,
      });
    };
    update();
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [view]);

  if (!scroll.visible) return null;

  return (
    <button
      className={"scroll-to-top" + (aboveReviewBar ? " scroll-to-top-above-review" : "")}
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({
        top: 0,
        behavior: instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      })}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="scroll-to-top-track" cx="24" cy="24" r={radius} />
        <circle className="scroll-to-top-progress" cx="24" cy="24" r={radius}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - scroll.progress)} />
        <path className="scroll-to-top-arrow" d="M24 31V17m-6 6 6-6 6 6" />
      </svg>
    </button>
  );
}
