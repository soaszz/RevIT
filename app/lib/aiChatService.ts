import type { SupabaseClient } from "@supabase/supabase-js";

export type AiChat = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AiMessageRole = "user" | "assistant";

export type AiMessage = {
  id: string;
  chat_id: string;
  role: AiMessageRole;
  content: string;
  created_at: string;
};

const CHAT_FIELDS = "id,user_id,title,created_at,updated_at";
const MESSAGE_FIELDS = "id,chat_id,role,content,created_at";
const CHAT_PAGE_SIZE = 50;
const MESSAGE_PAGE_SIZE = 100;

function cleanTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[?.!,;:]+$/, "");
}

export function chatTitleFromFirstMessage(message: string) {
  const normalized = cleanTitle(message);
  if (!normalized) return "New chat";

  const explainMatch = normalized.match(/^explain(?:\s+(?:to\s+me))?\s+(.+)$/i);
  const candidate = explainMatch
    ? `${explainMatch[1]} explanation`
    : normalized.split(" ").slice(0, 9).join(" ");
  const title = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  return title.length > 80 ? `${title.slice(0, 77).trimEnd()}…` : title;
}

export async function loadAiChats(client: SupabaseClient, userId: string, offset = 0) {
  const { data, error } = await client
    .from("ai_chats")
    .select(CHAT_FIELDS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + CHAT_PAGE_SIZE);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AiChat[];
  return { items: rows.slice(0, CHAT_PAGE_SIZE), hasMore: rows.length > CHAT_PAGE_SIZE };
}

export async function createAiChat(client: SupabaseClient, userId: string, title = "New chat") {
  const { data, error } = await client
    .from("ai_chats")
    .insert({ user_id: userId, title: cleanTitle(title) || "New chat" })
    .select(CHAT_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data as AiChat;
}

export async function loadAiMessages(client: SupabaseClient, chatId: string, offset = 0) {
  const { data, error } = await client
    .from("ai_messages")
    .select(MESSAGE_FIELDS)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + MESSAGE_PAGE_SIZE);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AiMessage[];
  return {
    items: rows.slice(0, MESSAGE_PAGE_SIZE).reverse(),
    hasMore: rows.length > MESSAGE_PAGE_SIZE,
  };
}

export async function saveAiMessage(
  client: SupabaseClient,
  chatId: string,
  role: AiMessageRole,
  content: string,
) {
  const { data, error } = await client
    .from("ai_messages")
    .insert({ chat_id: chatId, role, content: content.trim() })
    .select(MESSAGE_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data as AiMessage;
}

export async function updateAiChatTitle(
  client: SupabaseClient,
  userId: string,
  chatId: string,
  title: string,
) {
  const { data, error } = await client
    .from("ai_chats")
    .update({ title: cleanTitle(title) || "New chat" })
    .eq("id", chatId)
    .eq("user_id", userId)
    .select(CHAT_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data as AiChat;
}

export async function deleteAiChat(client: SupabaseClient, userId: string, chatId: string) {
  const { error } = await client
    .from("ai_chats")
    .delete()
    .eq("id", chatId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
