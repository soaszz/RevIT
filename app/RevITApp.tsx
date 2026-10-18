"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session as AuthSession } from "@supabase/supabase-js";
import AccountSettings from "./components/AccountSettings";
import AchievementModal, { XpProgress } from "./components/AchievementModal";
import AiMarkdown from "./components/AiMarkdown";
import FeedbackModal from "./components/FeedbackModal";
import Flashcards from "./components/Flashcards";
import GradesPage from "./components/GradesPage";
import LeaderboardPage from "./components/LeaderboardPage";
import LegalConsentGate from "./components/LegalConsentGate";
import LibrarySearch from "./components/LibrarySearch";
import MtapOnboarding from "./components/MtapOnboarding";
import MtapPreferenceControl from "./components/MtapPreferenceControl";
import Onboarding from "./components/Onboarding";
import QuestionStimulus, { QuestionReferences } from "./components/QuestionStimulus";
import MatchingQuestion from "./components/MatchingQuestion";
import QuestionChoiceTable from "./components/QuestionChoiceTable";
import QuestionTimer from "./components/QuestionTimer";
import type { ReviewLibraryMode } from "./components/ReviewModeSwitch";
import RevITLoadingScreen from "./components/RevITLoadingScreen";
import ScientificCalculator from "./components/ScientificCalculator";
import MobileNavDock from "./components/MobileNavDock";
import ScrollToTop from "./components/ScrollToTop";
import MobileReviewBar from "./components/MobileReviewBar";
import { motion, AnimatePresence } from "motion/react";
import CustomConfirm from "./components/CustomConfirm";
import ResumeSessionModal, { type SavedRecentSession } from "./components/ResumeSessionModal";
import StudyActivityHeatmap from "./components/StudyActivityHeatmap";
import StudyCalendar from "./components/StudyCalendar";
import StudyPlanner, { TodayStudyPlan, type PlannerViewMode } from "./components/StudyPlanner";
import WeaknessDashboard from "./components/WeaknessDashboard";
import SiteNotificationTrigger from "./components/SiteNotificationTrigger";
import ProgressionSummaryCard from "./components/progression/ProgressionSummaryCard";
import MissionsModal from "./components/progression/MissionsModal";
import ProgressionToast, { type ProgressionToastItem } from "./components/progression/ProgressionToast";
import { evaluateProgression } from "./lib/progression/progressionEngine";
import type { Mission } from "./lib/progression/types";
import SiteUpdatesModal, { useSiteNotifications } from "./components/SiteUpdatesModal";
import ProgressPage from "./components/ProgressPage";
import ReviewLibrary from "./components/ReviewLibrary";
import PlanAnnouncementModal, {
  type PlanModalVariant,
  GIFTED_PRO_USERS,
  GIFTED_PRO_USER_IDS,
} from "./components/PlanAnnouncementModal";
import ProActivationModal from "./components/ProActivationModal";
import SidebarTooltip from "./components/SidebarTooltip";

export { GIFTED_PRO_USERS, GIFTED_PRO_USER_IDS };
import {
  acknowledgeProActivation,
  deleteExam as deleteCloudExam,
  flushQuestionAttemptQueue,
  flushQuestionReinforcementQueue,
  getQueuedQuestionAttemptsCount,
  getQueuedQuestionReinforcementCount,
  loadCloudSnapshot,
  localProfileToCloud,
  migrateLocalActivity,
  migrateLocalQuestionAttempts,
  queueQuestionAttempt,
  queueQuestionReinforcement,
  saveExam as saveCloudExam,
  saveGrade as saveCloudGrade,
  savePreferences,
} from "./lib/cloudService";
import type { CustomGradebook, DailyActivity, ExamSchedule, GradeRecord, PendingActivationNotification, Profile, QuestionAttempt, QuestionDifficulty, ReviewMode, StudyPlan, UserPreferences } from "./lib/domain";
import type { ProgressEvent, ProgressionUpdate } from "./lib/xpService";
import {
  chooseAdaptiveQuestion,
  reinforcementAfterAnswer,
  reinforcementLevelAfterAnswer,
  type QuestionPerformance,
  type ReinforcementLevels,
} from "./lib/adaptiveQuestions";
import { dateKeyInTimeZone, greetingFor, calculateStreak } from "./lib/studyCalendar";
import { normalizeStudyPlans, studyPlansStorageKey } from "./lib/studyPlanner";
import { type ReviewTimerDuration } from "./lib/reviewTimer";
import { playReviewSound, unlockReviewSounds } from "./lib/reviewSounds";
import { buildWeakTopicQuestionPool, type TopicMastery } from "./lib/weaknessAnalytics";
import { encodeMatchingAnswers, isQuestionAnswerCorrect } from "./lib/matchingQuestion";
import { createClient } from "./lib/supabase/client";
import { hasCurrentLegalConsent } from "./lib/legal";
import { canAccessFeature } from "./lib/features";
import { ALL_MAJORS_CATEGORY, buildSubjectSections, filterSubjectsBySearch, getUnifiedSubjects, MTAP_1_CATEGORY, OTHER_MAJORS_CATEGORY, type UnifiedSubject } from "./lib/reviewerLibrary";
import { LOCAL_PREFERENCES_STORAGE_KEY, normalizeUserPreferences, withMtapFeaturePreference } from "./lib/userPreferences";
import { withTimeout } from "./lib/withTimeout";
import {
  emptyProgression,
  flushCloudProgressEventQueue,
  getQueuedCloudProgressEventsCount,
  loadCloudProgression,
  loadCloudProgressionReadOnly,
  loadLocalProgression,
  markCurrentLevelSeen,
  queueCloudProgressEvents,
  recordLocalProgressEvents,
  syncLocalProgressionFromCloud,
  shouldShowLevelUp,
} from "./lib/xpService";
import { useOnlineStatus } from "./lib/useOnlineStatus";
import { levelProgress, XP_REWARDS } from "./lib/xpConfig";
import {
  chatTitleFromFirstMessage,
  createAiChat,
  deleteAiChat,
  loadAiChats,
  loadAiMessages,
  saveAiMessage,
  updateAiChatTitle,
  type AiChat,
} from "./lib/aiChatService";
import { AVATAR_ACCEPT, validateAvatarFile } from "./lib/avatarValidation";
import {
  FREE_ENTITLEMENT,
  canAccessFeature as canAccessSubscriptionFeature,
  canAccessQuestionBank,
  getAiLimits,
  isProActive,
  type SubscriptionEntitlement,
} from "./lib/entitlements";
import {
  questionById as freeQuestionById,
  questions as freeQuestions,
  subjectById as freeSubjectById,
  subjects as freeSubjects,
  topicById as freeTopicById,
  topics as freeTopics,
  type ReviewerBook,
  type ReviewerQuestion,
  type Subject,
  type Topic,
} from "./content/reviewerContent";
import {
  clearCiullaReviewerCache,
  clearRodakReviewerCache,
  clearStrasingerReviewerCache,
  fetchCiullaReviewer,
  fetchRodakReviewer,
  fetchStrasingerReviewer,
} from "./lib/premiumReviewerService";
import {
  ciullaPreviewSubjects,
  ciullaPreviewTopics,
  ciullaTopicQuestionCounts,
  CIULLA_TOTAL_QUESTIONS,
} from "./content/ciullaMetadata";
import {
  rodakPreviewSubjects,
  rodakPreviewTopics,
  rodakTopicQuestionCounts,
  RODAK_TOTAL_QUESTIONS,
} from "./content/rodakMetadata";
import {
  strasingerPreviewSubjects,
  strasingerPreviewTopics,
  strasingerTopicQuestionCounts,
  STRASINGER_TOTAL_QUESTIONS,
} from "./content/strasingerMetadata";
import { STRASINGER_CLOUD_SYNC_ENABLED } from "./lib/cloudSyncGate";
import { createTrustedStudyClient } from "./lib/trustedStudyClient";
import {
  DEFAULT_AI_ACADEMIC_PERMISSIONS,
  buildVerifiedAcademicContext,
  type AiAcademicPermissionState,
} from "./lib/aiGradeAssistant";
import AiAcademicSettingsModal from "./components/AiAcademicSettingsModal";

type View = "overview" | "library" | "progress" | "leaderboards" | "weakness" | "planner" | "grades" | "assistant";
type Attempt = QuestionAttempt;
type ReviewTimerConfig = { enabled: boolean; duration: ReviewTimerDuration };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  grounded?: boolean;
  mode?: "live" | "demo";
  provider?: "Groq";
};

type LearnerProfile = {
  name: string;
  photoDataUrl: string;
};

const DEFAULT_PROFILE: LearnerProfile = { name: "Student", photoDataUrl: "" };
const TIMER_DISABLED: ReviewTimerConfig = { enabled: false, duration: 60 };
const SOUND_EFFECTS_STORAGE_KEY = "revit-sound-effects";
const RECENT_SESSION_STORAGE_KEY = "revit_recent_session_v1";

function recentSessionStorageKey(userId?: string) {
  return `${RECENT_SESSION_STORAGE_KEY}:${userId ?? "local"}`;
}

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "/icons/neu/overview.png" },
  { id: "library", label: "Review Library", icon: "/icons/neu/review-library.png" },
  { id: "progress", label: "Progress", icon: "/icons/neu/progress.png" },
  { id: "leaderboards", label: "Leaderboards", icon: "/icons/neu/leaderboards.png" },
  { id: "weakness", label: "Weakness Analytics", icon: "/icons/neu/weakness.png" },
  { id: "planner", label: "Study Planner", icon: "/icons/neu/study-planner.png" },
  { id: "grades", label: "Grades", icon: "/icons/neu/grades.png" },
  { id: "assistant", label: "RevIT AI", icon: "/icons/neu/revit-ai.png" },
];

function RevITLogo() {
  return (
    <>
      <span className="brand-logo brand-logo-full" aria-hidden="true"><Image src="/icons/neu/revit-wordmark.png" alt="RevIT" width={1086} height={362} priority /></span>
      <span className="brand-frog-head" aria-hidden="true"><Image src="/revit-frog.png" alt="" width={308} height={242} unoptimized /></span>
      
    </>
  );
}

const viewCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Study overview",
    title: "Overview",
    description: "Review your current study activity, upcoming plans, performance, and progress.",
  },
  library: {
    eyebrow: "Structured practice",
    title: "Review Library",
    description: "Choose a subject or topic and build a focused session from the official reviewer library.",
  },
  progress: {
    eyebrow: "Performance analytics",
    title: "Progress",
    description: "Review accuracy by subject and topic to identify stronger areas and priorities for further study.",
  },
  leaderboards: {
    eyebrow: "Community rankings",
    title: "Leaderboards",
    description: "Compare eligible question activity, first-attempt accuracy, and study XP without exposing private attempt history.",
  },
  weakness: {
    eyebrow: "Study priorities",
    title: "Weakness Analytics",
    description: "Use your question history, first attempts, difficulty, and retention data to plan focused follow-up practice.",
  },
  planner: {
    eyebrow: "Academic planning",
    title: "Planner",
    description: "Organize your recurring classes, planned study sessions, upcoming exams, deadlines, and tasks.",
  },
  grades: {
    eyebrow: "Grade tracking",
    title: "Grades",
    description: "Record assessments by subject and review your saved grade history.",
  },
  assistant: {
    eyebrow: "Educational AI support",
    title: "RevIT AI",
    description: "Explore Medical Technology concepts while official reviewer answers remain separate from AI-generated explanations.",
  },
};

const viewTitles: Record<View, string> = {
  overview: "Overview",
  library: "Review Library",
  progress: "Progress",
  leaderboards: "Leaderboards",
  weakness: "Weakness Analytics",
  planner: "Study Planner",
  grades: "Grades",
  assistant: "RevIT AI",
};

function normalizedDifficulty(value: unknown): QuestionDifficulty {
  return value === "Easy" || value === "Medium" || value === "Hard" ? value : "Unspecified";
}

function normalizedReviewMode(value: unknown): ReviewMode {
  return value === "adaptive" || value === "wrong_answers" || value === "weakness_focus"
    || value === "pre_test" || value === "post_test" || value === "oral_review"
    ? value
    : "reviewer";
}

