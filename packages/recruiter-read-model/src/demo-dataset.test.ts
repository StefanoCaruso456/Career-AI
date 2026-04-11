import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { resetArtifactStore } from "@/packages/artifact-domain/src";
import { getCredentialStore, resetCredentialStore } from "@/packages/credential-domain/src";
import { listPersistentCandidateContexts } from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  ensureRecruiterDemoDatasetLoaded,
  getRecruiterTrustProfileByToken,
  resetRecruiterDemoDatasetState,
  resetRecruiterReadModelStore,
  searchEmployerCandidates,
  type RecruiterDemoDatasetSnapshot,
  type RecruiterDemoSeededCandidate,
} from "@/packages/recruiter-read-model/src";
import { getRecruiterReadModelStore } from "@/packages/recruiter-read-model/src/store";
import { resetVerificationStore } from "@/packages/verification-domain/src";

function resetDemoRuntime() {
  resetAuditStore();
  resetArtifactStore();
  resetCredentialStore();
  resetRecruiterDemoDatasetState();
  resetRecruiterReadModelStore();
  resetVerificationStore();
}

async function installFreshDemoDataset() {
  resetDemoRuntime();
  await resetTestDatabase();
  await installTestDatabase();

  return ensureRecruiterDemoDatasetLoaded();
}

function getVisibility(context: Awaited<ReturnType<typeof listPersistentCandidateContexts>>[number]) {
  return typeof context.onboarding.profile.recruiterVisibility === "string"
    ? context.onboarding.profile.recruiterVisibility
    : null;
}

function pickCandidate(
  snapshot: RecruiterDemoDatasetSnapshot,
  visibility: RecruiterDemoSeededCandidate["visibility"],
) {
  const candidate = snapshot.candidates.find((entry) => entry.visibility === visibility);

  expect(candidate).toBeDefined();

  return candidate!;
}

function toStableSnapshotShape(snapshot: RecruiterDemoDatasetSnapshot) {
  return snapshot.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    careerId: candidate.careerId,
    currentEmployer: candidate.currentEmployer,
    currentRole: candidate.currentRole,
    fullName: candidate.fullName,
    location: candidate.location,
    searchPrompt: candidate.searchPrompt,
    searchVisible: candidate.searchVisible,
    skillTerms: candidate.skillTerms,
    targetRole: candidate.targetRole,
    visibility: candidate.visibility,
  }));
}

describe("recruiter demo dataset validation", () => {
  let snapshot: RecruiterDemoDatasetSnapshot;
  let searchableCandidate: RecruiterDemoSeededCandidate;
  let limitedCandidate: RecruiterDemoSeededCandidate;
  let privateCandidate: RecruiterDemoSeededCandidate;

  beforeAll(async () => {
    snapshot = await installFreshDemoDataset();
    searchableCandidate = pickCandidate(snapshot, "searchable");
    limitedCandidate = pickCandidate(snapshot, "limited");
    privateCandidate = pickCandidate(snapshot, "private");
  }, 45_000);

  afterAll(async () => {
    resetDemoRuntime();
    await resetTestDatabase();
  });

  it("loads the expected 200 candidates with the expected visibility split", async () => {
    const contexts = await listPersistentCandidateContexts({
      limit: 500,
    });
    const searchable = contexts.filter((context) => getVisibility(context) === "searchable");
    const limited = contexts.filter((context) => getVisibility(context) === "limited");
    const privateContexts = contexts.filter((context) => getVisibility(context) === "private");
    const shareEnabled = contexts.filter(
      (context) => context.aggregate.privacySettings.allow_public_share_link,
    );

    expect(contexts).toHaveLength(200);
    expect(searchable).toHaveLength(130);
    expect(limited).toHaveLength(40);
    expect(privateContexts).toHaveLength(30);
    expect(shareEnabled).toHaveLength(170);
    expect(snapshot.totalCandidates).toBe(200);
    expect(snapshot.searchableCandidates).toBe(170);
    expect(snapshot.shareProfileCount).toBe(170);
  });

  it("returns searchable candidates and excludes private candidates from recruiter search", async () => {
    const visibleSearch = await searchEmployerCandidates({
      limit: 5,
      prompt: `${searchableCandidate.fullName} ${searchableCandidate.searchPrompt}`,
    });
    const privateSearch = await searchEmployerCandidates({
      limit: 5,
      prompt: `${privateCandidate.fullName} ${privateCandidate.searchPrompt}`,
    });

    expect(visibleSearch.candidates[0]?.candidateId).toBe(searchableCandidate.candidateId);
    expect(
      privateSearch.candidates.some(
        (candidate) => candidate.candidateId === privateCandidate.candidateId,
      ),
    ).toBe(false);
  });

  it("keeps limited candidates searchable while hiding employment-specific matching signals", async () => {
    const byPublicSignals = await searchEmployerCandidates({
      limit: 5,
      prompt: `${limitedCandidate.currentRole} ${limitedCandidate.location} ${limitedCandidate.skillTerms.slice(0, 2).join(" ")}`,
    });
    const byEmployerName = await searchEmployerCandidates({
      limit: 10,
      prompt: limitedCandidate.currentEmployer,
    });

    const limitedMatch = byPublicSignals.candidates.find(
      (candidate) => candidate.candidateId === limitedCandidate.candidateId,
    );

    expect(limitedMatch).toBeDefined();
    expect(limitedMatch?.profileSummary).not.toContain(limitedCandidate.currentEmployer);
    expect(
      byEmployerName.candidates.some(
        (candidate) => candidate.candidateId === limitedCandidate.candidateId,
      ),
    ).toBe(false);
  });

  it("builds recruiter-safe trust profiles by visibility tier", async () => {
    const searchableProfile = await getRecruiterTrustProfileByToken({
      actorId: "recruiter-demo-test",
      actorType: "recruiter_user",
      correlationId: "searchable-share-profile",
      token: searchableCandidate.publicShareToken ?? "",
    });
    const limitedProfile = await getRecruiterTrustProfileByToken({
      actorId: "recruiter-demo-test",
      actorType: "recruiter_user",
      correlationId: "limited-share-profile",
      token: limitedCandidate.publicShareToken ?? "",
    });

    expect(searchableProfile.visibleEmploymentRecords.length).toBeGreaterThan(0);
    expect(searchableProfile.candidate.id).toBe(searchableCandidate.candidateId);
    expect(limitedProfile.visibleEmploymentRecords).toHaveLength(0);
    expect(limitedProfile.trustSummary.totalClaims).toBeGreaterThan(0);
    expect(privateCandidate.publicShareToken).toBeNull();
  });

  it("supports title-only, free-text, and job-description search modes against the seeded dataset", async () => {
    const titleSearch = await searchEmployerCandidates({
      limit: 5,
      prompt: searchableCandidate.currentRole,
    });
    const freeTextSearch = await searchEmployerCandidates({
      limit: 5,
      prompt: `Looking for a recruiter-safe match near ${searchableCandidate.location} with strength in ${searchableCandidate.currentRole}, ${searchableCandidate.skillTerms.slice(0, 3).join(", ")}, and evidence-backed collaboration.`,
    });
    const jobDescriptionSearch = await searchEmployerCandidates({
      limit: 5,
      prompt: [
        `We need a ${searchableCandidate.targetRole} who can operate in ${searchableCandidate.location}.`,
        `The person should bring experience close to ${searchableCandidate.currentRole}, plus strength in ${searchableCandidate.skillTerms.slice(0, 3).join(", ")}.`,
        "Responsibilities include partnering with leadership, shaping priorities, and bringing evidence-backed experience into recruiter review.",
      ].join("\n"),
    });

    expect(titleSearch.query.inputMode).toBe("job_title");
    expect(freeTextSearch.query.inputMode).toBe("free_text");
    expect(jobDescriptionSearch.query.inputMode).toBe("job_description");
    expect(titleSearch.candidates.length).toBeGreaterThan(0);
    expect(
      freeTextSearch.candidates.some(
        (candidate) => candidate.candidateId === searchableCandidate.candidateId,
      ),
    ).toBe(true);
    expect(jobDescriptionSearch.candidates.length).toBeGreaterThan(0);
  });
});

