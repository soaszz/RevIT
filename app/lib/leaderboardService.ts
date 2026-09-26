import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewerBook } from "../content/reviewerContent";
import type { QuestionAttempt } from "./domain";
import type {
  CurrentLeaderboardPosition,
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardRow,
} from "./leaderboard";

type LeaderboardRowRecord = {
  rank: number | string;
  display_name: string;
  avatar_url: string | null;
  metric_value: number | string;
  answered_count: number | string;
  is_current_user: boolean;
  period_timezone: string;
};

type CurrentPositionRecord = {
  rank: number | string | null;
  display_name: string;
  avatar_url: string | null;
  metric_value: number | string;
  answered_count: number | string;
  minimum_required: number | string;
  questions_needed: number | string;
  eligible: boolean;
  opted_in: boolean;
  percentile: number | string | null;
  participant_count: number | string;
  period_timezone: string;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRow(row: LeaderboardRowRecord): LeaderboardRow {
  return {
    rank: asNumber(row.rank),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    metricValue: asNumber(row.metric_value),
    answeredCount: asNumber(row.answered_count),
    isCurrentUser: row.is_current_user,
    periodTimezone: row.period_timezone,
  };
}

function normalizePosition(row: CurrentPositionRecord): CurrentLeaderboardPosition {
  return {
    rank: row.rank === null ? null : asNumber(row.rank),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    metricValue: asNumber(row.metric_value),
    answeredCount: asNumber(row.answered_count),
    minimumRequired: asNumber(row.minimum_required),
    questionsNeeded: asNumber(row.questions_needed),
    eligible: row.eligible,
    optedIn: row.opted_in,
    percentile: row.percentile === null ? null : asNumber(row.percentile),
    participantCount: asNumber(row.participant_count),
    periodTimezone: row.period_timezone,
  };
}

export function isCiullaAttempt(attempt: QuestionAttempt): boolean {
  return Boolean(
    attempt.questionId?.startsWith("ciulla-") ||
    attempt.subjectId?.startsWith("ciulla-") ||
    attempt.topicId?.startsWith("ciulla-")
  );
}

export function getAccuracyMinimum(period: LeaderboardPeriod): number {
  if (period === "daily") return 20;
  if (period === "weekly") return 75;
  return 200;
}

function getPeriodStartDate(period: LeaderboardPeriod, timezone = "Asia/Manila"): Date | null {
  if (period === "all_time") return null;
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value;

  if (period === "daily") {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - (8 * 3600 * 1000));
  }

  const daysFromMonday: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const diff = daysFromMonday[weekday ?? "Mon"] ?? 0;
  return new Date(Date.UTC(year, month - 1, day - diff, 0, 0, 0) - (8 * 3600 * 1000));
}

export function computeAttemptStats(
  attempts: QuestionAttempt[] | undefined,
  options: {
    book?: ReviewerBook | "all" | null;
    period: LeaderboardPeriod;
    metric: LeaderboardMetric;
    subjectId?: string | null;
    timezone?: string;
  }
) {
  const minRequired = getAccuracyMinimum(options.period);
  if (!attempts || attempts.length === 0) {
    return {
      answeredCount: 0,
      correctCount: 0,
      metricValue: 0,
      eligible: false,
      questionsNeeded: minRequired,
    };
  }

  const periodStart = getPeriodStartDate(options.period, options.timezone);

  const filtered = attempts.filter((attempt) => {
    if (periodStart && new Date(attempt.timestamp) < periodStart) return false;
    if (options.subjectId && attempt.subjectId !== options.subjectId) return false;
    if (options.book && options.book !== "all") {
      const isCiulla = isCiullaAttempt(attempt);
      if (options.book === "Ciulla" && !isCiulla) return false;
      if (options.book === "Harr" && isCiulla) return false;
    }
    return true;
  });

  const seenDays = new Set<string>();
  const eligibleAttempts: QuestionAttempt[] = [];
  const sorted = [...filtered].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const attempt of sorted) {
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: options.timezone ?? "Asia/Manila",
    }).format(new Date(attempt.timestamp));
    const dayKey = `${attempt.questionId}:${dateStr}`;
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      eligibleAttempts.push(attempt);
    }
  }

  const answeredCount = eligibleAttempts.length;
  const correctCount = eligibleAttempts.filter((a) => a.correct).length;

  let metricValue = 0;
  let eligible = false;

  if (options.metric === "questions") {
    metricValue = answeredCount;
    eligible = answeredCount > 0;
  } else if (options.metric === "accuracy") {
    metricValue = answeredCount > 0 ? Number(((correctCount / answeredCount) * 100).toFixed(1)) : 0;
    eligible = answeredCount >= minRequired;
  } else if (options.metric === "study_xp") {
    metricValue = correctCount * 5;
    eligible = metricValue > 0;
  }

  return {
    answeredCount,
    correctCount,
    metricValue,
    eligible,
    questionsNeeded: Math.max(0, minRequired - answeredCount),
  };
}

