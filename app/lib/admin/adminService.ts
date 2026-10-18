import "server-only";
import { createAdminServiceClient } from "./adminAuth";

export type AdminUserRecord = {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  plan: "free" | "pro";
  proStartedAt: string | null;
  proExpiresAt: string | null;
  proNote: string | null;
  createdAt: string;
  isEffectivePro: boolean;
};

export type SubscriptionHistoryEntry = {
  id: string;
  userId: string;
  eventType: "activated" | "extended" | "expiration_modified" | "revoked" | "renewed";
  source: "purchased" | "gift" | "prize" | "unknown";
  previousPlan: string;
  newPlan: string;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
  adminId: string | null;
  customMessage: string | null;
  createdAt: string;
};

export type ApplySubscriptionParams = {
  userId: string;
  action: "activate" | "extend" | "modify_expiration" | "revoke";
  source?: "purchased" | "gift" | "prize";
  durationDays?: number;
  customExpiresAt?: string | null;
  adminId?: string | null;
  customMessage?: string | null;
  expectedExpiresAt?: string | null;
  allowShorten?: boolean;
};

export function isProActiveDate(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now();
}

export function generateAutomaticSubscriptionSummary(
  user: { plan: string; proStartedAt: string | null; proExpiresAt: string | null },
  history: SubscriptionHistoryEntry[]
): string {
  const isCurrentlyPro = user.plan === "pro" && isProActiveDate(user.proExpiresAt);

  if (isCurrentlyPro) {
    return "Currently active on RevIT Pro.";
  }

  const activations = (history || []).filter(
    (h) => h.eventType === "activated" || h.eventType === "renewed" || h.eventType === "extended"
  );

  if (user.proExpiresAt || activations.length > 0) {
    return "Previously had RevIT Pro. Currently on the Free plan.";
  }

  return "No recorded Pro history. Currently on the Free plan.";
}

export async function searchUsers(
  query: string,
  limit = 10,
  offset = 0
): Promise<{ users: AdminUserRecord[]; error?: string }> {
  const trimmed = query.trim();

  try {
    const service = createAdminServiceClient();

    // 1. Try atomic RPC first
    const { data, error } = await service.rpc("admin_search_users", {
      p_query: trimmed || null,
      p_limit: limit,
      p_offset: offset,
    });

    if (!error && Array.isArray(data)) {
      const records: AdminUserRecord[] = data.map((row: any) => ({
        id: row.id,
        email: row.email || "",
        username: row.username || null,
        firstName: row.first_name || null,
        plan: row.plan === "pro" ? "pro" : "free",
        proStartedAt: row.pro_started_at,
        proExpiresAt: row.pro_expires_at,
        proNote: row.pro_note || null,
        createdAt: row.created_at,
        isEffectivePro: row.plan === "pro" && isProActiveDate(row.pro_expires_at),
      }));
      return { users: records };
    }

    // 2. Fallback if RPC is not yet applied
    if (trimmed) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
      if (isUuid) {
        const { data: userData } = await service.auth.admin.getUserById(trimmed);
        if (userData?.user) {
          const { data: p } = await service.from("profiles").select("*").eq("id", trimmed).maybeSingle();
          return {
            users: [
              {
                id: userData.user.id,
                email: userData.user.email || "",
                username: p?.username || null,
                firstName: p?.first_name || null,
                plan: p?.plan === "pro" ? "pro" : "free",
                proStartedAt: p?.pro_started_at || null,
                proExpiresAt: p?.pro_expires_at || null,
                proNote: p?.pro_note || null,
                createdAt: userData.user.created_at,
                isEffectivePro: p?.plan === "pro" && isProActiveDate(p?.pro_expires_at),
              },
            ],
          };
        }
        return { users: [] };
      }

      // Direct profile search by username or first name
      const { data: matchedProfiles } = await service
        .from("profiles")
        .select("id, username, first_name, plan, pro_started_at, pro_expires_at, pro_note")
        .or(`username.ilike.%${trimmed}%,first_name.ilike.%${trimmed}%`)
        .limit(limit);

      if (matchedProfiles && matchedProfiles.length > 0) {
        const userPromises = matchedProfiles.map((p) =>
          service.auth.admin.getUserById(p.id).then(({ data }) => ({
            id: p.id,
            email: data?.user?.email || "",
            username: p.username || null,
            firstName: p.first_name || null,
            plan: (p.plan === "pro" ? "pro" : "free") as "free" | "pro",
            proStartedAt: p.pro_started_at || null,
            proExpiresAt: p.pro_expires_at || null,
            proNote: p.pro_note || null,
            createdAt: data?.user?.created_at || new Date().toISOString(),
            isEffectivePro: p.plan === "pro" && isProActiveDate(p.pro_expires_at),
          }))
        );
        const resolvedUsers = await Promise.all(userPromises);
        return { users: resolvedUsers };
      }
    }

    const { data: listData, error: listError } = await service.auth.admin.listUsers({
      page: Math.floor(offset / limit) + 1,
      perPage: 50,
    });

    if (listError) throw listError;

    const userList = listData?.users || [];
    if (userList.length === 0) return { users: [] };

    const ids = userList.map((u) => u.id);
    const { data: profiles } = await service
      .from("profiles")
      .select("id, username, first_name, plan, pro_started_at, pro_expires_at, pro_note")
      .in("id", ids);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    let mapped: AdminUserRecord[] = userList.map((u) => {
      const p = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email || "",
        username: p?.username || null,
        firstName: p?.first_name || null,
        plan: p?.plan === "pro" ? "pro" : "free",
        proStartedAt: p?.pro_started_at || null,
        proExpiresAt: p?.pro_expires_at || null,
        proNote: p?.pro_note || null,
        createdAt: u.created_at,
        isEffectivePro: p?.plan === "pro" && isProActiveDate(p?.pro_expires_at),
      };
    });

    if (trimmed) {
      const qLower = trimmed.toLowerCase();
      mapped = mapped.filter((u) =>
        u.email.toLowerCase().includes(qLower) ||
        (u.username && u.username.toLowerCase().includes(qLower)) ||
        (u.firstName && u.firstName.toLowerCase().includes(qLower)) ||
        u.id.toLowerCase() === qLower
      );
    }

    return { users: mapped.slice(0, limit) };
  } catch (err: any) {
    return { users: [], error: err.message || "Failed to search users." };
  }
}

