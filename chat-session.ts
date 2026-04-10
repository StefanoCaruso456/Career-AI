import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/auth-config";
import { auth } from "@/auth";

const chatOwnerCookieName = "career_ai_chat_owner";
const fallbackChatSessionSecret = "career-ai-chat-dev-secret";

export type ChatActor = {
  cookieValue?: string;
  ownerId: string;
};

function getChatSessionSecret() {
  return getAuthSecret() || fallbackChatSessionSecret;
}

function signChatOwnerId(ownerId: string) {
  return createHmac("sha256", getChatSessionSecret()).update(ownerId).digest("base64url");
}

function serializeChatOwnerId(ownerId: string) {
  return `${ownerId}.${signChatOwnerId(ownerId)}`;
}

function parseChatOwnerCookie(cookieValue?: string | null) {
  if (!cookieValue) {
    return null;
  }

  let normalizedCookieValue = cookieValue;

  try {
    normalizedCookieValue = decodeURIComponent(cookieValue);
  } catch {
    normalizedCookieValue = cookieValue;
  }

  const separatorIndex = normalizedCookieValue.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const ownerId = normalizedCookieValue.slice(0, separatorIndex);
  const signature = normalizedCookieValue.slice(separatorIndex + 1);
  const expectedSignature = signChatOwnerId(ownerId);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return ownerId;
}

export function getChatOwnerCookieName() {
  return chatOwnerCookieName;
}

export async function resolveChatActor(existingCookieValue?: string | null): Promise<ChatActor> {
  const session = await auth();
  const sessionOwnerId =
    session?.user?.talentIdentityId?.trim() ||
    session?.user?.email?.trim()?.toLowerCase() ||
    null;

  if (sessionOwnerId) {
    return {
      ownerId: `user:${sessionOwnerId}`,
    };
  }

  const existingOwnerId = parseChatOwnerCookie(existingCookieValue);

  if (existingOwnerId) {
    return {
      ownerId: existingOwnerId,
    };
  }

  const ownerId = `guest:${crypto.randomUUID()}`;

  return {
    cookieValue: serializeChatOwnerId(ownerId),
    ownerId,
  };
}