function applyLocalStats(
  rows: LeaderboardRow[],
  position: CurrentLeaderboardPosition,
  localStats: ReturnType<typeof computeAttemptStats>,
) {
  if (localStats.answeredCount >= position.answeredCount) {
    position.answeredCount = localStats.answeredCount;
    position.metricValue = localStats.metricValue;
    position.eligible = position.eligible || localStats.eligible;
    position.questionsNeeded = localStats.questionsNeeded;

    let foundInRows = false;
    for (const row of rows) {
      if (row.isCurrentUser) {
        foundInRows = true;
        row.answeredCount = localStats.answeredCount;
        row.metricValue = localStats.metricValue;
      }
    }

    if (!foundInRows && position.optedIn && position.eligible) {
      rows.push({
        rank: rows.length + 1,
        displayName: position.displayName,
        avatarUrl: position.avatarUrl,
        metricValue: position.metricValue,
        answeredCount: position.answeredCount,
        isCurrentUser: true,
        periodTimezone: position.periodTimezone,
      });
    }

    rows.sort((a, b) => b.metricValue - a.metricValue);
    rows.forEach((r, idx) => { r.rank = idx + 1; });

    const myIdx = rows.findIndex((r) => r.isCurrentUser);
    if (myIdx !== -1) {
      position.rank = myIdx + 1;
      position.participantCount = Math.max(position.participantCount, rows.length);
      position.percentile = Math.max(1, Math.round(((rows.length - myIdx) / rows.length) * 100));
    }
  }
}

