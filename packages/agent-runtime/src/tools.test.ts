import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";

const {
  findActiveAccessGrantMock,
  findPersistentContextByTalentIdentityIdMock,
  findPersistentRecruiterCandidateProjectionByLookupMock,
  findPersistentSharedRecruiterCandidateProjectionByLookupMock,
  getClaimDetailsMock,
  getClaimOwnerIdentityIdMock,
  getPersistentCareerBuilderProfileMock,
  getVerificationRecordMock,
  isDatabaseConfiguredMock,
  listOrganizationMembershipsForUserMock,
  listPersistentCareerBuilderEvidenceMock,
  listProvenanceRecordsMock,
  searchEmployerCandidatesMock,
  searchJobsCatalogMock,
  traceSpanMock,
} = vi.hoisted(() => ({
  findActiveAccessGrantMock: vi.fn(),
  findPersistentContextByTalentIdentityIdMock: vi.fn(),
  findPersistentRecruiterCandidateProjectionByLookupMock: vi.fn(),
  findPersistentSharedRecruiterCandidateProjectionByLookupMock: vi.fn(),
  getClaimDetailsMock: vi.fn(),
  getClaimOwnerIdentityIdMock: vi.fn(),
  getPersistentCareerBuilderProfileMock: vi.fn(),
  getVerificationRecordMock: vi.fn(),
  isDatabaseConfiguredMock: vi.fn(),
  listOrganizationMembershipsForUserMock: vi.fn(),
  listPersistentCareerBuilderEvidenceMock: vi.fn(),
  listProvenanceRecordsMock: vi.fn(),
  searchEmployerCandidatesMock: vi.fn(),
  searchJobsCatalogMock: vi.fn(),
  traceSpanMock: vi.fn(),
}));

vi.mock("@/lib/tracing", () => ({
  traceSpan: traceSpanMock,
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  searchJobsCatalog: searchJobsCatalogMock,
}));

vi.mock("@/packages/persistence/src", () => ({
  countPersistedAuditEvents: vi.fn(),
  createAuditEventRecord: vi.fn(),
  findActiveAccessGrant: findActiveAccessGrantMock,
  findPersistentContextByTalentIdentityId: findPersistentContextByTalentIdentityIdMock,
  findPersistentRecruiterCandidateProjectionByLookup:
    findPersistentRecruiterCandidateProjectionByLookupMock,
  findPersistentSharedRecruiterCandidateProjectionByLookup:
    findPersistentSharedRecruiterCandidateProjectionByLookupMock,
  getPersistentCareerBuilderProfile: getPersistentCareerBuilderProfileMock,
  isDatabaseConfigured: isDatabaseConfiguredMock,
  listOrganizationMembershipsForUser: listOrganizationMembershipsForUserMock,
  listPersistentCareerBuilderEvidence: listPersistentCareerBuilderEvidenceMock,
}));

vi.mock("@/packages/recruiter-read-model/src", () => ({
  searchEmployerCandidates: searchEmployerCandidatesMock,
}));

vi.mock("@/packages/credential-domain/src", () => ({
  getClaimDetails: getClaimDetailsMock,
  getClaimOwnerIdentityId: getClaimOwnerIdentityIdMock,
}));

vi.mock("@/packages/verification-domain/src", () => ({
  getVerificationRecord: getVerificationRecordMock,
  listProvenanceRecords: listProvenanceRecordsMock,
}));

import type { AgentContext } from "./context";
import {
  AgentToolInputError,
  AgentToolPermissionError,
  createAgentToolRegistry,
  executeAgentToolCall,
  homepageAssistantToolRegistry,
  listAgentToolsAsOpenAIFunctions,
} from "./tools";

const candidateAgentContext: AgentContext = {
  actor: {
    appUserId: "app_user_123",
    authProvider: "nextauth",
    authSource: "nextauth_session",
    email: "candidate@example.com",
    id: "user:tal_123",
    kind: "authenticated_user",
    name: "Taylor Candidate",
    preferredPersona: "job_seeker",
    providerUserId: "provider_123",
    roleType: "candidate",
    talentIdentityId: "tal_123",
  },
  organizationContext: null,
  ownerId: "user:tal_123",
  preferredPersona: "job_seeker",
  roleType: "candidate",
  run: {
    correlationId: "corr-123",
    runId: "run-123",
    traceRoot: {
      braintrustRootSpanId: null,
      requestId: null,
      routeName: "http.route.chat.post",
      traceId: "trace-123",
    },
  },
};

