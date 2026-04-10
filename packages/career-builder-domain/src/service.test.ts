import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetArtifactStore } from "@/packages/artifact-domain/src";
import { resetAuditStore } from "@/packages/audit-security/src";
import { getCareerBuilderWorkspace, saveCareerBuilderPhase } from "@/packages/career-builder-domain/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

const viewer = {
  email: "stefano@example.com",
  name: "Stefano Caruso",
};

describe("career builder service", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetArtifactStore();
    resetAuditStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates a builder workspace backed by a talent identity", async () => {
    const snapshot = await getCareerBuilderWorkspace({
      viewer,
      correlationId: "corr-1",
    });

    expect(snapshot.identity.email).toBe(viewer.email);
    expect(snapshot.identity.talentAgentId).toBe("TAID-000001");
    expect(snapshot.profile.legalName).toBe("Stefano Caruso");
    expect(snapshot.phaseProgress[0]?.phase).toBe("self");
    expect(snapshot.phaseProgress[0]?.completed).toBe(1);
  });

  it("saves profile and evidence data, then derives updated progress from stored state", async () => {
    const initial = await getCareerBuilderWorkspace({
      viewer,
      correlationId: "corr-1",
    });

    expect(initial.progress.completedEvidenceCount).toBe(0);

    const selfSaved = await saveCareerBuilderPhase({
      viewer,
      phase: "self",
      input: {
        profile: {
          legalName: "Stefano Caruso",
          careerHeadline: "Career identity builder",
          targetRole: "Founder",
          location: "Chicago, IL",
          coreNarrative: "Building a verifiable career record.",
        },
        evidence: [],
      },
      uploadsByTemplateId: {},
      correlationId: "corr-2",
    });

    expect(selfSaved.phaseProgress[0]?.isComplete).toBe(true);
    expect(selfSaved.progress.strongestTier).toBe("self");

    const offerFile = new File(["offer"], "offer-letter.pdf", {
      type: "application/pdf",
    });

    const documentSaved = await saveCareerBuilderPhase({
      viewer,
      phase: "document",
      input: {
        evidence: [
          {
            templateId: "offer-letters",
            sourceOrIssuer: "Acme Recruiting",
            issuedOn: "2026-04-09",
            validationContext: "Confirms the founding recruiter offer.",
            whyItMatters: "Shows the role and employer are real.",
            retainedArtifactIds: [],
          },
        ],
      },
      uploadsByTemplateId: {
        "offer-letters": [{ file: offerFile }],
      },
      correlationId: "corr-3",
    });

    const savedOffer = documentSaved.evidence.find(
      (record) => record.templateId === "offer-letters",
    );

    expect(savedOffer?.files).toHaveLength(1);
    expect(savedOffer?.status).toBe("COMPLETE");
    expect(documentSaved.progress.completedEvidenceCount).toBe(1);

    const hydrated = await getCareerBuilderWorkspace({
      viewer,
      correlationId: "corr-4",
    });

    expect(
      hydrated.evidence.find((record) => record.templateId === "offer-letters")?.files[0]
        ?.name,
    ).toBe("offer-letter.pdf");
  });

  it("rejects invalid driver license uploads", async () => {
    await expect(
      saveCareerBuilderPhase({
        viewer,
        phase: "institution",
        input: {
          evidence: [
            {
              templateId: "drivers-license",
              sourceOrIssuer: "Illinois",
              issuedOn: "",
              validationContext: "",
              whyItMatters: "",
              retainedArtifactIds: [],
            },
          ],
        },
        uploadsByTemplateId: {
          "drivers-license": [
            {
              file: new File(["oops"], "license.txt", {
                type: "text/plain",
              }),
              slot: "front",
            },
          ],
        },
        correlationId: "corr-5",
      }),
    ).rejects.toMatchObject({
      errorCode: "VALIDATION_FAILED",
    });
  });
});
