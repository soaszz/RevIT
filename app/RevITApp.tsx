"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import AccountSettings from "./components/AccountSettings";
import AiMarkdown from "./components/AiMarkdown";
import GradesPage from "./components/GradesPage";
import Onboarding from "./components/Onboarding";
import StudyCalendar from "./components/StudyCalendar";
import {
  deleteExam as deleteCloudExam,
  flushActivityQueue,
  loadCloudSnapshot,
  localProfileToCloud,
  migrateLocalActivity,
  queueActivity,
  recordActivity,
  saveExam as saveCloudExam,
  saveGrade as saveCloudGrade,
  savePreferences,
  saveQuestionReinforcement,
} from "./lib/cloudService";
import type { DailyActivity, ExamSchedule, GradeRecord, Profile, UserPreferences } from "./lib/domain";
import {
  chooseAdaptiveQuestion,
  reinforcementAfterAnswer,
  reinforcementLevelAfterAnswer,
  type QuestionPerformance,
  type ReinforcementLevels,
} from "./lib/adaptiveQuestions";
import { dateKeyInTimeZone, greetingFor, calculateStreak } from "./lib/studyCalendar";
import { createClient } from "./lib/supabase/client";
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
import {
  questionById,
  questions,
  subjectById,
  subjects,
  topicById,
  topics,
} from "./content/reviewerContent";

type View = "overview" | "library" | "progress" | "grades" | "assistant";

type Attempt = {
  id?: string;
  questionId: string;
  topicId: string;
  subjectId: string;
  selectedAnswer: number;
  correct: boolean;
  timestamp: string;
};

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

const DEFAULT_PROFILE: LearnerProfile = { name: "Jamie Santos", photoDataUrl: "" };

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Home", icon: "/icons/home.svg" },
  { id: "library", label: "QnA", icon: "/icons/qna.svg" },
  { id: "progress", label: "Progress", icon: "/icons/progress.svg" },
  { id: "grades", label: "Grades", icon: "/icons/grades.svg" },
  { id: "assistant", label: "MedTech AI", icon: "/icons/medtech-ai.svg" },
];

function RevITLogo() {
  return (
    <>
      <span className="brand-logo brand-logo-full" aria-hidden="true"><Image src="/revit-logo.png" alt="" width={1376} height={768} priority /></span>
      <span className="brand-logo brand-logo-mark" aria-hidden="true"><Image src="/revit-logo.png" alt="" width={1376} height={768} priority /></span>
    </>
  );
}

const viewCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Study dashboard",
    title: "Master medtech, one focused review at a time.",
    description: "Practice official Clinical Chemistry, Hematology, Bacteriology, and AUBF questions with answer rationales from your supplied reviewers.",
  },
  library: {
    eyebrow: "Official reviewer library",
    title: "Build a review around your focus.",
    description: "Choose one topic, mix several, or practice the complete four-subject reviewer library.",
  },
  progress: {
    eyebrow: "Performance analytics",
    title: "See what you know. Focus on what is next.",
    description: "Every answer is organized by subject and topic, so your next study move stays clear.",
  },
  grades: {
    eyebrow: "Deterministic grade planning",
    title: "Know where you stand—and what comes next.",
    description: "Record every assessment by subject and see the weighted percentage earned in each category.",
  },
  assistant: {
    eyebrow: "General study support",
    title: "Ask RevIT AI for a clearer explanation.",
    description: "Explore medtech concepts with Groq while official reviewer answers remain the scoring source of truth.",
  },
};

const chatSuggestions = [
  "Why is decolorization the critical step in Gram staining?",
  "Differentiate iron deficiency anemia from anemia of chronic disease.",
  "Compare S. pneumoniae with viridans streptococci.",
];

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
    const subject = subjectById.get(attempt.subjectId)?.name ?? attempt.subjectId;
    current.subjects_studied = [...new Set([...current.subjects_studied, subject])];
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.activity_date.localeCompare(b.activity_date));
}

export type InitialUser = { id: string; email: string; username?: string };

