import type { SupabaseClient } from "@supabase/supabase-js";
import type { Achievement, ProgressionSnapshot, ProgressMetrics, UserAchievement } from "./domain";
import { ACHIEVEMENT_CATALOG, metricForCondition } from "./xpConfig";

export type ProgressEvent = {
  eventKey: string;
  eventType: "question_answered" | "study_session_completed" | "ai_review" | "daily_streak" | "first_ai_message" | "first_exam";
  xp: number;
  activityDate: string;
  questions?: number;
  correct?: number;
  reviews?: number;
  subjectId?: string;
  subjectName?: string;
};

export type ProgressionUpdate = { snapshot: ProgressionSnapshot; newlyUnlocked: Achievement[] };
type LocalProgressStore = { totalXp: number; eventKeys: string[]; unlocked: UserAchievement[] };

const LOCAL_PROGRESS_VERSION = "v1";
const CLOUD_QUEUE_VERSION = "v1";

function normalizedEventType(event: ProgressEvent) {
  if (event.eventType) return event.eventType;
  if (event.eventKey.startsWith("answer:")) return "question_answered";
  if (event.eventKey.startsWith("study-session:")) return "study_session_completed";
  if (event.eventKey.startsWith("ai-review:")) return "ai_review";
  if (event.eventKey.startsWith("xp:daily-streak:")) return "daily_streak";
  if (event.eventKey === "xp:first-ai-message") return "first_ai_message";
  if (event.eventKey === "xp:first-exam") return "first_exam";
  throw new Error("Unknown queued progression event type.");
}

function localProgressKey(ownerKey: string) { return `revit-progression-${LOCAL_PROGRESS_VERSION}:${ownerKey}`; }
function cloudQueueKey(userId: string) { return `revit-progression-queue-${CLOUD_QUEUE_VERSION}:${userId}`; }
function emptyLocalStore(): LocalProgressStore { return { totalXp: 0, eventKeys: [], unlocked: [] }; }

function readLocalStore(ownerKey: string): LocalProgressStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(localProgressKey(ownerKey)) ?? "null") as Partial<LocalProgressStore> | null;
    if (!parsed) return emptyLocalStore();
    return {
      totalXp: Number.isFinite(parsed.totalXp) ? Math.max(0, Math.floor(parsed.totalXp!)) : 0,
      eventKeys: Array.isArray(parsed.eventKeys) ? [...new Set(parsed.eventKeys.filter((key): key is string => typeof key === "string"))] : [],
      unlocked: Array.isArray(parsed.unlocked)
        ? parsed.unlocked.filter((item): item is UserAchievement => Boolean(item && typeof item.achievement_id === "string" && typeof item.unlocked_at === "string"))
        : [],
    };
  } catch { return emptyLocalStore(); }
}

function writeLocalStore(ownerKey: string, store: LocalProgressStore) {
  localStorage.setItem(localProgressKey(ownerKey), JSON.stringify(store));
}

function snapshotFromLocal(store: LocalProgressStore): ProgressionSnapshot {
  return {
    totalXp: store.totalXp,
    achievements: ACHIEVEMENT_CATALOG,
    unlocked: store.unlocked,
    studySessions: store.eventKeys.filter((key) => key.startsWith("study-session:")).length,
  };
}

function unlockLocalAchievements(store: LocalProgressStore, metrics: ProgressMetrics) {
  const unlockedIds = new Set(store.unlocked.map((item) => item.achievement_id));
  const studySessions = store.eventKeys.filter((key) => key.startsWith("study-session:")).length;
  const newlyUnlocked = ACHIEVEMENT_CATALOG.filter((achievement) => (
    !unlockedIds.has(achievement.id)
    && metricForCondition(achievement.condition_type, { ...metrics, studySessions }) >= achievement.condition_value
  ));
  if (!newlyUnlocked.length) return newlyUnlocked;
  const unlockedAt = new Date().toISOString();
  store.unlocked.push(...newlyUnlocked.map((achievement) => ({ id: crypto.randomUUID(), achievement_id: achievement.id, unlocked_at: unlockedAt })));
  store.totalXp += newlyUnlocked.reduce((sum, achievement) => sum + achievement.xp_reward, 0);
  return newlyUnlocked;
}

export function loadLocalProgression(ownerKey: string, metrics: ProgressMetrics): ProgressionUpdate {
  const store = readLocalStore(ownerKey);
  const newlyUnlocked = unlockLocalAchievements(store, metrics);
  if (newlyUnlocked.length) writeLocalStore(ownerKey, store);
  return { snapshot: snapshotFromLocal(store), newlyUnlocked };
}

