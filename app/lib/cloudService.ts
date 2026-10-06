import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CloudSnapshot,
  CustomGradeAssessment,
  CustomGradeCategory,
  CustomGradebook,
  DailyActivity,
  ExamSchedule,
  GradeRecord,
  GradeSubject,
  Profile,
  QuestionAttempt,
  QuestionReinforcement,
  UserPreferences,
} from "./domain";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "./legal";
import { validateAvatarFile } from "./avatarValidation";
import { FREE_ENTITLEMENT, type SubscriptionEntitlement } from "./entitlements";

const PROFILE_COLUMNS = "id,username,first_name,avatar_url,onboarding_complete,terms_accepted_at,terms_version,privacy_accepted_at,privacy_version";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Cloud sync failed.";
}

export function isMissingGradebooksTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const msg = error.message?.toLowerCase() ?? "";
  return error.code === "PGRST205"
    || error.code === "42P01"
    || error.code === "404"
    || msg.includes("gradebooks")
    || false;
}

export function universalGradebooksStorageKey(userId?: string | null) {
  return `revit-universal-gradebooks-v1:${userId ?? "local"}`;
}

export function isMissingQuestionReinforcementTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const msg = error.message?.toLowerCase() ?? "";
  return error.code === "PGRST205"
    || error.code === "42P01"
    || error.code === "404"
    || msg.includes("question_reinforcement")
    || false;
}

export function isMissingQuestionAttemptsTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST205"
    || error.code === "42P01"
    || (error.message?.includes("question_attempts") && error.message.includes("schema cache"))
    || false;
}

export function isMissingLeaderboardSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST202"
    || error.code === "PGRST204"
    || error.code === "42703"
    || (error.message?.toLowerCase().includes("leaderboard") ?? false);
}

export function isMissingMtapPreferenceSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "PGRST202"
    || error.code === "PGRST204"
    || error.code === "42703"
    || message.includes("mtap_features_enabled")
    || message.includes("mtap_onboarding_completed");
}

type QuestionAttemptRow = {
  id: string;
  user_id: string;
  question_id: string;
  subject_id: string;
  subject_name: string;
  topic_id: string;
  topic_name: string;
  subtopic: string;
  difficulty: QuestionAttempt["difficulty"];
  selected_answer: number | null;
  is_correct: boolean;
  attempt_number: number;
  review_mode: QuestionAttempt["reviewMode"];
  session_id: string | null;
  is_adaptive_repeat: boolean;
  answered_at: string;
};

function questionAttemptFromRow(row: QuestionAttemptRow): QuestionAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    questionId: row.question_id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    topicId: row.topic_id,
    topicName: row.topic_name,
    subtopic: row.subtopic,
    difficulty: row.difficulty,
    selectedAnswer: row.selected_answer,
    correct: row.is_correct,
    attemptNumber: row.attempt_number,
    reviewMode: row.review_mode,
    sessionId: row.session_id,
    isAdaptiveRepeat: row.is_adaptive_repeat,
    timestamp: row.answered_at,
  };
}

const QUESTION_ATTEMPT_COLUMNS = "id,user_id,question_id,subject_id,subject_name,topic_id,topic_name,subtopic,difficulty,selected_answer,is_correct,attempt_number,review_mode,session_id,is_adaptive_repeat,answered_at";
const SNAPSHOT_ROW_LIMIT = 1000;
const REINFORCEMENT_PAGE_LIMIT = 1000;
const REINFORCEMENT_MAX_ROWS = 10000;

type EntitlementRow = {
  stored_plan?: unknown;
  effective_plan?: unknown;
  pro_started_at?: unknown;
  pro_expires_at?: unknown;
  server_now?: unknown;
};

function subscriptionEntitlement(value: unknown): SubscriptionEntitlement {
  const row = (Array.isArray(value) ? value[0] : value) as EntitlementRow | null;
  if (!row) return FREE_ENTITLEMENT;
  return {
    storedPlan: row.stored_plan === "pro" ? "pro" : "free",
    effectivePlan: row.effective_plan === "pro" ? "pro" : "free",
    proStartedAt: typeof row.pro_started_at === "string" ? row.pro_started_at : null,
    proExpiresAt: typeof row.pro_expires_at === "string" ? row.pro_expires_at : null,
    serverNow: typeof row.server_now === "string" ? row.server_now : null,
  };
}

