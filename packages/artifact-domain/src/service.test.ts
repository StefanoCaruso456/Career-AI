import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTalentIdentity } from "@/packages/identity-domain/src";
import {
  attachArtifactToClaim,
  deleteArtifact,
  getArtifactContentByteLength,
  getArtifactMetadata,
  listArtifactsForClaim,
  resetArtifactStore,
  uploadArtifact,
} from "@/packages/artifact-domain/src";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("artifact service", () => {
  let artifactStorageRoot = "";

  beforeEach(async () => {
    artifactStorageRoot = mkdtempSync(join(tmpdir(), "career-ai-artifacts-"));
    process.env.CAREER_AI_ARTIFACT_STORAGE_ROOT = artifactStorageRoot;
    resetArtifactStore({ clearPersisted: true });
    await resetTestDatabase();
    await installTestDatabase();
    resetAuditStore();
  });

  afterEach(async () => {
    delete process.env.CAREER_AI_ARTIFACT_STORAGE_ROOT;
    rmSync(artifactStorageRoot, { force: true, recursive: true });
    await resetTestDatabase();
  });

  it("stores artifact metadata and checksum", async () => {
    const talent = await createTalentIdentity({
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
      getArtifactContentByteLength({
        artifactId: result.artifact.artifact_id,
      }),
    ).toBeGreaterThan(0);
    expect(
      getArtifactMetadata({
        artifactId: result.artifact.artifact_id,
        correlationId: "corr-3",
      }).original_filename,
    ).toBe("offer-letter.pdf");
  });

  it("loads artifact metadata and claim links after an in-memory reset", async () => {
    const talent = await createTalentIdentity({
      input: {
        email: "artifact-persist@example.com",
        firstName: "Artifact",
        lastName: "Persisted",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-persist-1",
    });

    const result = await uploadArtifact({
      file: new File(["persisted-bytes"], "persisted.pdf", {
        type: "application/pdf",
      }),
      ownerTalentId: talent.talentIdentity.id,
      actorType: "talent_user",
      actorId: talent.talentIdentity.id,
      correlationId: "corr-persist-2",
    });

    attachArtifactToClaim({
      claimId: "claim_persisted",
      artifactId: result.artifact.artifact_id,
      actorType: "talent_user",
      actorId: talent.talentIdentity.id,
      correlationId: "corr-persist-3",
    });

    resetArtifactStore({ clearPersisted: false });

    expect(
      getArtifactMetadata({
        artifactId: result.artifact.artifact_id,
        correlationId: "corr-persist-4",
      }).original_filename,
    ).toBe("persisted.pdf");
    expect(listArtifactsForClaim("claim_persisted")).toEqual([result.artifact.artifact_id]);
    expect(
      getArtifactContentByteLength({
        artifactId: result.artifact.artifact_id,
      }),
    ).toBeGreaterThan(0);
  });

  it("links artifacts to claims", async () => {
    const talent = await createTalentIdentity({
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

  it("audits artifact reads and deletes", async () => {
    const talent = await createTalentIdentity({
      input: {
        email: "artifact-audit@example.com",
        firstName: "Artifact",
        lastName: "Audit",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-audit-1",
    });

    const result = await uploadArtifact({
      file: new File(["read-and-delete"], "audit.pdf", {
        type: "application/pdf",
      }),
      ownerTalentId: talent.talentIdentity.id,
      actorType: "talent_user",
      actorId: talent.talentIdentity.id,
      correlationId: "corr-audit-2",
    });

    getArtifactMetadata({
      actorId: talent.talentIdentity.id,
      actorType: "talent_user",
      artifactId: result.artifact.artifact_id,
      correlationId: "corr-audit-3",
    });
    deleteArtifact({
      actorId: talent.talentIdentity.id,
      actorType: "talent_user",
      artifactId: result.artifact.artifact_id,
      correlationId: "corr-audit-4",
    });

    expect(listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          correlation_id: "corr-audit-3",
          event_type: "artifact.metadata.read",
          target_id: result.artifact.artifact_id,
        }),
        expect.objectContaining({
          correlation_id: "corr-audit-4",
          event_type: "artifact.deleted",
          target_id: result.artifact.artifact_id,
        }),
      ]),
    );
  });
});