export function recordLocalProgressEvents(ownerKey: string, events: ProgressEvent[], metrics: ProgressMetrics): ProgressionUpdate {
  const store = readLocalStore(ownerKey);
  const knownEvents = new Set(store.eventKeys);
  for (const event of events) {
    if (knownEvents.has(event.eventKey)) continue;
    knownEvents.add(event.eventKey);
    store.eventKeys.push(event.eventKey);
    store.totalXp += Math.max(0, Math.floor(event.xp));
  }
  const newlyUnlocked = unlockLocalAchievements(store, metrics);
  writeLocalStore(ownerKey, store);
  return { snapshot: snapshotFromLocal(store), newlyUnlocked };
}

async function checkCloudAchievements(client: SupabaseClient) {
  const { data, error } = await client.rpc("check_and_unlock_achievements");
  if (error) throw new Error(error.message);
  return (data ?? []) as Achievement[];
}

async function loadCloudProgressionRows(client: SupabaseClient, userId: string): Promise<ProgressionSnapshot> {
  const [progress, achievements, unlocked, sessions] = await Promise.all([
    client.from("user_progress").select("total_xp").eq("user_id", userId).maybeSingle(),
    client.from("achievements").select("id,name,description,icon,xp_reward,condition_type,condition_value,created_at").order("condition_value", { ascending: true }),
    client.from("user_achievements").select("id,user_id,achievement_id,unlocked_at").eq("user_id", userId).order("unlocked_at", { ascending: true }),
    client.from("activity_events").select("id", { count: "exact", head: true }).eq("user_id", userId).like("event_key", "study-session:%"),
  ]);
  const failure = [progress, achievements, unlocked, sessions].find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
  return {
    totalXp: Number(progress.data?.total_xp ?? 0),
    achievements: (achievements.data ?? []) as Achievement[],
    unlocked: (unlocked.data ?? []) as UserAchievement[],
    studySessions: sessions.count ?? 0,
  };
}

export async function loadCloudProgression(client: SupabaseClient, userId: string): Promise<ProgressionUpdate> {
  const newlyUnlocked = await checkCloudAchievements(client);
  return { snapshot: await loadCloudProgressionRows(client, userId), newlyUnlocked };
}

export async function recordCloudProgressEvents(client: SupabaseClient, userId: string, events: ProgressEvent[]): Promise<ProgressionUpdate> {
  for (const event of events) {
    const { error } = await client.rpc("record_study_activity", {
      p_event_key: event.eventKey,
      p_event_type: normalizedEventType(event),
    });
    if (error) throw new Error(error.message);
  }
  const newlyUnlocked = await checkCloudAchievements(client);
  return { snapshot: await loadCloudProgressionRows(client, userId), newlyUnlocked };
}

export function queueCloudProgressEvents(userId: string, events: ProgressEvent[]) {
  const key = cloudQueueKey(userId);
  try {
    const current = JSON.parse(localStorage.getItem(key) ?? "[]") as ProgressEvent[];
    const byKey = new Map(current.map((event) => [event.eventKey, event]));
    events.forEach((event) => byKey.set(event.eventKey, event));
    localStorage.setItem(key, JSON.stringify([...byKey.values()]));
  } catch { localStorage.setItem(key, JSON.stringify(events)); }
}

export async function flushCloudProgressEventQueue(client: SupabaseClient, userId: string) {
  const key = cloudQueueKey(userId);
  const queued = JSON.parse(localStorage.getItem(key) ?? "[]") as ProgressEvent[];
  if (!queued.length) return null;
  const update = await recordCloudProgressEvents(client, userId, queued);
  localStorage.removeItem(key);
  return update;
}

export function emptyProgression(): ProgressionSnapshot {
  return { totalXp: 0, achievements: ACHIEVEMENT_CATALOG, unlocked: [], studySessions: 0 };
}

export function markCurrentLevelSeen(ownerKey: string, level: number) {
  const key = `revit-level-notified-v1:${ownerKey}`;
  const seen = Number(localStorage.getItem(key) ?? 0);
  if (level > seen) localStorage.setItem(key, String(level));
}

export function shouldShowLevelUp(ownerKey: string, level: number) {
  const key = `revit-level-notified-v1:${ownerKey}`;
  const seen = Number(localStorage.getItem(key) ?? 0);
  if (level <= seen) return false;
  localStorage.setItem(key, String(level));
  return true;
}