export async function getUserDetails(userId: string): Promise<{
  user: AdminUserRecord | null;
  history: SubscriptionHistoryEntry[];
  summaryNote: string;
  error?: string;
}> {
  try {
    const service = createAdminServiceClient();

    const [{ data: authUser, error: authErr }, { data: profile, error: profileErr }, { data: historyData, error: histErr }] =
      await Promise.all([
        service.auth.admin.getUserById(userId),
        service.from("profiles").select("*").eq("id", userId).maybeSingle(),
        service
          .from("subscription_history")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

    if (authErr || !authUser?.user) {
      return {
        user: null,
        history: [],
        summaryNote: "Historical subscription information is unavailable.",
        error: "User not found.",
      };
    }

    const u = authUser.user;
    const userRecord: AdminUserRecord = {
      id: u.id,
      email: u.email || "",
      username: profile?.username || null,
      firstName: profile?.first_name || null,
      plan: profile?.plan === "pro" ? "pro" : "free",
      proStartedAt: profile?.pro_started_at || null,
      proExpiresAt: profile?.pro_expires_at || null,
      proNote: profile?.pro_note || null,
      createdAt: u.created_at,
      isEffectivePro: profile?.plan === "pro" && isProActiveDate(profile?.pro_expires_at),
    };

    const history: SubscriptionHistoryEntry[] = (historyData || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      source: row.source || "purchased",
      previousPlan: row.previous_plan,
      newPlan: row.new_plan,
      previousExpiresAt: row.previous_expires_at,
      newExpiresAt: row.new_expires_at,
      adminId: row.admin_id,
      customMessage: row.custom_message,
      createdAt: row.created_at,
    }));

    const summaryNote = generateAutomaticSubscriptionSummary(
      {
        plan: userRecord.plan,
        proStartedAt: userRecord.proStartedAt,
        proExpiresAt: userRecord.proExpiresAt,
      },
      history
    );

    return { user: userRecord, history, summaryNote };
  } catch (err: any) {
    return {
      user: null,
      history: [],
      summaryNote: "Historical subscription information is unavailable.",
      error: err.message || "Failed to load user details.",
    };
  }
}

export async function applySubscriptionChange(params: ApplySubscriptionParams) {
  const service = createAdminServiceClient();

  const { data, error } = await service.rpc("admin_apply_subscription_change", {
    p_user_id: params.userId,
    p_action: params.action,
    p_source: params.source || "purchased",
    p_duration_days: params.durationDays || 30,
    p_custom_expires_at: params.customExpiresAt || null,
    p_admin_id: params.adminId || null,
    p_custom_message: params.customMessage || null,
    p_expected_expires_at: params.expectedExpiresAt || null,
    p_allow_shorten: Boolean(params.allowShorten),
  });

  if (error) {
    throw new Error(error.message || "Failed to apply subscription change.");
  }

  return data;
}

export async function savePrivateAdminNote(userId: string, note: string) {
  const service = createAdminServiceClient();
  const trimmed = note.slice(0, 2000).trim();

  const { error } = await service
    .from("profiles")
    .update({ pro_note: trimmed || null })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message || "Failed to save admin note.");
  }

  return { success: true };
}
