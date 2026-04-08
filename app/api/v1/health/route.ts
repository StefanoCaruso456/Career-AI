import { NextResponse } from "next/server";
import { listAuditEvents } from "@/packages/audit-security/src";
import { getArtifactServiceMetrics } from "@/packages/artifact-domain/src";
import { getCredentialServiceMetrics } from "@/packages/credential-domain/src";
import { getIdentityServiceMetrics } from "@/packages/identity-domain/src";
import { getVerificationServiceMetrics } from "@/packages/verification-domain/src";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    services: {
      identity: "up",
      artifact: "up",
      credential: "up",
      verification: "up",
      audit: "up",
    },
    metrics: {
      identity: getIdentityServiceMetrics(),
      artifact: getArtifactServiceMetrics(),
      credential: getCredentialServiceMetrics(),
      verification: getVerificationServiceMetrics(),
      auditEvents: listAuditEvents().length,
    },
    generatedAt: new Date().toISOString(),
  });
}
