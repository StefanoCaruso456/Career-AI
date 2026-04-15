import type { AuthenticatedActorIdentity } from "@/actor-identity";
import { searchEmployerCandidatesViaRecruiterAgentBoundary } from "@/lib/internal-agents/recruiter-product-search";
import { updateRequestTraceContext, withTracedRoute } from "@/lib/tracing";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { searchEmployerCandidatesInputSchema } from "@/packages/contracts/src";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";

export const dynamic = "force-dynamic";

function isRecruiterAgentEligibleIdentity(
  identity: AuthenticatedActorIdentity | null | undefined,
): identity is AuthenticatedActorIdentity {
  if (!identity?.appUserId) {
    return false;
  }

  const normalizedRole = identity.roleType?.trim().toLowerCase();
  return normalizedRole === "recruiter" || normalizedRole === "hiring_manager";
}

async function handleEmployerCandidateSearchPost(request: Request) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId, {
      allowPublic: true,
    });
    const actorIdentity =
      actor.identity?.kind === "authenticated_user" ? actor.identity : null;

    updateRequestTraceContext({
      actorType: actor.actorType,
      ownerId: actor.actorId,
      sessionId: actorIdentity?.appUserId ?? actor.actorId,
      userId: actorIdentity?.appUserId ?? null,
    });

    const payload = searchEmployerCandidatesInputSchema.parse(await request.json());
    const response = isRecruiterAgentEligibleIdentity(actorIdentity)
      ? await searchEmployerCandidatesViaRecruiterAgentBoundary({
          actorIdentity,
          conversationId: payload.conversationId ?? null,
          correlationId,
          filters: payload.filters,
          limit: payload.limit,
          prompt: payload.prompt,
          sourceEndpoint: "/api/v1/employer/candidates/search",
        })
      : await searchEmployerCandidates({
          filters: payload.filters,
          limit: payload.limit,
          prompt: payload.prompt,
        });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export const POST = withTracedRoute(
  {
    name: "http.route.v1.employer.candidates.search.post",
    tags: ["route:v1_employer_candidates_search", "surface:employer"],
    type: "task",
  },
  handleEmployerCandidateSearchPost,
);
