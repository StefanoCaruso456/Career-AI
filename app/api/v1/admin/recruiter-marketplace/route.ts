import { type NextRequest } from "next/server";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import {
  ensureSyntheticRecruiterMarketplaceSeeded,
  getRecruiterMarketplaceSeedSummary,
  listEmployerPartnersForDiscovery,
  listRecruitersForEmployerPartner,
} from "@/packages/recruiter-marketplace-domain/src";
import {
  listRecruiterAccessGrantRecords,
  listRecruiterOwnedJobRecords,
  listRecruiterProtocolEventRecords,
} from "@/packages/persistence/src";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "inspect recruiter marketplace data");

    await ensureSyntheticRecruiterMarketplaceSeeded();

    const recruiterCareerIdentityId =
      request.nextUrl.searchParams.get("recruiterCareerIdentityId")?.trim() || null;
    const seekerCareerIdentityId =
      request.nextUrl.searchParams.get("seekerCareerIdentityId")?.trim() || null;
    const includeProtocolEvents =
      request.nextUrl.searchParams.get("includeProtocolEvents")?.trim() === "1";

    const employerPartners = await listEmployerPartnersForDiscovery();
    const recruitersByEmployerPartner = await Promise.all(
      employerPartners.map(async (partner) => ({
        employerPartnerId: partner.id,
        recruiters: await listRecruitersForEmployerPartner({
          employerPartnerId: partner.id,
        }),
      })),
    );
    const grants = await listRecruiterAccessGrantRecords({
      jobSeekerCareerIdentityId: seekerCareerIdentityId,
      recruiterCareerIdentityId,
    });
    const jobs = recruiterCareerIdentityId
      ? await listRecruiterOwnedJobRecords({
          recruiterCareerIdentityId,
        })
      : [];
    const protocolEvents =
      includeProtocolEvents && recruiterCareerIdentityId
        ? await listRecruiterProtocolEventRecords({
            recruiterCareerIdentityId,
            seekerCareerIdentityId,
          })
        : [];

    return successResponse(
      {
        employerPartners,
        grants,
        jobs,
        protocolEvents,
        recruitersByEmployerPartner,
        seedSummary: await getRecruiterMarketplaceSeedSummary(),
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
