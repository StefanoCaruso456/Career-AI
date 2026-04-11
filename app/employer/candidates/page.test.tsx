import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recruiterReadModelMocks = vi.hoisted(() => ({
  searchEmployerCandidates: vi.fn(),
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

describe("EmployerCandidatesPage", () => {
  beforeEach(() => {
    recruiterReadModelMocks.searchEmployerCandidates.mockReset();
  });

  it("renders recruiter-safe candidate detail for direct Career ID lookups", async () => {
    recruiterReadModelMocks.searchEmployerCandidates.mockResolvedValue({
      assistantMessage: "Resolved Alex Rivera directly.",
      candidates: [
        {
          actions: {
            careerIdUrl: "/employer/candidates?careerId=TAID-000123",
            profileUrl: "/employer/candidates?candidateId=tal_123",
            trustProfileUrl: "/share/token-123",
          },
          candidateId: "tal_123",
          careerId: "TAID-000123",
          credibility: {
            evidenceCount: 3,
            label: "High credibility",
            score: 91,
            verificationSignal: "Verified experience",
            verifiedExperienceCount: 2,
          },
          currentEmployer: "Northstar SaaS",
          currentRole: "Senior Product Manager",
          experienceHighlights: ["Built AI workflow tooling."],
          fullName: "Alex Rivera",
          headline: "Senior Product Manager",
          location: "Austin, TX",
          matchReason: "Exact Career ID lookup matched TAID-000123.",
          profileSummary: "Leads AI platform launches for B2B SaaS products.",
          ranking: {
            label: "Exact match",
            score: 100,
          },
          targetRole: "VP Product",
          topSkills: ["AI", "SaaS"],
        },
      ],
      diagnostics: {
        candidateCount: 1,
        filteredOutCount: 0,
        highCredibilityCount: 1,
        parsedSkillCount: 0,
        searchLatencyMs: 11,
      },
      generatedAt: "2026-04-10T00:00:00.000Z",
      panelCount: 1,
      query: {
        filters: {
          certifications: [],
          credibilityThreshold: null,
          education: null,
          industry: null,
          location: null,
          priorEmployers: [],
          skills: [],
          title: undefined,
          verificationStatus: [],
          verifiedExperienceOnly: false,
          workAuthorization: null,
          yearsExperienceMin: null,
        },
        inputMode: "free_text",
        normalizedPrompt: "taid-000123",
        parsedCriteria: {
          industryHints: [],
          location: null,
          priorEmployers: [],
          seniority: null,
          skillKeywords: [],
          titleHints: [],
          yearsExperienceMin: null,
        },
        prompt: "TAID-000123",
      },
      totalMatches: 1,
    });

    const EmployerCandidatesPage = (await import("@/app/employer/candidates/page")).default;

    render(
      await EmployerCandidatesPage({
        searchParams: Promise.resolve({
          careerId: "TAID-000123",
        }),
      }),
    );

    expect(recruiterReadModelMocks.searchEmployerCandidates).toHaveBeenCalledWith({
      limit: 1,
      prompt: "TAID-000123",
    });
    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Career ID")).toBeInTheDocument();
    expect(screen.getByText("TAID-000123")).toBeInTheDocument();
    expect(screen.getByText("Northstar SaaS")).toBeInTheDocument();
    const trustProfileLinks = screen.getAllByRole("link", { name: "Review trust profile" });

    expect(trustProfileLinks).toHaveLength(2);
    trustProfileLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/share/token-123");
    });
  });

  it("shows the recruiter-safe empty state when no identifier is provided", async () => {
    const EmployerCandidatesPage = (await import("@/app/employer/candidates/page")).default;

    render(
      await EmployerCandidatesPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(recruiterReadModelMocks.searchEmployerCandidates).not.toHaveBeenCalled();
    expect(screen.getByText("Ready for direct candidate lookup")).toBeInTheDocument();
  });
});
