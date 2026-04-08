import { NextResponse } from "next/server";
import { listAuditEvents } from "@/packages/audit-security/src";
import { getIdentityServiceMetrics } from "@/packages/identity-domain/src";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    services: {
      identity: "up",
      audit: "up",
    },
    metrics: {
      identity: getIdentityServiceMetrics(),
      auditEvents: listAuditEvents().length,
    },
    generatedAt: new Date().toISOString(),
  });
}
