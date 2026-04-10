import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authEnabled, authOptions, googleOAuthDisabledMessage } from "@/auth";

const handler = NextAuth(authOptions);

type RouteContext = {
  params: Promise<{ nextauth?: string[] }>;
};

function getAuthUnavailableMessage() {
  return (
    googleOAuthDisabledMessage ||
    "Authentication is disabled because required server configuration is missing."
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const params = await context.params;
  const action = params.nextauth?.[0];

  if (!authEnabled) {
    if (action === "providers") {
      return NextResponse.json({});
    }

    if (action === "session") {
      return NextResponse.json({});
    }

    return NextResponse.json(
      { message: getAuthUnavailableMessage() },
      { status: 503 },
    );
  }

  return handler(request, context);
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const params = await context.params;
  const action = params.nextauth?.[0];

  if (!authEnabled) {
    if (action === "_log") {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { message: getAuthUnavailableMessage() },
      { status: 503 },
    );
  }

  return handler(request, context);
}