const recruiterAgentContext: AgentContext = {
  ...candidateAgentContext,
  actor: {
    appUserId: "app_user_123",
    authProvider: "nextauth",
    authSource: "nextauth_session",
    email: "candidate@example.com",
    id: "user:tal_123",
    kind: "authenticated_user",
    name: "Taylor Candidate",
    preferredPersona: "employer",
    providerUserId: "provider_123",
    roleType: "recruiter",
    talentIdentityId: "tal_123",
  },
  preferredPersona: "employer",
  roleType: "recruiter",
};

const guestAgentContext: AgentContext = {
  actor: {
    authSource: "chat_owner_cookie",
    guestSessionId: "guest_123",
    id: "guest:guest_123",
    kind: "guest_user",
    preferredPersona: "job_seeker",
    roleType: null,
  },
  ownerId: "guest:guest_123",
  organizationContext: null,
  preferredPersona: "job_seeker",
  roleType: null,
  run: candidateAgentContext.run,
};

describe("agent tools", () => {
  beforeEach(() => {
    findActiveAccessGrantMock.mockReset();
    findPersistentContextByTalentIdentityIdMock.mockReset();
    findPersistentRecruiterCandidateProjectionByLookupMock.mockReset();
    findPersistentSharedRecruiterCandidateProjectionByLookupMock.mockReset();
    getClaimDetailsMock.mockReset();
    getClaimOwnerIdentityIdMock.mockReset();
    getPersistentCareerBuilderProfileMock.mockReset();
    getVerificationRecordMock.mockReset();
    isDatabaseConfiguredMock.mockReset();
    listOrganizationMembershipsForUserMock.mockReset();
    listPersistentCareerBuilderEvidenceMock.mockReset();
    listProvenanceRecordsMock.mockReset();
    searchEmployerCandidatesMock.mockReset();
    searchJobsCatalogMock.mockReset();
    traceSpanMock.mockReset();
    traceSpanMock.mockImplementation(
      (_options: unknown, callback: () => Promise<unknown> | unknown) => callback(),
    );
    isDatabaseConfiguredMock.mockReturnValue(false);
    listOrganizationMembershipsForUserMock.mockResolvedValue([]);
    resetAuditStore();
  });

  it("builds OpenAI function definitions from the registry", () => {
    const definitions = listAgentToolsAsOpenAIFunctions(homepageAssistantToolRegistry);

    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "search_jobs",
          strict: true,
          type: "function",
        }),
        expect.objectContaining({
          name: "get_career_id_summary",
          strict: true,
          type: "function",
        }),
        expect.objectContaining({
          name: "search_candidates",
          strict: true,
          type: "function",
        }),
        expect.objectContaining({
          name: "get_claim_details",
          strict: true,
          type: "function",
        }),
        expect.objectContaining({
          name: "get_verification_record",
          strict: true,
          type: "function",
        }),
        expect.objectContaining({
          name: "list_provenance_records",
          strict: true,
          type: "function",
        }),
      ]),
    );
  });

  it("executes the search_jobs tool with validation and tracing", async () => {
    searchJobsCatalogMock.mockResolvedValue({
      results: [
        {
          applyUrl: "https://example.com/jobs/1",
          companyName: "Acme",
          descriptionSnippet: "Build backend systems.",
          id: "job_1",
          location: "Austin, TX",
          postedAt: "2026-04-12T00:00:00.000Z",
          salaryText: "$180k-$210k",
          sourceLabel: "Greenhouse",
          title: "Senior Backend Engineer",
          workplaceType: "remote",
        },
      ],
      totalCandidateCount: 1,
    });

    const result = await executeAgentToolCall({
      agentContext: candidateAgentContext,
      registry: homepageAssistantToolRegistry,
      toolCall: {
        arguments: JSON.stringify({
          limit: 3,
          location: "Austin, TX",
          query: "backend engineer",
        }),
        name: "search_jobs",
      },
    });

    expect(searchJobsCatalogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 3,
        origin: "chat_prompt",
        ownerId: "user:tal_123",
        prompt: "backend engineer in Austin, TX",
        refresh: false,
      }),
    );
    expect(result).toEqual({
      jobs: [
        {
          applyUrl: "https://example.com/jobs/1",
          companyName: "Acme",
          id: "job_1",
          location: "Austin, TX",
          postedAt: "2026-04-12T00:00:00.000Z",
          salaryText: "$180k-$210k",
          sourceLabel: "Greenhouse",
          summary: "Build backend systems.",
          title: "Senior Backend Engineer",
          workplaceType: "remote",
        },
      ],
      location: "Austin, TX",
      query: "backend engineer",
      totalResults: 1,
    });
  });

  it("returns a safe self Career ID summary for authenticated users", async () => {
    findPersistentContextByTalentIdentityIdMock.mockResolvedValue({
      aggregate: {
        privacySettings: {
          allow_public_share_link: true,
          show_employment_records: true,
        },
        soulRecord: {
          default_share_profile_id: "share_123",
          id: "soul_123",
        },
        talentIdentity: {
          display_name: "Taylor Candidate",
          id: "tal_123",
          talent_agent_id: "TAID-123456",
        },
      },
      onboarding: {
        profile: {
          headline: "Senior Product Manager",
          intent: "Builds evidence-backed B2B workflows.",
          location: "Austin, TX",
          recruiterVisibility: "limited",
        },
        profileCompletionPercent: 82,
        roleType: "candidate",
      },
    });
    getPersistentCareerBuilderProfileMock.mockResolvedValue({
      careerHeadline: "Senior Product Manager",
      coreNarrative: "Builds evidence-backed B2B workflows.",
      location: "Austin, TX",
      targetRole: "Principal Product Manager",
    });
    listPersistentCareerBuilderEvidenceMock.mockResolvedValue([
      {
        status: "COMPLETE",
        templateId: "offer-letters",
      },
      {
        status: "COMPLETE",
        templateId: "portfolio",
      },
    ]);

    const result = await executeAgentToolCall({
      agentContext: candidateAgentContext,
      registry: homepageAssistantToolRegistry,
      toolCall: {
        arguments: JSON.stringify({}),
        name: "get_career_id_summary",
      },
    });

    expect(result).toEqual({
      found: true,
      subject: "self",
      summary: {
        candidateId: "tal_123",
        careerId: "TAID-123456",
        credibilityLabel: "High credibility",
        credibilityScore: 88,
        displayName: "Taylor Candidate",
        evidenceCount: 2,
        hasPublicShareProfile: true,
        headline: "Senior Product Manager",
        location: "Austin, TX",
        profileCompletionPercent: 82,
        profileSummary: "Builds evidence-backed B2B workflows.",
        recruiterVisibility: "limited",
        roleType: "candidate",
        searchable: true,
        targetRole: "Principal Product Manager",
        topSkills: [],
        verifiedExperienceCount: 1,
      },
    });
  });

  it("denies guest access to the Career ID summary tool", async () => {
    await expect(
      executeAgentToolCall({
        agentContext: guestAgentContext,
        registry: homepageAssistantToolRegistry,
        toolCall: {
          arguments: JSON.stringify({}),
          name: "get_career_id_summary",
        },
      }),
    ).rejects.toBeInstanceOf(AgentToolPermissionError);
  });

  it("returns recruiter-safe public candidate summaries for recruiter search", async () => {
    searchEmployerCandidatesMock.mockResolvedValue({
      candidates: [
        {
          actions: {
            trustProfileUrl: "/share/token-123",
          },
          candidateId: "tal_candidate_1",
          careerId: "TAID-654321",
          credibility: {
            label: "Evidence-backed",
            score: 73,
            verifiedExperienceCount: 2,
          },
          fullName: "Jordan Vale",
          headline: "Senior Data Engineer",
          location: "Denver, CO",
          profileSummary: "Owns analytics infrastructure for B2B teams.",
          targetRole: "Staff Data Engineer",
          topSkills: ["Python", "Airflow", "Snowflake"],
        },
      ],
      totalMatches: 1,
    });

    const result = await executeAgentToolCall({
      agentContext: recruiterAgentContext,
      registry: homepageAssistantToolRegistry,
      toolCall: {
        arguments: JSON.stringify({
          query: "senior data engineer denver",
        }),
        name: "search_candidates",
      },
    });

    expect(result).toEqual({
      candidates: [
        {
          candidateId: "tal_candidate_1",
          careerId: "TAID-654321",
          credibilityLabel: "Evidence-backed",
          credibilityScore: 73,
          displayName: "Jordan Vale",
          hasPublicShareProfile: true,
          headline: "Senior Data Engineer",
          location: "Denver, CO",
          profileSummary: "Owns analytics infrastructure for B2B teams.",
          targetRole: "Staff Data Engineer",
          topSkills: ["Python", "Airflow", "Snowflake"],
          verifiedExperienceCount: 2,
        },
      ],
      query: "senior data engineer denver",
      totalResults: 1,
    });
  });

  it("falls back to an exact shared-profile lookup when candidate search has no public matches", async () => {
    searchEmployerCandidatesMock.mockResolvedValue({
      candidates: [],
      totalMatches: 0,
    });
    findPersistentSharedRecruiterCandidateProjectionByLookupMock.mockResolvedValue({
      candidateId: "tal_private_1",
      careerId: "TAID-777777",
      credibilityScore: 0.62,
      displaySkills: ["Security", "SIEM"],
      evidenceCount: 3,
      fullName: "Morgan Hale",
      headline: "Principal Security Engineer",
      location: "Remote - US",
      profileSummary: "Keeps sensitive employer history private.",
      publicShareToken: "token-123",
      recruiterVisibility: "private",
      searchText: "",
      searchable: false,
      shareProfileId: "share_private_123",
      targetRole: "Security Architect",
      updatedAt: "2026-04-12T00:00:00.000Z",
      verificationSignal: "Evidence-backed profile",
      verifiedExperienceCount: 1,
    });

    const result = await executeAgentToolCall({
      agentContext: recruiterAgentContext,
      registry: homepageAssistantToolRegistry,
      toolCall: {
        arguments: JSON.stringify({
          query: "share_private_123",
        }),
        name: "search_candidates",
      },
    });

    expect(result).toEqual({
      candidates: [
        {
          candidateId: "tal_private_1",
          careerId: "TAID-777777",
          credibilityLabel: "Evidence-backed",
          credibilityScore: 62,
          displayName: "Morgan Hale",
          hasPublicShareProfile: true,
          headline: "Principal Security Engineer",
          location: "Remote - US",
          profileSummary: "Keeps sensitive employer history private.",
          targetRole: "Security Architect",
          topSkills: ["Security", "SIEM"],
          verifiedExperienceCount: 1,
        },
      ],
      query: "share_private_123",
      totalResults: 1,
    });
  });

  it("denies candidate users from searching candidates", async () => {
    await expect(
      executeAgentToolCall({
        agentContext: candidateAgentContext,
        registry: homepageAssistantToolRegistry,
        toolCall: {
          arguments: JSON.stringify({
            query: "backend engineers",
          }),
          name: "search_candidates",
        },
      }),
    ).rejects.toBeInstanceOf(AgentToolPermissionError);
    expect(searchEmployerCandidatesMock).not.toHaveBeenCalled();
    expect(listAuditEvents()).toContainEqual(
      expect.objectContaining({
        event_type: "security.tool_access.denied",
        target_id: "search_candidates",
      }),
    );
  });

  it("rejects invalid tool arguments", async () => {
    await expect(
      executeAgentToolCall({
        agentContext: candidateAgentContext,
        registry: homepageAssistantToolRegistry,
        toolCall: {
          arguments: JSON.stringify({
            query: "   ",
          }),
          name: "search_jobs",
        },
      }),
    ).rejects.toBeInstanceOf(AgentToolInputError);
    expect(searchJobsCatalogMock).not.toHaveBeenCalled();
  });

  it("rejects tool execution when permission is denied", async () => {
    const gatedRegistry = createAgentToolRegistry([
      {
        description: "Permission-gated test tool",
        execute: vi.fn(),
        inputSchema: z.object({
          query: z.string(),
        }),
        isAuthorized: () => false,
        name: "gated_tool",
      },
    ]);

    await expect(
      executeAgentToolCall({
        agentContext: candidateAgentContext,
        registry: gatedRegistry,
        toolCall: {
          arguments: JSON.stringify({ query: "hello" }),
          name: "gated_tool",
        },
      }),
    ).rejects.toBeInstanceOf(AgentToolPermissionError);
  });

  it("returns private claim details for the owning candidate", async () => {
    getClaimOwnerIdentityIdMock.mockResolvedValue("tal_123");
    getClaimDetailsMock.mockResolvedValue({
      artifactIds: ["art_123"],
      claimId: "claim_123",
      claimType: "EMPLOYMENT",
      createdAt: "2026-04-13T00:00:00.000Z",
      employmentRecord: {
        claim_id: "claim_123",
        company_letterhead_detected_optional: true,
        created_at: "2026-04-13T00:00:00.000Z",
        currently_employed: false,
        document_date_optional: "2024-01-01",
        employer_domain_optional: "acme.com",
        employer_name: "Acme",
        employment_type_optional: "Full-time",
        end_date_optional: "2024-01-01",
        id: "emp_123",
        location_optional: "Austin, TX",
        role_title: "Senior Engineer",
        signatory_name_optional: "Alex HR",
        signatory_title_optional: "HR Director",
        start_date: "2021-01-01",
        updated_at: "2026-04-13T00:00:00.000Z",
      },
      summary: "Acme employment from 2021-01-01",
      title: "Senior Engineer at Acme",
      updatedAt: "2026-04-13T00:00:00.000Z",
      verification: {
        claim_id: "claim_123",
        confidence_tier: "REVIEWED",
        created_at: "2026-04-13T00:00:00.000Z",
        expires_at_optional: null,
        id: "ver_123",
        notes_optional: "Reviewed",
        primary_method: "USER_UPLOAD",
        reviewed_at_optional: "2026-04-13T01:00:00.000Z",
        reviewer_actor_id_optional: "admin_1",
        source_label: "candidate_self_report",
        source_reference_optional: null,
        status: "REVIEWED",
        updated_at: "2026-04-13T01:00:00.000Z",
      },
    });

    await expect(
      executeAgentToolCall({
        agentContext: candidateAgentContext,
        registry: homepageAssistantToolRegistry,
        toolCall: {
          arguments: JSON.stringify({ claimId: "claim_123" }),
          name: "get_claim_details",
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        found: true,
      }),
    );
  });

  it("denies recruiters from reading private claim details without a grant", async () => {
    getClaimOwnerIdentityIdMock.mockResolvedValue("tal_candidate_1");

    await expect(
      executeAgentToolCall({
        agentContext: recruiterAgentContext,
        registry: homepageAssistantToolRegistry,
        toolCall: {
          arguments: JSON.stringify({ claimId: "claim_private_1" }),
          name: "get_claim_details",
        },
      }),
    ).rejects.toBeInstanceOf(AgentToolPermissionError);
  });

  it("allows recruiters with an active grant to read verification data", async () => {
    listOrganizationMembershipsForUserMock.mockResolvedValue([
      {
        createdAt: "2026-04-13T00:00:00.000Z",
        id: "org_mem_1",
        organizationId: "org_1",
        role: "admin",
        status: "active",
        updatedAt: "2026-04-13T00:00:00.000Z",
        userId: "app_user_123",
      },
    ]);
    findActiveAccessGrantMock.mockResolvedValue({
      accessRequestId: "access_req_1",
      createdAt: "2026-04-13T00:00:00.000Z",
      expiresAt: null,
      grantedByActorId: "tal_candidate_1",
      grantedByActorType: "talent_user",
      id: "access_grant_1",
      metadataJson: {},
      organizationId: "org_1",
      revokedAt: null,
      scope: "candidate_private_profile",
      status: "active",
      subjectTalentIdentityId: "tal_candidate_1",
      updatedAt: "2026-04-13T00:00:00.000Z",
    });
    getVerificationRecordMock.mockResolvedValue({
      claim_id: "claim_private_1",
      confidence_tier: "REVIEWED",
      created_at: "2026-04-13T00:00:00.000Z",
      expires_at_optional: null,
      id: "ver_private_1",
      notes_optional: null,
      primary_method: "USER_UPLOAD",
      reviewed_at_optional: "2026-04-13T01:00:00.000Z",
      reviewer_actor_id_optional: "admin_1",
      source_label: "candidate_self_report",
      source_reference_optional: null,
      status: "REVIEWED",
      updated_at: "2026-04-13T01:00:00.000Z",
    });
    getClaimOwnerIdentityIdMock.mockResolvedValue("tal_candidate_1");
    listProvenanceRecordsMock.mockResolvedValue([
      {
        artifact_id_optional: "art_private_1",
        created_at: "2026-04-13T01:05:00.000Z",
        id: "prov_1",
        source_actor_id_optional: "admin_1",
        source_actor_type: "reviewer_admin",
        source_details_json: {
          note: "Offer letter matched.",
        },
        source_method: "INTERNAL_REVIEW",
        verification_record_id: "ver_private_1",
      },
    ]);

    await expect(
      executeAgentToolCall({
        agentContext: recruiterAgentContext,
        registry: homepageAssistantToolRegistry,
        toolCall: {
          arguments: JSON.stringify({ verificationRecordId: "ver_private_1" }),
          name: "get_verification_record",
        },
      }),
    ).resolves.toEqual({
      found: true,
      verificationRecord: expect.objectContaining({
        id: "ver_private_1",
        status: "REVIEWED",
      }),
    });

    await expect(
      executeAgentToolCall({
        agentContext: recruiterAgentContext,
        registry: homepageAssistantToolRegistry,
        toolCall: {
          arguments: JSON.stringify({ verificationRecordId: "ver_private_1" }),
          name: "list_provenance_records",
        },
      }),
    ).resolves.toEqual({
      found: true,
      provenance: [
        expect.objectContaining({
          id: "prov_1",
          source_method: "INTERNAL_REVIEW",
        }),
      ],
      verificationRecordId: "ver_private_1",
    });
  });
});
