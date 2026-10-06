import type { SubscriptionEntitlement } from "./entitlements";

export const SUBJECTS = ["Hematology", "Clinical Chemistry", "Bacteriology", "AUBF"] as const;
export type GradeSubject = (typeof SUBJECTS)[number];

export const ASSESSMENT_TYPES = [
  "Pre-Test",
  "Post-Test",
  "Comprehensive Exam",
  "Written Revalida",
  "Oral Revalida",
] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const GRADE_FIELDS = [
  { key: "pre_test", label: "Pre-Test", max: 50, weight: 0.1 },
  { key: "post_test", label: "Post-Test", max: 70, weight: 0.15 },
  { key: "comprehensive", label: "Comprehensive Exam", max: 100, weight: 0.25 },
  { key: "written_revalida", label: "Written Revalida", max: 100, weight: 0.25 },
  { key: "oral_revalida", label: "Oral Revalida", max: 100, weight: 0.25 },
] as const;

export type GradeField = (typeof GRADE_FIELDS)[number]["key"];
export type GradeValues = Record<GradeField, number | null>;

export const EMPTY_GRADES: GradeValues = {
  pre_test: null,
  post_test: null,
  comprehensive: null,
  written_revalida: null,
  oral_revalida: null,
};

export const PASSING_GRADE = 65;

export const GUIDANCE_BOUNDARIES = {
  comfortable: 60,
  onTrack: 75,
  needsImprovement: 88,
} as const;

export const ACTIVITY_THRESHOLDS = {
  light: 1,
  medium: 4,
  strong: 8,
  intense: 14,
} as const;

export type Profile = {
  id: string;
  username: string;
  first_name: string;
  avatar_url: string | null;
  onboarding_complete: boolean;
  terms_accepted_at: string | null;
  terms_version: string | null;
  privacy_accepted_at: string | null;
  privacy_version: string | null;
  plan?: "free" | "pro";
  pro_started_at?: string | null;
  pro_expires_at?: string | null;
};

export function isEffectivePro(
  profile: Pick<Profile, "plan" | "pro_expires_at"> | null | undefined,
): boolean {
  return Boolean(
    profile
    && profile.plan === "pro"
    && profile.pro_expires_at
    && new Date(profile.pro_expires_at).getTime() > Date.now(),
  );
}

export type GradeRecord = GradeValues & {
  id?: string;
  user_id?: string;
  subject: GradeSubject;
};

export type DailyActivity = {
  id?: string;
  user_id?: string;
  activity_date: string;
  questions_answered: number;
  correct_answers: number;
  review_count: number;
  subjects_studied: string[];
};

export type ExamSchedule = {
  id: string;
  user_id?: string;
  subject: GradeSubject;
  assessment_type: AssessmentType;
  scheduled_date: string;
  note: string | null;
};

export const STUDY_PLAN_CATEGORIES = ["Study", "Break", "Exam", "Event", "Other"] as const;
export type StudyPlanCategory = (typeof STUDY_PLAN_CATEGORIES)[number];

export const PLANNER_EVENT_KINDS = ["class", "study", "exam", "deadline", "task"] as const;
export type PlannerEventKind = (typeof PLANNER_EVENT_KINDS)[number];

export type PlannerAttachmentMeta = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

/**
 * Local-first planner records deliberately use stable UUIDs and timestamps so
 * they can later be copied to Supabase without changing the UI data model.
 */
export type StudyPlanBlock = {
  id: string;
  startTime: string;
  endTime: string;
  activity: string;
  subject: string | null;
  topic: string | null;
  notes: string | null;
  category: StudyPlanCategory;
  addedToCalendar: boolean;
  calendarEventId: string | null;
  completed: boolean;
  // Extended academic planner properties (backward compatible):
  eventKind?: PlannerEventKind;
  room?: string | null;
  instructor?: string | null;
  targetCount?: number | null;
  targetType?: "mcq" | "flashcard" | "pages" | null;
  recurrenceDays?: number[] | null; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  recurrenceEnd?: string | null;   // YYYY-MM-DD
  dueDate?: string | null;          // For deadlines & tasks
  dueTime?: string | null;          // For deadlines & tasks
  attachments?: PlannerAttachmentMeta[];
};

export type StudyPlan = {
  id: string;
  date: string;
  title: string;
  blocks: StudyPlanBlock[];
  createdAt: string;
  updatedAt: string;
};

export type QuestionReinforcement = {
  user_id?: string;
  question_id: string;
  reinforcement_level: number;
  updated_at?: string;
};

export const QUESTION_DIFFICULTIES = ["Easy", "Medium", "Hard", "Unspecified"] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const REVIEW_MODES = [
  "reviewer",
  "adaptive",
  "wrong_answers",
  "weakness_focus",
  "pre_test",
  "post_test",
  "oral_review",
] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

/**
 * Question metadata is copied onto each attempt because RevIT's official
 * question bank is bundled with the app rather than stored in Supabase.
 * This keeps old analytics stable if a question is reorganized later.
 */
export type QuestionAttempt = {
  id: string;
  userId?: string;
  questionId: string;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  subtopic: string;
  difficulty: QuestionDifficulty;
  selectedAnswer: number | null;
  correct: boolean;
  attemptNumber: number;
  reviewMode: ReviewMode;
  sessionId: string | null;
  isAdaptiveRepeat: boolean;
  timestamp: string;
};

export type UserPreferences = {
  user_id?: string;
  timezone: string;
  theme: "light" | "dark" | "system";
  leaderboard_opt_in: boolean;
  mtap_features_enabled: boolean;
  mtap_onboarding_completed: boolean;
};

export type CloudSnapshot = {
  profile: Profile | null;
  grades: GradeRecord[];
  activity: DailyActivity[];
  exams: ExamSchedule[];
  preferences: UserPreferences | null;
  reinforcement: QuestionReinforcement[];
  attempts: QuestionAttempt[];
  attemptHistoryAvailable: boolean;
  entitlement: SubscriptionEntitlement;
  customGradebooks?: CustomGradebook[];
};

export type AchievementConditionType =
  | "questions_answered"
  | "ai_messages"
  | "streak_days"
  | "exam_created"
  | "study_sessions";

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  xp_reward: number;
  condition_type: AchievementConditionType;
  condition_value: number;
  created_at?: string;
};

export type UserAchievement = {
  id: string;
  user_id?: string;
  achievement_id: string;
  unlocked_at: string;
};

export type ProgressionSnapshot = {
  totalXp: number;
  achievements: Achievement[];
  unlocked: UserAchievement[];
  studySessions: number;
};

export type ProgressMetrics = {
  questionsAnswered: number;
  aiMessages: number;
  streakDays: number;
  examsCreated: number;
};

export type GradebookTemplateType = "nu_moa_mtap1" | "custom";

export type CustomGradeAssessment = {
  id: string;
  categoryId: string;
  name: string;
  score: number | null;
  maxScore: number;
  position: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomGradeCategory = {
  id: string;
  gradebookId: string;
  name: string;
  weight: number;
  position: number;
  assessments: CustomGradeAssessment[];
  createdAt?: string;
  updatedAt?: string;
};

export type CustomGradebook = {
  id: string;
  userId: string;
  name: string;
  subjectCode: string | null;
  templateType: GradebookTemplateType;
  passingGrade: number;
  position: number;
  categories: CustomGradeCategory[];
  createdAt?: string;
  updatedAt?: string;
};
