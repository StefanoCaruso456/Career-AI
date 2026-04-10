import { NextResponse } from "next/server";
import { getGoogleAuthStatus } from "@/auth-config";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getGoogleAuthStatus(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