describe("recruiter demo dataset idempotency", () => {
  beforeAll(async () => {
    await installFreshDemoDataset();
  }, 45_000);

  afterAll(async () => {
    resetDemoRuntime();
    await resetTestDatabase();
  });

  it(
    "does not create duplicate candidates, claims, or share profiles on repeated bootstrap in the same runtime",
    async () => {
    const firstCandidateCount = (
      await listPersistentCandidateContexts({
        limit: 500,
      })
    ).length;
    const firstClaimCount = getCredentialStore().claimsById.size;
    const firstProfileCount = getRecruiterReadModelStore().profilesById.size;
    const firstSnapshot = await ensureRecruiterDemoDatasetLoaded();

    resetRecruiterDemoDatasetState();

    const secondSnapshot = await ensureRecruiterDemoDatasetLoaded();
    const secondCandidateCount = (
      await listPersistentCandidateContexts({
        limit: 500,
      })
    ).length;
    const secondClaimCount = getCredentialStore().claimsById.size;
    const secondProfileCount = getRecruiterReadModelStore().profilesById.size;

    expect(secondCandidateCount).toBe(firstCandidateCount);
    expect(secondClaimCount).toBe(firstClaimCount);
    expect(secondProfileCount).toBe(firstProfileCount);
    expect(secondSnapshot.candidates).toEqual(firstSnapshot.candidates);
    },
    45_000,
  );

  it(
    "rebuilds the same seeded behavior after a simulated process reset without duplicating persistent candidates",
    async () => {
    const originalSnapshot = await ensureRecruiterDemoDatasetLoaded();
    const originalClaimCount = getCredentialStore().claimsById.size;
    const originalProfileCount = getRecruiterReadModelStore().profilesById.size;
    const referenceCandidate = originalSnapshot.candidates[0];
    const referenceSearch = await searchEmployerCandidates({
      limit: 3,
      prompt: `${referenceCandidate.fullName} ${referenceCandidate.searchPrompt}`,
    });

    resetArtifactStore();
    resetCredentialStore();
    resetRecruiterDemoDatasetState();
    resetRecruiterReadModelStore();
    resetVerificationStore();

    const reloadedSnapshot = await ensureRecruiterDemoDatasetLoaded();
    const reloadedCandidateCount = (
      await listPersistentCandidateContexts({
        limit: 500,
      })
    ).length;
    const reloadedClaimCount = getCredentialStore().claimsById.size;
    const reloadedProfileCount = getRecruiterReadModelStore().profilesById.size;
    const reloadedSearch = await searchEmployerCandidates({
      limit: 3,
      prompt: `${referenceCandidate.fullName} ${referenceCandidate.searchPrompt}`,
    });

    expect(reloadedCandidateCount).toBe(200);
    expect(reloadedClaimCount).toBe(originalClaimCount);
    expect(reloadedProfileCount).toBe(originalProfileCount);
    expect(toStableSnapshotShape(reloadedSnapshot)).toEqual(
      toStableSnapshotShape(originalSnapshot),
    );
    expect(reloadedSearch.candidates[0]?.candidateId).toBe(referenceSearch.candidates[0]?.candidateId);
  },
  90_000,
  );
});
