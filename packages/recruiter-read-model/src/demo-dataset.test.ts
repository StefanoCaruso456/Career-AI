import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { resetArtifactStore } from "@/packages/artifact-domain/src";
import { resetCredentialStore } from "@/packages/credential-domain/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  ensureRecruiterDemoDatasetLoaded,
  getRecruiterTrustProfileByToken,
  resetRecruiterDemoDatasetState,
  resetRecruiterReadModelStore,
  searchEmployerCandidates,
} from "@/packages/recruiter-read-model/src";
import { resetVerificationStore } from "@/packages/verification-domain/src";

describe("recruiter demo dataset bootstrap", () => {
  let snapshot: Awaited<ReturnType<typeof ensureRecruiterDemoDatasetLoaded>>;

  beforeAll(async () => {
    resetAuditStore();
    resetArtifactStore();
    resetCredentialStore();
    resetRecruiterDemoDatasetState();
    resetRecruiterReadModelStore();
    resetVerificationStore();
    await resetTestDatabase();
    await installTestDatabase();
    snapshot = await ensureRecruiterDemoDatasetLoaded();
  }, 30_000);

  afterAll(async () => {
    resetAuditStore();
    resetArtifactStore();
    resetCredentialStore();
    resetRecruiterDemoDatasetState();
    resetRecruiterReadModelStore();
    resetVerificationStore();
    await resetTestDatabase();
  });

  it("bootstraps 200 deterministic candidates and recruiter-safe share profiles", async () => {
    const secondLoad = await ensureRecruiterDemoDatasetLoaded();

    expect(snapshot.totalCandidates).toBe(200);
    expect(snapshot.fullVisibilityCandidates).toBe(130);
    expect(snapshot.limitedVisibilityCandidates).toBe(40);
    expect(snapshot.privateCandidates).toBe(30);
    expect(snapshot.searchableCandidates).toBe(170);
    expect(snapshot.shareProfileCount).toBe(170);
    expect(snapshot.candidates.map((candidate) => candidate.fullName)).toEqual(
      secondLoad.candidates.map((candidate) => candidate.fullName),
    );
  });

  it("makes seeded candidates searchable while keeping private candidates out of recruiter search", async () => {
    const searchableCandidate = snapshot.candidates.find(
      (candidate) => candidate.visibility === "searchable",
    );
    const privateCandidate = snapshot.candidates.find(
      (candidate) => candidate.visibility === "private",
    );

    expect(searchableCandidate).toBeDefined();
    expect(privateCandidate).toBeDefined();

    const visibleSearch = await searchEmployerCandidates({
      limit: 5,
      prompt: `${searchableCandidate?.fullName} ${searchableCandidate?.searchPrompt}`,
    });
    const privateSearch = await searchEmployerCandidates({
      limit: 5,
      prompt: `${privateCandidate?.fullName} ${privateCandidate?.searchPrompt}`,
    });

    expect(visibleSearch.candidates[0]?.candidateId).toBe(searchableCandidate?.candidateId);
    expect(
      privateSearch.candidates.some(
        (candidate) => candidate.candidateId === privateCandidate?.candidateId,
      ),
    ).toBe(false);
  });

  it("builds limited-visibility share profiles without exposing employment records", async () => {
    const limitedCandidate = snapshot.candidates.find(
      (candidate) => candidate.visibility === "limited" && candidate.publicShareToken,
    );

    expect(limitedCandidate).toBeDefined();

    const profile = await getRecruiterTrustProfileByToken({
      actorId: "recruiter-demo-test",
      actorType: "recruiter_user",
      correlationId: "limited-share-profile",
      token: limitedCandidate?.publicShareToken ?? "",
    });

    expect(profile.visibleEmploymentRecords).toHaveLength(0);
    expect(profile.trustSummary.totalClaims).toBeGreaterThan(0);
  });
});
