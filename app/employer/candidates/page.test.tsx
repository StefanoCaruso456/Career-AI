import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recruiterReadModelMocks = vi.hoisted(() => ({
  getEmployerCandidateTrace: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/packages/recruiter-read-model/src", () => recruiterReadModelMocks);
vi.mock("@/components/access-requests/recruiter-access-request-panel", () => ({
  RecruiterAccessRequestPanel: ({
    candidateName,
  }: {
    candidateName: string;
  }) => <div>Private access panel for {candidateName}</div>,
}));

describe("EmployerCandidatesPage", () => {
  beforeEach(() => {
    recruiterReadModelMocks.getEmployerCandidateTrace.mockReset();
  });

  it("renders recruiter-safe candidate detail for direct Career ID lookups", async () => {
    recruiterReadModelMocks.getEmployerCandidateTrace.mockResolvedValue({
      actions: {
        careerIdUrl: "/employer/candidates?careerId=TAID-000123",
        profileUrl: "/employer/candidates?candidateId=tal_123",
        trustProfileUrl: "/share/token-123",
      },
      candidate: {
        candidateId: "tal_123",
        careerId: "TAID-000123",
        currentEmployer: "Northstar SaaS",
        currentRole: "Senior Product Manager",
        fullName: "Alex Rivera",
        headline: "Senior Product Manager",
        location: "Austin, TX",
        profileSummary: "Leads AI platform launches for B2B SaaS products.",
        recruiterVisibility: "searchable",
        searchable: true,
        targetRole: "VP Product",
        updatedAt: "2026-04-10T00:00:00.000Z",
      },
      credibility: {
        evidenceCount: 3,
        label: "High credibility",
        score: 91,
        verificationSignal: "Verified experience",
        verifiedExperienceCount: 2,
      },
      evidenceRecords: [
        {
          completionTier: "document",
          createdAt: "2026-04-10T00:00:00.000Z",
          fileCount: 1,
          files: [],
          id: "evidence_1",
          issuedOn: "2025-03-10",
          sourceOrIssuer: "Northstar SaaS",
          status: "COMPLETE",
          templateId: "offer-letters",
          updatedAt: "2026-04-10T00:00:00.000Z",
          validationContext: "Offer letter confirms product scope.",
          whyItMatters: "Built AI workflow tooling.",
        },
      ],
      generatedAt: "2026-04-10T00:00:00.000Z",
      lookup: {
        resolvedBy: "career_id",
        value: "TAID-000123",
      },
      onboarding: {
        currentStep: 4,
        profileCompletionPercent: 100,
        roleType: "candidate",
        status: "completed",
      },
      privacy: {
        allowPublicShareLink: true,
        allowQrShare: true,
        showArtifactPreviews: false,
        showCertificationRecords: false,
        showEducationRecords: false,
        showEmploymentRecords: true,
        showEndorsements: false,
        showStatusLabels: true,
      },
      profile: {
        careerHeadline: "Senior Product Manager",
        coreNarrative: "Leads AI platform launches for B2B SaaS products.",
        createdAt: "2026-04-10T00:00:00.000Z",
        legalName: "Alex Rivera",
        location: "Austin, TX",
        soulRecordId: "soul_123",
        talentIdentityId: "tal_123",
        targetRole: "VP Product",
        updatedAt: "2026-04-10T00:00:00.000Z",
      },
      searchProjection: {
        displaySkills: ["AI", "SaaS"],
        experienceHighlights: ["Built AI workflow tooling."],
        priorEmployers: ["Northstar SaaS"],
        searchText: "Alex Rivera Senior Product Manager Austin",
        searchableKeywords: ["ai", "saas"],
      },
      shareProfile: {
        publicShareToken: "token-123",
        shareProfileId: "share_123",
        shareUrl: "/share/token-123",
        trustProfileUrl: "/share/token-123",
      },
      visibleEmploymentRecords: [
        {
          artifactCount: 1,
          claimId: "claim_123",
          confidenceTierOptional: "MEDIUM",
          currentlyEmployed: true,
          employerName: "Northstar SaaS",
          endDateOptional: null,
          lastUpdatedAt: "2026-04-10T00:00:00.000Z",
          roleTitle: "Senior Product Manager",
          sourceLabelOptional: "HR letter",
          startDate: "2024-01-01",
          verificationStatusOptional: "REVIEWED",
        },
      ],
    });

    const EmployerCandidatesPage = (await import("@/app/employer/candidates/page")).default;

    render(
      await EmployerCandidatesPage({
        searchParams: Promise.resolve({
          careerId: "TAID-000123",
        }),
      }),
    );

    expect(recruiterReadModelMocks.getEmployerCandidateTrace).toHaveBeenCalledWith({
      correlationId: expect.any(String),
      input: {
        lookup: "TAID-000123",
      },
    });
    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Career ID")).toBeInTheDocument();
    expect(screen.getByText("TAID-000123")).toBeInTheDocument();
    expect(screen.getAllByText("Northstar SaaS").length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence records")).toBeInTheDocument();
    expect(screen.getByText("Visible employment records")).toBeInTheDocument();
    const trustProfileLinks = screen.getAllByRole("link", { name: "Review trust profile" });

    expect(trustProfileLinks).toHaveLength(2);
    trustProfileLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "#trusted-profile");
    });
  });

  it("shows the recruiter-safe empty state when no identifier is provided", async () => {
    const EmployerCandidatesPage = (await import("@/app/employer/candidates/page")).default;

    render(
      await EmployerCandidatesPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(recruiterReadModelMocks.getEmployerCandidateTrace).not.toHaveBeenCalled();
    expect(screen.getByText("Ready for direct candidate lookup")).toBeInTheDocument();
  });
});
