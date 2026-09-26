export type UpdateType = "major" | "minor";

export interface SiteUpdate {
  id: string;
  version: string;
  date: string;
  type: UpdateType;
  title: string;
  summary: string;
  tags: string[];
  highlights: string[];
}

export const SITE_UPDATES: SiteUpdate[] = [
  {
    id: "update-v1-6-0",
    version: "v1.6.0",
    date: "September 26, 2026",
    type: "major",
    title: "Ciulla Book Addition, Unified Hematology & Calculator Enhancements",
    summary: "Introduced the Ciulla 4th Edition question bank, unified Hematology on Harr, refined the scientific calculator for mobile and tablet screens, and improved review session management.",
    tags: ["Books", "Ciulla", "Harr", "Calculator", "UI/UX"],
    highlights: [
      "Added Ciulla Book Fourth Edition with 1,884 new practice questions across 14 subjects.",
      "Combined Hematology 1 and 2 on Harr into a single complete subject under MTAP 1.",
      "Refined the scientific calculator with a more compact layout on mobile and tablet screens.",
      "Fixed directional arrow keys on touchscreens and enabled tap-to-place cursor navigation on the formula display.",
      "Added early-exit session summaries so you can end review sessions anytime without losing earned XP or answered questions.",
      "Introduced custom confirmation prompts before exiting sessions or deleting chats to prevent accidental data loss.",
      "Added multi-book edition filtering across MCQs, Flashcards, Progress, Leaderboards, and Weakness Analytics."
    ]
  },
  {
    id: "update-v1-5-0",
    version: "v1.5.0",
    date: "September 24, 2026",
    type: "major",
    title: "Live Learner Presence, Accordion Library & Enhanced Flashcards",
    summary: "Study alongside fellow future RMTs with real-time active presence, explore topics with expandable subject accordions, and practice flashcards with horizontal choices.",
    tags: ["Presence", "Flashcards", "Library", "UI/UX"],
    highlights: [
      "Real-time online learner counter showing active future RMT/s reviewing together.",
      "Accordion subject navigation in Review Library for cleaner, focused topic selection.",
      "Interactive horizontal answer choices on flashcard front cards with persistent selections.",
      "Sound effects enabled by default for immediate feedback on every question.",
      "Streamlined Leaderboard privacy with a centralized public participation switch."
    ]
  },
  {
    id: "update-v1-4-0",
    version: "v1.4.0",
    date: "September 24, 2026",
    type: "major",
    title: "Hematology MCQ Graphs & Cell Morphology Visuals",
    summary: "Visual upgrade for Hematology review questions including high-detail scatterplots, cell morphology charts, and responsive image modal viewing.",
    tags: ["MCQs", "Hematology", "Graphs", "Reviewer"],
    highlights: [
      "Added laboratory graphs, scatterplots, and diagnostic morphology diagrams.",
      "Optimized diagram scaling and image responsiveness across all device sizes.",
      "Page-level textbook and reviewer citations attached to each rationale.",
      "Strict separation between official question bank scoring and study notes."
    ]
  },
  {
    id: "update-v1-3-5",
    version: "v1.3.5",
    date: "September 20, 2026",
    type: "minor",
    title: "Vercel Analytics & Speed Insights Integration",
    summary: "Integrated real-time performance telemetry and Core Web Vitals monitoring for instant question loading and zero-lag flashcard navigation.",
    tags: ["Performance", "Telemetry"],
    highlights: [
      "Real-time Core Web Vitals (LCP, FID, CLS) tracking.",
      "Reduced client-side hydration time for instantaneous question transitions.",
      "Memory leak mitigation during prolonged study sessions."
    ]
  },
  {
    id: "update-v1-3-0",
    version: "v1.3.0",
    date: "September 18, 2026",
    type: "major",
    title: "Learner Feedback & Question Suggestion System",
    summary: "Students can now report questionable items, flag typographical errors, and submit content suggestions directly from within any review session.",
    tags: ["Feedback", "Cloud", "Community"],
    highlights: [
      "One-click feedback trigger from any question or review overview.",
      "Automatic capture of topic context, question ID, and device metadata.",
      "Custom confirmation dialogs for key actions to prevent accidental session exit."
    ]
  },
  {
    id: "update-v1-2-4",
    version: "v1.2.4",
    date: "September 12, 2026",
    type: "minor",
    title: "Scientific Calculator Power-Ups",
    summary: "Enhanced the floating laboratory calculator with scientific notation, clinical conversion tools, and full undo/redo calculation history.",
    tags: ["Tools", "Calculator"],
    highlights: [
      "Full scientific functions: log, ln, square root, powers, and trigonometry.",
      "Step-by-step history drawer with reversible undo/redo operations.",
      "Persistent drawer state and full keyboard numpad navigation."
    ]
  },
  {
    id: "update-v1-2-0",
    version: "v1.2.0",
    date: "September 5, 2026",
    type: "major",
    title: "Global Leaderboards & Level Progression v1",
    summary: "Compete with peers nationwide on daily, weekly, and all-time reviewer leaderboards, backed by cloud level milestones and XP progression.",
    tags: ["Leaderboards", "Supabase", "Gamification"],
    highlights: [
      "Daily and weekly competitive review rankings with anonymized or custom handles.",
      "Level 1 to 50 XP milestone progression with celebratory audio cues.",
      "Secured with Supabase Row Level Security (RLS) policies and cloud sync."
    ]
  },
  {
    id: "update-v1-1-2",
    version: "v1.1.2",
    date: "August 28, 2026",
    type: "minor",
    title: "Weakness Analytics & Targeted Drill Mode",
    summary: "Topic-level accuracy radar charts and one-click reinforcement practice drills focused specifically on previously missed questions.",
    tags: ["Analytics", "Reinforcement"],
    highlights: [
      "Granular breakdown across Clinical Chemistry, Bacteriology, Hematology, and AUBF.",
      "Instant 'Drill Weak Areas' custom test generator.",
      "Visual mastery progress meters for every individual sub-topic."
    ]
  },
  {
    id: "update-v1-1-0",
    version: "v1.1.0",
    date: "August 27, 2026",
    type: "major",
    title: "MedTech AI Clinical Explanations (Groq LLM)",
    summary: "Context-aware AI tutor providing clinical correlation, memory mnemonics, and deep rationales powered by ultra-fast Groq models.",
    tags: ["AI", "Groq", "Study Assistant"],
    highlights: [
      "Ultra-low latency clinical explanations powered by Groq LLMs.",
      "Strict safeguard: AI responses are advisory and never alter official scoring answers.",
      "Built-in token safety and rate limit reservations."
    ]
  },
  {
    id: "update-v1-0-2",
    version: "v1.0.2",
    date: "August 21, 2026",
    type: "minor",
    title: "Flashcard Spaced Repetition & Dark Theme",
    summary: "Interactive 3D card flips with keyboard navigation shortcuts and an eye-friendly high-contrast dark mode for evening study.",
    tags: ["Flashcards", "Dark Mode", "Keyboard"],
    highlights: [
      "Keyboard shortcuts (Space to flip, 1/2 for self-check, Arrow keys for next/prev).",
      "Ergonomic dark theme engineered for high readability on medical terminology.",
      "Session resume support so you never lose your place."
    ]
  }
];
