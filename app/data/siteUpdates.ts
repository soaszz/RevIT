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
    id: "update-v1-9-0",
    version: "v1.9.0",
    date: "October 4, 2026",
    type: "major",
    title: "Sign in with Google, 3D Mascot, and Cleaner Avatars",
    summary: "You can now sign in or create an account with Google, connect your existing account in Settings, and enjoy our updated 3D smiling mascot and cleaner profile icons.",
    tags: ["Account", "Google Sign In", "Design", "Avatars"],
    highlights: [
      "Added Continue with Google so you can sign in or sign up with a single click.",
      "Connect your Google account inside Account Settings to sign in with either email or Google.",
      "Updated the RevIT mascot to our new 3D smiling frog across the app and onboarding.",
      "Refreshed profile letter icons with a cleaner, uniform dark-mode design and clearer text.",
      "Cleaned up login screen spacing and input placeholders for a smoother experience."
    ]
  },
  {
    id: "update-v1-8-1",
    version: "v1.8.1",
    date: "October 3, 2026",
    type: "minor",
    title: "Faster App Installation and Offline Sync Improvements",
    summary: "Sped up phone app installs, improved offline sync reliability, and removed cloud migration notices inside the installed app.",
    tags: ["Installation", "Offline", "Sync", "Performance"],
    highlights: [
      "Faster app installation on phones and tablets with lightweight initial downloads.",
      "Added support for home screen touch icons on iPhones and iPads.",
      "Ensured the installed app name displays cleanly as RevIT across devices.",
      "Removed distracting cloud migration banners inside installed apps while keeping saved history safe.",
      "Improved offline sync to prevent repeated network retries during temporary connection drops."
    ]
  },
  {
    id: "update-v1-8-0",
    version: "v1.8.0",
    date: "October 3, 2026",
    type: "major",
    title: "Offline Reviews and More Reliable Sign In",
    summary: "Added offline review access, automatic progress sync, Chrome app installation, and fixes for sign-in loading and saved sessions.",
    tags: ["Offline", "Sync", "Account", "Sessions"],
    highlights: [
      "Added offline review access after RevIT has been opened online once.",
      "Saved offline answers and progress now sync automatically when the internet returns.",
      "Added clear offline messages while RevIT AI, rankings, and account tools are unavailable.",
      "Fixed users getting stuck while RevIT checks a temporarily unavailable account session.",
      "Fixed saved review sessions so they stay with the correct account.",
      "Added Chrome app installation support with proper app icons."
    ]
  },
  {
    id: "update-v1-7-6",
    version: "v1.7.6",
    date: "October 2, 2026",
    type: "minor",
    title: "Scroll to Top, Flashcard Fixes, and New Achievements",
    summary: "Added a quick scroll-to-top button, refreshed flashcard styling, added new unlockable achievements, and fixed answer sync retry issues.",
    tags: ["Navigation", "Flashcards", "Achievements", "Sync"],
    highlights: [
      "Added a floating scroll-to-top button for easy navigation on long review and question lists.",
      "Updated flashcard question and answer layouts for smoother flips and readability.",
      "Added new unlockable achievements and badges to study progress.",
      "Fixed an issue where clock differences caused answer submissions to get stuck in retry loops.",
      "Refined question timer behavior and mobile navigation bar spacing."
    ]
  },
  {
    id: "update-v1-7-5",
    version: "v1.7.5",
    date: "October 1, 2026",
    type: "minor",
    title: "Question Quality Fixes and Sidebar Improvements",
    summary: "Audited and cleaned up review questions, docked the calculator button above rankings on phones, fixed sidebar spacing, and resolved study progress loading retries.",
    tags: ["MCQs", "Calculator", "UI/UX", "Progress"],
    highlights: [
      "Audited all questions across Harr and Ciulla to fix typos, cut-off questions, and answer choices.",
      "Moved the calculator button to peek above the rankings button on phones so it stays out of the way until tapped.",
      "Improved the sidebar on laptops and tablets so user profiles stay anchored at the bottom with no empty space.",
      "Fixed an issue where study progress would get stuck retrying on reconnect.",
      "Fixed mobile review buttons from showing up on computer screens."
    ]
  },
  {
    id: "update-v1-7-4",
    version: "v1.7.4",
    date: "September 30, 2026",
    type: "minor",
    title: "Faster Question Loading and Reviewer Updates",
    summary: "Removed question loading delays in MCQs and flashcards, fixed the sidebar to follow while scrolling, moved the calculator button above the mobile navbar, and cleaned up Ciulla questions.",
    tags: ["MCQs", "Flashcards", "Calculator", "UI/UX"],
    highlights: [
      "Removed question transition delays so questions and flashcards load instantly when clicking next or previous.",
      "Fixed the left navigation bar to follow smoothly when scrolling up and down.",
      "Moved the calculator button above the bottom navigation bar on phones so it is easy to see, tap, and swipe.",
      "Combined Mycology and Virology in Ciulla into a single subject under Other Majors.",
      "Fixed questions, typos, and rationales across Ciulla and Harr to match the review books."
    ]
  },
  {
    id: "update-v1-7-3",
    version: "v1.7.3",
    date: "September 29, 2026",
    type: "minor",
    title: "Fixed RevIT Logo and Updated Login Mascot",
    summary: "Fixed the text logo across login, loading, and main screens so letters are no longer cut off, and updated the login mascot to the rounded frog design.",
    tags: ["Branding", "Mascot", "UI/UX"],
    highlights: [
      "Fixed the RevIT text logo across login, loading, and main screens so letters display fully without being cut off.",
      "Updated the login page frog mascot to the new rounded waving frog icon.",
      "Aligned logo and mascot styling across all pages for a clean, consistent look."
    ]
  },
  {
    id: "update-v1-7-2",
    version: "v1.7.2",
    date: "September 29, 2026",
    type: "minor",
    title: "Clearer Signup Messages and Email Checks",
    summary: "Added clear messages when an email is already taken and added email format checks to make signing up and logging in easier.",
    tags: ["Account", "Authentication", "UI/UX"],
    highlights: [
      "Added a clear message showing that an email is already taken so you can sign in or reset your password directly.",
      "Added email format checking to prevent typos and invalid email entries during signup and login.",
      "Improved error messages to clearly show why an account could not be created."
    ]
  },
  {
    id: "update-v1-7-1",
    version: "v1.7.1",
    date: "September 27, 2026",
    type: "minor",
    title: "Mobile Flashcards UI Fix & Screen Width Spacing",
    summary: "Fixed flashcard choices on mobile so they stack top to bottom instead of overflowing horizontally, and removed unwanted side-to-side scrolling on phones.",
    tags: ["Flashcards", "Mobile", "UI/UX"],
    highlights: [
      "Stacked flashcard choices vertically from top to bottom on mobile screens.",
      "Reduced choices box height for a more compact and readable look.",
      "Fixed mobile width and spacing to stop horizontal scrollbars and side-to-side scrolling.",
      "Cleaned up session headers on phones to keep flashcards centered and easy to use."
    ]
  },
  {
    id: "update-v1-7-0",
    version: "v1.7.0",
    date: "September 27, 2026",
    type: "major",
    title: "Swipeable Calculator, NU MOA Highlights & Grading Updates",
    summary: "Added a swipeable scientific calculator that docks on the right side, highlighted the National University MOA grading tools, updated exam grading weights, and refreshed mobile navigation styling.",
    tags: ["Calculator", "Grades", "NU MOA", "Mobile", "UI/UX"],
    highlights: [
      "Made the calculator draggable up and down along the right side so it never blocks your questions.",
      "Added peeking mode for the calculator button that hides after 5 seconds if not used.",
      "Highlighted National University MOA MTAP in Account Settings and Grades.",
      "Updated grading system weights: Oral Revalida 25%, Comprehensive Exam 25%, Written Revalida 25%.",
      "Made 'Tap to review' in Mistake Bank brighter and easier to see.",
      "Improved mobile navigation dock and fixed header spacing."
    ]
  },
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
