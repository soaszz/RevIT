import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CloudSnapshot,
  DailyActivity,
  ExamSchedule,
  GradeRecord,
  GradeSubject,
  Profile,
  QuestionAttempt,
  QuestionReinforcement,
  UserPreferences,
} from "./domain";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Cloud sync failed.";
}

export function isMissingQuestionReinforcementTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST205"
    || error.code === "42P01"
    || (error.message?.includes("question_reinforcement") && error.message.includes("schema cache"))
    || false;
}

export function isMissingQuestionAttemptsTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST205"
    || error.code === "42P01"
    || (error.message?.includes("question_attempts") && error.message.includes("schema cache"))
    || false;
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

export async function loadCloudSnapshot(client: SupabaseClient, userId: string): Promise<CloudSnapshot> {
  const [profile, grades, activity, exams, preferences, reinforcement, attempts] = await Promise.all([
    client.from("profiles").select("id,username,first_name,avatar_url,onboarding_complete").eq("id", userId).maybeSingle(),
    client.from("grades").select("id,user_id,subject,pre_test,post_test,comprehensive,written_revalida,oral_revalida").eq("user_id", userId),
    client.from("daily_activity").select("id,user_id,activity_date,questions_answered,correct_answers,review_count,subjects_studied").eq("user_id", userId).order("activity_date", { ascending: true }),
    client.from("exam_schedule").select("id,user_id,subject,assessment_type,scheduled_date,note").eq("user_id", userId).order("scheduled_date", { ascending: true }),
    client.from("user_preferences").select("user_id,timezone,theme").eq("user_id", userId).maybeSingle(),
    client.from("question_reinforcement").select("user_id,question_id,reinforcement_level,updated_at").eq("user_id", userId),
    client.from("question_attempts").select(QUESTION_ATTEMPT_COLUMNS).eq("user_id", userId)
      .order("answered_at", { ascending: false }).limit(5000),
  ]);
  const failure = [profile, grades, activity, exams, preferences].find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
  if (reinforcement.error && !isMissingQuestionReinforcementTableError(reinforcement.error)) {
    throw new Error(reinforcement.error.message);
  }
  if (attempts.error && !isMissingQuestionAttemptsTableError(attempts.error)) {
    throw new Error(attempts.error.message);
  }
  return {
    profile: profile.data as Profile | null,
    grades: (grades.data ?? []) as GradeRecord[],
    activity: (activity.data ?? []) as DailyActivity[],
    exams: (exams.data ?? []) as ExamSchedule[],
    preferences: preferences.data as UserPreferences | null,
    reinforcement: (reinforcement.error ? [] : reinforcement.data ?? []) as QuestionReinforcement[],
    attempts: (attempts.error ? [] : attempts.data ?? []).map((row) => questionAttemptFromRow(row as QuestionAttemptRow)),
    attemptHistoryAvailable: !attempts.error,
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
  if (localStorage.getItem(marker) === "complete") return;
  for (const attempt of [...attempts].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    await saveQuestionAttempt(client, attempt);
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

export async function flushQuestionAttemptQueue(client: SupabaseClient, userId: string) {
  const key = questionAttemptQueueKey(userId);
  const queued = JSON.parse(localStorage.getItem(key) ?? "[]") as QuestionAttempt[];
  const remaining: QuestionAttempt[] = [];
  for (const attempt of queued) {
    try { await saveQuestionAttempt(client, attempt); } catch { remaining.push(attempt); }
  }
  localStorage.setItem(key, JSON.stringify(remaining));
  return remaining.length;
}

export async function saveProfile(client: SupabaseClient, profile: Profile) {
  const { data, error } = await client.from("profiles").upsert({
    id: profile.id,
    username: profile.username.trim().toLowerCase(),
    first_name: profile.first_name.trim(),
    avatar_url: profile.avatar_url,
    onboarding_complete: profile.onboarding_complete,
  }).select("id,username,first_name,avatar_url,onboarding_complete").single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function uploadAvatar(client: SupabaseClient, userId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await client.storage.from("avatars").upload(path, file, { cacheControl: "3600", upsert: true });
  if (error) throw new Error(error.message);
  return client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
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
  const { error } = await client.from("user_preferences").upsert({ ...preferences, user_id: userId });
  if (error) throw new Error(error.message);
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
  const { error } = await client.rpc("record_study_activity", {
    p_event_key: input.eventKey,
    p_activity_date: input.activityDate,
    p_questions: input.questions ?? 0,
    p_correct: input.correct ?? 0,
    p_review_count: input.reviews ?? 0,
    p_subject: input.subject ?? null,
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
    await recordActivity(client, {
      eventKey: attempt.id ? `answer:${attempt.id}` : `legacy-answer:${attempt.questionId}:${attempt.timestamp}`,
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
  };
}

export function subjectForReviewer(subjectId: string): GradeSubject {
  return subjectId.toLowerCase().includes("bact") ? "Bacteriology" : "Hematology";
}
