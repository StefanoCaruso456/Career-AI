import { beforeEach, describe, expect, it } from "vitest";
import { createTalentIdentity, resetIdentityStore } from "@/packages/identity-domain/src";
import {
  attachArtifactToClaim,
  getArtifactMetadata,
  listArtifactsForClaim,
  resetArtifactStore,
  uploadArtifact,
} from "@/packages/artifact-domain/src";
import { resetAuditStore } from "@/packages/audit-security/src";

describe("artifact service", () => {
  beforeEach(() => {
    resetArtifactStore();
    resetIdentityStore();
    resetAuditStore();
  });

  it("stores artifact metadata and checksum", async () => {
    const talent = createTalentIdentity({
      input: {
        email: "artifact@example.com",
        firstName: "Artifact",
        lastName: "Owner",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const file = new File(["offer-letter"], "offer-letter.pdf", {
      type: "application/pdf",
    });
    const result = await uploadArtifact({
      file,
      ownerTalentId: talent.talentIdentity.id,
      actorType: "talent_user",
      actorId: talent.talentIdentity.id,
      correlationId: "corr-2",
    });

    expect(result.dto.parsingStatus).toBe("QUEUED");
    expect(result.artifact.sha256_checksum).toHaveLength(64);
    expect(
      getArtifactMetadata({
        artifactId: result.artifact.artifact_id,
        correlationId: "corr-3",
      }).original_filename,
    ).toBe("offer-letter.pdf");
  });

  it("links artifacts to claims", async () => {
    const talent = createTalentIdentity({
      input: {
        email: "artifact@example.com",
        firstName: "Artifact",
        lastName: "Owner",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const file = new File(["offer-letter"], "offer-letter.pdf", {
      type: "application/pdf",
    });
    const result = await uploadArtifact({
      file,
      ownerTalentId: talent.talentIdentity.id,
      actorType: "talent_user",
      actorId: talent.talentIdentity.id,
      correlationId: "corr-2",
    });

    attachArtifactToClaim({
      claimId: "claim_1",
      artifactId: result.artifact.artifact_id,
      actorType: "talent_user",
      actorId: talent.talentIdentity.id,
      correlationId: "corr-3",
    });

    expect(listArtifactsForClaim("claim_1")).toEqual([result.artifact.artifact_id]);
  });
});
