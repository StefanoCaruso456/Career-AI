import { NextResponse } from "next/server";
import { getChatOwnerCookieName, type ChatActor, resolveChatActor } from "@/chat-session";
import { ApiError } from "@/packages/contracts/src";

function readCookieValue(request: Request, cookieName: string) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1) ?? null;
}

export function withChatActorCookie(response: NextResponse, actor: ChatActor) {
  if (!actor.cookieValue) {
    return response;
  }

  response.cookies.set({
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    name: getChatOwnerCookieName(),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: actor.cookieValue,
  });

  return response;
}

export async function resolveChatRouteContext(request: Request) {
  const actor = await resolveChatActor(readCookieValue(request, getChatOwnerCookieName()));

  return {
    actor,
    ownerId: actor.ownerId,
  };
}

export function jsonChatResponse(payload: unknown, actor: ChatActor, init?: ResponseInit) {
  return withChatActorCookie(NextResponse.json(payload, init), actor);
}

export function jsonChatErrorResponse(args: {
  actor: ChatActor;
  error: unknown;
  fallbackMessage: string;
}) {
  if (args.error instanceof ApiError) {
    return jsonChatResponse(
      {
        error: args.error.message,
        errorCode: args.error.errorCode,
      },
      args.actor,
      { status: args.error.status },
    );
  }

  console.error(args.fallbackMessage, args.error);

  return jsonChatResponse(
    { error: args.fallbackMessage },
    args.actor,
    { status: 500 },
  );
}
