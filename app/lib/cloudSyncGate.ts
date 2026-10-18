/**
 * Migration-readiness capability gate for Strasinger cloud attempt synchronization.
 * Defaults strictly to false until the Supabase migration
 * (supabase/migrations/202610130023_strasinger_book_edition_support.sql)
 * has been executed, verified, and explicitly authorized.
 *
 * Build-time rollout gate only, not a server authorization boundary.
 * Premium content authorization remains enforced by the reviewer API.
 */
export const STRASINGER_CLOUD_SYNC_ENABLED: boolean =
  process.env.NEXT_PUBLIC_STRASINGER_CLOUD_SYNC_ENABLED === "true";

/**
 * Returns true if cloud sync operations (attempt recording, reinforcement queueing,
 * study session events, and batched syncing) are authorized for the specified book.
 */
export function isCloudSyncAllowedForBook(book?: string): boolean {
  if (book === "Strasinger") {
    return STRASINGER_CLOUD_SYNC_ENABLED;
  }
  return true;
}

export function isCloudSyncAllowedForQuestion(questionId: string, subjectId?: string, topicId?: string): boolean {
  const isStrasinger = [questionId, subjectId, topicId].some((id) =>
    id?.startsWith("strasinger-") || id?.startsWith("strasinger7-"));
  return isCloudSyncAllowedForBook(isStrasinger ? "Strasinger" : undefined);
}
