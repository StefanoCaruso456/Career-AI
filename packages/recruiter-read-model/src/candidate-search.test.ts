import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetArtifactStore } from "@/packages/artifact-domain/src";
import { resetCredentialStore } from "@/packages/credential-domain/src";
import {
  getPersistentCareerBuilderProfile,
  listPersistentRecruiterCandidateProjections,
  provisionGoogleUser,
  updateCareerProfileBasics,
  updateRoleSelection,
  upsertPersistentCareerBuilderEvidence,
  upsertPersistentCareerBuilderProfile,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import { resetRecruiterReadModelStore, searchEmployerCandidates } from "@/packages/recruiter-read-model/src";
import { resetVerificationStore } from "@/packages/verification-domain/src";

describe("searchEmployerCandidates", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    resetArtifactStore();
    resetCredentialStore();
    resetRecruiterReadModelStore();
    resetVerificationStore();
    await resetTestDatabase();
  });

  it("ranks aligned candidate profiles ahead of unrelated records", async () => {
    const productManager = await provisionGoogleUser({
      correlationId: "candidate-1",
      email: "pm@example.com",
      emailVerified: true,
      firstName: "Alex",
      fullName: "Alex Rivera",
      lastName: "Rivera",
      providerUserId: "google-pm",
    });
    await updateRoleSelection({
      correlationId: "candidate-1-role",
      roleType: "candidate",
      userId: productManager.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "candidate-1-profile",
      profilePatch: {
        headline: "Senior Product Manager",
        intent: "Leads enterprise SaaS and AI platform launches with startup urgency.",
        location: "Austin, TX",
      },
      userId: productManager.context.user.id,
    });
    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: productManager.context.aggregate.talentIdentity.id,
      input: {
        careerHeadline: "Senior Product Manager",
        coreNarrative:
          "Built AI workflow products for B2B SaaS teams, partnered with engineering, and shipped platform migrations.",
        legalName: "Alex Rivera",
        location: "Austin, TX",
        targetRole: "Senior Product Manager",
      },
      soulRecordId: productManager.context.aggregate.soulRecord.id,
    });
    await upsertPersistentCareerBuilderEvidence({
      careerIdentityId: productManager.context.aggregate.talentIdentity.id,
      record: {
        completionTier: "document",
        createdAt: "2026-04-10T00:00:00.000Z",
        files: [],
        id: "evidence_pm_offer",
        issuedOn: "2025-03-10",
        soulRecordId: productManager.context.aggregate.soulRecord.id,
        sourceOrIssuer: "Northstar SaaS",
        status: "COMPLETE",
        talentIdentityId: productManager.context.aggregate.talentIdentity.id,
        templateId: "offer-letters",
        updatedAt: "2026-04-10T00:00:00.000Z",
        validationContext: "Offer letter confirms product leadership scope and AI workflow ownership.",
        whyItMatters: "Shows enterprise SaaS product ownership in a verified employer document.",
      },
      soulRecordId: productManager.context.aggregate.soulRecord.id,
    });

    const recruiterProfile = await provisionGoogleUser({
      correlationId: "candidate-2",
      email: "recruiter@example.com",
      emailVerified: true,
      firstName: "Taylor",
      fullName: "Taylor Brooks",
      lastName: "Brooks",
      providerUserId: "google-recruiter",
    });
    await updateRoleSelection({
      correlationId: "candidate-2-role",
      roleType: "recruiter",
      userId: recruiterProfile.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "candidate-2-profile",
      profilePatch: {
        headline: "Recruiting Lead",
        intent: "Runs full-funnel recruiting for growth teams.",
        location: "Chicago, IL",
      },
      userId: recruiterProfile.context.user.id,
    });

    const designer = await provisionGoogleUser({
      correlationId: "candidate-3",
      email: "designer@example.com",
      emailVerified: true,
      firstName: "Mina",
      fullName: "Mina Chen",
      lastName: "Chen",
      providerUserId: "google-designer",
    });
    await updateRoleSelection({
      correlationId: "candidate-3-role",
      roleType: "candidate",
      userId: designer.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "candidate-3-profile",
      profilePatch: {
        headline: "Brand Designer",
        intent: "Designs visual systems and campaign launches.",
        location: "Remote",
      },
      userId: designer.context.user.id,
    });
    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: designer.context.aggregate.talentIdentity.id,
      input: {
        careerHeadline: "Brand Designer",
        coreNarrative: "Leads campaign systems and creative operations for consumer launches.",
        legalName: "Mina Chen",
        location: "Remote",
        targetRole: "Brand Designer",
      },
      soulRecordId: designer.context.aggregate.soulRecord.id,
    });

    const result = await searchEmployerCandidates({
      prompt: "Senior product manager with AI and enterprise SaaS experience in Austin",
    });

    expect(result.candidates[0]?.fullName).toBe("Alex Rivera");
    expect(result.candidates.some((candidate) => candidate.fullName === "Taylor Brooks")).toBe(
      false,
    );
    expect(result.candidates[0]?.credibility.verificationSignal).toMatch(/verified|evidence/i);
  });

  it("supports verified-only sourcing filters", async () => {
    const candidate = await provisionGoogleUser({
      correlationId: "verified-only",
      email: "verified@example.com",
      emailVerified: true,
      firstName: "Nina",
      fullName: "Nina Stone",
      lastName: "Stone",
      providerUserId: "google-verified",
    });
    await updateRoleSelection({
      correlationId: "verified-only-role",
      roleType: "candidate",
      userId: candidate.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "verified-only-profile",
      profilePatch: {
        headline: "Platform Engineer",
        intent: "Builds backend infrastructure and developer workflows.",
        location: "Remote",
      },
      userId: candidate.context.user.id,
    });
    const profile = await getPersistentCareerBuilderProfile({
      careerIdentityId: candidate.context.aggregate.talentIdentity.id,
      soulRecordId: candidate.context.aggregate.soulRecord.id,
    });

    expect(profile).toBeNull();

    const result = await searchEmployerCandidates({
      filters: {
        certifications: [],
        credibilityThreshold: null,
        education: null,
        industry: null,
        location: null,
        priorEmployers: [],
        skills: [],
        verificationStatus: [],
        verifiedExperienceOnly: true,
        workAuthorization: null,
        yearsExperienceMin: null,
      },
      prompt: "Platform engineer",
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("supports direct recruiter lookups while keeping private candidates hidden", async () => {
    const visibleCandidate = await provisionGoogleUser({
      correlationId: "lookup-visible",
      email: "lookup-visible@example.com",
      emailVerified: true,
      firstName: "Jamie",
      fullName: "Jamie Stone",
      lastName: "Stone",
      providerUserId: "google-lookup-visible",
    });
    await updateRoleSelection({
      correlationId: "lookup-visible-role",
      roleType: "candidate",
      userId: visibleCandidate.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "lookup-visible-profile",
      profilePatch: {
        headline: "Staff Product Designer",
        intent: "Designs enterprise workflow systems with verified collaboration history.",
        location: "Seattle, WA",
      },
      userId: visibleCandidate.context.user.id,
    });
    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: visibleCandidate.context.aggregate.talentIdentity.id,
      input: {
        careerHeadline: "Staff Product Designer",
        coreNarrative: "Owns end-to-end product design systems for B2B workflow software.",
        legalName: "Jamie Stone",
        location: "Seattle, WA",
        targetRole: "Head of Product Design",
      },
      soulRecordId: visibleCandidate.context.aggregate.soulRecord.id,
    });

    const privateCandidate = await provisionGoogleUser({
      correlationId: "lookup-private",
      email: "lookup-private@example.com",
      emailVerified: true,
      firstName: "Morgan",
      fullName: "Morgan Hale",
      lastName: "Hale",
      providerUserId: "google-lookup-private",
    });
    await updateRoleSelection({
      correlationId: "lookup-private-role",
      roleType: "candidate",
      userId: privateCandidate.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "lookup-private-profile",
      profilePatch: {
        headline: "Principal Security Engineer",
        intent: "Keeps sensitive employer history private.",
        location: "Remote - US",
        recruiterVisibility: "private",
      },
      userId: privateCandidate.context.user.id,
    });

    const byCareerId = await searchEmployerCandidates({
      prompt: visibleCandidate.context.aggregate.talentIdentity.talent_agent_id,
    });
    const byCandidateId = await searchEmployerCandidates({
      prompt: visibleCandidate.context.aggregate.talentIdentity.id,
    });
    const privateLookup = await searchEmployerCandidates({
      prompt: privateCandidate.context.aggregate.talentIdentity.talent_agent_id,
    });

    expect(byCareerId.totalMatches).toBe(1);
    expect(byCareerId.candidates[0]?.fullName).toBe("Jamie Stone");
    expect(byCareerId.candidates[0]?.ranking.label).toBe("Exact match");
    expect(byCandidateId.totalMatches).toBe(1);
    expect(byCandidateId.candidates[0]?.candidateId).toBe(
      visibleCandidate.context.aggregate.talentIdentity.id,
    );
    expect(privateLookup.candidates).toHaveLength(0);
  });

  it("keeps recruiter search DB-backed after runtime-only stores are reset", async () => {
    const candidate = await provisionGoogleUser({
      correlationId: "db-backed-search",
      email: "db-backed-search@example.com",
      emailVerified: true,
      firstName: "Jordan",
      fullName: "Jordan Vale",
      lastName: "Vale",
      providerUserId: "google-db-backed-search",
    });
    await updateRoleSelection({
      correlationId: "db-backed-search-role",
      roleType: "candidate",
      userId: candidate.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "db-backed-search-profile",
      profilePatch: {
        headline: "Senior Data Engineer",
        intent: "Builds warehouse and orchestration systems for enterprise analytics teams.",
        location: "Denver, CO",
      },
      userId: candidate.context.user.id,
    });
    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: candidate.context.aggregate.talentIdentity.id,
      input: {
        careerHeadline: "Senior Data Engineer",
        coreNarrative:
          "Owns ETL, data platform migrations, and analytics infrastructure for B2B products.",
        legalName: "Jordan Vale",
        location: "Denver, CO",
        targetRole: "Staff Data Engineer",
      },
      soulRecordId: candidate.context.aggregate.soulRecord.id,
    });
    await upsertPersistentCareerBuilderEvidence({
      careerIdentityId: candidate.context.aggregate.talentIdentity.id,
      record: {
        completionTier: "document",
        createdAt: "2026-04-10T00:00:00.000Z",
        files: [],
        id: "evidence_data_platform_offer",
        issuedOn: "2025-04-10",
        soulRecordId: candidate.context.aggregate.soulRecord.id,
        sourceOrIssuer: "Summit Analytics",
        status: "COMPLETE",
        talentIdentityId: candidate.context.aggregate.talentIdentity.id,
        templateId: "offer-letters",
        updatedAt: "2026-04-10T00:00:00.000Z",
        validationContext: "Offer letter confirms data platform leadership and pipeline ownership.",
        whyItMatters: "Shows verified data engineering leadership in a production analytics environment.",
      },
      soulRecordId: candidate.context.aggregate.soulRecord.id,
    });

    const persisted = await listPersistentRecruiterCandidateProjections({
      limit: 10,
      searchableOnly: false,
    });

    expect(
      persisted.some(
        (projection) =>
          projection.candidateId === candidate.context.aggregate.talentIdentity.id &&
          projection.searchable,
      ),
    ).toBe(true);

    resetArtifactStore();
    resetCredentialStore();
    resetRecruiterReadModelStore();
    resetVerificationStore();

    const result = await searchEmployerCandidates({
      prompt: "Senior data engineer for warehouse and analytics infrastructure in Denver",
    });

    expect(result.candidates[0]?.candidateId).toBe(candidate.context.aggregate.talentIdentity.id);
    expect(result.candidates[0]?.fullName).toBe("Jordan Vale");
  });
});