export default function RevITApp({ initialUser = null, cloudEnabled = false }: { initialUser?: InitialUser | null; cloudEnabled?: boolean }) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<View>("overview");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [sessionSize, setSessionSize] = useState("10");
  const [wrongAnswersOnly, setWrongAnswersOnly] = useState(false);
  const [sessionPoolIds, setSessionPoolIds] = useState<string[]>([]);
  const [sessionTargetCount, setSessionTargetCount] = useState(0);
  const [sessionQuestionIds, setSessionQuestionIds] = useState<string[]>([]);
  const [sessionChoiceOrders, setSessionChoiceOrders] = useState<Record<string, number[]>>({});
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionStrictWrongOnly, setSessionStrictWrongOnly] = useState(false);
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
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
  const [chatActionPending, setChatActionPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [profile, setProfile] = useState<LearnerProfile>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<LearnerProfile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [cloudProfile, setCloudProfile] = useState<Profile | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [exams, setExams] = useState<ExamSchedule[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
    theme: "system",
  }));
  const [cloudLoading, setCloudLoading] = useState(cloudEnabled);
  const [cloudError, setCloudError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

useEffect(() => {
  const validViews: View[] = [
    "overview",
    "library",
    "progress",
    "grades",
    "assistant",
  ];

  const path = window.location.pathname
    .replace(/^\/|\/$/g, "") as View;

  if (validViews.includes(path)) {
    setActiveView(path);
  } else {
    setActiveView("overview");
    window.history.replaceState(null, "", "/overview");
  }

  const handlePopState = () => {
    const currentPath = window.location.pathname
      .replace(/^\/|\/$/g, "") as View;

    if (validViews.includes(currentPath)) {
      setActiveView(currentPath);
    }
  };

  window.addEventListener("popstate", handlePopState);

  return () => {
    window.removeEventListener("popstate", handlePopState);
  };
}, []);

  useEffect(() => {
    try {
      const savedAttempts = JSON.parse(localStorage.getItem("revit-attempts-v1") ?? "[]") as Attempt[];
      const savedTopics = JSON.parse(localStorage.getItem("revit-selected-topics-v1") ?? "[]") as string[];
      const savedProfile = JSON.parse(localStorage.getItem("revit-profile-v1") ?? "null") as LearnerProfile | null;
      const savedSidebarCollapsed = localStorage.getItem("revit-sidebar-collapsed") === "true";
      const reinforcementKey = `revit-reinforcement-v1:${initialUser?.id ?? "local"}`;
      const savedReinforcement = JSON.parse(localStorage.getItem(reinforcementKey) ?? "{}") as ReinforcementLevels;
      if (Array.isArray(savedAttempts)) setAttempts(savedAttempts);
      if (Array.isArray(savedTopics)) {
        setSelectedTopicIds(savedTopics.filter((id) => topicById.has(id)));
      }
      if (savedProfile && typeof savedProfile.name === "string" && typeof savedProfile.photoDataUrl === "string") {
        const normalizedProfile = { name: savedProfile.name.trim() || DEFAULT_PROFILE.name, photoDataUrl: savedProfile.photoDataUrl };
        setProfile(normalizedProfile);
        setProfileDraft(normalizedProfile);
      }
      setSidebarCollapsed(savedSidebarCollapsed);
      if (savedReinforcement && typeof savedReinforcement === "object" && !Array.isArray(savedReinforcement)) {
        setReinforcementLevels(Object.fromEntries(Object.entries(savedReinforcement)
          .filter(([id, level]) => questionById.has(id) && Number.isInteger(level) && level > 0 && level <= 3)));
      }
    } catch {
      // Invalid local data should not block a study session.
    }
    setReinforcementReady(true);
    setStorageReady(true);
  }, [initialUser?.id]);

  useEffect(() => {
    if (!storageReady || cloudEnabled) return;
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
  }, [attempts, cloudEnabled, preferences.timezone, storageReady]);

  useEffect(() => {
    if (!storageReady || cloudEnabled) return;
    setActivity((current) => mergeLocalAttemptActivity(attempts, current, preferences.timezone));
  }, [attempts, cloudEnabled, preferences.timezone, storageReady]);

  useEffect(() => {
    if (!cloudEnabled || !initialUser) return;
    const policy = localStorage.getItem("revit-session-policy");
    const rememberedUntil = Number(localStorage.getItem("revit-remember-until") ?? 0);
    if ((policy === "session-only" && sessionStorage.getItem("revit-session-only") !== "active")
      || (policy === "remember" && rememberedUntil > 0 && rememberedUntil < Date.now())) {
      void createClient().auth.signOut({ scope: "local" }).then(() => router.replace("/auth"));
    }
  }, [cloudEnabled, initialUser, router]);

  useEffect(() => {
    if (!cloudEnabled || !initialUser) return;
    let cancelled = false;
    async function load() {
      setCloudLoading(true); setCloudError("");
      try {
        const client = createClient();
        await flushActivityQueue(client);
        const snapshot = await loadCloudSnapshot(client, initialUser!.id);
        if (cancelled) return;
        const nextProfile = snapshot.profile ?? localProfileToCloud(initialUser!.id, initialUser!.username ?? `learner_${initialUser!.id.slice(0, 8)}`, profile.name, profile.photoDataUrl);
        const nextPreferences = snapshot.preferences ?? preferences;
        setCloudProfile(nextProfile); setGrades(snapshot.grades); setActivity(snapshot.activity); setExams(snapshot.exams); setPreferences(nextPreferences);
        setReinforcementLevels((current) => ({
          ...current,
          ...Object.fromEntries(snapshot.reinforcement.map((item) => [item.question_id, item.reinforcement_level])),
        }));
        setProfile({ name: nextProfile.first_name || profile.name, photoDataUrl: nextProfile.avatar_url ?? "" });
        if (nextPreferences.theme === "light" || nextPreferences.theme === "dark") {
          document.documentElement.dataset.theme = nextPreferences.theme;
          document.documentElement.style.colorScheme = nextPreferences.theme;
          localStorage.setItem("revit-theme", nextPreferences.theme);
        }
      } catch (error) {
        if (!cancelled) setCloudError(error instanceof Error ? error.message : "Cloud data could not be loaded.");
      } finally { if (!cancelled) setCloudLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  // Load once for the authenticated identity; local fallback data is migrated separately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, initialUser?.id]);

  useEffect(() => {
    if (activeView !== "assistant" || !cloudEnabled || !initialUser || chatHistoryLoaded) return;
    let cancelled = false;

    async function loadHistory() {
      setChatHistoryLoading(true);
      setChatError("");
      try {
        const chats = await loadAiChats(createClient(), initialUser!.id);
        if (cancelled) return;
        setAiChats(chats);
        setActiveChatId((current) => (
          current && chats.some((chat) => chat.id === current) ? current : chats[0]?.id ?? null
        ));
        if (!chats.length) {
          setMessages([]);
          setLoadedChatId(null);
        }
      } catch (error) {
        if (!cancelled) {
          setAiChats([]);
          setChatError(error instanceof Error ? error.message : "Chat history could not be loaded.");
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
  }, [activeView, chatHistoryLoaded, cloudEnabled, initialUser]);

  useEffect(() => {
    if (activeView !== "assistant" || !cloudEnabled || !initialUser || !activeChatId || loadedChatId === activeChatId) return;
    let cancelled = false;

    async function loadConversation() {
      setChatMessagesLoading(true);
      setChatError("");
      try {
        const storedMessages = await loadAiMessages(createClient(), activeChatId!);
        if (cancelled) return;
        setMessages(storedMessages.map(({ id, role, content }) => ({ id, role, content })));
        setLoadedChatId(activeChatId);
      } catch (error) {
        if (!cancelled) {
          setMessages([]);
          setLoadedChatId(activeChatId);
          setChatError(error instanceof Error ? error.message : "This conversation could not be loaded.");
        }
      } finally {
        if (!cancelled) setChatMessagesLoading(false);
      }
    }

    void loadConversation();
    return () => { cancelled = true; };
  }, [activeChatId, activeView, cloudEnabled, initialUser, loadedChatId]);

  useEffect(() => {
    if (!cloudEnabled || !initialUser || !storageReady || cloudLoading || cloudError) return;
    let cancelled = false;
    async function migrate() {
      try {
        const client = createClient();
        await migrateLocalActivity(client, initialUser!.id, preferences.timezone, attempts, (id) => subjectById.get(id)?.name ?? id);
        const snapshot = await loadCloudSnapshot(client, initialUser!.id);
        if (!cancelled) setActivity(snapshot.activity);
      } catch (error) {
        if (!cancelled) setCloudError(`Local history is preserved, but migration needs retry: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    void migrate();
    return () => { cancelled = true; };
  }, [attempts, cloudEnabled, cloudError, cloudLoading, initialUser, preferences.timezone, storageReady]);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-attempts-v1", JSON.stringify(attempts));
  }, [attempts, storageReady]);

  useEffect(() => {
    if (!reinforcementReady) return;
    const reinforcementKey = `revit-reinforcement-v1:${initialUser?.id ?? "local"}`;
    localStorage.setItem(reinforcementKey, JSON.stringify(reinforcementLevels));
  }, [initialUser?.id, reinforcementLevels, reinforcementReady]);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-selected-topics-v1", JSON.stringify(selectedTopicIds));
  }, [selectedTopicIds, storageReady]);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-profile-v1", JSON.stringify(profile));
  }, [profile, storageReady]);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed, storageReady]);

  useEffect(() => {
    if (cloudEnabled) return;
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (localZone) setPreferences((current) => ({ ...current, timezone: localZone }));
  }, [cloudEnabled]);

  useEffect(() => {
    if (!storageReady || cloudEnabled) return;
    localStorage.setItem("revit-grades-v1", JSON.stringify(grades));
  }, [cloudEnabled, grades, storageReady]);

  useEffect(() => {
    if (!storageReady || cloudEnabled) return;
    localStorage.setItem("revit-exams-v1", JSON.stringify(exams));
  }, [cloudEnabled, exams, storageReady]);

  useEffect(() => {
    if (!storageReady || cloudEnabled) return;
    localStorage.setItem("revit-activity-v1", JSON.stringify(activity));
  }, [activity, cloudEnabled, storageReady]);

  const selectedQuestions = useMemo(
    () => questions.filter((question) => selectedTopicIds.includes(question.topicId)),
    [selectedTopicIds],
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

  const wrongTopicIds = useMemo(
    () => [...new Set(questions.filter((question) => wrongQuestionIds.has(question.id)).map((question) => question.topicId))],
    [wrongQuestionIds],
  );

  const sessionQuestions = useMemo(
    () => wrongAnswersOnly
      ? selectedQuestions.filter((question) => wrongQuestionIds.has(question.id))
      : selectedQuestions,
    [selectedQuestions, wrongAnswersOnly, wrongQuestionIds],
  );

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
  const strongestTopic = [...practicedTopics].sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)[0];
  const weakestTopic = [...practicedTopics].sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)[0];
  const currentQuestion = questionById.get(sessionQuestionIds[sessionIndex]);
  const currentChoiceOrder = currentQuestion
    ? sessionChoiceOrders[`${sessionIndex}:${currentQuestion.id}`] ?? currentQuestion.choices.map((_, index) => index)
    : [];
  const sessionComplete = sessionQuestionIds.length > 0 && sessionIndex >= sessionQuestionIds.length;
  const sessionRequiresFullCoverage = !sessionStrictWrongOnly && sessionTargetCount > 0 && sessionTargetCount === sessionPoolIds.length;
  const sessionHasUnseenQuestions = sessionRequiresFullCoverage
    && sessionPoolIds.some((id) => !sessionQuestionIds.includes(id));
  const sessionCanFinish = sessionStrictWrongOnly
    ? sessionQuestionIds.length > 0 && sessionAttempts.length >= sessionQuestionIds.length
    : sessionAttempts.length >= sessionTargetCount && !sessionHasUnseenQuestions;
  const sessionUniqueQuestionCount = new Set(sessionQuestionIds).size;
  const sessionProgressCount = sessionStrictWrongOnly
    ? Math.min(sessionIndex + 1, sessionTargetCount)
    : sessionRequiresFullCoverage
    ? sessionUniqueQuestionCount
    : Math.min(sessionIndex + 1, sessionTargetCount);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((current) => current.includes(topicId)
      ? current.filter((id) => id !== topicId)
      : [...current, topicId]);
  }

  function toggleSubject(subjectId: string) {
    const subjectTopicIds = topics.filter((topic) => topic.subjectId === subjectId).map((topic) => topic.id);
    setSelectedTopicIds((current) => subjectTopicIds.every((id) => current.includes(id))
      ? current.filter((id) => !subjectTopicIds.includes(id))
      : [...new Set([...current, ...subjectTopicIds])]);
  }

  function selectAllWrongAnswers() {
    setSelectedTopicIds(wrongTopicIds);
    setWrongAnswersOnly(true);
  }

  function startSession() {
    if (!sessionQuestions.length) return;
    const limit = sessionSize === "all" ? sessionQuestions.length : Number(sessionSize);
    const poolIds = sessionQuestions.map((question) => question.id);
    const targetCount = Math.min(limit, poolIds.length);
    if (wrongAnswersOnly) {
      const strictQuestionIds = shuffled(poolIds).slice(0, targetCount);
      setSessionPoolIds(strictQuestionIds);
      setSessionTargetCount(strictQuestionIds.length);
      setSessionQuestionIds(strictQuestionIds);
      setSessionChoiceOrders(Object.fromEntries(strictQuestionIds.map((questionId, index) => [
        `${index}:${questionId}`,
        shuffled([0, 1, 2, 3]),
      ])));
      setSessionStrictWrongOnly(true);
      setSessionIndex(0);
      setSessionAttempts([]);
      setSelectedChoice(null);
      setAnswerRevealed(false);
      return;
    }
    const firstQuestionId = chooseAdaptiveQuestion(poolIds, reinforcementLevels, [], Math.random, questionPerformance);
    if (!firstQuestionId) return;
    setSessionPoolIds(poolIds);
    setSessionTargetCount(targetCount);
    setSessionQuestionIds([firstQuestionId]);
    setSessionChoiceOrders({ [`0:${firstQuestionId}`]: shuffled([0, 1, 2, 3]) });
    setSessionStrictWrongOnly(false);
    setSessionIndex(0);
    setSessionAttempts([]);
    setSelectedChoice(null);
    setAnswerRevealed(false);
  }

  function leaveSession() {
    setSessionPoolIds([]);
    setSessionTargetCount(0);
    setSessionQuestionIds([]);
    setSessionChoiceOrders({});
    setSessionStrictWrongOnly(false);
    setSessionIndex(0);
    setSessionAttempts([]);
    setSelectedChoice(null);
    setAnswerRevealed(false);
  }

  async function recordStudyEvent(input: {
    eventKey: string;
    questions?: number;
    correct?: number;
    reviews?: number;
    subject?: string;
  }) {
    const activityDate = dateKeyInTimeZone(new Date(), preferences.timezone);
    setActivity((current) => {
      const existing = current.find((day) => day.activity_date === activityDate);
      const updated: DailyActivity = {
        ...(existing ?? { activity_date: activityDate, questions_answered: 0, correct_answers: 0, review_count: 0, subjects_studied: [] }),
        questions_answered: (existing?.questions_answered ?? 0) + (input.questions ?? 0),
        correct_answers: (existing?.correct_answers ?? 0) + (input.correct ?? 0),
        review_count: (existing?.review_count ?? 0) + (input.reviews ?? 0),
        subjects_studied: input.subject ? [...new Set([...(existing?.subjects_studied ?? []), input.subject])] : (existing?.subjects_studied ?? []),
      };
      return [...current.filter((day) => day.activity_date !== activityDate), updated].sort((a, b) => a.activity_date.localeCompare(b.activity_date));
    });
    if (!cloudEnabled || !initialUser) return;
    const payload = { ...input, activityDate };
    try { await recordActivity(createClient(), payload); }
    catch {
      queueActivity(payload);
      setCloudError("Study activity is queued and will sync when the connection recovers.");
    }
  }

  function submitAnswer() {
    if (!currentQuestion || selectedChoice === null || answerRevealed) return;
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      questionId: currentQuestion.id,
      topicId: currentQuestion.topicId,
      subjectId: currentQuestion.subjectId,
      selectedAnswer: selectedChoice,
      correct: selectedChoice === currentQuestion.correctAnswer,
      timestamp: new Date().toISOString(),
    };
    setAttempts((current) => [...current, attempt]);
    setSessionAttempts((current) => [...current, attempt]);
    const currentReinforcementLevel = reinforcementLevels[currentQuestion.id] ?? 0;
    const nextReinforcementLevel = reinforcementLevelAfterAnswer(
      currentReinforcementLevel,
      attempt.correct,
    );
    setReinforcementLevels((current) => reinforcementAfterAnswer(current, currentQuestion.id, attempt.correct));
    if (cloudEnabled && initialUser && (!attempt.correct || currentReinforcementLevel > 0)) {
      void saveQuestionReinforcement(createClient(), initialUser.id, currentQuestion.id, nextReinforcementLevel)
        .catch(() => setCloudError("Your answer is saved locally, but reinforcement sync needs another attempt."));
    }
    setAnswerRevealed(true);
    void recordStudyEvent({
      eventKey: `answer:${attempt.id}`,
      questions: 1,
      correct: attempt.correct ? 1 : 0,
      subject: subjectById.get(attempt.subjectId)?.name ?? attempt.subjectId,
    });
  }

  function nextQuestion() {
    if (sessionStrictWrongOnly) {
      setSessionIndex((current) => current + 1);
      setSelectedChoice(null);
      setAnswerRevealed(false);
      return;
    }

    if (sessionCanFinish) {
      setSessionIndex((current) => current + 1);
      setSelectedChoice(null);
      setAnswerRevealed(false);
      return;
    }

    const nextQuestionId = chooseAdaptiveQuestion(sessionPoolIds, reinforcementLevels, sessionQuestionIds, Math.random, questionPerformance);
    if (!nextQuestionId) {
      setSessionIndex((current) => current + 1);
      setSelectedChoice(null);
      setAnswerRevealed(false);
      return;
    }
    const nextIndex = sessionQuestionIds.length;
    setSessionQuestionIds((current) => [...current, nextQuestionId]);
    setSessionChoiceOrders((current) => ({
      ...current,
      [`${nextIndex}:${nextQuestionId}`]: shuffled([0, 1, 2, 3]),
    }));
    setSessionIndex(nextIndex);
    setSelectedChoice(null);
    setAnswerRevealed(false);
  }

 function openView(view: View) {
  setActiveView(view);
  window.history.pushState(null, "", `/${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

  function openNavigationView(view: View) {
    openView(view);
    setSidebarCollapsed(true);
  }

  function openProfileEditor() {
    setProfileDraft(profile);
    setProfileError("");
    setProfileOpen(true);
  }

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    localStorage.setItem("revit-theme", nextTheme);
    setPreferences((current) => ({ ...current, theme: nextTheme }));
    if (cloudEnabled && initialUser) {
      void savePreferences(createClient(), initialUser.id, { ...preferences, theme: nextTheme })
        .catch(() => setCloudError("Theme changed locally; cloud preference sync needs retry."));
    }
  }

  function chooseProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("Choose a PNG, JPG, WebP, or another image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Choose an image smaller than 2 MB so it can be saved on this device.");
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
    setChatError("");
    setDraft("");

    if (!cloudEnabled || !initialUser) {
      setActiveChatId(null);
      setLoadedChatId(null);
      setMessages([]);
      return;
    }

    setChatActionPending(true);
    try {
      const chat = await createAiChat(createClient(), initialUser.id);
      setAiChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setActiveChatId(chat.id);
      setLoadedChatId(chat.id);
      setMessages([]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "A new chat could not be created.");
    } finally {
      setChatActionPending(false);
    }
  }

  function openAiChat(chatId: string) {
    if (pending || chatActionPending || chatId === activeChatId) return;
    setChatError("");
    setMessages([]);
    setLoadedChatId(null);
    setActiveChatId(chatId);
  }

  async function removeAiChat(chat: AiChat) {
    if (!cloudEnabled || !initialUser || pending || chatActionPending) return;
    if (!window.confirm(`Delete “${chat.title}”? This conversation cannot be recovered.`)) return;

    setChatActionPending(true);
    setChatError("");
    try {
      await deleteAiChat(createClient(), initialUser.id, chat.id);
      const remaining = aiChats.filter((item) => item.id !== chat.id);
      setAiChats(remaining);
      if (activeChatId === chat.id) {
        const nextChatId = remaining[0]?.id ?? null;
        setMessages([]);
        setLoadedChatId(null);
        setActiveChatId(nextChatId);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "The conversation could not be deleted.");
    } finally {
      setChatActionPending(false);
    }
  }

  async function ask(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || pending || chatActionPending || chatMessagesLoading) return;
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
      } catch (error) {
        setChatError(`This question could not be saved to chat history. ${error instanceof Error ? error.message : "You can continue in this tab."}`);
      }
    }

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.slice(-12).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json() as {
        answer?: string;
        citations?: string[];
        grounded?: boolean;
        mode?: "live" | "demo";
        provider?: "Groq";
        error?: string;
      };
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
        } catch (error) {
          setChatError(`The answer is visible, but it could not be saved. ${error instanceof Error ? error.message : "Please try again later."}`);
        }
      }

      setMessages((current) => [...current, assistantMessage]);
      void recordStudyEvent({ eventKey: `ai-review:${userMessage.id}`, reviews: 1, subject: "MedTech AI" });
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
    if (cloudEnabled && initialUser) {
      const saved = await saveCloudGrade(createClient(), initialUser.id, record);
      setGrades((current) => [...current.filter((item) => item.subject !== saved.subject), saved]);
    } else setGrades((current) => [...current.filter((item) => item.subject !== record.subject), record]);
  }

  async function persistExam(exam: Omit<ExamSchedule, "id"> & { id?: string }) {
    if (cloudEnabled && initialUser) {
      const saved = await saveCloudExam(createClient(), initialUser.id, exam);
      setExams((current) => [...current.filter((item) => item.id !== saved.id && !(item.subject === saved.subject && item.assessment_type === saved.assessment_type)), saved].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)));
    } else {
      const saved = { ...exam, id: exam.id ?? crypto.randomUUID() } as ExamSchedule;
      setExams((current) => [...current.filter((item) => item.id !== saved.id && !(item.subject === saved.subject && item.assessment_type === saved.assessment_type)), saved].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)));
    }
  }

  async function removeExam(id: string) {
    if (cloudEnabled && initialUser) await deleteCloudExam(createClient(), initialUser.id, id);
    setExams((current) => current.filter((exam) => exam.id !== id));
  }

  const baseHeading = viewCopy[activeView];
  const todayKey = dateKeyInTimeZone(new Date(), preferences.timezone);
  const streak = calculateStreak(activity, todayKey);
  const firstName = cloudProfile?.first_name || profile.name.split(/\s+/)[0] || "Learner";
  const heading = activeView === "overview" ? {
    ...baseHeading,
    title: `${greetingFor(new Date(), preferences.timezone)}, ${firstName}.`,
    description: streak.current > 0
      ? `${streak.current}-day study streak. Keep the next focused step small and consistent.`
      : "Your next meaningful answer starts a new study streak.",
  } : baseHeading;
  const selectedTopicNames = selectedTopicIds.map((id) => topicById.get(id)?.name).filter(Boolean);
  const profileInitials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R";
  const avatarStyle = profile.photoDataUrl ? { backgroundImage: `url(${JSON.stringify(profile.photoDataUrl)})` } : undefined;
  const accountProfile = cloudProfile ?? (initialUser
    ? localProfileToCloud(initialUser.id, initialUser.username ?? `learner_${initialUser.id.slice(0, 8)}`, profile.name, profile.photoDataUrl)
    : null);
  const activeNavItem = navItems.find((item) => item.id === activeView) ?? navItems[0];
  const activeAiChat = aiChats.find((chat) => chat.id === activeChatId) ?? null;
  const chatBusy = pending || chatActionPending || chatMessagesLoading;

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-heading">
          <div className="sidebar-brand-row">
            <button className="brand brand-button" type="button" onClick={() => openNavigationView("overview")} aria-label="RevIT home">
              <RevITLogo />
            </button>
            <button
              className="sidebar-toggle"
              type="button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="sidebar-toggle-icon" aria-hidden="true">{sidebarCollapsed ? "☰" : "«"}</span>
            </button>
          </div>
        </div>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={`nav-link ${activeView === item.id ? "active" : ""}`}
              type="button"
              key={item.id}
              onClick={() => openNavigationView(item.id)}
              aria-current={activeView === item.id ? "page" : undefined}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="nav-icon" aria-hidden="true"><Image src={item.icon} alt="" width={24} height={24} /></span><span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="theme-toggle sidebar-theme-toggle" type="button" onClick={toggleTheme} aria-label="Toggle light and dark mode">
          <span className="theme-symbol light-symbol" aria-hidden="true">☼</span>
          <span className="theme-symbol dark-symbol" aria-hidden="true">☾</span>
          <span className="sidebar-control-copy"><strong>Appearance</strong><small>Light / dark</small></span>
        </button>
        <div className="sidebar-note">
          <p>Official library</p>
          <strong>{questions.length} questions</strong>
          <span>CC + Hema + Bacte + AUBF</span>
        </div>
        <button className="profile" type="button" onClick={openProfileEditor} aria-label="Customize learner profile">
          <span className={`avatar ${profile.photoDataUrl ? "has-photo" : ""}`} style={avatarStyle}>{profile.photoDataUrl ? "" : profileInitials}</span>
          <span className="profile-copy"><strong>{cloudProfile?.first_name || profile.name}</strong><small>{cloudEnabled ? "Profile & security" : "Customize name and photo"}</small></span>
        </button>
      </aside>

      <section className="workspace">
        <header className="mobile-header">
          <div className="mobile-brand-stack">
            <button className="brand brand-button" type="button" onClick={() => openView("overview")} aria-label="RevIT home"><RevITLogo /></button>
            <span className="mobile-current-view"><i aria-hidden="true"><Image src={activeNavItem.icon} alt="" width={15} height={15} /></i>{activeNavItem.label}</span>
          </div>
          <div className="mobile-actions"><label><span className="sr-only">Choose page</span><select value={activeView} onChange={(event) => openView(event.target.value as View)}>{navItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button className="theme-toggle mobile-theme-toggle" type="button" onClick={toggleTheme} aria-label="Toggle light and dark mode"><span className="theme-symbol light-symbol" aria-hidden="true">☼</span><span className="theme-symbol dark-symbol" aria-hidden="true">☾</span></button><button className={`avatar mobile-profile ${profile.photoDataUrl ? "has-photo" : ""}`} style={avatarStyle} type="button" onClick={openProfileEditor} aria-label="Customize learner profile">{profile.photoDataUrl ? "" : profileInitials}</button></div>
        </header>

        <div className="page-heading">
          <div>
            <p className="eyebrow">{heading.eyebrow}</p>
            <h1>{heading.title}</h1>
            <p>{heading.description}</p>
          </div>
          <div className="heading-actions">
            {activeView === "overview" && <span className="streak-badge"><strong>{streak.current}</strong><span>day streak<small>{streak.longest} longest · {streak.activeDays} active</small></span></span>}
            {activeView === "overview" && <button className="primary-button" type="button" onClick={() => openView("library")}>Choose topics</button>}
          </div>
        </div>

        {cloudLoading && <div className="sync-banner">Loading your cloud workspace…</div>}
        {cloudError && <div className="sync-banner error" role="status"><span>{cloudError}</span><button type="button" onClick={() => window.location.reload()}>Retry</button></div>}
        {!cloudEnabled && <div className="sync-banner local"><span>Local mode: reviewer data stays on this device until Supabase is connected.</span><a href="/auth">Connect account</a></div>}

        {activeView === "overview" && (
          <div className="content-grid">
            <div className="dashboard-column">
              <section className="summary-grid" aria-label="Performance summary">
                <article className="metric-card accent-card">
                  <div className="metric-label"><span>Overall mastery</span><small>{attempts.length ? "All attempts" : "Not started"}</small></div>
                  <strong>{attempts.length ? `${overallAccuracy}%` : "—"}</strong>
                  <div className="meter"><span style={{ width: `${overallAccuracy}%` }} /></div>
                  <p>{attempts.length ? `${overallCorrect} of ${attempts.length} answers correct` : "Complete a review to establish your baseline."}</p>
                </article>
                <article className="metric-card">
                  <div className="metric-label"><span>Official questions</span><small>Current library</small></div>
                  <strong>{questions.length}</strong>
                  <p>{subjects.length} subjects across {topics.length} selectable topics</p>
                </article>
                <article className="metric-card">
                  <div className="metric-label"><span>Topics practiced</span><small>{cloudEnabled ? "Cloud synced" : "On this device"}</small></div>
                  <strong>{practicedTopics.length}</strong>
                  <p>{attempts.length} total attempts {cloudEnabled ? "recorded" : "saved locally"}</p>
                </article>
              </section>

              <StudyCalendar activity={activity} exams={exams} grades={grades} timeZone={preferences.timezone} onSaveExam={persistExam} onDeleteExam={removeExam} />

              <section className="focus-card">
                <div className="section-heading">
                  <div><p className="eyebrow">Recommended next</p><h2>{weakestTopic?.name ?? "Start with one focused topic"}</h2></div>
                  <span className="state-pill">{weakestTopic ? `${weakestTopic.accuracy}% accuracy` : "Choose your topics"}</span>
                </div>
                <p>{weakestTopic
                  ? `This is currently your lowest-performing practiced topic across ${weakestTopic.attempts} attempt${weakestTopic.attempts === 1 ? "" : "s"}. A focused session will keep it from being hidden by stronger areas.`
                  : "Select any combination of Clinical Chemistry, Hematology, Bacteriology, and AUBF topics. RevIT preserves topic attribution in mixed reviews."}</p>
                <div className="focus-actions">
                  <button className="primary-button" type="button" onClick={() => openView("library")}>{weakestTopic ? "Build focused review" : "Open review library"}</button>
                  <button className="text-button" type="button" onClick={() => openView("progress")}>View progress</button>
                </div>
              </section>

              <section className="topic-card">
                <div className="section-heading"><div><p className="eyebrow">Topic performance</p><h2>Your learning map</h2></div><button className="text-button" type="button" onClick={() => openView("progress")}>View all</button></div>
                <div className="topic-list">
                  {topicStats.slice(0, 6).map((topic) => (
                    <div className="topic-row" key={topic.id}>
                      <span>{topic.name}</span>
                      <div className="topic-meter"><i className={toneFor(topic.accuracy, topic.attempts)} style={{ width: `${topic.attempts ? Math.max(topic.accuracy, 4) : 0}%` }} /></div>
                      <strong>{topic.attempts ? `${topic.accuracy}%` : "—"}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="overview-aside">
              <div className="source-summary-card">
                <span className="ai-mark">PDF</span>
                <p className="eyebrow">Supplied sources</p>
                <h2>Three official PDF reviewers mapped</h2>
                <p>Clinical Chemistry, Hematology, Bacteriology, and AUBF now power scoring, rationales, and page-level source references.</p>
                {subjects.map((subject) => (
                  <div className="source-stat" key={subject.id}>
                    <span>{subject.name}</span>
                    <strong>{questions.filter((question) => question.subjectId === subject.id).length} MCQs</strong>
                  </div>
                ))}
              </div>
              <div className="ai-peek-card">
                <span className="ai-mark">AI</span>
                <h2>Ask for a clearer explanation</h2>
                <p>Groq study support stays separate from the local official reviewer bank and never changes scoring answers.</p>
                <button className="primary-button" type="button" onClick={() => openView("assistant")}>Open RevIT AI</button>
              </div>
            </aside>
          </div>
        )}

        {activeView === "library" && (
          <div className="library-shell">
            {sessionQuestionIds.length === 0 ? (
              <div className="library-layout">
                <div className="subject-list">
                  {subjects.map((subject) => {
                    const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
                    const subjectSelected = subjectTopics.filter((topic) => selectedTopicIds.includes(topic.id)).length;
                    const subjectFullySelected = subjectSelected === subjectTopics.length;
                    return (
                      <section className="subject-card" key={subject.id}>
                        <div className="subject-heading">
                          <div><p className="eyebrow">{questions.filter((question) => question.subjectId === subject.id).length} official MCQs</p><h2>{subject.name}</h2><p>{subject.description}</p></div>
                          <button className="text-button" type="button" onClick={() => toggleSubject(subject.id)}>{subjectFullySelected ? "Unselect subject" : "Select subject"}</button>
                        </div>
                        <div className="topic-selection-grid">
                          {subjectTopics.map((topic) => {
                            const count = questions.filter((question) => question.topicId === topic.id).length;
                            const selected = selectedTopicIds.includes(topic.id);
                            return (
                              <label className={`topic-select-card ${selected ? "selected" : ""}`} key={topic.id}>
                                <input type="checkbox" checked={selected} onChange={() => toggleTopic(topic.id)} />
                                <span className="topic-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                                <span className="topic-select-copy"><strong>{topic.name}</strong><small>{topic.description}</small><em>{count} questions · {topic.sourcePdfs.length} source PDF{topic.sourcePdfs.length === 1 ? "" : "s"}</em></span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="subject-selection-note">{subjectSelected} of {subjectTopics.length} topics selected</p>
                      </section>
                    );
                  })}
                </div>

                <aside className="selection-panel">
                  <p className="eyebrow">Session setup</p>
                  <h2>{selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"} selected</h2>
                  <p>{wrongAnswersOnly
                    ? `${sessionQuestions.length} wrong-answer question${sessionQuestions.length === 1 ? " is" : "s are"} available from your selection.`
                    : `${sessionQuestions.length} official questions are available from your selection.`}</p>
                  <div className="selection-controls">
                    <button className="text-button" type="button" onClick={() => setSelectedTopicIds(topics.map((topic) => topic.id))}>Select all</button>
                    <button className="text-button" type="button" onClick={selectAllWrongAnswers} disabled={!wrongTopicIds.length}>All wrong answers</button>
                    <button className="text-button quiet" type="button" onClick={() => setSelectedTopicIds([])}>Clear all</button>
                  </div>
                  <div className="wrong-answer-filter">
                    <input id="wrong-answers-only" type="checkbox" aria-describedby="wrong-answers-only-help" checked={wrongAnswersOnly} onChange={(event) => setWrongAnswersOnly(event.target.checked)} />
                    <label htmlFor="wrong-answers-only">Wrong answers only<small id="wrong-answers-only-help">Practice only questions whose latest answer was wrong.</small></label>
                  </div>
                  {wrongAnswersOnly && selectedTopicIds.length > 0 && sessionQuestions.length === 0 && <p className="wrong-answer-empty">No wrong-answer questions remain in these topics.</p>}
                  <label className="field-label" htmlFor="session-size">Questions this session</label>
                  <select id="session-size" value={sessionSize} onChange={(event) => setSessionSize(event.target.value)}>
                    <option value="10">10 questions</option>
                    <option value="20">20 questions</option>
                    <option value="30">30 questions</option>
                    <option value="40">40 questions</option>
                    <option value="50">50 questions</option>
                    <option value="all">All selected questions</option>
                  </select>
                  <button className="primary-button wide" type="button" onClick={startSession} disabled={!sessionQuestions.length}>Start review</button>
                  {selectedTopicNames.length > 0 && <div className="selected-tags">{selectedTopicNames.map((name) => <span key={name}>{name}</span>)}</div>}
                </aside>
              </div>
            ) : sessionComplete ? (
              <SessionSummary attempts={sessionAttempts} onDone={leaveSession} cloudEnabled={cloudEnabled} />
            ) : currentQuestion ? (
              <section className="quiz-card">
                <div className="quiz-topline">
                  <div><span>{sessionRequiresFullCoverage ? `Question ${sessionIndex + 1} · ${sessionUniqueQuestionCount} of ${sessionPoolIds.length} concepts` : `Question ${sessionIndex + 1} of ${sessionTargetCount}`}</span><strong>{topicById.get(currentQuestion.topicId)?.name}</strong></div>
                  <button className="text-button quiet" type="button" onClick={leaveSession}>Exit session</button>
                </div>
                <div className="quiz-progress"><span style={{ width: `${Math.min(100, (sessionProgressCount / Math.max(sessionTargetCount, 1)) * 100)}%` }} /></div>
                <p className="question-source">{subjectById.get(currentQuestion.subjectId)?.name}</p>
                <h2>{currentQuestion.prompt}</h2>
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
                        <span>{String.fromCharCode(65 + displayIndex)}</span>{choice}
                      </button>
                    );
                  })}
                </div>
                {answerRevealed && (
                  <div className={`answer-panel ${selectedChoice === currentQuestion.correctAnswer ? "correct" : "wrong"}`}>
                    <strong>{selectedChoice === currentQuestion.correctAnswer ? "Correct" : "Review this one"}</strong>
                    <p className="answer-key"><b>Correct answer:</b> {String.fromCharCode(65 + currentChoiceOrder.indexOf(currentQuestion.correctAnswer))}. {currentQuestion.officialAnswer}</p>
                    <div className="answer-rationale"><span>Rationale</span><p>{currentQuestion.explanation}</p></div>
                    {selectedChoice !== currentQuestion.correctAnswer && <p className="reinforcement-note">We’ll bring this concept back later.</p>}
                    <small>Source: {currentQuestion.source.fileName}, page {currentQuestion.source.page}</small>
                  </div>
                )}
                <div className="quiz-actions">
                  {!answerRevealed
                    ? <button className="primary-button" type="button" onClick={submitAnswer} disabled={selectedChoice === null}>Check answer</button>
                    : <button className="primary-button" type="button" onClick={nextQuestion}>{sessionCanFinish ? "See results" : "Next question"}</button>}
                </div>
              </section>
            ) : null}
          </div>
        )}

        {activeView === "progress" && (
          <div className="progress-shell">
            <section className="summary-grid progress-summary">
              <article className="metric-card accent-card"><div className="metric-label"><span>Practice accuracy</span><small>All topics</small></div><strong>{attempts.length ? `${overallAccuracy}%` : "—"}</strong><p>{attempts.length ? `${overallCorrect} correct answers` : "No attempts yet"}</p></article>
              <article className="metric-card"><div className="metric-label"><span>Strongest topic</span><small>{strongestTopic?.attempts ?? 0} attempts</small></div><strong className="metric-name">{strongestTopic?.name ?? "Not enough data"}</strong><p>{strongestTopic ? `${strongestTopic.accuracy}% accuracy` : "Complete your first review."}</p></article>
              <article className="metric-card"><div className="metric-label"><span>Needs review</span><small>{weakestTopic?.attempts ?? 0} attempts</small></div><strong className="metric-name">{weakestTopic?.name ?? "Not enough data"}</strong><p>{weakestTopic ? `${weakestTopic.accuracy}% accuracy` : "Topic guidance appears after practice."}</p></article>
            </section>
            <div className="progress-grid">
              {subjects.map((subject) => (
                <section className="analytics-card" key={subject.id}>
                  <div className="section-heading"><div><p className="eyebrow">Per-topic accuracy</p><h2>{subject.name}</h2></div><span className="source-pill">{attempts.filter((attempt) => attempt.subjectId === subject.id).length} attempts</span></div>
                  <div className="analytics-list">
                    {topicStats.filter((topic) => topic.subjectId === subject.id).map((topic) => (
                      <div className="analytics-row" key={topic.id}>
                        <div><strong>{topic.name}</strong><small>{topic.attempts ? `${topic.correct} of ${topic.attempts} correct` : "Not practiced yet"}</small></div>
                        <div className="topic-meter"><i className={toneFor(topic.accuracy, topic.attempts)} style={{ width: `${topic.attempts ? Math.max(topic.accuracy, 4) : 0}%` }} /></div>
                        <span>{topic.attempts ? `${topic.accuracy}%` : "—"}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {!attempts.length && <div className="empty-progress"><h2>Your progress starts with one answer</h2><p>Choose any topic combination. RevIT autosaves every answer {cloudEnabled ? "to your account" : "on this device"} and updates this page immediately.</p><button className="primary-button" type="button" onClick={() => openView("library")}>Start a review</button></div>}
          </div>
        )}

        {activeView === "grades" && <GradesPage grades={grades} onSave={persistGrade} />}

        {activeView === "assistant" && (
          <div className="assistant-page">
            <section className="context-strip">
              <div><p className="eyebrow">Current library selection</p><strong>{selectedTopicIds.length ? `${selectedTopicIds.length} selected topic${selectedTopicIds.length === 1 ? "" : "s"}` : "No topics selected"}</strong></div>
              <button className="text-button" type="button" onClick={() => openView("library")}>{selectedTopicIds.length ? "Change topics" : "Choose topics"}</button>
            </section>
            <div className="assistant-workspace">
              <aside className="chat-history-card" aria-label="AI chat history">
                <div className="chat-history-heading">
                  <div><p className="eyebrow">Saved conversations</p><h2>Chat history</h2></div>
                  <span>{cloudEnabled ? aiChats.length : "Local"}</span>
                </div>
                <button className="new-chat-button" type="button" onClick={() => void startNewChat()} disabled={chatBusy}>
                  <span aria-hidden="true">＋</span>{chatActionPending ? "Creating…" : "New Chat"}
                </button>
                <div className="chat-history-list">
                  {chatHistoryLoading ? (
                    <div className="chat-history-state" role="status"><span className="history-loader" />Loading conversations…</div>
                  ) : !cloudEnabled ? (
                    <div className="chat-history-state"><strong>History is available with an account.</strong><p>Sign in to keep RevIT AI conversations across pages and devices.</p></div>
                  ) : aiChats.length === 0 ? (
                    <div className="chat-history-state"><strong>No saved conversations yet.</strong><p>Start a new chat or ask a question to create one.</p>{chatError && <button type="button" onClick={() => { setChatError(""); setChatHistoryLoaded(false); }}>Try again</button>}</div>
                  ) : aiChats.map((chat) => (
                    <div className={`chat-history-item ${chat.id === activeChatId ? "active" : ""}`} key={chat.id}>
                      <button className="chat-history-open" type="button" onClick={() => openAiChat(chat.id)} disabled={chatBusy} aria-current={chat.id === activeChatId ? "true" : undefined}>
                        <strong>{chat.title}</strong>
                        <time dateTime={chat.updated_at}>{new Date(chat.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
                      </button>
                      <button className="chat-history-delete" type="button" onClick={() => void removeAiChat(chat)} disabled={chatBusy} aria-label={`Delete ${chat.title}`}>×</button>
                    </div>
                  ))}
                </div>
              </aside>

              <div className="assistant-card assistant-card-wide">
                <div className="assistant-header">
                  <div><span className="ai-mark">AI</span><div><h2>RevIT AI</h2><p><i />{activeAiChat?.title ?? "Groq educational support"}</p></div></div>
                  {cloudEnabled && <span className="history-status">{activeChatId ? "Saved" : "Ready"}</span>}
                </div>
                {chatError && <div className="chat-error" role="alert"><span>{chatError}</span><button type="button" onClick={() => setChatError("")} aria-label="Dismiss chat error">×</button></div>}
                <div className={`chat-body ${messages.length ? "chat-active" : ""}`} aria-live="polite">
                  {chatMessagesLoading ? (
                    <div className="conversation-loading" role="status"><span className="history-loader" /><strong>Opening conversation…</strong><p>Your saved messages are being loaded.</p></div>
                  ) : messages.length === 0 ? (
                    <>
                      <div className="assistant-intro"><span className="ai-mark large">AI</span><h3>Ask RevIT AI a study question</h3><p>Groq can explain study concepts, while the supplied reviewer answers stay local and remain the only scoring source of truth.</p></div>
                      <div className="prompt-chips">{chatSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void ask(suggestion)} disabled={chatBusy}>{suggestion}</button>)}</div>
                    </>
                  ) : (
                    <div className="chat-log">
                      {messages.map((message) => (
                        <article className={`chat-message ${message.role}`} key={message.id}>
                          <span className="message-role">{message.role === "user" ? "You" : "RevIT AI"}</span>
                          <div className="markdown-content"><AiMarkdown content={message.content} /></div>
                          {message.role === "assistant" && <div className="answer-meta">{message.mode === "demo" && <span>Demo mode</span>}{message.mode === "live" && <span>{message.grounded ? "Source-backed explanation" : `${message.provider ?? "AI"} explanation — verify with approved references`}</span>}{message.citations?.map((citation) => <span key={citation}>Source: {citation}</span>)}</div>}
                        </article>
                      ))}
                      {pending && <div className="thinking"><i /><i /><i /><span>Reviewing the question</span></div>}
                    </div>
                  )}
                </div>
                <form className="chat-form" onSubmit={submitChat}>
                  <label className="sr-only" htmlFor="medtech-question">Ask a medtech question</label>
                  <textarea id="medtech-question" rows={3} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(draft); } }} placeholder="Ask about Clinical Chemistry, Hematology, Bacteriology, AUBF, or another MedTech concept…" disabled={chatBusy} />
                  <div><span>{draft.length}/4000</span><button type="submit" disabled={!draft.trim() || chatBusy}>{pending ? "Thinking" : chatMessagesLoading ? "Loading" : "Ask RevIT"}</button></div>
                </form>
                <p className="medical-note">Educational use only. Official supplied answers control reviewer scoring; AI explanations do not replace laboratory policy or clinical judgment.</p>
              </div>
            </div>
          </div>
        )}

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
                    <label className="photo-upload">Choose photo<input type="file" accept="image/*" onChange={chooseProfilePhoto} /></label>
                    {profileDraft.photoDataUrl && <button className="text-button quiet" type="button" onClick={() => setProfileDraft((current) => ({ ...current, photoDataUrl: "" }))}>Remove photo</button>}
                    <small>PNG, JPG, or WebP up to 2 MB</small>
                  </div>
                </div>
                <label className="profile-name-field" htmlFor="profile-name"><span>Display name</span><input id="profile-name" maxLength={40} value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                {profileError && <p className="profile-error" role="alert">{profileError}</p>}
                <p className="profile-privacy">Your name and photo are saved only in this browser on this device.</p>
                <div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={() => setProfileOpen(false)}>Cancel</button><button className="primary-button" type="submit">Save profile</button></div>
              </form>
            </section>
          </div>
        )}
        {profileOpen && cloudEnabled && accountProfile && initialUser && <AccountSettings profile={accountProfile} email={initialUser.email} onClose={() => setProfileOpen(false)} onProfile={(updated) => { setCloudProfile(updated); setProfile({ name: updated.first_name, photoDataUrl: updated.avatar_url ?? "" }); setProfileOpen(false); }} />}
        {cloudEnabled && cloudProfile && !cloudProfile.onboarding_complete && !cloudLoading && !cloudError && <Onboarding profile={cloudProfile} onComplete={(updated) => { setCloudProfile(updated); setProfile({ name: updated.first_name, photoDataUrl: updated.avatar_url ?? "" }); }} />}
      </section>
    </main>
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
          return <div key={topicId}><span>{topicById.get(topicId)?.name}</span><strong>{topicCorrect}/{topicAttempts.length} · {percent(topicCorrect, topicAttempts.length)}%</strong></div>;
        })}
      </div>
      <button className="primary-button" type="button" onClick={onDone}>Return to topic selection</button>
    </section>
  );
}