async function loadQuestionReinforcement(client: SupabaseClient, userId: string) {
  const rows: QuestionReinforcement[] = [];
  for (let offset = 0; offset < REINFORCEMENT_MAX_ROWS; offset += REINFORCEMENT_PAGE_LIMIT) {
    const page = await client.from("question_reinforcement")
      .select("user_id,question_id,reinforcement_level,updated_at")
      .eq("user_id", userId)
      .order("question_id", { ascending: true })
      .range(offset, offset + REINFORCEMENT_PAGE_LIMIT - 1);
    if (page.error) return { data: rows, error: page.error };
    rows.push(...((page.data ?? []) as QuestionReinforcement[]));
    if ((page.data?.length ?? 0) < REINFORCEMENT_PAGE_LIMIT) break;
  }
  return { data: rows, error: null };
}

export async function loadCloudSnapshot(client: SupabaseClient, userId: string): Promise<CloudSnapshot> {
  if (client.auth && typeof client.auth.getSession === "function") {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session) {
      const { data: refreshed } = await client.auth.refreshSession().catch(() => ({ data: { session: null } }));
      if (!refreshed?.session) {
        throw new Error("AUTH_SESSION_EXPIRED");
      }
    }
  }

  const preferencesPromise = (async () => {
    const mtap = await client.from("user_preferences")
      .select("user_id,timezone,theme,leaderboard_opt_in,mtap_features_enabled,mtap_onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle();
    if (!mtap.error) return mtap;
    if (!isMissingMtapPreferenceSchemaError(mtap.error)) return mtap;
    const current = await client.from("user_preferences")
      .select("user_id,timezone,theme,leaderboard_opt_in")
      .eq("user_id", userId)
      .maybeSingle();
    if (!current.error) return {
      ...current,
      data: current.data ? {
        ...current.data,
        mtap_features_enabled: false,
        mtap_onboarding_completed: false,
      } : null,
    };
    if (!isMissingLeaderboardSchemaError(current.error)) return current;
    const legacy = await client.from("user_preferences")
      .select("user_id,timezone,theme")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      ...legacy,
      data: legacy.data ? {
        ...legacy.data,
        leaderboard_opt_in: false,
        mtap_features_enabled: false,
        mtap_onboarding_completed: false,
      } : null,
    };
  })();
  const [profile, grades, activity, exams, preferences, reinforcement, attempts, entitlement, customGradebooks] = await Promise.all([
    client.from("profiles").select(`${PROFILE_COLUMNS},plan,pro_started_at,pro_expires_at`).eq("id", userId).maybeSingle()
      .then((res) => res.error ? client.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle() : res),
    client.from("grades").select("id,user_id,subject,pre_test,post_test,comprehensive,written_revalida,oral_revalida").eq("user_id", userId),
    client.from("daily_activity").select("id,user_id,activity_date,questions_answered,correct_answers,review_count,subjects_studied").eq("user_id", userId)
      .order("activity_date", { ascending: false }).limit(SNAPSHOT_ROW_LIMIT),
    client.from("exam_schedule").select("id,user_id,subject,assessment_type,scheduled_date,note").eq("user_id", userId).order("scheduled_date", { ascending: true }),
    preferencesPromise,
    loadQuestionReinforcement(client, userId),
    client.from("question_attempts").select(QUESTION_ATTEMPT_COLUMNS).eq("user_id", userId)
      .order("answered_at", { ascending: false }).limit(1000),
    client.rpc("get_my_entitlement"),
    loadCustomGradebooks(client, userId).catch(() => []),
  ]);
  const failure = [profile, grades, activity, exams, preferences].find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
  if (reinforcement.error && !isMissingQuestionReinforcementTableError(reinforcement.error)) {
    throw new Error(reinforcement.error.message);
  }
  if (attempts.error && !isMissingQuestionAttemptsTableError(attempts.error)) {
    throw new Error(attempts.error.message);
  }
  const isMissingEntitlementRpc = entitlement.error && (
    entitlement.error.code === "PGRST202"
    || entitlement.error.code === "42883"
    || (entitlement.error.message?.toLowerCase().includes("get_my_entitlement") ?? false)
  );
  if (entitlement.error && !isMissingEntitlementRpc) throw new Error(entitlement.error.message);
  return {
    profile: profile.data as Profile | null,
    grades: (grades.data ?? []) as GradeRecord[],
    activity: ((activity.data ?? []) as DailyActivity[]).reverse(),
    exams: (exams.data ?? []) as ExamSchedule[],
    preferences: preferences.data as UserPreferences | null,
    reinforcement: (reinforcement.error ? [] : reinforcement.data ?? []) as QuestionReinforcement[],
    attempts: (attempts.error ? [] : attempts.data ?? []).map((row) => questionAttemptFromRow(row as QuestionAttemptRow)),
    attemptHistoryAvailable: !attempts.error,
    entitlement: subscriptionEntitlement(entitlement.data),
    customGradebooks: (customGradebooks ?? []) as CustomGradebook[],
  };
}

