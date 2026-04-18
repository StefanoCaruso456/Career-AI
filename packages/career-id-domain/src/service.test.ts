import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { saveCareerBuilderPhase } from "@/packages/career-builder-domain/src";
import { findTalentIdentityByEmail } from "@/packages/identity-domain/src";
import {
  listCareerIdAuditEvents,
  listCareerIdEvidence,
  listCareerIdVerifications,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  createGovernmentIdVerificationSession,
  getCareerIdPresentation,
  getGovernmentIdVerificationStatus,
  handlePersonaWebhook,
  normalizePersonaInquiry,
  resetGovernmentIdSessionRateLimitStore,
} from "./service";

const personaMocks = vi.hoisted(() => ({
  createPersonaInquiry: vi.fn(),
  generatePersonaOneTimeLink: vi.fn(),
  retrievePersonaInquiry: vi.fn(),
}));

vi.mock("./persona", async () => {
  const actual = await vi.importActual<typeof import("./persona")>("./persona");

  return {
    ...actual,
    createPersonaInquiry: personaMocks.createPersonaInquiry,
    generatePersonaOneTimeLink: personaMocks.generatePersonaOneTimeLink,
    retrievePersonaInquiry: personaMocks.retrievePersonaInquiry,
  };
});

const viewer = {
  email: "stefano@example.com",
  name: "Stefano Caruso",
};

async function unlockDocumentLayer() {
  await saveCareerBuilderPhase({
    viewer,
    phase: "self",
    input: {
      profile: {
        legalName: "Stefano Caruso",
        careerHeadline: "Verified operator",
        targetRole: "Founder",
        location: "Chicago, IL",
        coreNarrative: "Building a verifiable career record.",
      },
      evidence: [],
    },
    uploadsByTemplateId: {},
    correlationId: "career-id-self",
  });

  const relationshipFile = new File(["relationship"], "relationship.pdf", {
    type: "application/pdf",
  });

  await saveCareerBuilderPhase({
    viewer,
    phase: "relationship",
    input: {
      evidence: [
        {
          templateId: "referrals",
          sourceOrIssuer: "Avery Smith",
          issuedOn: "2026-04-10",
          validationContext: "Referral from prior company collaboration.",
          whyItMatters: "Adds external relationship proof.",
          retainedArtifactIds: [],
        },
        {
          templateId: "endorsements",
          sourceOrIssuer: "Jordan Lee",
          issuedOn: "2026-04-10",
          validationContext: "Endorsement of recruiting systems work.",
          whyItMatters: "Adds social proof.",
          retainedArtifactIds: [],
        },
        {
          templateId: "past-colleague-letters",
          sourceOrIssuer: "Taylor Morgan",
          issuedOn: "2026-04-10",
          validationContext: "Past colleague overlap and outcomes.",
          whyItMatters: "Strengthens trust in delivery history.",
          retainedArtifactIds: [],
        },
      ],
    },
    uploadsByTemplateId: {
      referrals: [{ file: relationshipFile }],
      endorsements: [{ file: relationshipFile }],
      "past-colleague-letters": [{ file: relationshipFile }],
    },
    correlationId: "career-id-relationship",
  });
}

