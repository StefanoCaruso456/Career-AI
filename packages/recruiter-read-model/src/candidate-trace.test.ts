import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetArtifactStore } from "@/packages/artifact-domain/src";
import { createEmploymentClaim, resetCredentialStore } from "@/packages/credential-domain/src";
import { updatePrivacySettings } from "@/packages/identity-domain/src";
import {
  provisionGoogleUser,
  updateCareerProfileBasics,
  updateRoleSelection,
  upsertPersistentCareerBuilderEvidence,
  upsertPersistentCareerBuilderProfile,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import { getEmployerCandidateTrace } from "@/packages/recruiter-read-model/src";
import { resetVerificationStore } from "@/packages/verification-domain/src";

describe("getEmployerCandidateTrace", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetArtifactStore();
    resetCredentialStore();
    resetVerificationStore();
  });

  afterEach(async () => {
    resetArtifactStore();
    resetCredentialStore();
    resetVerificationStore();
    await resetTestDatabase();
  });

  it("returns a single recruiter-safe trace for a direct Career ID lookup", async () => {
    const candidate = await provisionGoogleUser({
      correlationId: "trace-career-id",
      email: "trace-career-id@example.com",
      emailVerified: true,
      firstName: "Alex",
      fullName: "Alex Rivera",
      lastName: "Rivera",
      providerUserId: "google-trace-career-id",
    });
    await updateRoleSelection({
      correlationId: "trace-career-id-role",
      roleType: "candidate",
      userId: candidate.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "trace-career-id-profile",
      profilePatch: {
        headline: "Senior Product Manager",
        intent: "Leads enterprise AI launches and platform rollouts.",
        location: "Austin, TX",
        recruiterVisibility: "searchable",
      },
      userId: candidate.context.user.id,
    });
    await updatePrivacySettings({
      actorId: "seed-user",
      actorType: "system_service",
      correlationId: "trace-career-id-privacy",
      input: {
        allowPublicShareLink: true,
        showArtifactPreviews: true,
        showEmploymentRecords: true,
        showStatusLabels: true,
      },
      talentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });
    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: candidate.context.aggregate.talentIdentity.id,
      input: {
        careerHeadline: "Senior Product Manager",
        coreNarrative: "Built AI workflow products for B2B SaaS teams.",
        legalName: "Alex Rivera",
        location: "Austin, TX",
        targetRole: "VP Product",
      },
      soulRecordId: candidate.context.aggregate.soulRecord.id,
    });
    await upsertPersistentCareerBuilderEvidence({
      careerIdentityId: candidate.context.aggregate.talentIdentity.id,
      record: {
        completionTier: "document",
        createdAt: "2026-04-10T00:00:00.000Z",
        files: [],
        id: "trace_evidence_pm_offer",
        issuedOn: "2025-03-10",
        soulRecordId: candidate.context.aggregate.soulRecord.id,
        sourceOrIssuer: "Northstar SaaS",
        status: "COMPLETE",
        talentIdentityId: candidate.context.aggregate.talentIdentity.id,
        templateId: "offer-letters",
        updatedAt: "2026-04-10T00:00:00.000Z",
        validationContext: "Offer letter confirms AI workflow ownership and product scope.",
        whyItMatters: "Shows verified enterprise product leadership.",
      },
      soulRecordId: candidate.context.aggregate.soulRecord.id,
    });
    await createEmploymentClaim({
      actorId: candidate.context.aggregate.talentIdentity.id,
      actorType: "talent_user",
      correlationId: "trace-career-id-claim",
      input: {
        currentlyEmployed: true,
        employerName: "Northstar SaaS",
        roleTitle: "Senior Product Manager",
        soulRecordId: candidate.context.aggregate.soulRecord.id,
        startDate: "2024-01-01",
      },
    });

    const trace = await getEmployerCandidateTrace({
      correlationId: "trace-career-id-read",
      input: {
        lookup: candidate.context.aggregate.talentIdentity.talent_agent_id,
      },
    });

    expect(trace.lookup.resolvedBy).toBe("career_id");
    expect(trace.candidate.fullName).toBe("Alex Rivera");
    expect(trace.candidate.currentEmployer).toBe("Northstar SaaS");
    expect(trace.profile?.targetRole).toBe("VP Product");
    expect(trace.evidenceRecords).toHaveLength(1);
    expect(trace.evidenceRecords[0]?.sourceOrIssuer).toBe("Northstar SaaS");
    expect(trace.visibleEmploymentRecords).toHaveLength(1);
  });

  it("keeps limited traces recruiter-safe by hiding employment-specific details", async () => {
    const candidate = await provisionGoogleUser({
      correlationId: "trace-limited",
      email: "trace-limited@example.com",
      emailVerified: true,
      firstName: "Mina",
      fullName: "Mina Chen",
      lastName: "Chen",
      providerUserId: "google-trace-limited",
    });
    await updateRoleSelection({
      correlationId: "trace-limited-role",
      roleType: "candidate",
      userId: candidate.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "trace-limited-profile",
      profilePatch: {
        headline: "Staff Designer",
        intent: "Designs workflow systems with recruiter-safe visibility.",
        location: "Seattle, WA",
        recruiterVisibility: "limited",
      },
      userId: candidate.context.user.id,
    });
    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: candidate.context.aggregate.talentIdentity.id,
      input: {
        careerHeadline: "Staff Designer",
        coreNarrative: "Shapes platform UX systems for enterprise tools.",
        legalName: "Mina Chen",
        location: "Seattle, WA",
        targetRole: "Head of Design",
      },
      soulRecordId: candidate.context.aggregate.soulRecord.id,
    });
    await upsertPersistentCareerBuilderEvidence({
      careerIdentityId: candidate.context.aggregate.talentIdentity.id,
      record: {
        completionTier: "document",
        createdAt: "2026-04-10T00:00:00.000Z",
        files: [],
        id: "trace_evidence_limited",
        issuedOn: "2025-02-01",
        soulRecordId: candidate.context.aggregate.soulRecord.id,
        sourceOrIssuer: "Bright Labs",
        status: "COMPLETE",
        talentIdentityId: candidate.context.aggregate.talentIdentity.id,
        templateId: "offer-letters",
        updatedAt: "2026-04-10T00:00:00.000Z",
        validationContext: "Confirms senior design systems scope.",
        whyItMatters: "Shows documented design leadership without exposing employer details.",
      },
      soulRecordId: candidate.context.aggregate.soulRecord.id,
    });

    const trace = await getEmployerCandidateTrace({
      correlationId: "trace-limited-read",
      input: {
        lookup: candidate.context.aggregate.talentIdentity.talent_agent_id,
      },
    });

    expect(trace.candidate.recruiterVisibility).toBe("limited");
    expect(trace.candidate.currentEmployer).toBeNull();
    expect(trace.evidenceRecords[0]?.sourceOrIssuer).toBeNull();
    expect(trace.visibleEmploymentRecords).toHaveLength(0);
  });

  it("does not return private candidates from the recruiter-safe trace endpoint", async () => {
    const candidate = await provisionGoogleUser({
      correlationId: "trace-private",
      email: "trace-private@example.com",
      emailVerified: true,
      firstName: "Morgan",
      fullName: "Morgan Hale",
      lastName: "Hale",
      providerUserId: "google-trace-private",
    });
    await updateRoleSelection({
      correlationId: "trace-private-role",
      roleType: "candidate",
      userId: candidate.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "trace-private-profile",
      profilePatch: {
        headline: "Principal Security Engineer",
        intent: "Keeps sensitive employer history private.",
        location: "Remote - US",
        recruiterVisibility: "private",
      },
      userId: candidate.context.user.id,
    });

    await expect(
      getEmployerCandidateTrace({
        correlationId: "trace-private-read",
        input: {
          lookup: candidate.context.aggregate.talentIdentity.talent_agent_id,
        },
      }),
    ).rejects.toThrowError(/No recruiter-safe candidate matched that lookup/i);
  });
});