export async function loadLeaderboard(client: SupabaseClient, input: {
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  subjectId: string | null;
  book?: ReviewerBook | "all" | null;
  limit?: number;
  offset?: number;
  attempts?: QuestionAttempt[];
}) {
  const bookParam = input.book && input.book !== "all" ? input.book : null;
  const parametersWithBook = {
    p_period: input.period,
    p_metric: input.metric,
    p_subject_id: input.subjectId,
    p_book: bookParam,
  };

  try {
    const [leaderboard, currentPosition] = await Promise.all([
      client.rpc("get_leaderboard", {
        ...parametersWithBook,
        p_limit: input.limit ?? 50,
        p_offset: input.offset ?? 0,
      }),
      client.rpc("get_current_user_leaderboard_position", parametersWithBook),
    ]);

    const failure = leaderboard.error ?? currentPosition.error;
    if (!failure) {
      const currentRecord = (Array.isArray(currentPosition.data) ? currentPosition.data[0] : currentPosition.data) as CurrentPositionRecord | null;
      if (!currentRecord) throw new Error("Your leaderboard position could not be loaded.");

      const normalizedPos = normalizePosition(currentRecord);
      const rows = ((leaderboard.data ?? []) as LeaderboardRowRecord[]).map(normalizeRow);

      if (input.attempts && input.attempts.length > 0) {
        if (!bookParam) {
          const harrStats = computeAttemptStats(input.attempts, {
            book: "Harr",
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });
          const ciullaStats = computeAttemptStats(input.attempts, {
            book: "Ciulla",
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });
          const allLocalStats = computeAttemptStats(input.attempts, {
            book: "all",
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });

          const harrAnswered = Math.max(normalizedPos.answeredCount, harrStats.answeredCount);
          const harrCorrect = normalizedPos.metricValue && input.metric === "accuracy"
            ? Math.round(harrAnswered * (normalizedPos.metricValue / 100))
            : harrStats.correctCount;

          const ciullaAnswered = ciullaStats.answeredCount;
          const ciullaCorrect = ciullaStats.correctCount;

          const combinedAnswered = Math.max(allLocalStats.answeredCount, harrAnswered + ciullaAnswered);
          const combinedCorrect = Math.max(allLocalStats.correctCount, harrCorrect + ciullaCorrect);

          let combinedMetricValue = 0;
          let combinedEligible = false;
          const minRequired = getAccuracyMinimum(input.period);

          if (input.metric === "questions") {
            combinedMetricValue = combinedAnswered;
            combinedEligible = combinedAnswered > 0;
          } else if (input.metric === "accuracy") {
            combinedMetricValue = combinedAnswered > 0 ? Number(((combinedCorrect / combinedAnswered) * 100).toFixed(1)) : 0;
            combinedEligible = combinedAnswered >= minRequired;
          } else if (input.metric === "study_xp") {
            combinedMetricValue = combinedCorrect * 5;
            combinedEligible = combinedMetricValue > 0;
          }

          applyLocalStats(rows, normalizedPos, {
            answeredCount: combinedAnswered,
            correctCount: combinedCorrect,
            metricValue: combinedMetricValue,
            eligible: combinedEligible,
            questionsNeeded: Math.max(0, minRequired - combinedAnswered),
          });
        } else if (bookParam === "Ciulla") {
          const ciullaStats = computeAttemptStats(input.attempts, {
            book: "Ciulla",
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });

          normalizedPos.answeredCount = ciullaStats.answeredCount;
          normalizedPos.metricValue = ciullaStats.metricValue;
          normalizedPos.eligible = ciullaStats.eligible;
          normalizedPos.questionsNeeded = ciullaStats.questionsNeeded;

          for (const row of rows) {
            if (row.isCurrentUser) {
              row.answeredCount = ciullaStats.answeredCount;
              row.metricValue = ciullaStats.metricValue;
            }
          }
        } else {
          const localStats = computeAttemptStats(input.attempts, {
            book: bookParam,
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });

          applyLocalStats(rows, normalizedPos, localStats);
        }
      }

      return {
        rows,
        currentPosition: normalizedPos,
      };
    }

    // If remote Supabase does not have p_book parameter yet (PGRST202 or schema mismatch), fallback gracefully
    if (failure.code === "PGRST202" || failure.message?.includes("p_book") || failure.message?.toLowerCase().includes("function public.get_leaderboard")) {
      const legacyParams = {
        p_period: input.period,
        p_metric: input.metric,
        p_subject_id: input.subjectId,
      };
      const [fallbackLb, fallbackPos] = await Promise.all([
        client.rpc("get_leaderboard", {
          ...legacyParams,
          p_limit: input.limit ?? 50,
          p_offset: input.offset ?? 0,
        }),
        client.rpc("get_current_user_leaderboard_position", legacyParams),
      ]);

      const fallbackFail = fallbackLb.error ?? fallbackPos.error;
      if (fallbackFail) throw new Error(fallbackFail.message);

      const currentRecord = (Array.isArray(fallbackPos.data) ? fallbackPos.data[0] : fallbackPos.data) as CurrentPositionRecord | null;
      if (!currentRecord) throw new Error("Your leaderboard position could not be loaded.");

      const normalizedPos = normalizePosition(currentRecord);
      const fallbackRows = ((fallbackLb.data ?? []) as LeaderboardRowRecord[]).map(normalizeRow);

      // If user selected Harr:
      if (bookParam === "Harr") {
        if (input.attempts && input.attempts.length > 0) {
          const localStats = computeAttemptStats(input.attempts, {
            book: "Harr",
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });

          applyLocalStats(fallbackRows, normalizedPos, localStats);
        }

        return {
          rows: fallbackRows,
          currentPosition: normalizedPos,
        };
      }

      // If user selected All Books, accurately combine remote Harr dataset with Ciulla:
      if (!bookParam) {
        if (input.attempts && input.attempts.length > 0) {
          const harrStats = computeAttemptStats(input.attempts, {
            book: "Harr",
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });
          const ciullaStats = computeAttemptStats(input.attempts, {
            book: "Ciulla",
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });
          const allLocalStats = computeAttemptStats(input.attempts, {
            book: "all",
            period: input.period,
            metric: input.metric,
            subjectId: input.subjectId,
            timezone: normalizedPos.periodTimezone,
          });

          const harrAnswered = Math.max(normalizedPos.answeredCount, harrStats.answeredCount);
          const harrCorrect = normalizedPos.metricValue && input.metric === "accuracy"
            ? Math.round(harrAnswered * (normalizedPos.metricValue / 100))
            : harrStats.correctCount;

          const ciullaAnswered = ciullaStats.answeredCount;
          const ciullaCorrect = ciullaStats.correctCount;

          const combinedAnswered = Math.max(allLocalStats.answeredCount, harrAnswered + ciullaAnswered);
          const combinedCorrect = Math.max(allLocalStats.correctCount, harrCorrect + ciullaCorrect);

          let combinedMetricValue = 0;
          let combinedEligible = false;
          const minRequired = getAccuracyMinimum(input.period);

          if (input.metric === "questions") {
            combinedMetricValue = combinedAnswered;
            combinedEligible = combinedAnswered > 0;
          } else if (input.metric === "accuracy") {
            combinedMetricValue = combinedAnswered > 0 ? Number(((combinedCorrect / combinedAnswered) * 100).toFixed(1)) : 0;
            combinedEligible = combinedAnswered >= minRequired;
          } else if (input.metric === "study_xp") {
            combinedMetricValue = combinedCorrect * 5;
            combinedEligible = combinedMetricValue > 0;
          }

          applyLocalStats(fallbackRows, normalizedPos, {
            answeredCount: combinedAnswered,
            correctCount: combinedCorrect,
            metricValue: combinedMetricValue,
            eligible: combinedEligible,
            questionsNeeded: Math.max(0, minRequired - combinedAnswered),
          });
        }

        return {
          rows: fallbackRows,
          currentPosition: normalizedPos,
        };
      }

      // If user selected Ciulla:
      if (bookParam === "Ciulla") {
        const userStats = computeAttemptStats(input.attempts, {
          book: "Ciulla",
          period: input.period,
          metric: input.metric,
          subjectId: input.subjectId,
          timezone: normalizedPos.periodTimezone,
        });

        const finalPosition: CurrentLeaderboardPosition = {
          ...normalizedPos,
          answeredCount: userStats.answeredCount,
          metricValue: userStats.metricValue,
          eligible: userStats.eligible,
          questionsNeeded: userStats.questionsNeeded,
          rank: userStats.eligible ? 1 : null,
          percentile: userStats.eligible ? 100 : null,
          participantCount: userStats.eligible ? 1 : 0,
        };

        const rows: LeaderboardRow[] = (finalPosition.optedIn && userStats.eligible) ? [
          {
            rank: 1,
            displayName: finalPosition.displayName,
            avatarUrl: finalPosition.avatarUrl,
            metricValue: userStats.metricValue,
            answeredCount: userStats.answeredCount,
            isCurrentUser: true,
            periodTimezone: finalPosition.periodTimezone,
          }
        ] : [];

        return {
          rows,
          currentPosition: finalPosition,
        };
      }

      return {
        rows: ((fallbackLb.data ?? []) as LeaderboardRowRecord[]).map(normalizeRow),
        currentPosition: normalizedPos,
      };
    }

    throw new Error(failure.message);
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string };
    if (errorObj?.code === "PGRST202" || errorObj?.message?.toLowerCase().includes("get_leaderboard")) {
      throw new Error("Apply the RevIT Leaderboards Supabase migration, then retry.");
    }
    throw err;
  }
}