function signWebhookBody(rawBody: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", process.env.PERSONA_WEBHOOK_SECRET ?? "test-secret")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

beforeEach(async () => {
  process.env.PERSONA_WEBHOOK_SECRET = "test-secret";
  resetGovernmentIdSessionRateLimitStore();
  resetAuditStore();
  await resetTestDatabase();
  await installTestDatabase();
  personaMocks.createPersonaInquiry.mockReset();
  personaMocks.generatePersonaOneTimeLink.mockReset();
  personaMocks.retrievePersonaInquiry.mockReset();
  personaMocks.createPersonaInquiry.mockResolvedValue({
    inquiryId: "inq_123",
    expiresAt: "2026-04-17T12:00:00.000Z",
    status: "pending",
  });
});

afterEach(async () => {
  await resetTestDatabase();
});

describe("career-id Persona service", () => {
  it("normalizes approved Persona inquiries into verified trust results", () => {
    const result = normalizePersonaInquiry({
      eventName: "inquiry.approved",
      inquiry: {
        id: "inq_123",
        attributes: {
          status: "approved",
          "completed-at": "2026-04-10T12:00:00.000Z",
        },
      },
    });

    expect(result.status).toBe("verified");
    expect(result.checks).toEqual({
      documentAuthenticity: "pass",
      liveness: "pass",
      faceMatch: "pass",
    });
    expect(result.confidenceBand).toBe("high");
  });

  it("normalizes Persona needs review outcomes with provider spacing and event naming", () => {
    const result = normalizePersonaInquiry({
      eventName: "inquiry.marked-for-review",
      inquiry: {
        id: "inq_456",
        attributes: {
          status: "needs review",
        },
      },
    });

    expect(result.status).toBe("manual_review");
  });

  it("creates a government ID verification session and persists in-progress evidence", async () => {
    const session = await createGovernmentIdVerificationSession({
      viewer,
      input: {
        returnUrl: "/agent-build",
        source: "career_id_page",
      },
      requestOrigin: "https://career-ai.example",
      correlationId: "career-id-session",
    });

    expect(session.status).toBe("in_progress");
    expect(session.launchUrl).toContain("inq_123");
    expect(session.launchUrl).toContain("careerIdVerificationId%3D");

    const identity = await findTalentIdentityByEmail({
      email: viewer.email,
      correlationId: "career-id-lookup",
    });
    const verifications = await listCareerIdVerifications({
      careerIdentityId: identity.talentIdentity.id,
    });
    const evidence = await listCareerIdEvidence({
      careerIdentityId: identity.talentIdentity.id,
    });

    expect(personaMocks.createPersonaInquiry).toHaveBeenCalledTimes(1);
    expect(verifications).toHaveLength(1);
    expect(verifications[0]?.status).toBe("in_progress");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.status).toBe("in_progress");
  });

  it("keeps government ID verification unlocked before earlier trust phases are complete", async () => {
    const identity = await findTalentIdentityByEmail({
      email: viewer.email,
      correlationId: "career-id-pre-presentation-lookup",
    });

    expect(identity).toBeNull();

    await createGovernmentIdVerificationSession({
      viewer,
      input: {
        returnUrl: "/agent-build",
        source: "career_id_page",
      },
      requestOrigin: "https://career-ai.example",
      correlationId: "career-id-first-step",
    });

    const resolvedIdentity = await findTalentIdentityByEmail({
      email: viewer.email,
      correlationId: "career-id-post-presentation-lookup",
    });

    const presentation = await getCareerIdPresentation({
      careerIdentityId: resolvedIdentity!.talentIdentity.id,
      correlationId: "career-id-first-step-presentation",
      phaseProgress: [
        {
          phase: "self",
          label: "Self-reported",
          completed: 0,
          started: 0,
          total: 5,
          isComplete: false,
          isCurrent: true,
          summary: "Self current",
        },
        {
          phase: "relationship",
          label: "Relationship-backed",
          completed: 0,
          started: 0,
          total: 3,
          isComplete: false,
          isCurrent: false,
          summary: "Relationship locked",
        },
        {
          phase: "document",
          label: "Document-backed",
          completed: 0,
          started: 0,
          total: 7,
          isComplete: false,
          isCurrent: false,
          summary: "Document available",
        },
        {
          phase: "signature",
          label: "Signature-backed",
          completed: 0,
          started: 0,
          total: 4,
          isComplete: false,
          isCurrent: false,
          summary: "Signature locked",
        },
        {
          phase: "institution",
          label: "Institution-verified",
          completed: 0,
          started: 0,
          total: 4,
          isComplete: false,
          isCurrent: false,
          summary: "Institution locked",
        },
      ],
    });

    expect(presentation.documentVerification.unlocked).toBe(true);
    expect(presentation.documentVerification.status).toBe("in_progress");
    expect(presentation.careerIdProfile.phases.find((phase) => phase.key === "document_backed")?.unlocked).toBe(true);
  });

  it("processes Persona webhooks idempotently and exposes a verified document-backed artifact", async () => {
    await unlockDocumentLayer();

    const session = await createGovernmentIdVerificationSession({
      viewer,
      input: {
        returnUrl: "/agent-build",
        source: "career_id_page",
      },
      requestOrigin: "https://career-ai.example",
      correlationId: "career-id-start",
    });

    personaMocks.retrievePersonaInquiry.mockResolvedValue({
      id: "inq_123",
      attributes: {
        status: "approved",
        "completed-at": "2026-04-10T12:00:00.000Z",
      },
      included: [],
    });

    const rawBody = JSON.stringify({
      data: {
        id: "evt_123",
        attributes: {
          "created-at": "2026-04-10T12:00:01.000Z",
          name: "inquiry.approved",
          payload: {
            data: {
              id: "inq_123",
              attributes: {
                status: "approved",
              },
            },
          },
        },
      },
    });

    const firstResult = await handlePersonaWebhook({
      rawBody,
      signatureHeader: signWebhookBody(rawBody),
      correlationId: "career-id-webhook-1",
    });
    const secondResult = await handlePersonaWebhook({
      rawBody,
      signatureHeader: signWebhookBody(rawBody),
      correlationId: "career-id-webhook-2",
    });

    expect(firstResult.processed).toBe(true);
    expect(firstResult.status).toBe("verified");
    expect(secondResult.duplicate).toBe(true);

    const identity = await findTalentIdentityByEmail({
      email: viewer.email,
      correlationId: "career-id-lookup-after-webhook",
    });
    const phaseProgress = [
      {
        phase: "self",
        label: "Self-reported",
        completed: 5,
        started: 5,
        total: 5,
        isComplete: true,
        isCurrent: false,
        summary: "Self complete",
      },
      {
        phase: "relationship",
        label: "Relationship-backed",
        completed: 3,
        started: 3,
        total: 3,
        isComplete: true,
        isCurrent: false,
        summary: "Relationship complete",
      },
      {
        phase: "document",
        label: "Document-backed",
        completed: 0,
        started: 0,
        total: 7,
        isComplete: false,
        isCurrent: true,
        summary: "Document active",
      },
      {
        phase: "signature",
        label: "Signature-backed",
        completed: 0,
        started: 0,
        total: 4,
        isComplete: false,
        isCurrent: false,
        summary: "Signature locked",
      },
      {
        phase: "institution",
        label: "Institution-verified",
        completed: 0,
        started: 0,
        total: 4,
        isComplete: false,
        isCurrent: false,
        summary: "Institution locked",
      },
    ];

    const presentation = await getCareerIdPresentation({
      careerIdentityId: identity.talentIdentity.id,
      phaseProgress,
      correlationId: "career-id-presentation",
    });

    expect(presentation.documentVerification.status).toBe("verified");
    expect(presentation.careerIdProfile.badges).toEqual([
      {
        id: expect.stringMatching(/^badge_/),
        label: "Government ID verified",
        phase: "document_backed",
        status: "verified",
      },
    ]);
    expect(
      presentation.careerIdProfile.phases.find((phase) => phase.key === "document_backed")
        ?.completedCount,
    ).toBe(1);

    const auditEvents = await listCareerIdAuditEvents({
      careerIdentityId: identity.talentIdentity.id,
    });
    const evidence = await listCareerIdEvidence({
      careerIdentityId: identity.talentIdentity.id,
    });

    expect(auditEvents).toHaveLength(1);
    expect(evidence[0]?.status).toBe("verified");
  });

  it("reconciles an in-progress verification against Persona on read and creates the badge", async () => {
    const session = await createGovernmentIdVerificationSession({
      viewer,
      input: {
        returnUrl: "/agent-build",
        source: "career_id_page",
      },
      requestOrigin: "https://career-ai.example",
      correlationId: "career-id-read-sync-start",
    });

    personaMocks.retrievePersonaInquiry.mockResolvedValue({
      id: "inq_123",
      attributes: {
        status: "completed",
        "completed-at": "2026-04-10T12:00:00.000Z",
      },
      included: [
        {
          id: "ver_gov_123",
          type: "verification/government-id",
          attributes: {
            status: "passed",
          },
        },
        {
          id: "ver_selfie_123",
          type: "verification/selfie",
          attributes: {
            status: "passed",
            checks: [
              {
                name: "selfie_liveness_detection",
                status: "passed",
              },
              {
                name: "selfie_id_comparison",
                status: "passed",
              },
            ],
          },
        },
      ],
    });

    const synced = await getGovernmentIdVerificationStatus({
      verificationId: session.verificationId,
      viewer,
      correlationId: "career-id-read-sync-status",
    });

    expect(synced.status).toBe("verified");
    expect(synced.checks).toEqual({
      documentAuthenticity: "pass",
      liveness: "pass",
      faceMatch: "pass",
    });

    const identity = await findTalentIdentityByEmail({
      email: viewer.email,
      correlationId: "career-id-read-sync-lookup",
    });
    const presentation = await getCareerIdPresentation({
      careerIdentityId: identity!.talentIdentity.id,
      correlationId: "career-id-read-sync-presentation",
      phaseProgress: [
        {
          phase: "self",
          label: "Self-reported",
          completed: 0,
          started: 0,
          total: 5,
          isComplete: false,
          isCurrent: true,
          summary: "Self current",
        },
        {
          phase: "relationship",
          label: "Relationship-backed",
          completed: 0,
          started: 0,
          total: 3,
          isComplete: false,
          isCurrent: false,
          summary: "Relationship locked",
        },
        {
          phase: "document",
          label: "Document-backed",
          completed: 0,
          started: 0,
          total: 7,
          isComplete: false,
          isCurrent: false,
          summary: "Document active",
        },
        {
          phase: "signature",
          label: "Signature-backed",
          completed: 0,
          started: 0,
          total: 4,
          isComplete: false,
          isCurrent: false,
          summary: "Signature locked",
        },
        {
          phase: "institution",
          label: "Institution-verified",
          completed: 0,
          started: 0,
          total: 4,
          isComplete: false,
          isCurrent: false,
          summary: "Institution locked",
        },
      ],
    });

    expect(presentation.documentVerification.status).toBe("verified");
    expect(presentation.careerIdProfile.badges).toEqual([
      {
        id: expect.stringMatching(/^badge_/),
        label: "Government ID verified",
        phase: "document_backed",
        status: "verified",
      },
    ]);
  });

  it("reconciles active verification status during Career ID presentation reads", async () => {
    await createGovernmentIdVerificationSession({
      viewer,
      input: {
        returnUrl: "/agent-build",
        source: "career_id_page",
      },
      requestOrigin: "https://career-ai.example",
      correlationId: "career-id-presentation-sync-start",
    });

    personaMocks.retrievePersonaInquiry.mockResolvedValue({
      id: "inq_123",
      attributes: {
        status: "approved",
        "completed-at": "2026-04-10T12:00:00.000Z",
      },
      included: [],
    });

    const identity = await findTalentIdentityByEmail({
      email: viewer.email,
      correlationId: "career-id-presentation-sync-lookup",
    });
    const presentation = await getCareerIdPresentation({
      careerIdentityId: identity!.talentIdentity.id,
      correlationId: "career-id-presentation-sync",
      phaseProgress: [
        {
          phase: "self",
          label: "Self-reported",
          completed: 0,
          started: 0,
          total: 5,
          isComplete: false,
          isCurrent: true,
          summary: "Self current",
        },
        {
          phase: "relationship",
          label: "Relationship-backed",
          completed: 0,
          started: 0,
          total: 3,
          isComplete: false,
          isCurrent: false,
          summary: "Relationship locked",
        },
        {
          phase: "document",
          label: "Document-backed",
          completed: 0,
          started: 0,
          total: 7,
          isComplete: false,
          isCurrent: false,
          summary: "Document active",
        },
        {
          phase: "signature",
          label: "Signature-backed",
          completed: 0,
          started: 0,
          total: 4,
          isComplete: false,
          isCurrent: false,
          summary: "Signature locked",
        },
        {
          phase: "institution",
          label: "Institution-verified",
          completed: 0,
          started: 0,
          total: 4,
          isComplete: false,
          isCurrent: false,
          summary: "Institution locked",
        },
      ],
    });

    expect(presentation.documentVerification.status).toBe("verified");
    expect(presentation.careerIdProfile.badges).toEqual([
      {
        id: expect.stringMatching(/^badge_/),
        label: "Government ID verified",
        phase: "document_backed",
        status: "verified",
      },
    ]);
  });
});