export async function saveQuestionAttempt(client: SupabaseClient, attempt: QuestionAttempt) {
  const { data, error } = await client.rpc("record_question_attempt", {
    p_id: attempt.id,
    p_question_id: attempt.questionId,
    p_subject_id: attempt.subjectId,
    p_subject_name: attempt.subjectName,
    p_topic_id: attempt.topicId,
    p_topic_name: attempt.topicName,
    p_subtopic: attempt.subtopic,
    p_difficulty: attempt.difficulty,
    p_selected_answer: attempt.selectedAnswer,
    p_is_correct: attempt.correct,
    p_review_mode: attempt.reviewMode,
    p_session_id: attempt.sessionId,
    p_is_adaptive_repeat: attempt.isAdaptiveRepeat,
    p_answered_at: attempt.timestamp,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("The question attempt was not returned by Supabase.");
  return questionAttemptFromRow(row as QuestionAttemptRow);
}

export async function migrateLocalQuestionAttempts(
  client: SupabaseClient,
  userId: string,
  attempts: QuestionAttempt[],
) {
  const marker = `revit-question-attempts-migrated-v1:${userId}`;
  if (localStorage.getItem(marker) === "complete" || attempts.length === 0) return;
  const unmigrated = attempts.filter((a) => !a.id.startsWith("cloud_"));
  if (unmigrated.length === 0) {
    localStorage.setItem(marker, "complete");
    return;
  }
  for (const attempt of [...unmigrated].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    try {
      await saveQuestionAttempt(client, attempt);
    } catch {
      return;
    }
  }
  localStorage.setItem(marker, "complete");
}

function questionAttemptQueueKey(userId: string) {
  return `revit-question-attempt-queue-v1:${userId}`;
}

export function queueQuestionAttempt(userId: string, attempt: QuestionAttempt) {
  try {
    const key = questionAttemptQueueKey(userId);
    const queued = JSON.parse(localStorage.getItem(key) ?? "[]") as QuestionAttempt[];
    if (!queued.some((item) => item.id === attempt.id)) queued.push(attempt);
    localStorage.setItem(key, JSON.stringify(queued));
  } catch (error) {
    console.warn(errorMessage(error));
  }
}

export function getQueuedQuestionAttemptsCount(userId: string): number {
  try {
    const key = questionAttemptQueueKey(userId);
    const queued = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
    return queued.length;
  } catch {
    return 0;
  }
}

function reinforcementQueueKey(userId: string) {
  return `revit-question-reinforcement-queue-v1:${userId}`;
}

export function queueQuestionReinforcement(userId: string, questionId: string, reinforcementLevel: number) {
  try {
    const key = reinforcementQueueKey(userId);
    const queued = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number>;
    queued[questionId] = reinforcementLevel;
    localStorage.setItem(key, JSON.stringify(queued));
  } catch (error) {
    console.warn(errorMessage(error));
  }
}

export function getQueuedQuestionReinforcementCount(userId: string): number {
  try {
    return Object.keys(JSON.parse(localStorage.getItem(reinforcementQueueKey(userId)) ?? "{}") as object).length;
  } catch {
    return 0;
  }
}

export async function flushQuestionReinforcementQueue(client: SupabaseClient, userId: string) {
  const key = reinforcementQueueKey(userId);
  const queued = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number>;
  const failed = new Set<string>();
  const entries = Object.entries(queued);
  for (let index = 0; index < entries.length; index += 1) {
    const [questionId, reinforcementLevel] = entries[index];
    try { await saveQuestionReinforcement(client, userId, questionId, reinforcementLevel); }
    catch {
      entries.slice(index).forEach(([remainingQuestionId]) => failed.add(remainingQuestionId));
      break;
    }
  }
  const current = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number>;
  const remaining = Object.fromEntries(Object.entries(current).filter(([questionId, level]) =>
    failed.has(questionId) || queued[questionId] !== level));
  if (Object.keys(remaining).length) localStorage.setItem(key, JSON.stringify(remaining));
  else localStorage.removeItem(key);
  return Object.keys(remaining).length;
}

export async function flushQuestionAttemptQueue(client: SupabaseClient, userId: string) {
  const key = questionAttemptQueueKey(userId);
  const queued = JSON.parse(localStorage.getItem(key) ?? "[]") as QuestionAttempt[];
  const failed = new Set<string>();
  for (let index = 0; index < queued.length; index += 1) {
    try { await saveQuestionAttempt(client, queued[index]); }
    catch {
      queued.slice(index).forEach((attempt) => failed.add(attempt.id));
      break;
    }
  }
  const processed = new Set(queued.map((attempt) => attempt.id));
  const current = JSON.parse(localStorage.getItem(key) ?? "[]") as QuestionAttempt[];
  const remaining = current.filter((attempt) => !processed.has(attempt.id) || failed.has(attempt.id));
  if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
  else localStorage.removeItem(key);
  return remaining.length;
}

export async function saveProfile(client: SupabaseClient, profile: Profile) {
  const { data, error } = await client.from("profiles").upsert({
    id: profile.id,
    username: profile.username.trim().toLowerCase(),
    first_name: profile.first_name.trim(),
    avatar_url: profile.avatar_url,
    onboarding_complete: profile.onboarding_complete,
  }).select(PROFILE_COLUMNS).single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function uploadAvatar(client: SupabaseClient, userId: string, file: File) {
  const validated = await validateAvatarFile(file);
  const version = Date.now();
  const path = `${userId}/avatar.${validated.extension}`;
  const { error } = await client.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    contentType: validated.contentType,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return `${client.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${version}`;
}

export async function saveGrade(client: SupabaseClient, userId: string, record: GradeRecord) {
  const { data, error } = await client.from("grades").upsert({ ...record, user_id: userId }, { onConflict: "user_id,subject" })
    .select("id,user_id,subject,pre_test,post_test,comprehensive,written_revalida,oral_revalida").single();
  if (error) throw new Error(error.message);
  return data as GradeRecord;
}

export async function saveExam(client: SupabaseClient, userId: string, exam: Omit<ExamSchedule, "id"> & { id?: string }) {
  const payload = { ...exam, user_id: userId };
  const query = exam.id
    ? client.from("exam_schedule").update(payload).eq("id", exam.id).eq("user_id", userId)
    : client.from("exam_schedule").upsert(payload, { onConflict: "user_id,subject,assessment_type" });
  const { data, error } = await query.select("id,user_id,subject,assessment_type,scheduled_date,note").single();
  if (error) throw new Error(error.message);
  return data as ExamSchedule;
}

export async function deleteExam(client: SupabaseClient, userId: string, id: string) {
  const { error } = await client.from("exam_schedule").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function savePreferences(client: SupabaseClient, userId: string, preferences: UserPreferences) {
  const { data, error } = await client.from("user_preferences")
    .upsert({ ...preferences, user_id: userId })
    .select("user_id,timezone,theme,leaderboard_opt_in,mtap_features_enabled,mtap_onboarding_completed")
    .single();
  if (error) throw new Error(error.message);
  return data as UserPreferences;
}

export async function acceptLegalConsent(client: SupabaseClient) {
  const { data, error } = await client.rpc("accept_current_legal_terms", {
    p_terms_version: CURRENT_TERMS_VERSION,
    p_privacy_version: CURRENT_PRIVACY_VERSION,
  });
  if (error) throw new Error(error.message);
  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile) throw new Error("The agreement record was not returned by Supabase.");
  return profile as Profile;
}

export async function saveQuestionReinforcement(
  client: SupabaseClient,
  userId: string,
  questionId: string,
  reinforcementLevel: number,
) {
  if (reinforcementLevel <= 0) {
    const { error } = await client.from("question_reinforcement")
      .delete().eq("user_id", userId).eq("question_id", questionId);
    if (error && !isMissingQuestionReinforcementTableError(error)) throw new Error(error.message);
    return;
  }

  const { error } = await client.from("question_reinforcement").upsert({
    user_id: userId,
    question_id: questionId,
    reinforcement_level: reinforcementLevel,
  }, { onConflict: "user_id,question_id" });
  if (error && !isMissingQuestionReinforcementTableError(error)) throw new Error(error.message);
}

export async function recordActivity(client: SupabaseClient, input: {
  eventKey: string;
  activityDate: string;
  questions?: number;
  correct?: number;
  reviews?: number;
  subject?: string;
}) {
  const eventType = input.eventKey.startsWith("answer:")
    ? "question_answered"
    : input.eventKey.startsWith("ai-review:")
      ? "ai_review"
      : null;
  if (!eventType) throw new Error("This legacy activity event cannot be validated for migration.");
  const { error } = await client.rpc("record_study_activity", {
    p_event_key: input.eventKey,
    p_event_type: eventType,
  });
  if (error) throw new Error(error.message);
}

export async function migrateLocalActivity(
  client: SupabaseClient,
  userId: string,
  timeZone: string,
  attempts: Array<{ id?: string; questionId: string; timestamp: string; correct: boolean; subjectId: string }>,
  subjectName: (id: string) => string,
) {
  const marker = `revit-cloud-migrated-v1:${userId}`;
  if (localStorage.getItem(marker) === "complete") return;
  for (const attempt of attempts) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(attempt.timestamp));
    if (!attempt.id) continue;
    await recordActivity(client, {
      eventKey: `answer:${attempt.id}`,
      activityDate: date,
      questions: 1,
      correct: attempt.correct ? 1 : 0,
      subject: subjectName(attempt.subjectId),
    });
  }
  localStorage.setItem(marker, "complete");
}

export function queueActivity(input: Parameters<typeof recordActivity>[1]) {
  try {
    const key = "revit-activity-queue-v1";
    const queue = JSON.parse(localStorage.getItem(key) ?? "[]") as Parameters<typeof recordActivity>[1][];
    if (!queue.some((entry) => entry.eventKey === input.eventKey)) queue.push(input);
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (error) {
    console.warn(errorMessage(error));
  }
}

export async function flushActivityQueue(client: SupabaseClient) {
  const key = "revit-activity-queue-v1";
  const queue = JSON.parse(localStorage.getItem(key) ?? "[]") as Parameters<typeof recordActivity>[1][];
  const remaining: typeof queue = [];
  for (const item of queue) {
    try { await recordActivity(client, item); } catch { remaining.push(item); }
  }
  localStorage.setItem(key, JSON.stringify(remaining));
}

export function localProfileToCloud(userId: string, username: string, name: string, photoDataUrl: string): Profile {
  return {
    id: userId,
    username,
    first_name: name.trim().split(/\s+/)[0] || "Learner",
    avatar_url: photoDataUrl.startsWith("http") ? photoDataUrl : null,
    onboarding_complete: false,
    terms_accepted_at: null,
    terms_version: null,
    privacy_accepted_at: null,
    privacy_version: null,
  };
}

export function subjectForReviewer(subjectId: string): GradeSubject {
  return subjectId.toLowerCase().includes("bact") ? "Bacteriology" : "Hematology";
}

/* ==========================================================================
   Universal Gradebook Cloud Operations
   ========================================================================== */

export async function loadCustomGradebooks(client: SupabaseClient, userId: string): Promise<CustomGradebook[]> {
  try {
    const { data: books, error: booksError } = await client
      .from("gradebooks")
      .select("id,user_id,name,subject_code,template_type,passing_grade,position,created_at,updated_at")
      .eq("user_id", userId)
      .order("position", { ascending: true });

    if (booksError) {
      if (isMissingGradebooksTableError(booksError)) return [];
      throw new Error(booksError.message);
    }
    if (!books || books.length === 0) return [];

    const bookIds = books.map((b) => b.id);
    const { data: categories, error: catsError } = await client
      .from("grade_categories")
      .select("id,gradebook_id,name,weight,position,created_at,updated_at")
      .in("gradebook_id", bookIds)
      .order("position", { ascending: true });

    if (catsError) throw new Error(catsError.message);

    const categoryIds = (categories ?? []).map((c) => c.id);
    let assessments: any[] = [];
    if (categoryIds.length > 0) {
      const { data: assessData, error: assessError } = await client
        .from("grade_assessments")
        .select("id,category_id,name,score,max_score,position,created_at,updated_at")
        .in("category_id", categoryIds)
        .order("position", { ascending: true });
      if (assessError) throw new Error(assessError.message);
      assessments = assessData ?? [];
    }

    return books.map((b) => {
      const bookCats = (categories ?? [])
        .filter((c) => c.gradebook_id === b.id)
        .map((c) => ({
          id: c.id,
          gradebookId: c.gradebook_id,
          name: c.name,
          weight: Number(c.weight),
          position: c.position,
          assessments: assessments
            .filter((a) => a.category_id === c.id)
            .map((a) => ({
              id: a.id,
              categoryId: a.category_id,
              name: a.name,
              score: a.score !== null ? Number(a.score) : null,
              maxScore: Number(a.max_score),
              position: a.position,
              createdAt: a.created_at,
              updatedAt: a.updated_at,
            })),
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        }));

      return {
        id: b.id,
        userId: b.user_id,
        name: b.name,
        subjectCode: b.subject_code,
        templateType: b.template_type,
        passingGrade: Number(b.passing_grade),
        position: b.position,
        categories: bookCats,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      };
    });
  } catch (error) {
    if (isMissingGradebooksTableError(error as any)) return [];
    throw error;
  }
}

export async function saveCustomGradebook(
  client: SupabaseClient,
  userId: string,
  gradebook: {
    id?: string;
    name: string;
    subjectCode?: string | null;
    templateType?: "nu_moa_mtap1" | "custom";
    passingGrade?: number;
    position?: number;
  },
): Promise<CustomGradebook> {
  const payload = {
    ...(gradebook.id ? { id: gradebook.id } : {}),
    user_id: userId,
    name: gradebook.name,
    subject_code: gradebook.subjectCode ?? null,
    template_type: gradebook.templateType ?? "custom",
    passing_grade: gradebook.passingGrade ?? 75,
    position: gradebook.position ?? 0,
  };

  const { data, error } = await client
    .from("gradebooks")
    .upsert(payload)
    .select("id,user_id,name,subject_code,template_type,passing_grade,position,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    subjectCode: data.subject_code,
    templateType: data.template_type,
    passingGrade: Number(data.passing_grade),
    position: data.position,
    categories: [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteCustomGradebook(client: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await client.from("gradebooks").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function saveCustomCategory(
  client: SupabaseClient,
  category: {
    id?: string;
    gradebookId: string;
    name: string;
    weight: number;
    position?: number;
  },
): Promise<CustomGradeCategory> {
  const payload = {
    ...(category.id ? { id: category.id } : {}),
    gradebook_id: category.gradebookId,
    name: category.name,
    weight: category.weight,
    position: category.position ?? 0,
  };

  const { data, error } = await client
    .from("grade_categories")
    .upsert(payload)
    .select("id,gradebook_id,name,weight,position,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    gradebookId: data.gradebook_id,
    name: data.name,
    weight: Number(data.weight),
    position: data.position,
    assessments: [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteCustomCategory(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("grade_categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function saveCustomAssessment(
  client: SupabaseClient,
  assessment: {
    id?: string;
    categoryId: string;
    name: string;
    score: number | null;
    maxScore: number;
    position?: number;
  },
): Promise<CustomGradeAssessment> {
  const payload = {
    ...(assessment.id ? { id: assessment.id } : {}),
    category_id: assessment.categoryId,
    name: assessment.name,
    score: assessment.score !== null && !Number.isNaN(assessment.score) ? assessment.score : null,
    max_score: assessment.maxScore,
    position: assessment.position ?? 0,
  };

  const { data, error } = await client
    .from("grade_assessments")
    .upsert(payload)
    .select("id,category_id,name,score,max_score,position,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    categoryId: data.category_id,
    name: data.name,
    score: data.score !== null ? Number(data.score) : null,
    maxScore: Number(data.max_score),
    position: data.position,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteCustomAssessment(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("grade_assessments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
