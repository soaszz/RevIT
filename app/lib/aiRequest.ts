export type AiInputMessage = { role: "user" | "assistant"; content: string };

export const AI_REQUEST_LIMITS = {
  bodyBytes: 32 * 1024,
  messages: 12,
  messageCharacters: 4000,
  totalCharacters: 16_000,
} as const;

export class AiRequestError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "AiRequestError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseAiRequest(value: unknown): AiInputMessage[] {
  if (!isPlainObject(value) || !hasExactKeys(value, ["messages"]) || !Array.isArray(value.messages)) {
    throw new AiRequestError(400, "Please send a valid question.");
  }
  if (value.messages.length < 1 || value.messages.length > AI_REQUEST_LIMITS.messages) {
    throw new AiRequestError(400, "Please send a valid question.");
  }

  let totalCharacters = 0;
  const messages = value.messages.map((message, index): AiInputMessage => {
    if (!isPlainObject(message) || !hasExactKeys(message, ["role", "content"])) {
      throw new AiRequestError(400, "Please send a valid question.");
    }
    if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") {
      throw new AiRequestError(400, "Please send a valid question.");
    }
    const content = message.content.trim();
    if (!content || content.length > AI_REQUEST_LIMITS.messageCharacters) {
      throw new AiRequestError(400, "Please send a valid question.");
    }
    if (message.role !== (index % 2 === 0 ? "user" : "assistant")) {
      throw new AiRequestError(400, "Please send a valid conversation.");
    }
    totalCharacters += content.length;
    return { role: message.role, content };
  });

  if (messages.at(-1)?.role !== "user" || totalCharacters > AI_REQUEST_LIMITS.totalCharacters) {
    throw new AiRequestError(400, "Please shorten the conversation and try again.");
  }
  return messages;
}

export async function readAiRequest(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new AiRequestError(415, "This endpoint accepts JSON requests only.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0 || length > AI_REQUEST_LIMITS.bodyBytes) {
      throw new AiRequestError(413, "The request is too large.");
    }
  }
  if (!request.body) throw new AiRequestError(400, "Please send a valid question.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > AI_REQUEST_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new AiRequestError(413, "The request is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    throw new AiRequestError(400, "The JSON request could not be read.");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AiRequestError(400, "The JSON request is malformed.");
  }
  return parseAiRequest(value);
}

export function isSameOriginRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
