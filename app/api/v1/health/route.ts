import { NextResponse } from "next/server";
import { getAdminOpsMetrics } from "@/packages/admin-ops/src";
import { listAuditEvents } from "@/packages/audit-security/src";
import { getArtifactServiceMetrics } from "@/packages/artifact-domain/src";
import { getCredentialServiceMetrics } from "@/packages/credential-domain/src";
import { getIdentityServiceMetrics } from "@/packages/identity-domain/src";
import { isDatabaseConfigured } from "@/packages/persistence/src";
import { getRecruiterReadModelMetrics } from "@/packages/recruiter-read-model/src";
import { getVerificationServiceMetrics } from "@/packages/verification-domain/src";

type DatabaseHealth =
  | {
      status: "up";
      reason: null;
      adminOpsMetrics: Awaited<ReturnType<typeof getAdminOpsMetrics>>;
      identityMetrics: Awaited<ReturnType<typeof getIdentityServiceMetrics>>;
    }
  | {
      status: "degraded";
      reason: string;
      adminOpsMetrics: null;
      identityMetrics: null;
    };

async function getDatabaseHealth(): Promise<DatabaseHealth> {
  if (!isDatabaseConfigured()) {
    return {
      status: "degraded",
      reason: "DATABASE_URL is not configured.",
      adminOpsMetrics: null,
      identityMetrics: null,
    };
  }

  try {
    const [identityMetrics, adminOpsMetrics] = await Promise.all([
      getIdentityServiceMetrics(),
      getAdminOpsMetrics(),
    ]);

    return {
      status: "up",
      reason: null,
      adminOpsMetrics,
      identityMetrics,
    };
  } catch (error) {
    return {
      status: "degraded",
      reason:
        error instanceof Error
          ? error.message
          : "Database-backed services are unavailable.",
      adminOpsMetrics: null,
      identityMetrics: null,
    };
  }
}

export async function GET() {
  const databaseHealth = await getDatabaseHealth();
  const databaseBackedServiceStatus =
    databaseHealth.status === "up" ? "up" : "degraded";

  return NextResponse.json({
    status: databaseHealth.status === "up" ? "ok" : "degraded",
    services: {
      database: databaseBackedServiceStatus,
      identity: databaseBackedServiceStatus,
      artifact: "up",
      credential: "up",
      verification: "up",
      recruiterReadModel: "up",
      adminOps: databaseBackedServiceStatus,
      audit: "up",
    },
    metrics: {
      identity: databaseHealth.identityMetrics,
      artifact: getArtifactServiceMetrics(),
      credential: getCredentialServiceMetrics(),
      verification: getVerificationServiceMetrics(),
      recruiterReadModel: getRecruiterReadModelMetrics(),
      adminOps: databaseHealth.adminOpsMetrics,
      auditEvents: listAuditEvents().length,
    },
    warnings: databaseHealth.reason ? [databaseHealth.reason] : [],
    generatedAt: new Date().toISOString(),
  });
}