function normalizeAttempts(value: unknown): Attempt[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((raw): Attempt[] => {
    if (!raw || typeof raw !== "object") return [];
    const input = raw as Partial<Attempt> & { id?: string; selectedAnswer?: number; correct?: boolean; timestamp?: string };
    if (typeof input.questionId !== "string" || typeof input.correct !== "boolean" || typeof input.timestamp !== "string") return [];
    const question = freeQuestionById.get(input.questionId);
    const topicId = typeof input.topicId === "string" ? input.topicId : question?.topicId ?? "uncategorized";
    const subjectId = typeof input.subjectId === "string" ? input.subjectId : question?.subjectId ?? "uncategorized";
    return [{
      id: typeof input.id === "string" ? input.id : crypto.randomUUID(),
      questionId: input.questionId,
      topicId,
      subjectId,
      topicName: typeof input.topicName === "string" && input.topicName.trim() ? input.topicName : freeTopicById.get(topicId)?.name ?? "Uncategorized",
      subjectName: typeof input.subjectName === "string" && input.subjectName.trim() ? input.subjectName : freeSubjectById.get(subjectId)?.name ?? "Uncategorized",
      subtopic: typeof input.subtopic === "string" && input.subtopic.trim() ? input.subtopic : question?.subtopic ?? "Uncategorized",
      difficulty: normalizedDifficulty(input.difficulty ?? question?.difficulty),
      selectedAnswer: typeof input.selectedAnswer === "number" ? input.selectedAnswer : null,
      correct: input.correct,
      attemptNumber: typeof input.attemptNumber === "number" && input.attemptNumber > 0 ? input.attemptNumber : 1,
      reviewMode: normalizedReviewMode(input.reviewMode),
      sessionId: typeof input.sessionId === "string" ? input.sessionId : null,
      isAdaptiveRepeat: Boolean(input.isAdaptiveRepeat),
      timestamp: input.timestamp,
    }];
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const counts = new Map<string, number>();
  return normalized.map((attempt) => {
    const count = (counts.get(attempt.questionId) ?? 0) + 1;
    counts.set(attempt.questionId, count);
    return { ...attempt, attemptNumber: Math.max(attempt.attemptNumber, count) };
  });
}

function mergeAttempts(...sources: Attempt[][]) {
  const merged = new Map<string, Attempt>();
  for (const attempt of sources.flat()) merged.set(attempt.id, attempt);
  return [...merged.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function getBookBadgeStyle(book: ReviewerBook | string, extraStyle?: React.CSSProperties): React.CSSProperties {
  const b = book.toLowerCase();
  const color = b === "strasinger" ? "#38bdf8" : b === "rodak" ? "#fbbf24" : b === "ciulla" ? "#92e06b" : "#66d0b2";
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: 0,
    borderRadius: 0,
    fontSize: "8.5px",
    fontWeight: 750,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
    flexShrink: 0,
    lineHeight: 1.2,
    border: "none",
    color,
    background: "transparent",
    boxSizing: "border-box",
    ...extraStyle,
  };
}

const chatSuggestionCategories = [
  {
    category: "Explain a MedTech concept",
    title: "Explain Gram staining",
    text: "Why is decolorization the critical step in Gram staining?",
  },
  {
    category: "Calculate my required grade",
    title: "Calculate my grade",
    text: "What grade do I need in finals to pass Clinical Chemistry?",
  },
  {
    category: "Compare laboratory concepts",
    title: "Compare anemia types",
    text: "Differentiate iron deficiency anemia from anemia of chronic disease.",
  },
  {
    category: "Create a mnemonic",
    title: "Create a mnemonic",
    text: "Give me a mnemonic for acute phase reactant proteins.",
  },
  {
    category: "Explain laboratory principles",
    title: "Explain laboratory principles",
    text: "Explain forward vs reverse typing in immunohematology.",
  },
  {
    category: "Understand my academic standing",
    title: "Understand my academic standing",
    text: "What is my current average in Hematology?",
  },
];

const chatSuggestions = chatSuggestionCategories.map((c) => c.text);

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function percent(correct: number, total: number) {
  return total ? Math.round((correct / total) * 100) : 0;
}

function toneFor(score: number, attempts: number) {
  if (!attempts) return "unstarted";
  if (score >= 80) return "strong";
  if (score >= 60) return "developing";
  return "focus";
}

function mergeLocalAttemptActivity(attempts: Attempt[], existing: DailyActivity[], timeZone: string) {
  const map = new Map(existing.map((day) => [day.activity_date, { ...day, questions_answered: 0, correct_answers: 0 }]));
  for (const attempt of attempts) {
    const key = dateKeyInTimeZone(new Date(attempt.timestamp), timeZone);
    const current = map.get(key) ?? { activity_date: key, questions_answered: 0, correct_answers: 0, review_count: 0, subjects_studied: [] };
    current.questions_answered += 1;
    current.correct_answers += attempt.correct ? 1 : 0;
    const subject = freeSubjectById.get(attempt.subjectId)?.name ?? attempt.subjectName ?? attempt.subjectId;
    current.subjects_studied = [...new Set([...current.subjects_studied, subject])];
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.activity_date.localeCompare(b.activity_date));
}

function activityAfterEvent(current: DailyActivity[], activityDate: string, input: {
  questions?: number;
  correct?: number;
  reviews?: number;
  subject?: string;
}) {
  const existing = current.find((day) => day.activity_date === activityDate);
  const updated: DailyActivity = {
    ...(existing ?? { activity_date: activityDate, questions_answered: 0, correct_answers: 0, review_count: 0, subjects_studied: [] }),
    questions_answered: (existing?.questions_answered ?? 0) + (input.questions ?? 0),
    correct_answers: (existing?.correct_answers ?? 0) + (input.correct ?? 0),
    review_count: (existing?.review_count ?? 0) + (input.reviews ?? 0),
    subjects_studied: input.subject ? [...new Set([...(existing?.subjects_studied ?? []), input.subject])] : (existing?.subjects_studied ?? []),
  };
  return [...current.filter((day) => day.activity_date !== activityDate), updated]
    .sort((a, b) => a.activity_date.localeCompare(b.activity_date));
}

export type InitialUser = { id: string; email: string; username?: string };

export default function RevITApp({ initialUser = null, cloudEnabled = false, offlineMode = false, turnstileSiteKey, trustedStudyTransport = false }: { initialUser?: InitialUser | null; cloudEnabled?: boolean; offlineMode?: boolean; turnstileSiteKey?: string; trustedStudyTransport?: boolean }) {
  const [reviewerContent, setReviewerContent] = useState<{ subjects: Subject[]; topics: Topic[]; questions: ReviewerQuestion[] }>({
    subjects: freeSubjects,
    topics: freeTopics,
    questions: freeQuestions,
  });
  const { subjects, topics, questions } = reviewerContent;
  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const router = useRouter();
  const online = useOnlineStatus();
  const cloudAvailable = cloudEnabled && online && !offlineMode;
  const trustedStudy = useMemo(() => trustedStudyTransport && cloudEnabled && initialUser?.id
    ? createTrustedStudyClient({ enabled: true, userId: initialUser.id, currentUserId: () => initialUser.id,
      storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
      fetch: (...args) => fetch(...args), online: () => !offlineMode && navigator.onLine })
    : null, [trustedStudyTransport, cloudEnabled, initialUser?.id, offlineMode]);
  useEffect(() => {
    if (!trustedStudy || !initialUser) return;
    trustedStudy.setAccount(initialUser.id);
    const { data } = createClient().auth.onAuthStateChange((_event: AuthChangeEvent, session: AuthSession | null) => trustedStudy.setAccount(session?.user.id ?? null));
    return () => { trustedStudy.setAccount(null); data.subscription.unsubscribe(); };
  }, [trustedStudy, initialUser]);
  const [activeView, setActiveView] = useState<View>("overview");
  const [viewDirection, setViewDirection] = useState(1);
  const [libraryMode, setLibraryMode] = useState<ReviewLibraryMode>("mcqs");
  const [isFlashcardReviewing, setIsFlashcardReviewing] = useState(false);
  const [activeFlashcardTopics, setActiveFlashcardTopics] = useState<string[]>([]);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<string[]>([]);
  const [expandedBookEditionKeys, setExpandedBookEditionKeys] = useState<string[]>([]);
  const [progressSearch, setProgressSearch] = useState("");
  const [progressBook, setProgressBook] = useState<ReviewerBook | "all">("all");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<ReviewerBook | "all">(() => {
    if (typeof window === "undefined") return "Harr";
    try {
      const saved = localStorage.getItem("revit-selected-book-v1");
      if (saved === "Harr" || saved === "Ciulla" || saved === "Rodak" || saved === "Strasinger" || saved === "all") return saved;
    } catch {}
    return "Harr";
  });
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [sessionSize, setSessionSize] = useState("10");
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerDuration, setTimerDuration] = useState<ReviewTimerDuration>(60);
  const [activeTimer, setActiveTimer] = useState<ReviewTimerConfig>(TIMER_DISABLED);
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [wrongAnswersOnly, setWrongAnswersOnly] = useState(false);
  const [sessionPoolIds, setSessionPoolIds] = useState<string[]>([]);
  const [sessionTargetCount, setSessionTargetCount] = useState(0);
  const [sessionQuestionIds, setSessionQuestionIds] = useState<string[]>([]);
  const [sessionChoiceOrders, setSessionChoiceOrders] = useState<Record<string, number[]>>({});
  const [sessionSkippedIds, setSessionSkippedIds] = useState<string[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionStrictWrongOnly, setSessionStrictWrongOnly] = useState(false);
  const [sessionMode, setSessionMode] = useState<ReviewMode>("reviewer");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [matchingSelections, setMatchingSelections] = useState<number[]>([]);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [reinforcementLevels, setReinforcementLevels] = useState<ReinforcementLevels>({});
  const [reinforcementReady, setReinforcementReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [aiChats, setAiChats] = useState<AiChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadedChatId, setLoadedChatId] = useState<string | null>(null);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [chatMessagesLoading, setChatMessagesLoading] = useState(false);
  const [chatHistoryHasMore, setChatHistoryHasMore] = useState(false);
  const [chatMessagesHasMore, setChatMessagesHasMore] = useState(false);
  const [chatHistoryLoadingMore, setChatHistoryLoadingMore] = useState(false);
  const [chatMessagesLoadingMore, setChatMessagesLoadingMore] = useState(false);
  const [chatActionPending, setChatActionPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [aiDailyUsed, setAiDailyUsed] = useState<number | null>(null);
  const [aiAcademicPermissions, setAiAcademicPermissions] = useState<AiAcademicPermissionState>(() => {
    if (typeof window === "undefined") return DEFAULT_AI_ACADEMIC_PERMISSIONS;
    try {
      const key = `revit-ai-academic-context:${initialUser?.id ?? "local"}`;
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as AiAcademicPermissionState) : DEFAULT_AI_ACADEMIC_PERMISSIONS;
    } catch {
      return DEFAULT_AI_ACADEMIC_PERMISSIONS;
    }
  });
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [mobileAiHistoryOpen, setMobileAiHistoryOpen] = useState(false);
  const [aiChatSearchQuery, setAiChatSearchQuery] = useState("");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!mobileAiHistoryOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileAiHistoryOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileAiHistoryOpen]);

  const filteredAiChats = useMemo(() => {
    if (!aiChatSearchQuery.trim()) return aiChats;
    const q = aiChatSearchQuery.trim().toLowerCase();
    return aiChats.filter((chat) => chat.title.toLowerCase().includes(q));
  }, [aiChats, aiChatSearchQuery]);

  const selectedTopicsSummary = useMemo(() => {
    if (selectedTopicIds.length === 0) return "No topics selected";
    const firstTopicId = selectedTopicIds[0];
    const firstTopic = topicById.get(firstTopicId);
    const firstSubject = firstTopic?.subjectId ? subjectById.get(firstTopic.subjectId) : null;
    const prefix = firstSubject?.name || firstTopic?.name;
    if (selectedTopicIds.length === 1) {
      return prefix || "1 topic selected";
    }
    return prefix ? `${prefix} · ${selectedTopicIds.length} topics` : `${selectedTopicIds.length} topics`;
  }, [selectedTopicIds, topicById, subjectById]);

  const formatChatDate = useCallback((dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) return "Today";
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  }, []);

  function handleSaveAiAcademicPermissions(next: AiAcademicPermissionState) {
    setAiAcademicPermissions(next);
    try {
      const key = `revit-ai-academic-context:${initialUser?.id ?? "local"}`;
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }

  async function copyMessageText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => {
        setCopiedMessageId((cur) => (cur === id ? null : cur));
      }, 2000);
    } catch {}
  }

  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = chatBodyRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
  }, []);

  const handleChatScroll = useCallback(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 90;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(distanceFromBottom > 140 && messages.length > 1);
  }, [messages.length]);

  useEffect(() => {
    if (!chatBodyRef.current) return;
    if (isNearBottomRef.current) {
      chatBodyRef.current.scrollTo({
        top: chatBodyRef.current.scrollHeight,
        behavior: "auto",
      });
    }
  }, [messages, pending]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;

    function handleVisualViewportResize() {
      if (window.innerWidth > 900) {
        setIsKeyboardOpen(false);
        document.documentElement.style.removeProperty("--ai-viewport-height");
        return;
      }
      const diff = window.innerHeight - vv.height;
      const open = diff > 120;
      setIsKeyboardOpen(open);
      if (open) {
        document.documentElement.style.setProperty("--ai-viewport-height", `${vv.height}px`);
      } else {
        document.documentElement.style.removeProperty("--ai-viewport-height");
      }
    }

    vv.addEventListener("resize", handleVisualViewportResize);
    return () => {
      vv.removeEventListener("resize", handleVisualViewportResize);
      document.documentElement.style.removeProperty("--ai-viewport-height");
    };
  }, []);
  const [profile, setProfile] = useState<LearnerProfile>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<LearnerProfile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountInitialTab, setAccountInitialTab] = useState<"profile" | "security">("profile");
  const [accountInitialStatus, setAccountInitialStatus] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [updatesModalOpen, setUpdatesModalOpen] = useState(false);
  const { readIds, unreadCount, markAllRead, toggleRead, hasNewForPopup, dismissPopup } = useSiteNotifications();
  const [profileError, setProfileError] = useState("");
  const [cloudProfile, setCloudProfile] = useState<Profile | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [customGradebooks, setCustomGradebooks] = useState<CustomGradebook[]>([]);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [exams, setExams] = useState<ExamSchedule[]>([]);
  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>([]);
  const [selectedStudyPlanId, setSelectedStudyPlanId] = useState<string | null>(null);
  const [studyPlansReady, setStudyPlansReady] = useState(false);
  const [plannerViewMode, setPlannerViewMode] = useState<PlannerViewMode>("today");
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
    theme: "system",
    leaderboard_opt_in: false,
    mtap_features_enabled: false,
    mtap_onboarding_completed: false,
  }));
  const [cloudLoading, setCloudLoading] = useState(cloudEnabled && !offlineMode);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [premiumContentLoading, setPremiumContentLoading] = useState(false);
  const [premiumContentError, setPremiumContentError] = useState("");
  const [attemptHistoryAvailable, setAttemptHistoryAvailable] = useState(!cloudEnabled || offlineMode);
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement>(FREE_ENTITLEMENT);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionPolicyReady, setSessionPolicyReady] = useState(!cloudEnabled || offlineMode);
  const [themeReady, setThemeReady] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, action?: () => void, title?: string, message?: string, confirmLabel?: string}>({ isOpen: false });
  const [recentSession, setRecentSession] = useState<SavedRecentSession | null>(null);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [planAnnouncementOpen, setPlanAnnouncementOpen] = useState(false);
  const [planAnnouncementVariant, setPlanAnnouncementVariant] = useState<PlanModalVariant>("general");
  const [pendingActivation, setPendingActivation] = useState<PendingActivationNotification | null>(null);

  function requestConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
    setConfirmConfig({ isOpen: true, title, message, confirmLabel, action: () => {
      onConfirm();
      setConfirmConfig({ isOpen: false });
    }});
  }
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("revit-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("revit-sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  };
  const attemptMigrationStarted = useRef(false);
  const answerLockedRef = useRef(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const [progression, setProgression] = useState(emptyProgression);
  const [progressionReady, setProgressionReady] = useState(false);
  const [progressionError, setProgressionError] = useState("");
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [missionsModalOpen, setMissionsModalOpen] = useState(false);
  const [progressionToasts, setProgressionToasts] = useState<ProgressionToastItem[]>([]);

  const handleMissionCompleted = useCallback((mission: Mission, xpAwarded: number) => {
    setProgressionToasts((prev) => [
      ...prev,
      {
        id: `${mission.id}-${Date.now()}`,
        type: "mission",
        title: "Mission Complete!",
        subtitle: `${mission.title} (+${xpAwarded} XP)`,
      },
    ]);
  }, []);

  const handleProgressionLevelUp = useCallback((newLevel: number, newTitle: string) => {
    setProgressionToasts((prev) => [
      ...prev,
      {
        id: `level-up-${newLevel}-${Date.now()}`,
        type: "level_up",
        title: "Level Up!",
        subtitle: `Level ${newLevel} · ${newTitle}`,
      },
    ]);
  }, []);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const progressionOwnerKey = initialUser?.id ?? "local";
  const progressMetrics = useMemo(() => {
    const currentStreak = calculateStreak(activity, dateKeyInTimeZone(new Date(), preferences.timezone));
    return {
      questionsAnswered: cloudEnabled ? activity.reduce((sum, day) => sum + day.questions_answered, 0) : attempts.length,
      aiMessages: activity.reduce((sum, day) => sum + day.review_count, 0),
      streakDays: currentStreak.longest,
      examsCreated: exams.length,
    };
  }, [activity, attempts.length, cloudEnabled, exams.length, preferences.timezone]);

  const studyProgression = useMemo(() => {
    const currentStreak = calculateStreak(activity, dateKeyInTimeZone(new Date(), preferences.timezone));
    return evaluateProgression({
      ownerKey: progressionOwnerKey,
      timezone: preferences.timezone,
      attempts,
      activity,
      reinforcement: reinforcementLevels,
      baseXp: progression.totalXp,
      currentStreak: currentStreak.current,
      longestStreak: currentStreak.longest,
      onMissionCompleted: handleMissionCompleted,
      onLevelUp: handleProgressionLevelUp,
    });
  }, [
    progressionOwnerKey,
    preferences.timezone,
    attempts,
    activity,
    reinforcementLevels,
    progression.totalXp,
    handleMissionCompleted,
    handleProgressionLevelUp,
  ]);

useEffect(() => {
  const validViews: View[] = [
    "overview",
    "library",
    "progress",
    "leaderboards",
    "weakness",
    "planner",
    "grades",
    "assistant",
  ];

  const path = window.location.pathname.replace(/^\/|\/$/g, "");

  if (path === "flashcards") {
    setLibraryMode("flashcards");
    setActiveView("library");
    window.history.replaceState(null, "", "/library");
  } else if (validViews.includes(path as View)) {
    setActiveView(path as View);
  } else {
    setActiveView("overview");
    window.history.replaceState(null, "", "/overview");
  }

  const handlePopState = () => {
    const currentPath = window.location.pathname.replace(/^\/|\/$/g, "");

    if (currentPath === "flashcards") {
      setLibraryMode("flashcards");
      setActiveView("library");
      window.history.replaceState(null, "", "/library");
    } else if (validViews.includes(currentPath as View)) {
      setActiveView(currentPath as View);
    }
  };

  window.addEventListener("popstate", handlePopState);

  return () => {
    window.removeEventListener("popstate", handlePopState);
  };
}, []);

  useEffect(() => {
    document.title = `RevIT | ${viewTitles[activeView]}`;
  }, [activeView]);

  useEffect(() => {
    if (!initialUser || offlineMode) return;
    localStorage.setItem("revit-offline-user", JSON.stringify(initialUser));
  }, [initialUser, offlineMode]);

  // Existing users login modal (Free vs Pro update) & Gifted VIP modal (for Fia, Mich, Claire)
  useEffect(() => {
    if (cloudLoading) return;
    // Strictly existing users only: skip if brand new user who hasn't finished onboarding
    if (cloudProfile && !cloudProfile.onboarding_complete) return;
    if (!preferences.mtap_onboarding_completed) return;

    const currentUserId = initialUser?.id ?? "local";
    const isGifted = GIFTED_PRO_USER_IDS.includes(currentUserId);
    const storageKey = isGifted
      ? `revit_pro_gift_modal_seen_${currentUserId}`
      : `revit_plan_announcement_seen_${currentUserId}`;

    try {
      // Check if user has already seen this announcement
      const hasSeen = localStorage.getItem(storageKey);
      if (!hasSeen) {
        setPlanAnnouncementVariant(isGifted ? "gift" : "general");
        setPlanAnnouncementOpen(true);
      }
    } catch {
      // Fallback
    }
  }, [cloudLoading, initialUser?.id, cloudProfile?.onboarding_complete, preferences.mtap_onboarding_completed]);

  const handleClosePlanAnnouncement = () => {
    setPlanAnnouncementOpen(false);
    const currentUserId = initialUser?.id ?? "local";
    const isGifted = GIFTED_PRO_USER_IDS.includes(currentUserId);
    const storageKey = isGifted
      ? `revit_pro_gift_modal_seen_${currentUserId}`
      : `revit_plan_announcement_seen_${currentUserId}`;
    try {
      localStorage.setItem(storageKey, "true");
    } catch {}
  };

  const handleAcknowledgeActivation = async () => {
    if (!pendingActivation) return;
    const notifId = pendingActivation.id;
    setPendingActivation(null);
    try {
      const client = createClient();
      await acknowledgeProActivation(client, notifId);
    } catch {}
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("account") !== "security") return;
    setAccountInitialTab("security");
    setAccountInitialStatus(params.get("google_linked") === "true"
      ? "Google is connected to this RevIT account."
      : params.has("oauth_error")
        ? "Google could not be connected. No account changes were made."
        : "");
    setProfileOpen(true);
    params.delete("account");
    params.delete("google_linked");
    params.delete("oauth_error");
    const query = params.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (query ? "?" + query : ""));
  }, []);

  useEffect(() => {
    const preferencesReady = storageReady && (!cloudEnabled || !cloudLoading);
    if (!preferencesReady || activeView !== "grades" || canAccessFeature("grades", preferences)) return;

    setActiveView("overview");
    window.history.replaceState(null, "", "/overview");
  }, [activeView, cloudEnabled, cloudLoading, preferences, storageReady]);

  useEffect(() => {
    const root = document.documentElement;
    let savedTheme: string | null = null;
    try {
      savedTheme = localStorage.getItem("revit-theme");
    } catch {
      // The head bootstrap already applied the system/default theme when storage is unavailable.
    }
    const resolvedTheme = savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : root.dataset.theme === "dark" || root.dataset.theme === "light"
        ? root.dataset.theme
        : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    setThemeReady(true);
  }, []);

  useEffect(() => {
    try {
      const attemptStorageKey = `revit-attempts-v2:${initialUser?.id ?? "local"}`;
      const scopedAttempts = localStorage.getItem(attemptStorageKey);
      let rawAttempts = scopedAttempts ? JSON.parse(scopedAttempts) : null;
      if (!scopedAttempts) {
        const legacyAttempts = JSON.parse(localStorage.getItem("revit-attempts-v1") ?? "[]");
        const legacyClaim = localStorage.getItem("revit-attempts-v1-claimed-by");
        if (!initialUser || !legacyClaim || legacyClaim === initialUser.id) {
          rawAttempts = legacyAttempts;
          if (initialUser && Array.isArray(legacyAttempts) && legacyAttempts.length) {
            localStorage.setItem("revit-attempts-v1-claimed-by", initialUser.id);
          }
        }
      }
      const savedTopics = JSON.parse(localStorage.getItem("revit-selected-topics-v1") ?? "[]") as string[];
      const savedProfile = JSON.parse(localStorage.getItem("revit-profile-v1") ?? "null") as LearnerProfile | null;
      const savedSidebarCollapsed = localStorage.getItem("revit-sidebar-collapsed") === "true";
      const savedSoundEffects = localStorage.getItem(SOUND_EFFECTS_STORAGE_KEY);
      const savedPreferences = !initialUser
        ? JSON.parse(localStorage.getItem(LOCAL_PREFERENCES_STORAGE_KEY) ?? "null") as Partial<UserPreferences> | null
        : null;
      const reinforcementKey = `revit-reinforcement-v1:${initialUser?.id ?? "local"}`;
      const savedReinforcement = JSON.parse(localStorage.getItem(reinforcementKey) ?? "{}") as ReinforcementLevels;
      setAttempts(normalizeAttempts(rawAttempts));
      if (Array.isArray(savedTopics)) {
        setSelectedTopicIds(savedTopics.filter((id) => topicById.has(id)));
      }
      if (!initialUser && savedProfile && typeof savedProfile.name === "string" && typeof savedProfile.photoDataUrl === "string") {
        const normalizedProfile = { name: savedProfile.name.trim() || DEFAULT_PROFILE.name, photoDataUrl: savedProfile.photoDataUrl };
        setProfile(normalizedProfile);
        setProfileDraft(normalizedProfile);
      }
      setSidebarCollapsed(savedSidebarCollapsed);
      setSoundEffectsEnabled(savedSoundEffects !== "false");
      if (!initialUser) {
        setPreferences(normalizeUserPreferences(
          savedPreferences,
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
        ));
      }
      if (savedReinforcement && typeof savedReinforcement === "object" && !Array.isArray(savedReinforcement)) {
        setReinforcementLevels(Object.fromEntries(Object.entries(savedReinforcement)
          .filter(([id, level]) => questionById.has(id) && Number.isInteger(level) && level > 0 && level <= 3)));
      }
    } catch {
      // Invalid local data should not block a study session.
    }
    try {
      localStorage.removeItem(RECENT_SESSION_STORAGE_KEY);
      const savedRecent = localStorage.getItem(recentSessionStorageKey(initialUser?.id));
      if (savedRecent) {
        const parsed = JSON.parse(savedRecent) as SavedRecentSession;
        if (parsed && Array.isArray(parsed.questionIds) && parsed.questionIds.length > 0
          && parsed.index < parsed.questionIds.length && questionById.has(parsed.questionIds[parsed.index])) {
          setRecentSession(parsed);
          setResumeModalOpen(true);
        } else {
          localStorage.removeItem(recentSessionStorageKey(initialUser?.id));
        }
      }
    } catch {
      // Corrupt recent session should not block app
    }
    setReinforcementReady(true);
    setStorageReady(true);
  }, [initialUser]);

  useEffect(() => {
    setStudyPlansReady(false);
    try {
      const saved = normalizeStudyPlans(JSON.parse(localStorage.getItem(studyPlansStorageKey(initialUser?.id)) ?? "[]"));
      setStudyPlans(saved);
      setSelectedStudyPlanId((current) => current && saved.some((plan) => plan.id === current) ? current : saved[0]?.id ?? null);
    } catch {
      setStudyPlans([]);
      setSelectedStudyPlanId(null);
    }
    setStudyPlansReady(true);
  }, [initialUser?.id]);

  useEffect(() => {
    if (!studyPlansReady) return;
    localStorage.setItem(studyPlansStorageKey(initialUser?.id), JSON.stringify(studyPlans));
  }, [initialUser?.id, studyPlans, studyPlansReady]);

  useEffect(() => {
    if (!storageReady || (cloudEnabled && !offlineMode)) return;
    try {
      const savedGrades = JSON.parse(localStorage.getItem("revit-grades-v1") ?? "[]") as GradeRecord[];
      const savedExams = JSON.parse(localStorage.getItem("revit-exams-v1") ?? "[]") as ExamSchedule[];
      const savedActivity = JSON.parse(localStorage.getItem("revit-activity-v1") ?? "[]") as DailyActivity[];
      if (Array.isArray(savedGrades)) setGrades(savedGrades);
      if (Array.isArray(savedExams)) setExams(savedExams);
      if (Array.isArray(savedActivity)) setActivity(mergeLocalAttemptActivity(attempts, savedActivity, preferences.timezone));
    } catch {
      setActivity(mergeLocalAttemptActivity(attempts, [], preferences.timezone));
    }
  }, [attempts, cloudEnabled, offlineMode, preferences.timezone, storageReady]);

  useEffect(() => {
    if (!storageReady || (cloudEnabled && !offlineMode)) return;
    setActivity((current) => mergeLocalAttemptActivity(attempts, current, preferences.timezone));
  }, [attempts, cloudEnabled, offlineMode, preferences.timezone, storageReady]);

  useEffect(() => {
    if (!cloudEnabled || !initialUser || offlineMode) {
      setSessionPolicyReady(true);
      return;
    }
    let policy: string | null = null;
    let rememberedUntil = 0;
    try {
      policy = localStorage.getItem("revit-session-policy");
      rememberedUntil = Number(localStorage.getItem("revit-remember-until") ?? 0);
    } catch {
      setSessionPolicyReady(true);
      return;
    }
    if ((policy === "session-only" && sessionStorage.getItem("revit-session-only") !== "active")
      || (policy === "remember" && rememberedUntil > 0 && rememberedUntil < Date.now())) {
      void createClient().auth.signOut({ scope: "local" })
        .catch(() => undefined)
        .finally(() => router.replace("/auth"));
      return;
    }
    setSessionPolicyReady(true);
  }, [cloudEnabled, initialUser, offlineMode, router]);

  useEffect(() => {
    function handleSessionExpired() {
      isSyncingRef.current = true;
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      void createClient().auth.signOut({ scope: "local" })
        .catch(() => undefined)
        .finally(() => router.replace("/auth?clear_session=true"));
    }
    window.addEventListener("revit:session_expired", handleSessionExpired);
    return () => window.removeEventListener("revit:session_expired", handleSessionExpired);
  }, [router]);

  useEffect(() => {
    if (!cloudEnabled || !initialUser || !sessionPolicyReady || offlineMode) return;
    let cancelled = false;
    async function load() {
      setCloudLoading(true); setCloudError("");
      try {
        const client = createClient();
        const snapshot = await withTimeout(loadCloudSnapshot(client, initialUser!.id), 12_000);
        if (cancelled) return;
        const fallbackName = initialUser!.username?.trim() || DEFAULT_PROFILE.name;
        const nextProfile = snapshot.profile ?? localProfileToCloud(initialUser!.id, initialUser!.username ?? `learner_${initialUser!.id.slice(0, 8)}`, fallbackName, "");
        const nextPreferences = normalizeUserPreferences(snapshot.preferences ?? preferences, preferences.timezone);
        const userEntitlement = snapshot.entitlement;
        const isGiftedUser = GIFTED_PRO_USER_IDS.includes(initialUser!.id);
        const giftedUserConfig = isGiftedUser ? GIFTED_PRO_USERS[initialUser!.id] : undefined;
        const effectiveEntitlement: SubscriptionEntitlement = isGiftedUser
          ? {
              storedPlan: "pro",
              effectivePlan: "pro",
              proStartedAt: userEntitlement.proStartedAt || new Date().toISOString(),
              proExpiresAt: giftedUserConfig?.expiresAt || "2028-12-31T23:59:59Z",
              serverNow: userEntitlement.serverNow || new Date().toISOString(),
            }
          : userEntitlement;
        setCloudProfile(nextProfile); setGrades(snapshot.grades); if (snapshot.customGradebooks) setCustomGradebooks(snapshot.customGradebooks); setActivity(snapshot.activity); setExams(snapshot.exams); setPreferences(nextPreferences); setEntitlement(effectiveEntitlement);
        if (snapshot.pendingActivation) setPendingActivation(snapshot.pendingActivation);
        setAttempts((current) => mergeAttempts(snapshot.attempts, current));
        setAttemptHistoryAvailable(snapshot.attemptHistoryAvailable);
        setReinforcementLevels((current) => ({
          ...current,
          ...Object.fromEntries(snapshot.reinforcement.map((item) => [item.question_id, item.reinforcement_level])),
        }));
        setProfile({ name: nextProfile.first_name?.trim() || DEFAULT_PROFILE.name, photoDataUrl: nextProfile.avatar_url ?? "" });
        const savedTheme = localStorage.getItem("revit-theme");
        const cloudTheme = nextPreferences.theme === "light" || nextPreferences.theme === "dark" ? nextPreferences.theme : null;
        const resolvedTheme = savedTheme === "light" || savedTheme === "dark"
          ? savedTheme
          : cloudTheme ?? (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
        document.documentElement.dataset.theme = resolvedTheme;
        document.documentElement.style.colorScheme = resolvedTheme;
        if (savedTheme !== "light" && savedTheme !== "dark" && cloudTheme) localStorage.setItem("revit-theme", cloudTheme);
        const queuedAttempts = getQueuedQuestionAttemptsCount(initialUser!.id);
        const queuedReinforcement = getQueuedQuestionReinforcementCount(initialUser!.id);
        const queuedProgress = getQueuedCloudProgressEventsCount(initialUser!.id);
        void (async () => {
          if (queuedAttempts && !trustedStudy) await flushQuestionAttemptQueue(client, initialUser!.id);
          if (queuedReinforcement && !trustedStudy) await flushQuestionReinforcementQueue(client, initialUser!.id);
          const progressionUpdate = queuedProgress && !trustedStudy
            ? await flushCloudProgressEventQueue(client, initialUser!.id) ?? await loadCloudProgression(client, initialUser!.id)
            : trustedStudy ? await loadCloudProgressionReadOnly(client, initialUser!.id)
              : await loadCloudProgression(client, initialUser!.id);
          if (cancelled) return;
          syncLocalProgressionFromCloud(progressionOwnerKey, progressionUpdate.snapshot);
          setProgression(progressionUpdate.snapshot);
          markCurrentLevelSeen(progressionOwnerKey, levelProgress(progressionUpdate.snapshot.totalXp).level);
        })().catch(() => {
          if (!cancelled) setProgressionError("Progression could not be loaded. It will retry when the connection recovers.");
        });
      } catch (error) {
        if (!cancelled) {
          if (error instanceof Error && error.message === "AUTH_SESSION_EXPIRED") {
            void createClient().auth.signOut({ scope: "local" })
              .catch(() => undefined)
              .finally(() => router.replace("/auth?clear_session=true"));
            return;
          }
          setCloudError(error instanceof Error && error.message === "Request timed out."
            ? "Cloud data took too long to respond. Please try again."
            : "Cloud data could not be loaded. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setProgressionReady(true);
          setCloudLoading(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  // Load once for the authenticated identity; local fallback data is migrated separately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, initialUser?.id, offlineMode, sessionPolicyReady, trustedStudy]);

  useEffect(() => {
    if (activeView !== "assistant" || !cloudAvailable || !initialUser || chatHistoryLoaded) return;
    let cancelled = false;

    async function loadHistory() {
      setChatHistoryLoading(true);
      setChatError("");
      try {
        const page = await loadAiChats(createClient(), initialUser!.id);
        if (cancelled) return;
        const chats = page.items;
        setAiChats(chats);
        setChatHistoryHasMore(page.hasMore);
        setActiveChatId((current) => (
          current && chats.some((chat) => chat.id === current) ? current : chats[0]?.id ?? null
        ));
        if (!chats.length) {
          setMessages([]);
          setLoadedChatId(null);
        }
      } catch {
        if (!cancelled) {
          setAiChats([]);
          setChatError("Chat history could not be loaded. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setChatHistoryLoaded(true);
          setChatHistoryLoading(false);
        }
      }
    }

    void loadHistory();
    return () => { cancelled = true; };
  }, [activeView, chatHistoryLoaded, cloudAvailable, initialUser]);

  useEffect(() => {
    if (activeView !== "assistant" || !cloudAvailable || !initialUser || !activeChatId || loadedChatId === activeChatId) return;
    let cancelled = false;

    async function loadConversation() {
      setChatMessagesLoading(true);
      setChatError("");
      try {
        const page = await loadAiMessages(createClient(), activeChatId!);
        if (cancelled) return;
        setMessages(page.items.map(({ id, role, content }) => ({ id, role, content })));
        setChatMessagesHasMore(page.hasMore);
        setLoadedChatId(activeChatId);
      } catch {
        if (!cancelled) {
          setMessages([]);
          setLoadedChatId(activeChatId);
          setChatError("This conversation could not be loaded. Please try again.");
        }
      } finally {
        if (!cancelled) setChatMessagesLoading(false);
      }
    }

    void loadConversation();
    return () => { cancelled = true; };
  }, [activeChatId, activeView, cloudAvailable, initialUser, loadedChatId]);

  useEffect(() => {
    if (trustedStudy || !cloudAvailable || !initialUser || !storageReady || cloudLoading || cloudError || !attemptHistoryAvailable) return;
    if (attemptMigrationStarted.current) return;
    attemptMigrationStarted.current = true;
    let cancelled = false;
    async function migrate() {
      try {
        const client = createClient();
        await flushQuestionAttemptQueue(client, initialUser!.id);
        await migrateLocalQuestionAttempts(client, initialUser!.id, attempts);
        await migrateLocalActivity(client, initialUser!.id, preferences.timezone, attempts, (id) => subjectById.get(id)?.name ?? id);
        if (!cancelled) setActivity((current) => mergeLocalAttemptActivity(attempts, current, preferences.timezone));
      } catch {
        attemptMigrationStarted.current = false;
      }
    }
    void migrate();
    return () => { cancelled = true; };
  }, [attemptHistoryAvailable, attempts, cloudAvailable, cloudError, cloudLoading, initialUser, preferences.timezone, storageReady, trustedStudy]);

  useEffect(() => {
    if (storageReady) localStorage.setItem(`revit-attempts-v2:${initialUser?.id ?? "local"}`, JSON.stringify(attempts));
  }, [attempts, initialUser?.id, storageReady]);

  useEffect(() => {
    if (!reinforcementReady) return;
    const reinforcementKey = `revit-reinforcement-v1:${initialUser?.id ?? "local"}`;
    localStorage.setItem(reinforcementKey, JSON.stringify(reinforcementLevels));
  }, [initialUser?.id, reinforcementLevels, reinforcementReady]);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-selected-topics-v1", JSON.stringify(selectedTopicIds));
  }, [selectedTopicIds, storageReady]);

  useEffect(() => {
    if (storageReady && !cloudEnabled) localStorage.setItem("revit-profile-v1", JSON.stringify(profile));
  }, [cloudEnabled, profile, storageReady]);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(SOUND_EFFECTS_STORAGE_KEY, String(soundEffectsEnabled));
    } catch {
      // Sound preference persistence is optional; review functionality remains available.
    }
  }, [soundEffectsEnabled, storageReady]);

  useEffect(() => {
    if (cloudEnabled) return;
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (localZone) setPreferences((current) => ({ ...current, timezone: localZone }));
  }, [cloudEnabled]);

  useEffect(() => {
    if (!storageReady || (cloudEnabled && !offlineMode)) return;
    localStorage.setItem(LOCAL_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [cloudEnabled, offlineMode, preferences, storageReady]);

  useEffect(() => {
    if (!storageReady || cloudEnabled) return;
    localStorage.setItem("revit-grades-v1", JSON.stringify(grades));
  }, [cloudEnabled, grades, storageReady]);

  useEffect(() => {
    if (!storageReady || cloudEnabled) return;
    localStorage.setItem("revit-exams-v1", JSON.stringify(exams));
  }, [cloudEnabled, exams, storageReady]);

  useEffect(() => {
    if (!storageReady || (cloudEnabled && !offlineMode)) return;
    localStorage.setItem("revit-activity-v1", JSON.stringify(activity));
  }, [activity, cloudEnabled, offlineMode, storageReady]);

  useEffect(() => {
    if (!storageReady || (cloudEnabled && !offlineMode)) return;
    const update = loadLocalProgression(progressionOwnerKey, progressMetrics);
    if (!progressionReady) {
      setProgression(update.snapshot);
      markCurrentLevelSeen(progressionOwnerKey, levelProgress(update.snapshot.totalXp).level);
      setProgressionReady(true);
      return;
    }
    applyProgressionUpdate(update);
  // Metrics are the existing local sources of truth; progression changes are applied inside this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, offlineMode, progressMetrics, progressionOwnerKey, storageReady]);

  useEffect(() => {
    const ready = themeReady
      && sessionPolicyReady
      && storageReady
      && studyPlansReady
      && progressionReady
      && (!cloudEnabled || offlineMode || !cloudLoading);
    if (!ready) return;
    const frame = window.requestAnimationFrame(() => setIsInitializing(false));
    return () => window.cancelAnimationFrame(frame);
  }, [cloudEnabled, cloudLoading, offlineMode, progressionReady, sessionPolicyReady, storageReady, studyPlansReady, themeReady]);


  // Auto-open updates modal once per login when new updates exist
  useEffect(() => {
    if (isInitializing || !hasNewForPopup) return;
    setUpdatesModalOpen(true);
  }, [isInitializing, hasNewForPopup]);

  useEffect(() => {
    if (levelUp === null) return;
    const timeout = window.setTimeout(() => setLevelUp(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [levelUp]);

  const handleFlashcardReviewingChange = useCallback((reviewing: boolean, topics?: string[]) => {
    setIsFlashcardReviewing(reviewing);
    setActiveFlashcardTopics(topics ?? []);
  }, []);

  const proActive = isProActive(entitlement);

  useEffect(() => {
    if (!proActive || !entitlement.proExpiresAt || !entitlement.serverNow) return;
    const expiresAt = Date.parse(entitlement.proExpiresAt);
    const checkedAt = Date.parse(entitlement.serverNow);
    if (!Number.isFinite(expiresAt) || !Number.isFinite(checkedAt)) return;

    const clientExpiry = Date.now() + Math.max(0, expiresAt - checkedAt);
    let timeout: number | undefined;
    const expireWhenDue = () => {
      const remaining = clientExpiry - Date.now();
      if (remaining > 0) {
        timeout = window.setTimeout(expireWhenDue, Math.min(remaining, 2_147_483_647));
        return;
      }
      clearCiullaReviewerCache();
      clearRodakReviewerCache();
      clearStrasingerReviewerCache();
      setEntitlement((current) => ({ ...current, effectivePlan: "free" }));
    };
    expireWhenDue();
    return () => { if (timeout !== undefined) window.clearTimeout(timeout); };
  }, [entitlement.proExpiresAt, entitlement.serverNow, proActive]);

  useEffect(() => {
    if (!proActive || !cloudEnabled || offlineMode) {
      setReviewerContent({
        subjects: freeSubjects,
        topics: freeTopics,
        questions: freeQuestions,
      });
      setPremiumContentLoading(false);
      setPremiumContentError("");
      return;
    }
    let cancelled = false;
    setPremiumContentLoading(true);
    setPremiumContentError("");
    void Promise.all([fetchCiullaReviewer(), fetchRodakReviewer(), fetchStrasingerReviewer()]).then(([ciullaResult, rodakResult, strasingerResult]) => {
      if (cancelled) return;
      const extraSubjects: Subject[] = [];
      const extraTopics: Topic[] = [];
      const extraQuestions: ReviewerQuestion[] = [];

      if (ciullaResult.status === "success") {
        extraSubjects.push(...ciullaResult.data.subjects);
        extraTopics.push(...ciullaResult.data.topics);
        extraQuestions.push(...ciullaResult.data.questions);
      }
      if (rodakResult.status === "success") {
        extraSubjects.push(...rodakResult.data.subjects);
        extraTopics.push(...rodakResult.data.topics);
        extraQuestions.push(...rodakResult.data.questions);
      }
      if (strasingerResult.status === "success") {
        extraSubjects.push(...strasingerResult.data.subjects);
        extraTopics.push(...strasingerResult.data.topics);
        extraQuestions.push(...strasingerResult.data.questions);
      }

      if (extraQuestions.length > 0) {
        setReviewerContent({
          subjects: [...freeSubjects, ...extraSubjects],
          topics: [...freeTopics, ...extraTopics],
          questions: [...freeQuestions, ...extraQuestions],
        });
      } else {
        setPremiumContentError(
          ciullaResult.status === "pro_required" || rodakResult.status === "pro_required" || strasingerResult.status === "pro_required"
            ? "Your Pro entitlement could not be verified. Refresh and try again."
            : "The Pro reviewer library could not be loaded. Please try again."
        );
      }
    }).finally(() => { if (!cancelled) setPremiumContentLoading(false); });
    return () => { cancelled = true; };
  }, [cloudEnabled, offlineMode, proActive]);

  const allAvailableSubjects = useMemo(() => {
    const base = proActive ? subjects : [...freeSubjects, ...ciullaPreviewSubjects, ...rodakPreviewSubjects, ...strasingerPreviewSubjects];
    const map = new Map<string, Subject>();
    for (const s of base) map.set(s.id, s);
    return Array.from(map.values());
  }, [proActive, subjects]);

  const allAvailableTopics = useMemo(() => {
    const base = proActive ? topics : [...freeTopics, ...ciullaPreviewTopics, ...rodakPreviewTopics, ...strasingerPreviewTopics];
    const map = new Map<string, Topic>();
    for (const t of base) map.set(t.id, t);
    return Array.from(map.values());
  }, [proActive, topics]);

  useEffect(() => {
    const validIds = new Set(allAvailableTopics.filter((t) => canAccessQuestionBank(t.book ?? "Harr", entitlement)).map((t) => t.id));
    setSelectedTopicIds((current) => current.filter((id) => validIds.has(id)));
  }, [allAvailableTopics, entitlement]);

  useEffect(() => {
    if (proActive || progressBook === "Harr") return;
    setProgressBook("Harr");
  }, [proActive, progressBook]);

  const selectedQuestions = useMemo(
    () => questions.filter((question) => selectedTopicIds.includes(question.topicId)),
    [selectedTopicIds, questions],
  );

  const questionPerformance = useMemo<QuestionPerformance>(() => {
    const performance: QuestionPerformance = {};
    for (const attempt of attempts) {
      const current = performance[attempt.questionId] ?? { correct: 0, wrong: 0 };
      performance[attempt.questionId] = {
        correct: current.correct + (attempt.correct ? 1 : 0),
        wrong: current.wrong + (attempt.correct ? 0 : 1),
      };
    }
    return performance;
  }, [attempts]);

  const wrongQuestionIds = useMemo(() => {
    const latestAttempts = new Map<string, Attempt>();
    for (const attempt of attempts) {
      const current = latestAttempts.get(attempt.questionId);
      if (!current || attempt.timestamp >= current.timestamp) latestAttempts.set(attempt.questionId, attempt);
    }
    return new Set([...latestAttempts.values()].filter((attempt) => !attempt.correct).map((attempt) => attempt.questionId));
  }, [attempts]);

  const currentBookSubjects = useMemo(() => {
    return getUnifiedSubjects(selectedBook, allAvailableSubjects, allAvailableTopics);
  }, [selectedBook, allAvailableSubjects, allAvailableTopics]);

  const currentBookTopics = useMemo(() => {
    if (selectedBook === "all") return allAvailableTopics;
    return allAvailableTopics.filter((topic) => (topic.book ?? "Harr") === selectedBook);
  }, [selectedBook, allAvailableTopics]);

  const wrongTopicIds = useMemo(() => {
    const activeTopicIds = new Set(allAvailableTopics.map((topic) => topic.id));
    return [...new Set(questions.filter((question) => wrongQuestionIds.has(question.id) && activeTopicIds.has(question.topicId)).map((question) => question.topicId))];
  }, [allAvailableTopics, questions, wrongQuestionIds]);

  const sessionQuestions = useMemo(
    () => wrongAnswersOnly
      ? selectedQuestions.filter((question) => wrongQuestionIds.has(question.id))
      : selectedQuestions,
    [selectedQuestions, wrongAnswersOnly, wrongQuestionIds],
  );

  const libraryUnifiedSubjects = useMemo(() => {
    return getUnifiedSubjects("all", allAvailableSubjects, allAvailableTopics);
  }, [allAvailableSubjects, allAvailableTopics]);

  const visibleLibrarySubjects = useMemo(
    () => filterSubjectsBySearch(libraryUnifiedSubjects, allAvailableTopics, subjectSearch),
    [libraryUnifiedSubjects, allAvailableTopics, subjectSearch],
  );

  const librarySubjectSections = useMemo(
    () => buildSubjectSections(visibleLibrarySubjects, preferences.mtap_features_enabled),
    [preferences.mtap_features_enabled, visibleLibrarySubjects],
  );

  const visibleSubjects = useMemo(
    () => filterSubjectsBySearch(currentBookSubjects, currentBookTopics, subjectSearch),
    [currentBookSubjects, currentBookTopics, subjectSearch],
  );

  const progressSubjects = useMemo(() => {
    return getUnifiedSubjects(progressBook, subjects, topics);
  }, [progressBook]);

  const availableBooks: ReviewerBook[] = useMemo(() => {
    const set = new Set<ReviewerBook>();
    for (const s of allAvailableSubjects) {
      if (s.book) set.add(s.book);
    }
    for (const t of allAvailableTopics) {
      if (t.book) set.add(t.book);
    }
    const arr = Array.from(set);
    return arr.length > 0 ? arr : ["Harr", "Ciulla", "Rodak", "Strasinger"];
  }, [allAvailableSubjects, allAvailableTopics]);

  const progressTopics = useMemo(() => {
    if (progressBook === "all") return topics;
    return topics.filter((t) => t.book === progressBook);
  }, [progressBook]);

  const visibleProgressSubjects = useMemo(
    () => filterSubjectsBySearch(progressSubjects, progressTopics, progressSearch),
    [progressSubjects, progressTopics, progressSearch],
  );

  const subjectSections = useMemo(
    () => buildSubjectSections(visibleSubjects, preferences.mtap_features_enabled),
    [preferences.mtap_features_enabled, visibleSubjects],
  );

  const overviewSubjects = useMemo(() => {
    return getUnifiedSubjects("all", allAvailableSubjects, allAvailableTopics);
  }, [allAvailableSubjects, allAvailableTopics]);

  const progressAttempts = useMemo(() => {
    if (progressBook === "all") return attempts;
    const validTopicIds = new Set(progressTopics.map((t) => t.id));
    return attempts.filter((a) => validTopicIds.has(a.topicId));
  }, [attempts, progressBook, progressTopics]);

  const progressTopicStats = useMemo(() => progressTopics.map((topic) => {
    const topicAttempts = progressAttempts.filter((attempt) => attempt.topicId === topic.id);
    const correct = topicAttempts.filter((attempt) => attempt.correct).length;
    return {
      ...topic,
      attempts: topicAttempts.length,
      correct,
      accuracy: percent(correct, topicAttempts.length),
    };
  }), [progressAttempts, progressTopics]);

  const progressOverallCorrect = progressAttempts.filter((attempt) => attempt.correct).length;
  const progressOverallAccuracy = percent(progressOverallCorrect, progressAttempts.length);
  const progressSubjectStats = useMemo(() => {
    const grouped = new Map<string, { attempts: number; correct: number }>();
    for (const attempt of progressAttempts) {
      const current = grouped.get(attempt.subjectName) ?? { attempts: 0, correct: 0 };
      current.attempts += 1;
      current.correct += attempt.correct ? 1 : 0;
      grouped.set(attempt.subjectName, current);
    }
    return [...grouped.entries()].map(([name, value]) => ({ name, ...value, accuracy: percent(value.correct, value.attempts) }));
  }, [progressAttempts]);
  const progressPracticedTopics = progressTopicStats.filter((topic) => topic.attempts > 0);
  const progressStrongestTopic = [...progressPracticedTopics].sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)[0];
  const progressWeakestTopic = [...progressPracticedTopics].sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)[0];

  const topicStats = useMemo(() => topics.map((topic) => {
    const topicAttempts = attempts.filter((attempt) => attempt.topicId === topic.id);
    const correct = topicAttempts.filter((attempt) => attempt.correct).length;
    return {
      ...topic,
      attempts: topicAttempts.length,
      correct,
      accuracy: percent(correct, topicAttempts.length),
    };
  }), [attempts]);

  const overallCorrect = attempts.filter((attempt) => attempt.correct).length;
  const overallAccuracy = percent(overallCorrect, attempts.length);
  const practicedTopics = topicStats.filter((topic) => topic.attempts > 0);
  const topicsLeft = Math.max(0, topics.length - practicedTopics.length);
  const weakestTopic = [...practicedTopics].sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)[0];
  const weakestTopicSubject = weakestTopic ? (subjectById.get(weakestTopic.subjectId)?.name ?? "Clinical Subject") : "Clinical Subject";
  const upNextTopic = useMemo(() => {
    const remaining = [...practicedTopics].filter((t) => t.id !== weakestTopic?.id).sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
    if (remaining.length > 0) return remaining[0];
    return topicStats.find((t) => t.id !== weakestTopic?.id) ?? null;
  }, [practicedTopics, topicStats, weakestTopic]);
  const currentQuestion = questionById.get(sessionQuestionIds[sessionIndex]);
  const currentChoiceOrder = currentQuestion
    ? currentQuestion.matching || currentQuestion.choiceTable || currentQuestion.disableShuffle
      ? currentQuestion.choices.map((_, index) => index)
      : (() => {
          const saved = sessionChoiceOrders[`${sessionIndex}:${currentQuestion.id}`]
            || sessionChoiceOrders[currentQuestion.id];
          if (saved && saved.length === currentQuestion.choices.length && saved.every((idx) => idx >= 0 && idx < currentQuestion.choices.length)) {
            return saved;
          }
          return currentQuestion.choices.map((_, index) => index);
        })()
    : [];
  const currentAnswerCorrect = currentQuestion ? isQuestionAnswerCorrect(currentQuestion, selectedChoice) : false;
  const sessionComplete = sessionQuestionIds.length > 0 && sessionIndex >= sessionQuestionIds.length;
  const sessionRequiresFullCoverage = !sessionStrictWrongOnly && sessionTargetCount > 0 && sessionTargetCount === sessionPoolIds.length;
  const sessionHasUnseenQuestions = sessionRequiresFullCoverage
    && sessionPoolIds.some((id) => !sessionQuestionIds.includes(id));
  const sessionWrongCount = sessionAttempts.filter((attempt) => !attempt.correct).length;
  const sessionDynamicTarget = sessionStrictWrongOnly
    ? sessionTargetCount
    : Math.max(sessionTargetCount + sessionWrongCount, sessionQuestionIds.length);
  const sessionCanFinish = sessionStrictWrongOnly
    ? sessionQuestionIds.length > 0 && sessionAttempts.length >= sessionQuestionIds.length
    : sessionAttempts.length >= sessionDynamicTarget && !sessionHasUnseenQuestions;
  const sessionUniqueQuestionCount = new Set(sessionQuestionIds).size;
  const sessionProgressCount = Math.min(sessionIndex + 1, sessionDynamicTarget);

  const remainingUnansweredInQueue = Math.max(0, sessionQuestionIds.length - sessionAttempts.length);
  const hasUnseenAdaptiveQuestions = !sessionStrictWrongOnly
    && (sessionDynamicTarget > sessionQuestionIds.length || sessionHasUnseenQuestions);
  const totalUnansweredRemaining = remainingUnansweredInQueue + (hasUnseenAdaptiveQuestions ? 1 : 0);
  const canSkipCurrentQuestion = !answerRevealed && totalUnansweredRemaining > 1;

  function toggleTopic(topicId: string) {
    const topic = allAvailableTopics.find((t) => t.id === topicId);
    if (!topic || !canAccessQuestionBank(topic.book ?? "Harr", entitlement)) {
      setPlanAnnouncementOpen(true);
      return;
    }
    setSelectedTopicIds((current) => current.includes(topicId)
      ? current.filter((id) => id !== topicId)
      : [...current, topicId]);
  }

  function toggleSubject(subjectId: string, topicIdsOverride?: string[]) {
    const candidateTopicIds = topicIdsOverride ?? allAvailableTopics.filter((topic) => topic.subjectId === subjectId).map((topic) => topic.id);
    const accessibleTopicIds = candidateTopicIds.filter((id) => {
      const topic = allAvailableTopics.find((t) => t.id === id);
      return topic ? canAccessQuestionBank(topic.book ?? "Harr", entitlement) : false;
    });
    if (!accessibleTopicIds.length) {
      setPlanAnnouncementOpen(true);
      return;
    }
    setSelectedTopicIds((current) => accessibleTopicIds.every((id) => current.includes(id))
      ? current.filter((id) => !accessibleTopicIds.includes(id))
      : [...new Set([...current, ...accessibleTopicIds])]);
  }

  function toggleSubjectExpanded(subjectId: string) {
    setExpandedSubjectIds((current) =>
      current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId],
    );
  }

  function toggleBookEditionExpanded(subjectId: string, book: ReviewerBook) {
    const key = `${subjectId}:${book}`;
    setExpandedBookEditionKeys((current) =>
      current.includes(key)
        ? current.filter((id) => id !== key)
        : [...current, key],
    );
  }

  function handleBookChange(newBook: ReviewerBook | "all") {
    setSelectedBook(newBook);
    try {
      localStorage.setItem("revit-selected-book-v1", newBook);
    } catch {}
  }

  function selectAllWrongAnswers() {
    setSelectedTopicIds(wrongTopicIds);
    setWrongAnswersOnly(true);
  }

  function beginAdaptiveSession(
    poolIds: string[],
    targetCount: number,
    mode: ReviewMode,
    timerConfig: ReviewTimerConfig = TIMER_DISABLED,
  ) {
    if (!poolIds.length) return;
    clearRecentSession();
    answerLockedRef.current = false;
    if (soundEffectsEnabled) void unlockReviewSounds();

    const target = Math.min(targetCount, poolIds.length);
    const initialQuestionIds: string[] = [];
    for (let i = 0; i < target; i++) {
      const nextId = chooseAdaptiveQuestion(
        poolIds,
        reinforcementLevels,
        initialQuestionIds,
        Math.random,
        questionPerformance,
      );
      if (nextId && !initialQuestionIds.includes(nextId)) {
        initialQuestionIds.push(nextId);
      } else {
        const remaining = poolIds.filter((id) => !initialQuestionIds.includes(id));
        if (remaining.length > 0) {
          initialQuestionIds.push(remaining[Math.floor(Math.random() * remaining.length)]);
        } else {
          break;
        }
      }
    }
    if (!initialQuestionIds.length) return;

    setSessionPoolIds(poolIds);
    setSessionTargetCount(initialQuestionIds.length);
    setSessionQuestionIds(initialQuestionIds);
    setSessionSkippedIds([]);

    const initialOrders: Record<string, number[]> = {};
    initialQuestionIds.forEach((qId, index) => {
      const q = questionById.get(qId);
      const choiceCount = q?.choices?.length ?? 4;
      const shouldShuffle = !q?.disableShuffle && !q?.matching && !q?.choiceTable;
      const order = shouldShuffle
        ? shuffled(Array.from({ length: choiceCount }, (_, i) => i))
        : Array.from({ length: choiceCount }, (_, i) => i);
      initialOrders[`${index}:${qId}`] = order;
      initialOrders[qId] = order;
    });
    setSessionChoiceOrders(initialOrders);
    setSessionStrictWrongOnly(false);
    setSessionMode(mode);
    const localSessionId = crypto.randomUUID();
    setSessionId(localSessionId);
    void trustedStudy?.startSession({ localSessionId, mode, questionIds: poolIds, targetCount: initialQuestionIds.length });
    setSessionIndex(0);
    setSessionAttempts([]);
    setSelectedChoice(null);
    setMatchingSelections([]);
    setAnswerRevealed(false);
    setTimedOut(false);
    setActiveTimer(timerConfig);
  }

  function beginStrictSession(
    poolIds: string[],
    mode: ReviewMode,
    limit = poolIds.length,
    timerConfig: ReviewTimerConfig = TIMER_DISABLED,
  ) {
    const strictQuestionIds = shuffled(poolIds).slice(0, Math.min(limit, poolIds.length));
    if (!strictQuestionIds.length) return;
    clearRecentSession();
    answerLockedRef.current = false;
    if (soundEffectsEnabled) void unlockReviewSounds();
    setSessionPoolIds(strictQuestionIds);
    setSessionTargetCount(strictQuestionIds.length);
    setSessionQuestionIds(strictQuestionIds);
    setSessionSkippedIds([]);
    const initialOrders: Record<string, number[]> = {};
    strictQuestionIds.forEach((questionId, index) => {
      const q = questionById.get(questionId);
      const choiceCount = q?.choices?.length ?? 4;
      const shouldShuffle = !q?.disableShuffle && !q?.matching && !q?.choiceTable;
      const order = shouldShuffle
        ? shuffled(Array.from({ length: choiceCount }, (_, i) => i))
        : Array.from({ length: choiceCount }, (_, i) => i);
      initialOrders[`${index}:${questionId}`] = order;
      initialOrders[questionId] = order;
    });
    setSessionChoiceOrders(initialOrders);
    setSessionStrictWrongOnly(true);
    setSessionMode(mode);
    const localSessionId = crypto.randomUUID();
    setSessionId(localSessionId);
    void trustedStudy?.startSession({ localSessionId, mode, questionIds: strictQuestionIds, targetCount: strictQuestionIds.length });
    setSessionIndex(0);
    setSessionAttempts([]);
    setSelectedChoice(null);
    setMatchingSelections([]);
    setAnswerRevealed(false);
    setTimedOut(false);
    setActiveTimer(timerConfig);
  }

  function startSession() {
    if (!sessionQuestions.length) return;
    const limit = sessionSize === "all" ? sessionQuestions.length : Number(sessionSize);
    const poolIds = sessionQuestions.map((question) => question.id);
    const targetCount = Math.min(limit, poolIds.length);
    const timerConfig = { enabled: timerEnabled, duration: timerDuration };
    if (wrongAnswersOnly) {
      beginStrictSession(poolIds, "wrong_answers", targetCount, timerConfig);
      return;
    }
    beginAdaptiveSession(poolIds, targetCount, "adaptive", timerConfig);
  }

  function clearRecentSession() {
    try {
      localStorage.removeItem(recentSessionStorageKey(initialUser?.id));
    } catch {}
    setRecentSession(null);
  }

  function timeoutSession() {
    if (!currentQuestion || sessionQuestionIds.length === 0) return;

    const currentTopic = topicById.get(currentQuestion.topicId);
    const currentSubject = subjectById.get(currentQuestion.subjectId);

    const saved: SavedRecentSession = {
      id: sessionId ?? crypto.randomUUID(),
      poolIds: sessionPoolIds,
      targetCount: sessionTargetCount,
      questionIds: sessionQuestionIds,
      choiceOrders: sessionChoiceOrders,
      strictWrongOnly: sessionStrictWrongOnly,
      sessionMode,
      index: sessionIndex,
      attempts: sessionAttempts,
      activeTimer,
      selectedTopicIds,
      wrongAnswersOnly,
      book: selectedBook,
      pausedAt: new Date().toISOString(),
      primaryTopicName: currentTopic?.name || "Review Session",
      subjectName: currentSubject?.name || "Review Library",
      skippedIds: sessionSkippedIds,
    };

    try {
      localStorage.setItem(recentSessionStorageKey(initialUser?.id), JSON.stringify(saved));
      setRecentSession(saved);
    } catch {}

    answerLockedRef.current = true;
    setSessionPoolIds([]);
    setSessionTargetCount(0);
    setSessionQuestionIds([]);
    setSessionChoiceOrders({});
    setSessionSkippedIds([]);
    setSessionStrictWrongOnly(false);
    setSessionMode("reviewer");
    setSessionId(null);
    setSessionIndex(0);
    setSessionAttempts([]);
    setSelectedChoice(null);
    setMatchingSelections([]);
    setAnswerRevealed(false);
    setTimedOut(false);
    setActiveTimer(TIMER_DISABLED);
  }

  useEffect(() => {
    if (!recentSession || cloudLoading) return;
    const hasUnauthorizedQuestions = recentSession.questionIds.some((id) => {
      const q = questionById.get(id);
      return q && !canAccessQuestionBank(q.book ?? "Harr", entitlement);
    });
    if (hasUnauthorizedQuestions) {
      clearRecentSession();
      setResumeModalOpen(false);
    }
  }, [recentSession, cloudLoading, entitlement, questionById]);

  function continueRecentSession() {
    const sessionToResume = recentSession;
    if (!sessionToResume) return;

    const hasUnauthorizedQuestions = sessionToResume.questionIds.some((id) => {
      const q = questionById.get(id);
      return q && !canAccessQuestionBank(q.book ?? "Harr", entitlement);
    });
    if (hasUnauthorizedQuestions) {
      clearRecentSession();
      setResumeModalOpen(false);
      setPlanAnnouncementOpen(true);
      return;
    }

    setLibraryMode("mcqs");
    if (sessionToResume.selectedTopicIds) {
      setSelectedTopicIds(sessionToResume.selectedTopicIds);
    }
    if (sessionToResume.wrongAnswersOnly !== undefined) {
      setWrongAnswersOnly(sessionToResume.wrongAnswersOnly);
    }
    if (sessionToResume.book) {
      setSelectedBook(sessionToResume.book);
    }

    setSessionId(sessionToResume.id);
    setSessionPoolIds(sessionToResume.poolIds);
    setSessionTargetCount(sessionToResume.targetCount);
    setSessionQuestionIds(sessionToResume.questionIds);
    setSessionChoiceOrders(sessionToResume.choiceOrders);
    setSessionSkippedIds(sessionToResume.skippedIds ?? []);
    setSessionStrictWrongOnly(sessionToResume.strictWrongOnly);
    setSessionMode(sessionToResume.sessionMode);
    setSessionIndex(sessionToResume.index);
    setSessionAttempts(sessionToResume.attempts);
    setSelectedChoice(null);
    setMatchingSelections([]);
    setAnswerRevealed(false);
    setTimedOut(false);
    setActiveTimer(sessionToResume.activeTimer || TIMER_DISABLED);
    answerLockedRef.current = false;

    setResumeModalOpen(false);
    setActiveView("library");
    window.history.pushState(null, "", "/library");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function discardRecentSession() {
    clearRecentSession();
    setResumeModalOpen(false);
  }

  function leaveSession(force?: boolean | import("react").MouseEvent) {
    const shouldForce = force === true;
    if (!shouldForce && !sessionComplete && sessionQuestionIds.length > 0) {
      if (sessionAttempts.length > 0) {
        requestConfirm(
          "Exit review session?",
          "Your answered questions are saved. Would you like to exit early and view your results?",
          "Yes, view results",
          () => {
            clearRecentSession();
            if (sessionId) {
              recordProgressOnlyEvent(`study-session:${sessionId}`, "study_session_completed", XP_REWARDS.COMPLETE_STUDY_SESSION);
            }
            scheduleBatchedCloudSync(true);
            const answeredIds = sessionQuestionIds.slice(0, sessionAttempts.length);
            setSessionQuestionIds(answeredIds.length > 0 ? answeredIds : sessionQuestionIds.slice(0, 1));
            setSessionIndex(sessionAttempts.length);
            setSessionSkippedIds([]);
            setSelectedChoice(null);
            setMatchingSelections([]);
            setAnswerRevealed(false);
            setTimedOut(false);
            setActiveTimer(TIMER_DISABLED);
          },
        );
      } else {
        requestConfirm(
          "Exit review session?",
          "Are you sure you want to exit? You have not answered any questions yet.",
          "Exit session",
          () => leaveSession(true),
        );
      }
      return false;
    }
    clearRecentSession();
    scheduleBatchedCloudSync(true);
    answerLockedRef.current = true;
    setSessionPoolIds([]);
    setSessionTargetCount(0);
    setSessionQuestionIds([]);
    setSessionChoiceOrders({});
    setSessionSkippedIds([]);
    setSessionStrictWrongOnly(false);
    setSessionMode("reviewer");
    setSessionId(null);
    setSessionIndex(0);
    setSessionAttempts([]);
    setSelectedChoice(null);
    setMatchingSelections([]);
    setAnswerRevealed(false);
    setTimedOut(false);
    setActiveTimer(TIMER_DISABLED);
    return true;
  }

  function changeLibraryMode(mode: ReviewLibraryMode) {
    if (mode === libraryMode) return;
    if (sessionQuestionIds.length) leaveSession();
    setLibraryMode(mode);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function practiceWeakTopic(topic: TopicMastery) {
    setLibraryMode("mcqs");
    const poolIds = buildWeakTopicQuestionPool(topic.topicId, questions, attempts);
    if (!poolIds.length) {
      setSelectedTopicIds([topic.topicId]);
      setWrongAnswersOnly(false);
      openView("library");
      return;
    }
    setSelectedTopicIds([topic.topicId]);
    setWrongAnswersOnly(false);
    beginAdaptiveSession(poolIds, Math.min(10, poolIds.length), "weakness_focus");
    openView("library");
  }

  function startRecommendedReview() {
    if (!weakestTopic) {
      openView("library");
      return;
    }
    const poolIds = buildWeakTopicQuestionPool(weakestTopic.id, questions, attempts);
    setSelectedTopicIds([weakestTopic.id]);
    setWrongAnswersOnly(false);
    if (poolIds.length > 0) {
      beginAdaptiveSession(poolIds, Math.min(15, poolIds.length), "weakness_focus");
    }
    openView("library");
  }

  function viewTopicMistakes(topic: TopicMastery) {
    setLibraryMode("mcqs");
    const mistakeIds = questions
      .filter((question) => question.topicId === topic.topicId && wrongQuestionIds.has(question.id))
      .map((question) => question.id);
    setSelectedTopicIds([topic.topicId]);
    setWrongAnswersOnly(true);
    if (mistakeIds.length) beginStrictSession(mistakeIds, "wrong_answers");
    openView("library");
  }

  function reviewTopicWithAi(topic: TopicMastery) {
    setSelectedTopicIds([topic.topicId]);
    setDraft(`Help me review ${topic.topicName} in ${topic.subjectName}. My RevIT mastery is ${topic.mastery ?? "not yet reliable"}% based on ${topic.uniqueQuestions} unique questions. Focus on likely misconceptions and give me a concise study plan without changing or inventing these statistics.`);
    openView("assistant");
  }

  const applyProgressionUpdate = useCallback((update: ProgressionUpdate) => {
    const previousLevel = levelProgress(progression.totalXp).level;
    const nextLevel = levelProgress(update.snapshot.totalXp).level;
    setProgression(update.snapshot);
    setProgressionError("");
    if (progressionReady && nextLevel > previousLevel && shouldShowLevelUp(progressionOwnerKey, nextLevel)) {
      setLevelUp(nextLevel);
    }
  }, [progression.totalXp, progressionOwnerKey, progressionReady]);

  const flushBatchedCloudSync = useCallback(async () => {
    if (!cloudAvailable || !initialUser || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setCloudSyncing(true);
    try {
      if (trustedStudy) { await trustedStudy.flush(); return; }
      const client = createClient();
      await flushQuestionAttemptQueue(client, initialUser.id);
      await flushQuestionReinforcementQueue(client, initialUser.id);
      const update = await flushCloudProgressEventQueue(client, initialUser.id);
      if (update) {
        syncLocalProgressionFromCloud(progressionOwnerKey, update.snapshot);
        applyProgressionUpdate(update);
      }
    } catch {
      // Kept in queue for next flush or reconnect
    } finally {
      isSyncingRef.current = false;
      setCloudSyncing(false);
    }
  }, [applyProgressionUpdate, cloudAvailable, initialUser, progressionOwnerKey, trustedStudy]);

  const scheduleBatchedCloudSync = useCallback((immediate = false) => {
    if (!cloudAvailable || !initialUser) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (immediate) {
      void flushBatchedCloudSync();
      return;
    }
    syncTimerRef.current = setTimeout(() => {
      void flushBatchedCloudSync();
    }, 4000);
  }, [cloudAvailable, flushBatchedCloudSync, initialUser]);

  useEffect(() => {
    if (cloudAvailable) scheduleBatchedCloudSync(true);
  }, [cloudAvailable, scheduleBatchedCloudSync]);

  useEffect(() => {
    if (sessionComplete) {
      const hasStrasinger = sessionQuestionIds.some((id) => questionById.get(id)?.book === "Strasinger");
      if (!hasStrasinger || STRASINGER_CLOUD_SYNC_ENABLED) {
        scheduleBatchedCloudSync(true);
      }
    }
  }, [sessionComplete, sessionQuestionIds, questionById, scheduleBatchedCloudSync]);

  function persistProgressEvents(
    events: ProgressEvent[],
    metrics = progressMetrics,
    immediate = false,
  ) {
    try {
      const update = recordLocalProgressEvents(progressionOwnerKey, events, metrics);
      applyProgressionUpdate(update);
      if (cloudEnabled && initialUser) {
        if (trustedStudy) { scheduleBatchedCloudSync(immediate); return; }
        queueCloudProgressEvents(initialUser.id, events);
        const queuedCount = getQueuedQuestionAttemptsCount(initialUser.id);
        if (immediate || queuedCount >= 5) {
          scheduleBatchedCloudSync(true);
        } else {
          scheduleBatchedCloudSync(false);
        }
      }
    } catch {
      if (cloudEnabled && initialUser && !trustedStudy) queueCloudProgressEvents(initialUser.id, events);
      setProgressionError("Progression is queued and will sync when the connection recovers.");
    }
  }

  function recordStudyEvent(input: {
    eventKey: string;
    eventType: ProgressEvent["eventType"];
    questions?: number;
    correct?: number;
    reviews?: number;
    subjectId?: string;
    subjectName?: string;
  }, xp = 0, extraEvents: Array<{ eventKey: string; eventType: ProgressEvent["eventType"]; xp: number }> = []) {
    const activityDate = dateKeyInTimeZone(new Date(), preferences.timezone);
    const nextActivity = activityAfterEvent(activity, activityDate, {
      ...input,
      subject: input.subjectName,
    });
    setActivity(nextActivity);
    const nextMetrics = {
      ...progressMetrics,
      questionsAnswered: progressMetrics.questionsAnswered + (input.questions ?? 0),
      aiMessages: progressMetrics.aiMessages + (input.reviews ?? 0),
      streakDays: calculateStreak(nextActivity, activityDate).longest,
    };
    const events: ProgressEvent[] = [
      { ...input, activityDate, xp },
      ...extraEvents.map((event) => ({ ...event, activityDate })),
    ];
    if ((input.questions ?? 0) > 0 || (input.reviews ?? 0) > 0) {
      events.push({ eventKey: `xp:daily-streak:${activityDate}`, eventType: "daily_streak", activityDate, xp: XP_REWARDS.DAILY_STREAK });
    }
    persistProgressEvents(events, nextMetrics);
  }

  function recordProgressOnlyEvent(eventKey: string, eventType: ProgressEvent["eventType"], xp: number, metrics = progressMetrics) {
    persistProgressEvents([{ eventKey, eventType, xp, activityDate: dateKeyInTimeZone(new Date(), preferences.timezone) }], metrics, true);
  }

  function completeQuestion(selectedAnswer: number | null, didTimeOut = false) {
    if (!currentQuestion || answerRevealed || answerLockedRef.current) return;
    if (selectedAnswer === null && !didTimeOut) return;
    answerLockedRef.current = true;
    const existingQuestionAttempts = attempts.filter((item) => item.questionId === currentQuestion.id);
    const topic = topicById.get(currentQuestion.topicId);
    const subject = subjectById.get(currentQuestion.subjectId);
    const currentReinforcementLevel = reinforcementLevels[currentQuestion.id] ?? 0;
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      questionId: currentQuestion.id,
      topicId: currentQuestion.topicId,
      subjectId: currentQuestion.subjectId,
      topicName: topic?.name ?? "Uncategorized",
      subjectName: subject?.name ?? "Uncategorized",
      subtopic: currentQuestion.subtopic ?? "Uncategorized",
      difficulty: normalizedDifficulty(currentQuestion.difficulty),
      selectedAnswer,
      correct: isQuestionAnswerCorrect(currentQuestion, selectedAnswer),
      attemptNumber: existingQuestionAttempts.length + 1,
      reviewMode: sessionMode,
      sessionId,
      isAdaptiveRepeat: existingQuestionAttempts.length > 0 || currentReinforcementLevel > 0,
      timestamp: new Date().toISOString(),
    };
    setAttempts((current) => [...current, attempt]);
    setSessionAttempts((current) => [...current, attempt]);
    const nextReinforcementLevel = reinforcementLevelAfterAnswer(
      currentReinforcementLevel,
      attempt.correct,
    );
    setReinforcementLevels((current) => reinforcementAfterAnswer(current, currentQuestion.id, attempt.correct));
    const isStrasingerSyncBlocked = currentQuestion.book === "Strasinger" && !STRASINGER_CLOUD_SYNC_ENABLED;
    if (trustedStudy && sessionId) trustedStudy.recordAttempt(sessionId, {
      id: attempt.id, questionId: attempt.questionId, selectedAnswer, didTimeOut,
      matchingSelections: currentQuestion.matching && !didTimeOut ? matchingSelections : undefined,
    }, currentQuestion);
    if (!trustedStudy && cloudEnabled && initialUser && (!attempt.correct || currentReinforcementLevel > 0) && !isStrasingerSyncBlocked) {
      queueQuestionReinforcement(initialUser.id, currentQuestion.id, nextReinforcementLevel);
    }
    if (!trustedStudy && cloudEnabled && initialUser && !isStrasingerSyncBlocked) {
      queueQuestionAttempt(initialUser.id, attempt);
    }
    setSelectedChoice(selectedAnswer);
    setTimedOut(didTimeOut);
    setAnswerRevealed(true);
    if (soundEffectsEnabled) {
      void playReviewSound(didTimeOut ? "timeout" : attempt.correct ? "correct" : "incorrect");
    }
    if (!isStrasingerSyncBlocked) {
      recordStudyEvent({
        eventKey: `answer:${attempt.id}`,
        eventType: "question_answered",
        questions: 1,
        correct: attempt.correct ? 1 : 0,
        subjectId: attempt.subjectId,
        subjectName: subjectById.get(attempt.subjectId)?.name ?? attempt.subjectId,
      }, attempt.correct ? XP_REWARDS.CORRECT_QUESTION : 0);
    }
  }

  function submitAnswer() {
    if (currentQuestion?.matching) {
      if (matchingSelections.length !== currentQuestion.matching.items.length || matchingSelections.some((answer) => answer < 0)) return;
      completeQuestion(encodeMatchingAnswers(matchingSelections, currentQuestion.choices.length));
      return;
    }
    completeQuestion(selectedChoice);
  }

  function handleQuestionTimeout() {
    completeQuestion(null, true);
  }

  function nextQuestion() {
    answerLockedRef.current = false;
    setTimedOut(false);
    const isStrasingerSyncBlocked = currentQuestion?.book === "Strasinger" && !STRASINGER_CLOUD_SYNC_ENABLED;
    if (sessionStrictWrongOnly) {
      if (sessionCanFinish && sessionId && !isStrasingerSyncBlocked) {
        if (trustedStudy) void trustedStudy.completeSession(sessionId);
        recordProgressOnlyEvent(`study-session:${sessionId}`, "study_session_completed", XP_REWARDS.COMPLETE_STUDY_SESSION);
      }
      setSessionIndex((current) => current + 1);
      setSelectedChoice(null);
      setMatchingSelections([]);
      setAnswerRevealed(false);
      if (!isStrasingerSyncBlocked) scheduleBatchedCloudSync(true);
      return;
    }
    if (sessionCanFinish) {
      if (sessionId && !isStrasingerSyncBlocked) {
        if (trustedStudy) void trustedStudy.completeSession(sessionId);
        recordProgressOnlyEvent(`study-session:${sessionId}`, "study_session_completed", XP_REWARDS.COMPLETE_STUDY_SESSION);
      }
      setSessionIndex((current) => current + 1);
      setSelectedChoice(null);
      setMatchingSelections([]);
      setAnswerRevealed(false);
      if (!isStrasingerSyncBlocked) scheduleBatchedCloudSync(true);
      return;
    }

    if (sessionIndex + 1 < sessionQuestionIds.length) {
      setSessionIndex((current) => current + 1);
      setSelectedChoice(null);
      setMatchingSelections([]);
      setAnswerRevealed(false);
      if (!isStrasingerSyncBlocked) scheduleBatchedCloudSync(true);
      return;
    }

    const nextQuestionId = chooseAdaptiveQuestion(sessionPoolIds, reinforcementLevels, sessionQuestionIds, Math.random, questionPerformance);
    if (!nextQuestionId) {
      if (sessionId && !isStrasingerSyncBlocked) {
        if (trustedStudy) void trustedStudy.completeSession(sessionId);
        recordProgressOnlyEvent(`study-session:${sessionId}`, "study_session_completed", XP_REWARDS.COMPLETE_STUDY_SESSION);
      }
      setSessionIndex((current) => current + 1);
      setSelectedChoice(null);
      setMatchingSelections([]);
      setAnswerRevealed(false);
      if (!isStrasingerSyncBlocked) scheduleBatchedCloudSync(true);
      return;
    }
    const nextIndex = sessionQuestionIds.length;
    const nextQ = questionById.get(nextQuestionId);
    const nextChoiceCount = nextQ?.choices?.length ?? 4;
    const shouldShuffleNext = !nextQ?.disableShuffle && !nextQ?.matching && !nextQ?.choiceTable;
    const nextOrder = shouldShuffleNext
      ? shuffled(Array.from({ length: nextChoiceCount }, (_, i) => i))
      : Array.from({ length: nextChoiceCount }, (_, i) => i);
    setSessionQuestionIds((current) => [...current, nextQuestionId]);
    setSessionChoiceOrders((current) => ({
      ...current,
      [`${nextIndex}:${nextQuestionId}`]: nextOrder,
      [nextQuestionId]: nextOrder,
    }));
    setSessionIndex(nextIndex);
    setSelectedChoice(null);
    setMatchingSelections([]);
    setAnswerRevealed(false);
  }

  function skipQuestion() {
    if (!currentQuestion || answerRevealed || !canSkipCurrentQuestion) return;

    const skippedId = currentQuestion.id;
    setSessionSkippedIds((current) => current.includes(skippedId) ? current : [...current, skippedId]);

    const nextIds = [...sessionQuestionIds];
    const [removed] = nextIds.splice(sessionIndex, 1);

    if (!sessionStrictWrongOnly && nextIds.length < sessionDynamicTarget) {
      const nextQuestionId = chooseAdaptiveQuestion(
        sessionPoolIds,
        reinforcementLevels,
        [...nextIds, removed],
        Math.random,
        questionPerformance,
      );
      if (nextQuestionId && !nextIds.includes(nextQuestionId) && nextQuestionId !== removed) {
        const nextQ = questionById.get(nextQuestionId);
        const nextChoiceCount = nextQ?.choices?.length ?? 4;
        const shouldShuffleNext = !nextQ?.disableShuffle && !nextQ?.matching && !nextQ?.choiceTable;
        const nextOrder = shouldShuffleNext
          ? shuffled(Array.from({ length: nextChoiceCount }, (_, i) => i))
          : Array.from({ length: nextChoiceCount }, (_, i) => i);

        nextIds.push(nextQuestionId);
        setSessionChoiceOrders((current) => ({
          ...current,
          [nextQuestionId]: nextOrder,
          [`${nextIds.length - 1}:${nextQuestionId}`]: nextOrder,
        }));
      }
    }

    nextIds.push(removed);

    setSessionChoiceOrders((current) => {
      const updated = { ...current };
      nextIds.forEach((id, idx) => {
        const existing = updated[id] || updated[`${idx}:${id}`];
        if (existing) {
          updated[`${idx}:${id}`] = existing;
          updated[id] = existing;
        }
      });
      return updated;
    });

    setSessionQuestionIds(nextIds);
    setSelectedChoice(null);
    setMatchingSelections([]);
    setAnswerRevealed(false);
    setTimedOut(false);
    answerLockedRef.current = false;
  }

  function openView(view: View) {
    const tabOrder: View[] = ["overview", "library", "progress", "leaderboards", "weakness", "planner", "grades", "assistant"];
    const currIdx = tabOrder.indexOf(activeView);
    const nextIdx = tabOrder.indexOf(view);
    if (currIdx !== -1 && nextIdx !== -1) {
      setViewDirection(nextIdx >= currIdx ? 1 : -1);
    }
    if (view !== "library" && activeView === "library") {
      const isReviewing = (libraryMode === "mcqs" && sessionQuestionIds.length > 0) || (libraryMode === "flashcards" && isFlashcardReviewing);
      if (isReviewing) {
        requestConfirm("Leave review session?", "Your answered questions are saved. Are you sure you want to leave this session?", "Leave session", () => {
          if (libraryMode === "mcqs" && sessionQuestionIds.length > 0) leaveSession(true);
          setActiveView(view);
          window.history.pushState(null, "", `/${view}`);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
        return;
      }
      if (libraryMode === "mcqs" && sessionQuestionIds.length > 0) leaveSession(true);
    }
    setActiveView(view);
    window.history.pushState(null, "", `/${view}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openStudyPlanner(planId?: string) {
    if (planId) {
      setSelectedStudyPlanId(planId);
      setPlannerViewMode("plans");
    } else {
      setPlannerViewMode("today");
    }
    openView("planner");
  }

  function openPlannerCalendar() {
    setPlannerViewMode("calendar");
    openView("planner");
  }

  function openNavigationView(view: View) {
    openView(view);
  }

  function openProfileEditor() {
    if (cloudEnabled && !cloudAvailable) {
      setCloudError("Account settings need an internet connection.");
      return;
    }
    setProfileDraft(profile);
    setProfileError("");
    setAccountInitialTab("profile");
    setAccountInitialStatus("");
    setProfileOpen(true);
  }

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    localStorage.setItem("revit-theme", nextTheme);
    setPreferences((current) => ({ ...current, theme: nextTheme }));
    if (cloudAvailable && initialUser) {
      void savePreferences(createClient(), initialUser.id, { ...preferences, theme: nextTheme })
        .catch(() => setCloudError("Theme changed locally; cloud preference sync needs retry."));
    }
  }

  async function updateMtapFeatures(enabled: boolean) {
    const previousPreferences = preferences;
    const nextPreferences = withMtapFeaturePreference(preferences, enabled);
    setPreferences(nextPreferences);

    try {
      if (cloudEnabled && initialUser) {
        const saved = await savePreferences(createClient(), initialUser.id, nextPreferences);
        setPreferences(normalizeUserPreferences(saved, nextPreferences.timezone));
        return;
      }

      localStorage.setItem(LOCAL_PREFERENCES_STORAGE_KEY, JSON.stringify(nextPreferences));
    } catch (error) {
      setPreferences(previousPreferences);
      throw error;
    }
  }

  async function updateLeaderboardOptIn(enabled: boolean) {
    const previousPreferences = preferences;
    const nextPreferences = { ...preferences, leaderboard_opt_in: enabled };
    setPreferences(nextPreferences);

    try {
      if (cloudEnabled && initialUser) {
        const saved = await savePreferences(createClient(), initialUser.id, nextPreferences);
        setPreferences(normalizeUserPreferences(saved, nextPreferences.timezone));
        return;
      }

      localStorage.setItem(LOCAL_PREFERENCES_STORAGE_KEY, JSON.stringify(nextPreferences));
    } catch (error) {
      setPreferences(previousPreferences);
      throw error;
    }
  }

  async function chooseProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await validateAvatarFile(file);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Choose a valid image smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileDraft((current) => ({ ...current, photoDataUrl: reader.result as string }));
        setProfileError("");
      }
    };
    reader.onerror = () => setProfileError("That image could not be read. Please try another file.");
    reader.readAsDataURL(file);
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = profileDraft.name.trim();
    if (!name) {
      setProfileError("Enter a display name.");
      return;
    }
    setProfile({ name, photoDataUrl: profileDraft.photoDataUrl });
    setProfileOpen(false);
  }

  function moveChatToTop(chatId: string, changes: Partial<AiChat> = {}) {
    setAiChats((current) => {
      const existing = current.find((chat) => chat.id === chatId);
      if (!existing) return current;
      const updated = { ...existing, ...changes, updated_at: changes.updated_at ?? new Date().toISOString() };
      return [updated, ...current.filter((chat) => chat.id !== chatId)];
    });
  }

  async function startNewChat() {
    if (pending || chatActionPending) return;
    if (!online) return setChatError("RevIT AI needs an internet connection.");
    setChatError("");
    setDraft("");

    if (!cloudEnabled || !initialUser) {
      setActiveChatId(null);
      setLoadedChatId(null);
      setMessages([]);
      setChatMessagesHasMore(false);
      return;
    }

    setChatActionPending(true);
    try {
      const chat = await createAiChat(createClient(), initialUser.id);
      setAiChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setActiveChatId(chat.id);
      setLoadedChatId(chat.id);
      setMessages([]);
      setChatMessagesHasMore(false);
    } catch {
      setChatError("A new chat could not be created. Please try again.");
    } finally {
      setChatActionPending(false);
    }
  }

  function openAiChat(chatId: string) {
    if (pending || chatActionPending || chatId === activeChatId) return;
    setChatError("");
    setMessages([]);
    setChatMessagesHasMore(false);
    setLoadedChatId(null);
    setActiveChatId(chatId);
  }

  async function loadOlderChats() {
    if (!cloudEnabled || !initialUser || chatHistoryLoadingMore || !chatHistoryHasMore) return;
    setChatHistoryLoadingMore(true);
    try {
      const page = await loadAiChats(createClient(), initialUser.id, aiChats.length);
      setAiChats((current) => {
        const existing = new Set(current.map((chat) => chat.id));
        return [...current, ...page.items.filter((chat) => !existing.has(chat.id))];
      });
      setChatHistoryHasMore(page.hasMore);
    } catch {
      setChatError("Older conversations could not be loaded. Please try again.");
    } finally {
      setChatHistoryLoadingMore(false);
    }
  }

  async function loadOlderMessages() {
    if (!activeChatId || chatMessagesLoadingMore || !chatMessagesHasMore) return;
    setChatMessagesLoadingMore(true);
    const scrollEl = chatBodyRef.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;
    const prevTop = scrollEl?.scrollTop ?? 0;
    try {
      const page = await loadAiMessages(createClient(), activeChatId, messages.length);
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [
          ...page.items.filter((message) => !existing.has(message.id)).map(({ id, role, content }) => ({ id, role, content })),
          ...current,
        ];
      });
      setChatMessagesHasMore(page.hasMore);
      requestAnimationFrame(() => {
        if (scrollEl) {
          const newHeight = scrollEl.scrollHeight;
          scrollEl.scrollTop = prevTop + (newHeight - prevHeight);
        }
      });
    } catch {
      setChatError("Older messages could not be loaded. Please try again.");
    } finally {
      setChatMessagesLoadingMore(false);
    }
  }

  async function removeAiChat(chat: AiChat) {
    if (!cloudAvailable || !initialUser || pending || chatActionPending) return;
    
    requestConfirm("Delete conversation?", `Delete “${chat.title}”? This conversation cannot be recovered.`, "Delete", async () => {
      setChatActionPending(true);
      setChatError("");
      try {
        await deleteAiChat(createClient(), initialUser.id, chat.id);
        const remaining = aiChats.filter((item) => item.id !== chat.id);
        setAiChats(remaining);
        if (activeChatId === chat.id) {
          const nextChatId = remaining[0]?.id ?? null;
          setMessages([]);
          setChatMessagesHasMore(false);
          setLoadedChatId(null);
          setActiveChatId(nextChatId);
        }
      } catch {
        setChatError("The conversation could not be deleted. Please try again.");
      } finally {
        setChatActionPending(false);
      }
    });
  }

  async function ask(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || pending || chatActionPending || chatMessagesLoading) return;
    if (!online) return setChatError("RevIT AI needs an internet connection.");
    let userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanQuestion,
    };
    setDraft("");
    setPending(true);
    setChatError("");

    const client = cloudEnabled && initialUser ? createClient() : null;
    let persistedChatId = activeChatId;
    let canPersistAssistant = false;

    if (client && initialUser) {
      try {
        if (!persistedChatId) {
          const createdChat = await createAiChat(client, initialUser.id, chatTitleFromFirstMessage(cleanQuestion));
          persistedChatId = createdChat.id;
          setAiChats((current) => [createdChat, ...current.filter((chat) => chat.id !== createdChat.id)]);
          setActiveChatId(createdChat.id);
          setLoadedChatId(createdChat.id);
        }

        const storedUserMessage = await saveAiMessage(client, persistedChatId, "user", cleanQuestion);
        userMessage = { id: storedUserMessage.id, role: storedUserMessage.role, content: storedUserMessage.content };
        canPersistAssistant = true;

        const currentChat = aiChats.find((chat) => chat.id === persistedChatId);
        if (currentChat?.title === "New chat") {
          try {
            const titledChat = await updateAiChatTitle(
              client,
              initialUser.id,
              persistedChatId,
              chatTitleFromFirstMessage(cleanQuestion),
            );
            moveChatToTop(persistedChatId, titledChat);
          } catch {
            moveChatToTop(persistedChatId);
            setChatError("The conversation is saved, but its title could not be updated.");
          }
        } else {
          moveChatToTop(persistedChatId);
        }
      } catch {
        setChatError("This question could not be saved to chat history. You can continue in this tab.");
      }
    }

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    scrollToBottom(true);

    try {
      const outboundMessages: { role: "user" | "assistant"; content: string }[] = [];
      for (let i = nextMessages.length - 1; i >= 0; i--) {
        const msg = nextMessages[i];
        if (msg.role !== "user" && msg.role !== "assistant") continue;
        const clean = msg.content.trim();
        if (!clean) continue;
        if (outboundMessages.length === 0) {
          if (msg.role === "user") outboundMessages.unshift({ role: "user", content: clean });
        } else {
          const expected = outboundMessages[0].role === "user" ? "assistant" : "user";
          if (msg.role === expected) outboundMessages.unshift({ role: msg.role, content: clean });
        }
        if (outboundMessages.length >= 11) break;
      }
      while (outboundMessages.length > 0 && outboundMessages[0].role !== "user") {
        outboundMessages.shift();
      }

      const academicContext = buildVerifiedAcademicContext({
        permissions: aiAcademicPermissions,
        userQuery: cleanQuestion,
        grades,
        customGradebooks,
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: outboundMessages.length > 0 ? outboundMessages : [{ role: "user", content: cleanQuestion }],
          ...(academicContext ? { academicContext } : {}),
        }),
      });
      const dailyLimitHeader = Number(response.headers.get("X-RateLimit-Limit-Day"));
      const dailyRemainingHeader = Number(response.headers.get("X-RateLimit-Remaining-Day"));
      if (Number.isInteger(dailyLimitHeader) && Number.isInteger(dailyRemainingHeader)) {
        setAiDailyUsed(Math.max(0, dailyLimitHeader - dailyRemainingHeader));
      }
      let data: {
        answer?: string;
        citations?: string[];
        grounded?: boolean;
        mode?: "live" | "demo";
        provider?: "Groq";
        error?: string;
      };
      try {
        data = await response.json() as typeof data;
      } catch {
        throw new Error("The assistant could not answer right now. Please try again.");
      }
      if (!response.ok || !data.answer) throw new Error(data.error || "The assistant could not answer right now.");
      let assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer!,
        citations: data.citations,
        grounded: data.grounded,
        mode: data.mode,
        provider: data.provider,
      };

      if (client && persistedChatId && canPersistAssistant) {
        try {
          const storedAssistantMessage = await saveAiMessage(client, persistedChatId, "assistant", data.answer);
          assistantMessage = { ...assistantMessage, id: storedAssistantMessage.id };
          moveChatToTop(persistedChatId);
        } catch {
          setChatError("The answer is visible, but it could not be saved. Please try again later.");
        }
      }

      setMessages((current) => [...current, assistantMessage]);
      void recordStudyEvent(
        { eventKey: `ai-review:${userMessage.id}`, eventType: "ai_review", reviews: 1, subjectName: "MedTech AI" },
        0,
        [{ eventKey: "xp:first-ai-message", eventType: "first_ai_message", xp: XP_REWARDS.FIRST_AI_MESSAGE }],
      );
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: error instanceof Error ? error.message : "The assistant could not answer right now. Please try again.",
      }]);
    } finally {
      setPending(false);
    }
  }

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  async function persistGrade(record: GradeRecord) {
    if (cloudEnabled && !cloudAvailable) return setCloudError("Grade changes need an internet connection.");
    if (cloudEnabled && initialUser) {
      const saved = await saveCloudGrade(createClient(), initialUser.id, record);
      setGrades((current) => [...current.filter((item) => item.subject !== saved.subject), saved]);
    } else setGrades((current) => [...current.filter((item) => item.subject !== record.subject), record]);
  }

  async function persistExam(exam: Omit<ExamSchedule, "id"> & { id?: string }) {
    if (cloudEnabled && !cloudAvailable) return setCloudError("Exam changes need an internet connection.");
    const isFirstExam = exams.length === 0 && !exam.id;
    if (cloudEnabled && initialUser) {
      const saved = await saveCloudExam(createClient(), initialUser.id, exam);
      setExams((current) => [...current.filter((item) => item.id !== saved.id && !(item.subject === saved.subject && item.assessment_type === saved.assessment_type)), saved].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)));
    } else {
      const saved = { ...exam, id: exam.id ?? crypto.randomUUID() } as ExamSchedule;
      setExams((current) => [...current.filter((item) => item.id !== saved.id && !(item.subject === saved.subject && item.assessment_type === saved.assessment_type)), saved].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)));
    }
    if (isFirstExam) {
      await recordProgressOnlyEvent("xp:first-exam", "first_exam", XP_REWARDS.FIRST_EXAM, { ...progressMetrics, examsCreated: 1 });
    }
  }

  async function removeExam(id: string) {
    if (cloudEnabled && !cloudAvailable) return setCloudError("Exam changes need an internet connection.");
    if (cloudEnabled && initialUser) await deleteCloudExam(createClient(), initialUser.id, id);
    setExams((current) => current.filter((exam) => exam.id !== id));
  }

  if (isInitializing) return <RevITLoadingScreen />;

  if (cloudEnabled && !offlineMode && !hasCurrentLegalConsent(cloudProfile)) {
    return (
      <LegalConsentGate
        profile={cloudProfile}
        loadError={cloudError}
        onAccepted={(acceptedProfile) => {
          setCloudProfile(acceptedProfile);
          setCloudError("");
        }}
      />
    );
  }

  const baseHeading = viewCopy[activeView];
  const todayKey = dateKeyInTimeZone(new Date(), preferences.timezone);
  const streak = calculateStreak(activity, todayKey);
  const firstName = cloudProfile?.first_name || profile.name.split(/\s+/)[0] || "Learner";
  const gradesEnabled = canAccessFeature("grades", preferences);
  const gradeSimulatorEnabled = canAccessFeature("gradeSimulator", preferences);
  const availableNavItems = navItems.filter((item) => item.id !== "grades" || gradesEnabled);
  const heading = activeView === "overview" ? {
    ...baseHeading,
    eyebrow: "STUDY OVERVIEW",
    title: `${greetingFor(new Date(), preferences.timezone)}, ${firstName}`,
    description: "Ready to continue your review?",
  } : activeView === "grades" && gradeSimulatorEnabled ? {
    ...baseHeading,
    title: "Grades & Simulator",
    description: preferences.mtap_features_enabled
      ? "Record assessments by subject and use deterministic calculations calibrated for NU MOA Students to review weighted results and possible outcomes."
      : "Record assessments by subject and use deterministic calculations to review weighted results and possible outcomes.",
  } : baseHeading;
  const selectedTopicNames = selectedTopicIds.map((id) => topicById.get(id)?.name).filter(Boolean);
  const profileInitials = (cloudProfile?.first_name || profile.name).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R";
  const activeAvatarUrl = cloudProfile?.avatar_url || profile.photoDataUrl;
  const avatarStyle = activeAvatarUrl ? { backgroundImage: `url(${JSON.stringify(activeAvatarUrl)})` } : undefined;
  const accountProfile = cloudProfile ?? (initialUser
    ? localProfileToCloud(initialUser.id, initialUser.username ?? `learner_${initialUser.id.slice(0, 8)}`, initialUser.username?.trim() || DEFAULT_PROFILE.name, "")
    : null);
  const activeAiChat = aiChats.find((chat) => chat.id === activeChatId) ?? null;
  const chatBusy = pending || chatActionPending || chatMessagesLoading;
  const currentLevel = levelProgress(studyProgression.totalXp);
  const isReviewSessionActive = (libraryMode === "mcqs" && sessionQuestionIds.length > 0) || (libraryMode === "flashcards" && isFlashcardReviewing);
  const currentSessionTopicIds = libraryMode === "mcqs" ? selectedTopicIds : activeFlashcardTopics;
  const currentSessionTopicNames = currentSessionTopicIds.map((id) => topicById.get(id)?.name).filter((name): name is string => Boolean(name));
  const currentSessionSubjects = Array.from(new Set(currentSessionTopicIds.map((id) => topicById.get(id)?.subjectId).filter((id): id is string => Boolean(id)).map((id) => subjectById.get(id)?.name).filter((name): name is string => Boolean(name))));
  const pendingSyncCount = initialUser ? getQueuedQuestionAttemptsCount(initialUser.id)
    + getQueuedQuestionReinforcementCount(initialUser.id)
    + getQueuedCloudProgressEventsCount(initialUser.id) : 0;

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${activeView === "library" && isReviewSessionActive && !sessionComplete ? "study-session-active" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-heading">
          <div className="sidebar-brand-row">
            <button className="brand brand-button" type="button" onClick={() => openNavigationView("overview")} aria-label="RevIT home">
              <RevITLogo />
            </button>
            <SidebarTooltip label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} disabled={!sidebarCollapsed}>
              <button
                className="sidebar-toggle"
                type="button"
                onClick={toggleSidebar}
                aria-expanded={!sidebarCollapsed}
                aria-label={sidebarCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
              >
                <span className="sidebar-toggle-icon" aria-hidden="true">{sidebarCollapsed ? "☰" : "«"}</span>
              </button>
            </SidebarTooltip>
          </div>
        </div>
        <nav aria-label="Primary navigation">
          {availableNavItems.map((item) => {
            const tooltipLabel = item.id === "planner"
              ? "Planner"
              : item.id === "weakness" && !proActive
                ? "Weakness Analytics · PRO"
                : item.label;

            return (
              <SidebarTooltip
                key={item.id}
                label={tooltipLabel}
                disabled={!sidebarCollapsed}
              >
                <button
                  className={`nav-link ${activeView === item.id ? "active" : ""}`}
                  type="button"
                  onClick={() => openNavigationView(item.id)}
                  aria-current={activeView === item.id ? "page" : undefined}
                  aria-label={item.label}
                >
                  {activeView === item.id && (
                    <motion.span
                      layoutId="sidebarActiveCutout"
                      className="sidebar-active-cutout"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className={`nav-icon ${item.id === "assistant" ? "nav-icon-ai" : ""}`} aria-hidden="true">
                    <Image src={item.icon} alt="" width={512} height={512} unoptimized />
                  </span>
                  <span className="nav-label">
                    {item.id === "planner" ? "Planner" : item.label}
                    {item.id === "weakness" && !proActive && (
                      <span style={{ marginLeft: "6px", fontSize: "9px", fontWeight: 800, color: "var(--green)", verticalAlign: "middle" }}>PRO</span>
                    )}
                  </span>
                </button>
              </SidebarTooltip>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-utility-list" role="toolbar" aria-label="Quick utilities">
            {/* 1. Appearance */}
            <div className="sidebar-tooltip-wrapper">
              <SidebarTooltip label="Appearance" disabled={!sidebarCollapsed}>
                <button
                  className="sidebar-utility-item"
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle light and dark mode"
                >
                  <span className="sidebar-utility-icon" aria-hidden="true">
                    <svg className="light-symbol" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                    <svg className="dark-symbol" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  </span>
                  <span className="sidebar-utility-text">
                    <strong>Appearance</strong>
                    <small>Light / dark</small>
                  </span>
                </button>
              </SidebarTooltip>
            </div>

            {/* 2. Send Feedback */}
            <div className="sidebar-tooltip-wrapper">
              <SidebarTooltip label="Send Feedback" disabled={!sidebarCollapsed}>
                <button
                  className="sidebar-utility-item"
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  disabled={!online}
                  aria-label="Send Feedback"
                >
                  <span className="sidebar-utility-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <span className="sidebar-utility-text">
                    <strong>Send Feedback</strong>
                    <small>Bug reports &amp; ideas</small>
                  </span>
                </button>
              </SidebarTooltip>
            </div>

            {/* 3. Pro Subscription / Upgrade to Pro */}
            <div className="sidebar-tooltip-wrapper">
              <SidebarTooltip label={proActive ? "RevIT Pro" : "Upgrade to RevIT Pro"} disabled={!sidebarCollapsed}>
                <Link className="sidebar-support" href="/pricing" aria-label={proActive ? "RevIT Pro (Active)" : "Upgrade to RevIT Pro"}>
                  <span className="sidebar-support-frog sidebar-utility-icon" aria-hidden="true">
                    <Image
                      src="/icons/neu/support.png"
                      alt=""
                      width={20}
                      height={20}
                      unoptimized
                      style={{ width: "20px", height: "20px", borderRadius: "5px", objectFit: "cover" }}
                    />
                  </span>
                  <span className="sidebar-utility-text">
                    <strong>{proActive ? "RevIT Pro" : "Upgrade to Pro"}</strong>
                    <small>{proActive ? "Active" : "Contact us to subscribe"}</small>
                  </span>
                </Link>
              </SidebarTooltip>
            </div>
          </div>

          {/* 4. Profile Card (Anchor of Sidebar) */}
          <div className="sidebar-tooltip-wrapper profile-tooltip-wrap">
            <SidebarTooltip label={`Profile & Security (Level ${currentLevel.level})`} disabled={!sidebarCollapsed}>
              <div className="profile-card">
                <button className="profile" type="button" onClick={openProfileEditor} aria-label="Customize learner profile">
                  <span className={`avatar ${activeAvatarUrl ? "has-photo" : ""}`} style={avatarStyle}>{activeAvatarUrl ? "" : profileInitials}</span>
                  <span className="profile-copy"><strong>{cloudProfile?.first_name || profile.name}</strong><small>{cloudEnabled ? "Profile & security" : "Customize name and photo"}</small></span>
                </button>
              </div>
            </SidebarTooltip>
          </div>
        </div>
      </aside>

      <section className={`workspace ${activeView === "assistant" ? "assistant-mode" : ""} ${isComposerFocused ? "composer-focused" : ""} ${isKeyboardOpen ? "keyboard-active" : ""}`}>
        <header className="mobile-header">
          <button className="brand brand-button" type="button" onClick={() => openView("overview")} aria-label="RevIT home">
            <RevITLogo />
          </button>
          <div className="mobile-header-right">
            {activeView === "overview" && (
              <SiteNotificationTrigger className="mobile-header-notification" size="compact" unreadCount={unreadCount} onClick={() => setUpdatesModalOpen(true)} />
            )}
            <button className="theme-toggle mobile-theme-toggle" type="button" onClick={toggleTheme} aria-label="Toggle light and dark mode">
              <svg className="light-symbol" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <svg className="dark-symbol" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
            <button className={`avatar mobile-profile ${activeAvatarUrl ? "has-photo" : ""}`} style={avatarStyle} type="button" onClick={openProfileEditor} aria-label="Customize learner profile">
              {activeAvatarUrl ? "" : profileInitials}
            </button>
          </div>
        </header>

        {activeView !== "assistant" && (
          <div className={`page-heading ${isReviewSessionActive ? "session-active-heading" : ""}`}>
            <div className="page-heading-content">
              <p className="eyebrow">{heading.eyebrow}</p>
              <h1 className={activeView === "overview" ? "overview-greeting" : undefined}>{heading.title}</h1>
              <p>{heading.description}</p>
            </div>
            <div className="heading-actions" style={isReviewSessionActive ? { flex: 1, justifyContent: "flex-end", flexWrap: "wrap", minWidth: 0 } : undefined}>
              {activeView === "overview" && (
                <div className="overview-header-group">
                  <SiteNotificationTrigger
                    className="desktop-only-updates"
                    unreadCount={unreadCount}
                    onClick={() => setUpdatesModalOpen(true)}
                  />
                  <ProgressionSummaryCard
                    progression={studyProgression}
                    onOpenMissions={() => setMissionsModalOpen(true)}
                  />
                </div>
              )}
              {activeView === "library" && !isReviewSessionActive && recentSession && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    className="continue-recent-session-button"
                    type="button"
                    onClick={continueRecentSession}
                    title={`Continue ${recentSession.primaryTopicName} (${recentSession.index + 1}/${recentSession.targetCount})`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Continue recent session</span>
                    <span className="continue-session-badge">
                      {recentSession.index + 1}/{recentSession.targetCount}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {!online && <div className="sync-banner local" role="status"><span>Offline mode: progress saves on this device and syncs automatically when you reconnect.{pendingSyncCount ? ` ${pendingSyncCount} update${pendingSyncCount === 1 ? "" : "s"} waiting.` : ""}</span></div>}
        {online && cloudSyncing && <div className="sync-banner" role="status">Syncing saved offline progress…</div>}
        {cloudLoading && <div className="sync-banner">Loading your cloud workspace…</div>}
        {cloudError && <div className="sync-banner error" role="status"><span>{cloudError}</span><button type="button" onClick={() => window.location.reload()}>Retry</button></div>}
        {progressionError && <div className="sync-banner error" role="status"><span>{progressionError}</span><button type="button" onClick={() => window.location.reload()}>Retry</button></div>}
        {!cloudEnabled && <div className="sync-banner local"><span>Local mode: reviewer data stays on this device until Supabase is connected.</span><a href="/auth">Connect account</a></div>}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeView}
            className="view-transition-container"
            initial={{ opacity: 0, y: viewDirection * 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: viewDirection * -32 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            drag={isReviewSessionActive || activeView === "assistant" ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_e, { offset, velocity }) => {
              if (Math.abs(offset.x) > 60 && Math.abs(velocity.x) > 0.15) {
                const primaryTabs: View[] = ["overview", "library", "progress", "leaderboards"];
                const currIdx = primaryTabs.indexOf(activeView);
                if (currIdx !== -1) {
                  if (offset.x < 0 && currIdx < primaryTabs.length - 1) {
                    openView(primaryTabs[currIdx + 1]);
                  } else if (offset.x > 0 && currIdx > 0) {
                    openView(primaryTabs[currIdx - 1]);
                  }
                }
              }
            }}
          >
            {activeView === "overview" && (
          <div className="content-grid">
            <div className="dashboard-column">
              {/* Row 1: Today's Schedule & Study Activity */}
              <div className="overview-activity-schedule-grid">
                <TodayStudyPlan
                  plans={studyPlans}
                  todayKey={todayKey}
                  timeZone={preferences.timezone}
                  onOpenPlanner={openStudyPlanner}
                  onStartReview={startRecommendedReview}
                />

                <StudyActivityHeatmap
                  activity={activity}
                  todayKey={todayKey}
                  timeZone={preferences.timezone}
                  streak={streak}
                  onViewFullCalendar={openPlannerCalendar}
                />
              </div>

              {/* Row 2: Performance Summary (3 equal cards) */}
              <section className="summary-grid" aria-label="Performance summary">
                <article className="metric-card accent-card mastery-card">
                  <div className="metric-header-row">
                    <div className="metric-title-with-icon">
                      <span>Overall Mastery</span>
                    </div>
                    <small className="metric-sub-label">{attempts.length ? "All attempts" : "Not started"}</small>
                  </div>
                  <div className="metric-body-row mastery-body-split">
                    <div className="mastery-stat-item">
                      <div className="mastery-donut-wrap" aria-hidden="true">
                        <svg width="36" height="36" viewBox="0 0 36 36" className="mastery-donut">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="var(--surface-soft)"
                            strokeWidth="3.6"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="var(--green)"
                            strokeWidth="3.6"
                            strokeDasharray={`${overallAccuracy}, 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      <div className="metric-text-col">
                        <strong className="metric-huge-num">{attempts.length ? `${overallAccuracy}%` : "—"}</strong>
                        <p>{attempts.length ? `${overallCorrect} of ${attempts.length} correct` : "Complete review"}</p>
                      </div>
                    </div>

                    <div className="mastery-stat-item">
                      <div className="topics-icon-wrap" aria-hidden="true">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 2 7 12 12 22 7 12 2" />
                          <polyline points="2 17 12 22 22 17" />
                          <polyline points="2 12 12 17 22 12" />
                        </svg>
                      </div>
                      <div className="metric-text-col">
                        <strong className="metric-huge-num">{practicedTopics.length}<span className="metric-denom">/{topics.length}</span></strong>
                        <p>topics practiced</p>
                        <span className="metric-sub-detail">{topicsLeft} left</span>
                      </div>
                    </div>
                  </div>
                </article>

                <article
                  className="metric-card interactive mistake-bank-card"
                  onClick={() => openView("weakness")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openView("weakness");
                    }
                  }}
                  title="Open Weakness Analytics to review missed questions"
                >
                  <div className="metric-header-row">
                    <div className="metric-title-with-icon mistake-accent">
                      <span>Mistake Bank</span>
                    </div>
                    <small className="metric-status-label" style={wrongQuestionIds.size > 0 ? { color: "#e67e22" } : undefined}>
                      {wrongQuestionIds.size > 0 ? "Needs review" : attempts.length ? "All clear" : "Not started"}
                    </small>
                  </div>
                  <div className="metric-body-row">
                    <div className="mistake-icon-wrap" aria-hidden="true">
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                    </div>
                    <div className="metric-text-col">
                      <strong className="metric-huge-num">{wrongQuestionIds.size}</strong>
                      <p>Questions to reinforce</p>
                    </div>
                    <svg className="metric-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </article>

                <article
                  className="metric-card interactive ai-metric-card"
                  onClick={() => openView("assistant")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openView("assistant");
                    }
                  }}
                  title="Open RevIT AI for guidance and concept explanation"
                >
                  <div className="metric-header-row">
                    <div className="metric-title-with-icon">
                      <span>Ask RevIT AI</span>
                    </div>
                    <small className="metric-status-label" style={{ color: "var(--green)" }}>Assistant</small>
                  </div>
                  <div className="metric-body-row">
                    <div className="ai-icon-wrap" aria-hidden="true">
                      <Image src="/revit-frog.png" alt="" width={44} height={44} unoptimized style={{ width: "40px", height: "40px", objectFit: "contain", borderRadius: "8px" }} />
                    </div>
                    <div className="metric-text-col">
                      <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.35, color: "var(--muted)" }}>Concepts, mnemonics & explanations</p>
                    </div>
                    <svg className="metric-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </article>
              </section>

              {/* Row 4: Recommended Next & Topic Performance */}
              <div className="overview-focus-topic-grid">
                <section className="focus-card">
                  <div className="focus-card-header">
                    <div className="focus-card-title-with-icon">
                      <span className="focus-card-icon" aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="6" />
                          <circle cx="12" cy="12" r="2" />
                        </svg>
                      </span>
                      <h2>Recommended Next</h2>
                    </div>
                  </div>

                  <div className="focus-topic-hero">
                    <div className="focus-topic-icon" aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20V10" />
                        <path d="M18 20V4" />
                        <path d="M6 20v-4" />
                      </svg>
                    </div>
                    <div className="focus-topic-info">
                      <h3>{weakestTopic ? weakestTopic.name : (topicStats[0]?.name ?? "Start with one focused topic")}</h3>
                      <p className="focus-topic-subject">{weakestTopicSubject}</p>
                    </div>
                    <span className="focus-accuracy-text" style={{ color: weakestTopic ? (weakestTopic.accuracy < 60 ? "#e67e22" : "var(--green)") : "var(--muted)" }}>
                      {weakestTopic ? `${weakestTopic.accuracy}% accuracy` : "Ready to practice"}
                    </span>
                  </div>

                  <p className="focus-card-desc">
                    {weakestTopic ? "Your weakest practiced topic right now." : "Pick a topic to start building mastery and track weak spots."}
                  </p>

                  <div className="focus-metric-cards">
                    <div className="focus-metric-card">
                      <div className="focus-metric-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                        <strong>{weakestTopic ? weakestTopic.attempts : 0}</strong>
                      </div>
                      <span>{weakestTopic?.attempts === 1 ? "attempt" : "attempts"}</span>
                    </div>
                    <div className="focus-metric-card">
                      <div className="focus-metric-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="2" />
                        </svg>
                        <strong>{weakestTopic ? `${weakestTopic.accuracy}%` : "—"}</strong>
                      </div>
                      <span>accuracy</span>
                    </div>
                    <div className="focus-metric-card">
                      <div className="focus-metric-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        <strong>15</strong>
                      </div>
                      <span>suggested MCQs</span>
                    </div>
                  </div>

                  <div className="focus-actions">
                    <button className="primary-button" type="button" onClick={startRecommendedReview}>
                      Start 15-question review →
                    </button>
                    <button className="secondary-button" type="button" onClick={() => {
                      if (weakestTopic) setSelectedTopicIds([weakestTopic.id]);
                      openView("library");
                    }}>
                      View topic →
                    </button>
                  </div>

                  {upNextTopic && (
                    <div className="focus-up-next-section">
                      <p className="eyebrow">Up next</p>
                      <button
                        type="button"
                        className="focus-up-next-card"
                        onClick={() => {
                          setSelectedTopicIds([upNextTopic.id]);
                          openView("library");
                        }}
                      >
                        <div className="focus-up-next-icon" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                          </svg>
                        </div>
                        <span className="focus-up-next-name">{upNextTopic.name}</span>
                        <span className="focus-up-next-meta">
                          {upNextTopic.attempts > 0 ? `${upNextTopic.accuracy}%` : "—"}
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                      </button>
                    </div>
                  )}
                </section>

                <section className="topic-card">
                  <div className="section-heading">
                    <div className="topic-card-title-col">
                      <div className="topic-card-header-row">
                        <span className="topic-header-icon" aria-hidden="true">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                          </svg>
                        </span>
                        <h2>Topic Performance</h2>
                      </div>
                      <p className="topic-card-subtitle">Your learning map</p>
                    </div>
                    <button className="text-button" type="button" onClick={() => openView("progress")}>View all →</button>
                  </div>
                  <div className="topic-list">
                    {topicStats.slice(0, 10).map((topic) => (
                      <div className="topic-row" key={topic.id}>
                        <span>{topic.name}</span>
                        <div className="topic-meter">
                          <i
                            className={topic.attempts ? (topic.accuracy >= 70 ? "strong" : "developing") : "empty"}
                            style={{
                              width: `${topic.attempts ? Math.max(topic.accuracy, 4) : 0}%`,
                              background: !topic.attempts ? "transparent" : topic.accuracy >= 70 ? "var(--green-dark)" : "#d4755f",
                            }}
                          />
                        </div>
                        <strong>{topic.attempts ? `${topic.accuracy}%` : "—"}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            {/* Right Column: Question Bank & RevIT AI */}
            <aside className="overview-aside">
              <div className="source-summary-card">
                <div className="source-summary-header">
                  <div className="source-summary-title-with-icon">
                    <span className="source-summary-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </span>
                    <h2 className="source-summary-title">Question Bank</h2>
                  </div>
                  <span className="source-summary-total">{questions.length.toLocaleString()} QUESTIONS</span>
                </div>
                <div className="source-summary-list">
                  {overviewSubjects.map((subject) => {
                    let subjectQuestionCount = questions.filter(
                      (q) => subject.sourceSubjectIds?.includes(q.subjectId) || (subject.topicIds && subject.topicIds.includes(q.topicId))
                    ).length;
                    if (!proActive && subject.topicIds) {
                      const ciullaAdd = subject.topicIds.reduce(
                        (sum, tid) => sum + (ciullaTopicQuestionCounts[tid] ?? 0),
                        0
                      );
                      subjectQuestionCount += ciullaAdd;
                    }
                    const bookSources = subject.books && subject.books.length > 0 ? subject.books.join(" · ") : null;

                    return (
                      <div className="source-stat" key={subject.id}>
                        <div className="source-stat-top">
                          <span className="source-stat-subject">{subject.name}</span>
                          <span className="source-stat-count">{subjectQuestionCount.toLocaleString()} MCQs</span>
                        </div>
                        {bookSources && (
                          <div className="source-stat-sources">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              className="source-stat-book-icon"
                            >
                              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                            </svg>
                            <span className="source-stat-sources-text">{bookSources}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button className="source-summary-view-all-btn" type="button" onClick={() => openView("library")}>
                  View all subjects →
                </button>
              </div>
            </aside>
          </div>
        )}

        {activeView === "library" && (
          sessionQuestionIds.length === 0 ? (
            <ReviewLibrary
              preferences={preferences}
              libraryMode={libraryMode}
              onLibraryModeChange={changeLibraryMode}
              selectedBook={selectedBook}
              onSelectBook={handleBookChange}
              proActive={proActive}
              subjectSearch={subjectSearch}
              onSubjectSearchChange={setSubjectSearch}
              visibleSubjects={visibleLibrarySubjects}
              subjectSections={librarySubjectSections}
              allAvailableSubjects={allAvailableSubjects}
              allAvailableTopics={allAvailableTopics}
              questions={questions}
              selectedTopicIds={selectedTopicIds}
              onToggleTopic={toggleTopic}
              onToggleSubject={toggleSubject}
              onSelectAllTopics={(tIds) => setSelectedTopicIds(tIds)}
              onClearAllTopics={() => setSelectedTopicIds([])}
              wrongAnswersOnly={wrongAnswersOnly}
              onWrongAnswersOnlyChange={setWrongAnswersOnly}
              wrongTopicIds={wrongTopicIds}
              onSelectAllWrongAnswers={selectAllWrongAnswers}
              sessionSize={sessionSize}
              onSessionSizeChange={setSessionSize}
              timerEnabled={timerEnabled}
              onTimerEnabledChange={setTimerEnabled}
              timerDuration={timerDuration}
              onTimerDurationChange={setTimerDuration}
              onStartSession={startSession}
              sessionQuestions={sessionQuestions}
              ciullaTopicQuestionCounts={ciullaTopicQuestionCounts}
              rodakTopicQuestionCounts={rodakTopicQuestionCounts}
              strasingerTopicQuestionCounts={strasingerTopicQuestionCounts}
              onOpenProModal={() => setPlanAnnouncementOpen(true)}
              onRequestConfirm={requestConfirm}
            />
          ) : (
            <div className="library-shell">
              {sessionComplete ? (
                <SessionSummary attempts={sessionAttempts} onDone={leaveSession} cloudEnabled={cloudEnabled && attemptHistoryAvailable} />
              ) : currentQuestion ? (
              <section className="quiz-card">
                <div className="quiz-topline">
                  <div><span>{`Question ${sessionIndex + 1} of ${sessionDynamicTarget}`}</span><strong>{topicById.get(currentQuestion.topicId)?.name}</strong></div>
                  <div className="quiz-topline-actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <button
                      className="secondary-button timeout-button"
                      type="button"
                      onClick={timeoutSession}
                      title="Pause session and navigate anywhere in RevIT"
                      style={{ display: "inline-flex", alignItems: "center", flexDirection: "row", gap: "6px", whiteSpace: "nowrap" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "inline-block", flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="10" y1="15" x2="10" y2="9" />
                        <line x1="14" y1="15" x2="14" y2="9" />
                      </svg>
                      <span>Timeout</span>
                    </button>
                    <button className="secondary-button" type="button" onClick={leaveSession} style={{ whiteSpace: "nowrap" }}>Exit session</button>
                  </div>
                </div>
                <div className="quiz-progress"><span style={{ width: `${Math.min(100, (sessionProgressCount / Math.max(sessionDynamicTarget, 1)) * 100)}%` }} /></div>
                <div key={`${currentQuestion.id}-${sessionIndex}`}>
                  <div className="quiz-header-row">
                    <p className="question-source">
                      {currentQuestion.book ? `${currentQuestion.book} · ` : ""}
                      {subjectById.get(currentQuestion.subjectId)?.name}
                    </p>
                    {activeTimer.enabled && (
                      <div className="quiz-timer-wrap">
                        <QuestionTimer
                          key={`${sessionIndex}:${currentQuestion.id}`}
                          durationSeconds={activeTimer.duration}
                          questionKey={`${sessionIndex}:${currentQuestion.id}`}
                          paused={answerRevealed}
                          onExpire={handleQuestionTimeout}
                        />
                      </div>
                    )}
                  </div>
                  {currentQuestion.caseStudy && (
                    <div className="quiz-case-study" style={{ marginBottom: "1rem", fontSize: "1.05rem", lineHeight: "1.6", color: "var(--text-main, #f1f5f9)", fontWeight: 500 }}>
                      <p>{currentQuestion.caseStudy}</p>
                    </div>
                  )}
                  {currentQuestion.book !== "Rodak" && <QuestionStimulus stimulus={currentQuestion.stimulus} />}
                  <div className="quiz-question-heading" style={{ marginTop: currentQuestion.caseStudy ? "1rem" : undefined }}>
                    <h2>
                      {currentQuestion.matching
                        ? currentQuestion.prompt.split(/\n+(?:(?:Disorders|Statements|Significance|1\.)|\n)/)[0].trim()
                        : currentQuestion.prompt}
                    </h2>
                  </div>
                  {currentQuestion.book === "Rodak" && <QuestionReferences question={currentQuestion} />}
                  {currentQuestion.promptAfterReferences && <p className="quiz-question-heading">{currentQuestion.promptAfterReferences}</p>}
                  {currentQuestion.matching ? (
                    <MatchingQuestion
                      question={currentQuestion}
                      selectedAnswers={matchingSelections}
                      revealed={answerRevealed}
                      onChange={(itemIndex, answerIndex) => {
                        setMatchingSelections((current) => {
                          const next = Array.from({ length: currentQuestion.matching!.items.length }, (_, index) => current[index] ?? -1);
                          next[itemIndex] = answerIndex;
                          return next;
                        });
                      }}
                    />
                  ) : currentQuestion.choiceTable ? (
                    <QuestionChoiceTable
                      question={currentQuestion}
                      selected={selectedChoice}
                      revealed={answerRevealed}
                      onSelect={setSelectedChoice}
                    />
                  ) : (
                    <div className="choice-list">
                      {currentChoiceOrder.map((choiceIndex, displayIndex) => {
                        const choice = currentQuestion.choices[choiceIndex];
                        const isCorrect = answerRevealed && choiceIndex === currentQuestion.correctAnswer;
                        const isWrong = answerRevealed && choiceIndex === selectedChoice && choiceIndex !== currentQuestion.correctAnswer;
                        return (
                          <button
                            type="button"
                            className={`choice-button ${selectedChoice === choiceIndex ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                            key={`${currentQuestion.id}-${choiceIndex}`}
                            onClick={() => !answerRevealed && setSelectedChoice(choiceIndex)}
                            aria-pressed={selectedChoice === choiceIndex}
                          >
                            <span className="choice-index">{String.fromCharCode(65 + displayIndex)}</span>
                            <b className="choice-copy">{choice}</b>
                            {isCorrect && <i className="choice-result-icon" aria-hidden="true">✓</i>}
                            {isWrong && <i className="choice-result-icon" aria-hidden="true">!</i>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {answerRevealed && (
                    <div
                      className={`answer-panel ${currentAnswerCorrect ? "correct" : "wrong"} ${timedOut ? "timed-out" : ""}`}
                      aria-live="polite"
                    >
                      <strong><span aria-hidden="true">{currentAnswerCorrect ? "✓" : "!"}</span>{timedOut ? "Time's up" : currentAnswerCorrect ? "Correct" : "Review this one"}</strong>
                      <p className="answer-key">
                        <b>Correct answer:</b>{" "}
                        {currentQuestion.matching
                          ? currentQuestion.officialAnswer
                          : (() => {
                              const displayedIndex = currentChoiceOrder.indexOf(currentQuestion.correctAnswer);
                              const displayedLetter = displayedIndex >= 0 ? String.fromCharCode(65 + displayedIndex) : "";
                              const rawChoiceText = currentQuestion.choices?.[currentQuestion.correctAnswer] ?? currentQuestion.officialAnswer;
                              const answerText = rawChoiceText.replace(/^[A-Za-z]\.\s+/, "");
                              return `${displayedLetter ? `${displayedLetter}. ` : ""}${answerText}`;
                            })()}
                      </p>
                      <div className="answer-rationale"><span>Rationale</span><p>{currentQuestion.explanation}</p></div>
                      {!currentAnswerCorrect && <p className="reinforcement-note">We’ll bring this concept back later.</p>}
                    </div>
                  )}
                </div>
                <div className="quiz-actions">
                  {!answerRevealed && (
                    <button
                      className="secondary-button skip-button"
                      type="button"
                      onClick={skipQuestion}
                      disabled={!canSkipCurrentQuestion}
                      title={canSkipCurrentQuestion ? "Skip question and return to it later" : "This is the last remaining question to answer"}
                      style={{ flexShrink: 0 }}
                    >
                      Skip
                    </button>
                  )}
                  {!answerRevealed ? (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={submitAnswer}
                      disabled={currentQuestion.matching ? matchingSelections.length !== currentQuestion.matching.items.length || matchingSelections.some((answer) => answer < 0) : selectedChoice === null}
                      style={{ marginLeft: "auto", flexShrink: 0 }}
                    >
                      Check answer
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={nextQuestion}
                      style={{ marginLeft: "auto", flexShrink: 0 }}
                    >
                      {sessionCanFinish ? "See results" : "Next question"}
                    </button>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ))}

        {activeView === "progress" && (
          <ProgressPage
            progressBook={progressBook}
            setProgressBook={setProgressBook}
            proActive={proActive}
            entitlement={entitlement}
            progressAttempts={progressAttempts}
            progressOverallAccuracy={progressOverallAccuracy}
            progressOverallCorrect={progressOverallCorrect}
            progressStrongestTopic={progressStrongestTopic}
            progressWeakestTopic={progressWeakestTopic}
            progressSubjectStats={progressSubjectStats}
            progressTopicStats={progressTopicStats}
            visibleProgressSubjects={visibleProgressSubjects}
            progressSearch={progressSearch}
            setProgressSearch={setProgressSearch}
            cloudEnabled={cloudEnabled}
            preferences={preferences}
            onStartReview={() => openView("library")}
            availableBooks={availableBooks}
          />
        )}

        {activeView === "leaderboards" && (!online ? <CloudOfflineState feature="Leaderboards" /> : (
          <LeaderboardPage
            cloudEnabled={cloudEnabled}
            leaderboardOptIn={preferences.leaderboard_opt_in}
            subjects={subjects}
            attempts={attempts}
            currentUserLevel={currentLevel}
            onOpenSettings={openProfileEditor}
            onToggleOptIn={updateLeaderboardOptIn}
          />
        ))}

        {activeView === "weakness" && (canAccessSubscriptionFeature("weaknessAnalytics", entitlement) ? (
          <WeaknessDashboard
            attempts={attempts}
            loading={cloudLoading}
            historyAvailable={attemptHistoryAvailable}
            cloudEnabled={cloudEnabled}
            subjects={subjects}
            topics={topics}
            questions={questions}
            onOpenReviewer={() => openView("library")}
            onReviewWithAi={reviewTopicWithAi}
            onPractice={practiceWeakTopic}
            onViewMistakes={viewTopicMistakes}
          />
        ) : (
          <section className="pro-locked-state">
            <span className="source-pill">PRO</span>
            <h2>Weakness Analytics</h2>
            <p>Identify repeated mistakes and topics that need more review. Your study history remains safe.</p>
            <Link className="secondary-button" href="/pricing">Learn about RevIT Pro</Link>
          </section>
        ))}

        {activeView === "planner" && (
          <StudyPlanner
            plans={studyPlans}
            selectedPlanId={selectedStudyPlanId}
            defaultDate={todayKey}
            subjectOptions={Array.from(new Set(subjects.map((subject) => subject.name).filter(Boolean)))}
            topicOptions={Array.from(new Set(topics.map((topic) => topic.name).filter(Boolean)))}
            onChange={setStudyPlans}
            onSelectPlan={setSelectedStudyPlanId}
            activity={activity}
            exams={exams}
            grades={grades}
            timeZone={preferences.timezone}
            onSaveExam={persistExam}
            onDeleteExam={removeExam}
            initialViewMode={plannerViewMode}
            onViewModeChange={setPlannerViewMode}
          />
        )}

        {activeView === "grades" && gradesEnabled && (
          <GradesPage
            grades={grades}
            onSave={persistGrade}
            showSimulator={gradeSimulatorEnabled}
            mtapFeaturesEnabled={preferences.mtap_features_enabled}
            initialCustomGradebooks={customGradebooks}
            userId={initialUser?.id}
            cloudClient={cloudEnabled && initialUser ? createClient() : null}
          />
        )}

        {activeView === "assistant" && (!online ? <CloudOfflineState feature="RevIT AI" /> : (
          <div className="assistant-page">
            {/* Top RevIT AI Header */}
            <header className="assistant-page-header">
              <div className="assistant-brand">
                <button
                  type="button"
                  className="mobile-drawer-toggle-btn"
                  onClick={() => setMobileAiHistoryOpen(true)}
                  aria-label="Open conversation history"
                  title="Recent conversations"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                </button>
                <div className="assistant-brand-text">
                  <h1>RevIT AI</h1>
                  <p>Your MedTech study assistant</p>
                </div>
              </div>
              <div className="assistant-header-actions">
                {cloudEnabled && (
                  <span className="assistant-usage-badge" title="Daily study assistant quota">
                    {aiDailyUsed === null
                      ? `${getAiLimits(entitlement).dailyRequests} left`
                      : `${Math.max(0, getAiLimits(entitlement).dailyRequests - aiDailyUsed)} left`}
                  </span>
                )}
                <button
                  type="button"
                  className="mobile-new-chat-btn"
                  onClick={() => void startNewChat()}
                  disabled={chatBusy}
                  aria-label="Start new chat"
                  title="New chat"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Compact Study Context Bar (Beneath Header) */}
            <div className="integrated-study-context-bar">
              <div className="study-context-left">
                <span className="study-context-icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </span>
                <span className="study-context-label">Study context</span>
              </div>
              <div className="study-context-right">
                <button
                  className="study-context-selector-btn"
                  type="button"
                  onClick={() => openView("library")}
                  title="Choose or change study topics"
                >
                  <span className="study-context-summary-text">{selectedTopicsSummary}</span>
                  <svg className="study-context-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`academic-context-pill-btn ${aiAcademicPermissions.masterEnabled && aiAcademicPermissions.gradesEnabled ? "active" : ""}`}
                  onClick={() => setAiSettingsOpen(true)}
                  title="Configure personalized academic assistance"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                  <span>{aiAcademicPermissions.masterEnabled && aiAcademicPermissions.gradesEnabled ? "Grades On" : "Grades"}</span>
                </button>
              </div>
            </div>

            {/* AI Workspace Grid */}
            <div className="assistant-workspace">
              {/* Desktop History Sidebar (240px–270px) */}
              <aside className="chat-history-card desktop-history" aria-label="AI chat history">
                <button
                  className="new-chat-button"
                  type="button"
                  onClick={() => void startNewChat()}
                  disabled={chatBusy}
                >
                  <span aria-hidden="true">＋</span> {chatActionPending ? "Creating…" : "New chat"}
                </button>
                <div className="chat-history-section-header">
                  <h3>Recent conversations</h3>
                </div>
                <div className="chat-history-list">
                  {chatHistoryLoading ? (
                    <div className="chat-history-state" role="status">
                      <span className="history-loader" />
                      <span>Loading conversations…</span>
                    </div>
                  ) : !cloudEnabled ? (
                    <div className="chat-history-state">
                      <strong>History available with account</strong>
                      <p>Sign in to save RevIT AI study sessions.</p>
                    </div>
                  ) : aiChats.length === 0 ? (
                    <div className="chat-history-empty-state">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>No conversations yet</span>
                    </div>
                  ) : (
                    <>
                      {aiChats.map((chat) => (
                        <div className={`chat-history-item ${chat.id === activeChatId ? "active" : ""}`} key={chat.id}>
                          <button
                            className="chat-history-open"
                            type="button"
                            onClick={() => openAiChat(chat.id)}
                            disabled={chatBusy}
                            aria-current={chat.id === activeChatId ? "true" : undefined}
                          >
                            <strong>{chat.title}</strong>
                            <time dateTime={chat.updated_at}>
                              {formatChatDate(chat.updated_at)}
                            </time>
                          </button>
                          <button
                            className="chat-history-delete"
                            type="button"
                            onClick={() => void removeAiChat(chat)}
                            disabled={chatBusy}
                            aria-label={`Delete ${chat.title}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {chatHistoryHasMore && (
                        <button
                          className="chat-load-older"
                          type="button"
                          onClick={() => void loadOlderChats()}
                          disabled={chatHistoryLoadingMore}
                        >
                          {chatHistoryLoadingMore ? "Loading…" : "Load older conversations"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </aside>

              {/* Mobile Slide-Out Conversation Sidebar */}
              <AnimatePresence>
                {mobileAiHistoryOpen && (
                  <div
                    className="chat-history-drawer-backdrop"
                    role="presentation"
                    onClick={() => setMobileAiHistoryOpen(false)}
                  >
                    <aside
                      className="chat-history-drawer-panel"
                      role="dialog"
                      aria-modal="true"
                      aria-label="AI chat history"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Drawer Header */}
                      <div className="chat-drawer-topline">
                        <div className="chat-drawer-brand">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                          </svg>
                          <span>RevIT AI</span>
                        </div>
                        <button
                          type="button"
                          className="chat-drawer-close-btn"
                          onClick={() => setMobileAiHistoryOpen(false)}
                          aria-label="Close history"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>

                      {/* Primary Action: New Chat Button */}
                      <button
                        className="chat-drawer-new-chat-btn"
                        type="button"
                        onClick={() => {
                          void startNewChat();
                          setMobileAiHistoryOpen(false);
                        }}
                        disabled={chatBusy}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>New chat</span>
                      </button>

                      {/* Conversation Search */}
                      <div className="chat-drawer-search-wrap">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          type="text"
                          className="chat-drawer-search-input"
                          value={aiChatSearchQuery}
                          onChange={(e) => setAiChatSearchQuery(e.target.value)}
                          placeholder="Search conversations…"
                          aria-label="Search conversations"
                        />
                        {aiChatSearchQuery && (
                          <button
                            type="button"
                            className="chat-drawer-search-clear"
                            onClick={() => setAiChatSearchQuery("")}
                            aria-label="Clear search"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Recent Conversations List */}
                      <div className="chat-drawer-history-section">
                        <span className="chat-drawer-section-title">RECENT CONVERSATIONS</span>
                        <div className="chat-drawer-list">
                          {chatHistoryLoading ? (
                            <div className="chat-history-state" role="status">
                              <span className="history-loader" />
                              <span>Loading conversations…</span>
                            </div>
                          ) : !cloudEnabled ? (
                            <div className="chat-history-state">
                              <strong>History available with account</strong>
                              <p>Sign in to keep RevIT AI conversations across devices.</p>
                            </div>
                          ) : filteredAiChats.length === 0 ? (
                            <div className="chat-drawer-empty-state">
                              <p>No conversations yet.</p>
                              <small>{aiChatSearchQuery ? "No matching conversations found." : "Start a new chat to review MedTech topics."}</small>
                            </div>
                          ) : (
                            filteredAiChats.map((chat) => (
                              <div className={`chat-drawer-item ${chat.id === activeChatId ? "is-active" : ""}`} key={`drawer-${chat.id}`}>
                                <button
                                  className="chat-drawer-item-main"
                                  type="button"
                                  onClick={() => {
                                    openAiChat(chat.id);
                                    setMobileAiHistoryOpen(false);
                                  }}
                                  disabled={chatBusy}
                                  aria-current={chat.id === activeChatId ? "true" : undefined}
                                >
                                  <span className="chat-drawer-item-icon" aria-hidden="true">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                  </span>
                                  <div className="chat-drawer-item-text">
                                    <strong>{chat.title}</strong>
                                    <time dateTime={chat.updated_at}>{formatChatDate(chat.updated_at)}</time>
                                  </div>
                                </button>
                                <button
                                  className="chat-drawer-item-delete"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void removeAiChat(chat);
                                  }}
                                  disabled={chatBusy}
                                  aria-label={`Delete ${chat.title}`}
                                  title="Delete conversation"
                                >
                                  ×
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Drawer Bottom: Academic Context Settings */}
                      <div className="chat-drawer-footer">
                        <button
                          type="button"
                          className="chat-drawer-settings-btn"
                          onClick={() => {
                            setMobileAiHistoryOpen(false);
                            setAiSettingsOpen(true);
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="4" y1="21" x2="4" y2="14" />
                            <line x1="4" y1="10" x2="4" y2="3" />
                            <line x1="12" y1="21" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12" y2="3" />
                            <line x1="20" y1="21" x2="20" y2="16" />
                            <line x1="20" y1="12" x2="20" y2="3" />
                            <line x1="1" y1="14" x2="7" y2="14" />
                            <line x1="9" y1="8" x2="15" y2="8" />
                            <line x1="17" y1="16" x2="23" y2="16" />
                          </svg>
                          <span>Academic context settings</span>
                        </button>
                      </div>
                    </aside>
                  </div>
                )}
              </AnimatePresence>

              {/* Main AI Workspace */}
              <main className="assistant-card assistant-card-main">
                {chatError && (
                  <div className="chat-error" role="alert">
                    <span>{chatError}</span>
                    <button type="button" onClick={() => setChatError("")} aria-label="Dismiss chat error">×</button>
                  </div>
                )}

                {/* Chat Body: Welcome Screen or Conversation Log */}
                <div
                  ref={chatBodyRef}
                  onScroll={handleChatScroll}
                  className={`chat-body ${messages.length ? "chat-active" : ""}`}
                  aria-live="polite"
                >
                  {chatMessagesLoading ? (
                    <div className="conversation-loading" role="status">
                      <span className="history-loader" />
                      <strong>Opening conversation…</strong>
                      <p>Your saved messages are being loaded.</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="ai-welcome-container">
                      <div className="assistant-intro">
                        <div className="assistant-welcome-mascot">
                          <Image
                            src="/icons/neu/revit-ai.png"
                            alt=""
                            width={52}
                            height={52}
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          />
                        </div>
                        <h3>What are we reviewing today?</h3>
                        <p>Ask about MedTech concepts, mnemonics, or your academic performance.</p>
                      </div>

                      {/* Suggested Prompt Cards */}
                      <div className="ai-prompt-grid">
                        {(showAllSuggestions ? chatSuggestionCategories : chatSuggestionCategories.slice(0, 4)).map((item) => (
                          <button
                            type="button"
                            key={item.title}
                            className="ai-prompt-card"
                            onClick={() => {
                              setDraft(item.text);
                              const el = document.getElementById("medtech-question");
                              if (el) el.focus();
                            }}
                            disabled={chatBusy}
                          >
                            <span className="ai-prompt-card-text">{item.title}</span>
                            <span className="ai-prompt-card-arrow" aria-hidden="true">↗</span>
                          </button>
                        ))}
                      </div>
                      {chatSuggestionCategories.length > 4 && (
                        <button
                          type="button"
                          className="ai-prompt-more-btn"
                          onClick={() => setShowAllSuggestions((prev) => !prev)}
                        >
                          <span>{showAllSuggestions ? "Fewer suggestions" : "More suggestions"}</span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            style={{ transform: showAllSuggestions ? "rotate(180deg)" : "none", transition: "transform 0.18s ease" }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="chat-log">
                      {chatMessagesHasMore && (
                        <button className="chat-load-older" type="button" onClick={() => void loadOlderMessages()} disabled={chatMessagesLoadingMore}>
                          {chatMessagesLoadingMore ? "Loading…" : "Load older messages"}
                        </button>
                      )}
                      {messages.map((message) => (
                        <article className={`chat-message ${message.role}`} key={message.id}>
                          <div className="message-header-bar">
                            <span className="message-role">{message.role === "user" ? "You" : "RevIT AI"}</span>
                          </div>
                          <div className="markdown-content">
                            <AiMarkdown content={message.content} />
                          </div>
                          {message.role === "assistant" && (
                            <div className="answer-meta">
                              <div className="answer-citations">
                                {message.mode === "demo" && <span>Demo mode</span>}
                                {message.mode === "live" && (
                                  <span>{message.grounded ? "Source-backed explanation" : `${message.provider ?? "AI"} explanation — verify with approved references`}</span>
                                )}
                                {message.citations?.map((citation) => (
                                  <span key={citation}>Source: {citation}</span>
                                ))}
                              </div>
                              <button
                                type="button"
                                className={`chat-copy-btn ${copiedMessageId === message.id ? "copied" : ""}`}
                                onClick={() => void copyMessageText(message.id, message.content)}
                                aria-label="Copy response"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                <span>{copiedMessageId === message.id ? "Copied" : "Copy"}</span>
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                      {pending && (
                        <div className="thinking">
                          <i /><i /><i />
                          <span>Reviewing the question…</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Floating Message Composer */}
                <div className="chat-composer-wrap">
                  {showScrollBottom && (
                    <button
                      type="button"
                      className="chat-scroll-bottom-btn"
                      onClick={() => scrollToBottom(true)}
                      aria-label="Scroll to latest messages"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <polyline points="19 12 12 19 5 12" />
                      </svg>
                      <span>Latest</span>
                    </button>
                  )}
                  <form className="chat-composer-box" onSubmit={submitChat}>
                    <label className="sr-only" htmlFor="medtech-question">Ask a MedTech question</label>
                    <textarea
                      id="medtech-question"
                      rows={1}
                      maxLength={4000}
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        event.target.style.height = "auto";
                        event.target.style.height = `${Math.min(130, event.target.scrollHeight)}px`;
                      }}
                      onFocus={() => setIsComposerFocused(true)}
                      onBlur={() => setIsComposerFocused(false)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void ask(draft);
                        }
                      }}
                      placeholder="Ask RevIT AI anything about MedTech…"
                      disabled={chatBusy}
                    />
                    <div className="chat-composer-footer">
                      <div className="composer-footer-left">
                        <button
                          type="button"
                          className="composer-academic-shortcut"
                          onClick={() => setAiSettingsOpen(true)}
                          title="Academic context settings"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                          </svg>
                          <span>Academic context</span>
                        </button>
                        <span className="composer-counter">{draft.length} / 4000</span>
                      </div>
                      <button
                        type="submit"
                        className={`composer-send-btn ${draft.trim() ? "has-text" : ""}`}
                        disabled={!draft.trim() || chatBusy}
                        aria-label="Send message"
                      >
                        {pending ? (
                          <span className="composer-spinner" />
                        ) : (
                          <svg className="composer-send-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="12" y1="19" x2="12" y2="5" />
                            <polyline points="5 12 12 5 19 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </main>
            </div>
          </div>
        ))}
          </motion.div>
        </AnimatePresence>

        {achievementsOpen && <AchievementModal progression={progression} metrics={progressMetrics} onClose={() => setAchievementsOpen(false)} />}
        <MissionsModal
          isOpen={missionsModalOpen}
          onClose={() => setMissionsModalOpen(false)}
          progression={studyProgression}
          achievementsCatalog={progression.achievements}
          unlockedAchievements={progression.unlocked}
        />
        <ProgressionToast
          toasts={progressionToasts}
          onDismiss={(id) => setProgressionToasts((prev) => prev.filter((t) => t.id !== id))}
        />
        {levelUp !== null && <div className="level-up-toast" role="status" aria-live="polite">
          <button type="button" onClick={() => setLevelUp(null)} aria-label="Dismiss level up notification">×</button>
          <span>Level up</span><strong>You reached Level {levelUp}</strong><p>Keep improving.</p>
        </div>}

        {feedbackOpen && online && <FeedbackModal profile={accountProfile ?? { id: initialUser?.id ?? "local", first_name: profile.name, username: profile.name, avatar_url: profile.photoDataUrl, onboarding_complete: true } as Profile} email={initialUser?.email} turnstileSiteKey={turnstileSiteKey} onClose={() => setFeedbackOpen(false)} />}

        {profileOpen && !cloudEnabled && (
          <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
            <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
              <div className="profile-modal-heading">
                <div><p className="eyebrow">Profile</p><h2 id="profile-title">Customize your profile</h2></div>
                <button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile editor">×</button>
              </div>
              <form onSubmit={saveProfile}>
                <div className="profile-photo-row">
                  <span className={`avatar profile-preview ${profileDraft.photoDataUrl ? "has-photo" : ""}`} style={profileDraft.photoDataUrl ? { backgroundImage: `url(${JSON.stringify(profileDraft.photoDataUrl)})` } : undefined}>
                    {profileDraft.photoDataUrl ? "" : (profileDraft.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R")}
                  </span>
                  <div>
                    <label className="photo-upload">Choose photo<input type="file" accept={AVATAR_ACCEPT} onChange={(event) => void chooseProfilePhoto(event)} /></label>
                    {profileDraft.photoDataUrl && <button className="text-button quiet" type="button" onClick={() => setProfileDraft((current) => ({ ...current, photoDataUrl: "" }))}>Remove photo</button>}
                    <small>PNG, JPG, or WebP up to 2 MB</small>
                  </div>
                </div>
                <label className="profile-name-field" htmlFor="profile-name"><span>Display name</span><input id="profile-name" maxLength={40} value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                {profileError && <p className="profile-error" role="alert">{profileError}</p>}
                <p className="profile-privacy">Your name and photo are saved only in this browser on this device.</p>
                <div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={() => setProfileOpen(false)}>Cancel</button><button className="primary-button" type="submit">Save profile</button></div>
              </form>
              <MtapPreferenceControl enabled={preferences.mtap_features_enabled} onChange={updateMtapFeatures} />
            </section>
          </div>
        )}
        {profileOpen && cloudAvailable && accountProfile && initialUser && <AccountSettings profile={accountProfile} preferences={preferences} entitlement={entitlement} email={initialUser.email} initialTab={accountInitialTab} initialStatus={accountInitialStatus} onClose={() => setProfileOpen(false)} onProfile={(updated) => { setCloudProfile(updated); setProfile({ name: updated.first_name, photoDataUrl: updated.avatar_url ?? "" }); setProfileOpen(false); }} onPreferences={setPreferences} onMtapFeaturesChange={updateMtapFeatures} />}
        {cloudAvailable && cloudProfile && !cloudProfile.onboarding_complete && !cloudLoading && !cloudError && <Onboarding profile={cloudProfile} onComplete={(updated) => { setCloudProfile(updated); setProfile({ name: updated.first_name, photoDataUrl: updated.avatar_url ?? "" }); }} onMtapChoose={updateMtapFeatures} />}
        {!preferences.mtap_onboarding_completed && (!cloudEnabled || Boolean(cloudProfile?.onboarding_complete)) && !cloudLoading && !cloudError && <MtapOnboarding onChoose={updateMtapFeatures} />}
      </section>
      <ScientificCalculator />
      {(["overview", "library", "progress", "leaderboards", "weakness", "grades"] as View[]).includes(activeView) && (
        <ScrollToTop
          view={activeView}
          aboveReviewBar={activeView === "library" && libraryMode === "mcqs" && !isReviewSessionActive && !sessionComplete}
          instant={activeView === "library" && isReviewSessionActive && !sessionComplete}
        />
      )}
      <MobileNavDock
        activeView={activeView}
        onSelectView={(view) => openNavigationView(view)}
        gradesEnabled={gradesEnabled}
        proActive={proActive}
        onOpenFeedback={() => setFeedbackOpen(true)}
        onOpenProfile={openProfileEditor}
        wrongCount={wrongQuestionIds.size}
        unreadCount={unreadCount}
        hidden={activeView === "assistant" && (isComposerFocused || isKeyboardOpen)}
      />
      <SiteUpdatesModal
        isOpen={updatesModalOpen}
        onClose={() => { setUpdatesModalOpen(false); dismissPopup(); }}
        readIds={readIds}
        onMarkAllRead={markAllRead}
        onToggleRead={toggleRead}
      />
      <PlanAnnouncementModal
        isOpen={planAnnouncementOpen}
        variant={planAnnouncementVariant}
        onClose={handleClosePlanAnnouncement}
        onExplorePricing={() => {
          window.location.assign("/pricing");
        }}
        proExpiresAt={initialUser?.id && GIFTED_PRO_USERS[initialUser.id] ? GIFTED_PRO_USERS[initialUser.id].expiresAt : (entitlement.proExpiresAt || "2028-12-31T23:59:59Z")}
        recipientGreeting={initialUser?.id ? GIFTED_PRO_USERS[initialUser.id]?.greeting : undefined}
        recipientUserId={initialUser?.id}
      />
      {pendingActivation && (
        <ProActivationModal
          isOpen={Boolean(pendingActivation)}
          username={cloudProfile?.username || initialUser?.username || profile.name}
          source={pendingActivation.source}
          durationDays={pendingActivation.duration_days}
          expiresAt={pendingActivation.pro_expires_at}
          customMessage={pendingActivation.custom_message}
          onClose={handleAcknowledgeActivation}
          onAcknowledge={handleAcknowledgeActivation}
        />
      )}
          <CustomConfirm
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title ?? ""}
        message={confirmConfig.message ?? ""}
        confirmLabel={confirmConfig.confirmLabel}
        onConfirm={confirmConfig.action ?? (() => {})}
        onCancel={() => setConfirmConfig({ isOpen: false })}
      />
      <ResumeSessionModal
        isOpen={resumeModalOpen}
        session={recentSession}
        onResume={continueRecentSession}
        onDismiss={() => setResumeModalOpen(false)}
        onDiscard={discardRecentSession}
      />
      {aiSettingsOpen && (
        <AiAcademicSettingsModal
          isOpen={aiSettingsOpen}
          onClose={() => setAiSettingsOpen(false)}
          permissions={aiAcademicPermissions}
          onSave={handleSaveAiAcademicPermissions}
        />
      )}
    </main>
  );
}

function CloudOfflineState({ feature }: { feature: string }) {
  return (
    <section className="empty-progress" role="status">
      <h2>{feature} needs internet</h2>
      <p>Keep reviewing offline. Saved progress will sync automatically when your connection returns.</p>
    </section>
  );
}

function SessionSummary({ attempts, onDone, cloudEnabled }: { attempts: Attempt[]; onDone: () => void; cloudEnabled: boolean }) {
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const topicIds = [...new Set(attempts.map((attempt) => attempt.topicId))];
  return (
    <section className="results-card">
      <span className="result-mark">{percent(correct, attempts.length)}%</span>
      <p className="eyebrow">Review complete</p>
      <h2>{correct} of {attempts.length} correct</h2>
      <p>Your answers are {cloudEnabled ? "synced to your account" : "saved locally"} and have already updated Progress.</p>
      <div className="result-breakdown">
        {topicIds.map((topicId) => {
          const topicAttempts = attempts.filter((attempt) => attempt.topicId === topicId);
          const topicCorrect = topicAttempts.filter((attempt) => attempt.correct).length;
          return <div key={topicId}><span>{topicAttempts[0]?.topicName ?? "Topic"}</span><strong>{topicCorrect}/{topicAttempts.length} · {percent(topicCorrect, topicAttempts.length)}%</strong></div>;
        })}
      </div>
      <button className="primary-button" type="button" onClick={onDone}>Return to topic selection</button>
    </section>
  );
}
