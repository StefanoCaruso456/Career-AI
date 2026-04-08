import { NextResponse } from "next/server";
import { getAdminOpsMetrics } from "@/packages/admin-ops/src";
import { listAuditEvents } from "@/packages/audit-security/src";
import { getArtifactServiceMetrics } from "@/packages/artifact-domain/src";
import { getCredentialServiceMetrics } from "@/packages/credential-domain/src";
import { getIdentityServiceMetrics } from "@/packages/identity-domain/src";
import { getRecruiterReadModelMetrics } from "@/packages/recruiter-read-model/src";
import { getVerificationServiceMetrics } from "@/packages/verification-domain/src";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    services: {
      identity: "up",
      artifact: "up",
      credential: "up",
      verification: "up",
      recruiterReadModel: "up",
      adminOps: "up",
      audit: "up",
    },
    metrics: {
      identity: getIdentityServiceMetrics(),
      artifact: getArtifactServiceMetrics(),
      credential: getCredentialServiceMetrics(),
      verification: getVerificationServiceMetrics(),
      recruiterReadModel: getRecruiterReadModelMetrics(),
      adminOps: getAdminOpsMetrics(),
      auditEvents: listAuditEvents().length,
    },
    generatedAt: new Date().toISOString(),
  });
}
