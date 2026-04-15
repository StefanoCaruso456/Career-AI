import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { ApiError } from "@/packages/contracts/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { uploadArtifact } from "@/packages/artifact-domain/src";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user) {
      throw new ApiError({
        correlationId,
        details: null,
        errorCode: "UNAUTHORIZED",
        message: "A signed-in session is required.",
        status: 401,
      });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError({
        correlationId,
        details: { field: "file" },
        errorCode: "VALIDATION_FAILED",
        message: "A resume file is required.",
        status: 422,
      });
    }

    const { context } = await ensurePersistentCareerIdentityForSessionUser({
      correlationId,
      user: {
        appUserId: session.user.appUserId,
        authProvider: session.user.authProvider,
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        providerUserId: session.user.providerUserId,
      },
    });

    const result = await uploadArtifact({
      actorId: context.aggregate.talentIdentity.id,
      actorType: "talent_user",
      correlationId,
      file,
      ownerTalentId: context.aggregate.talentIdentity.id,
    });

    return successResponse(
      {
        artifactId: result.dto.artifactId,
        fileName: file.name,
        mimeType: result.dto.mimeType,
        parsingStatus: result.dto.parsingStatus,
        uploadedAt: result.artifact.uploaded_at,
      },
      correlationId,
      201,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
