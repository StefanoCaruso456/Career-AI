import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilderWorkspace } from "@/components/agent-builder-workspace";
import { builderEvidenceTemplates } from "@/packages/career-builder-domain/src/config";
import type { CareerBuilderSnapshotDto, CareerEvidenceRecord } from "@/packages/contracts/src";

function createEvidenceRecord(template: (typeof builderEvidenceTemplates)[number]): CareerEvidenceRecord {
  return {
    id: `record-${template.id}`,
    talentIdentityId: "tal_123",
    soulRecordId: "soul_123",
    templateId: template.id,
    completionTier: template.completionTier,
    sourceOrIssuer: "",
    issuedOn: "",
    validationContext: "",
    whyItMatters: "",
    files: [],
    status: "NOT_STARTED",
    createdAt: "2026-04-09T00:00:00.000Z",
    updatedAt: "2026-04-09T00:00:00.000Z",
  };
}

function createSnapshot(): CareerBuilderSnapshotDto {
  return {
    identity: {
      talentIdentityId: "tal_123",
      talentAgentId: "TAID-000123",
      soulRecordId: "soul_123",
      displayName: "Stefano Caruso",
      email: "stefano@example.com",
    },
    profile: {
      talentIdentityId: "tal_123",
      soulRecordId: "soul_123",
      legalName: "",
      careerHeadline: "",
      targetRole: "",
      location: "",
      coreNarrative: "",
      createdAt: "2026-04-09T00:00:00.000Z",
      updatedAt: "2026-04-09T00:00:00.000Z",
    },
    evidence: builderEvidenceTemplates.map((template) => createEvidenceRecord(template)),
    progress: {
      overallProgress: 0,
      completedEvidenceCount: 0,
      strongestTier: "self",
      nextUploads: [
        { templateId: "diplomas-degrees", title: "Diplomas and degrees" },
        { templateId: "professional-certifications", title: "Professional certifications" },
        { templateId: "transcripts", title: "Transcripts" },
      ],
    },
    phaseProgress: [
      {
        phase: "self",
        label: "Self-reported",
        completed: 0,
        started: 0,
        total: 5,
        isComplete: false,
        isCurrent: true,
        summary: "0/5 self-reported fields are ready.",
      },
      {
        phase: "relationship",
        label: "Relationship-backed",
        completed: 0,
        started: 0,
        total: 3,
        isComplete: false,
        isCurrent: false,
        summary: "Waiting on the earlier trust layers to complete first.",
      },
      {
        phase: "document",
        label: "Document-backed",
        completed: 0,
        started: 0,
        total: 7,
        isComplete: false,
        isCurrent: false,
        summary: "Waiting on the earlier trust layers to complete first.",
      },
      {
        phase: "signature",
        label: "Signature-backed",
        completed: 0,
        started: 0,
        total: 4,
        isComplete: false,
        isCurrent: false,
        summary: "Waiting on the earlier trust layers to complete first.",
      },
      {
        phase: "institution",
        label: "Institution-verified",
        completed: 0,
        started: 0,
        total: 4,
        isComplete: false,
        isCurrent: false,
        summary: "Waiting on the earlier trust layers to complete first.",
      },
    ],
  };
}

describe("AgentBuilderWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps dense intake off the main page and opens the requested phase modal", async () => {
    render(<AgentBuilderWorkspace initialSnapshot={createSnapshot()} />);

    expect(screen.queryByLabelText("Legal name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /self-reported/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Self-reported foundation" })).toBeInTheDocument();
    expect(screen.getByLabelText("Legal name")).toBeInTheDocument();
    expect(
      screen.queryByText("Capture the profile narrative before trust signals and evidence are attached."),
    ).not.toBeInTheDocument();

    const stepList = screen.getByRole("list", {
      name: "Self-reported foundation steps",
    });

    expect(within(stepList).getAllByText(/^[1-5]$/)).toHaveLength(5);
  });

  it("removes the duplicate phase section header when a modal only has one section", async () => {
    render(<AgentBuilderWorkspace initialSnapshot={createSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: /relationship-backed/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Structured intake")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Relationship signals that show how trusted people describe overlap, trust, and outcomes.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Referrals" })).toBeInTheDocument();
  });

  it("shows education and certification uploads inside the document-backed modal", async () => {
    render(<AgentBuilderWorkspace initialSnapshot={createSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: /document-backed/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Education & certifications" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Diplomas and degrees" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Professional certifications" })).toBeInTheDocument();
  });

  it("loads existing saved values into the phase modal", async () => {
    const snapshot = createSnapshot();
    snapshot.profile.legalName = "Stefano Caruso";
    snapshot.profile.careerHeadline = "Verified operator";

    render(<AgentBuilderWorkspace initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: /self-reported/i }));

    expect(await screen.findByDisplayValue("Stefano Caruso")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Verified operator")).toBeInTheDocument();
  });

  it("persists through the save route and updates visible progress", async () => {
    const initial = createSnapshot();
    const updated = createSnapshot();
    updated.profile.legalName = "Stefano Caruso";
    updated.profile.careerHeadline = "Verified operator";
    updated.profile.targetRole = "Founder";
    updated.profile.location = "Chicago, IL";
    updated.profile.coreNarrative = "Building a verifiable career record.";
    updated.progress.overallProgress = 29;
    updated.phaseProgress[0] = {
      ...updated.phaseProgress[0],
      completed: 5,
      started: 5,
      isComplete: true,
      isCurrent: false,
      summary: "Self-reported foundation complete. Your Career ID can now level up with stronger proof.",
    };
    updated.phaseProgress[1] = {
      ...updated.phaseProgress[1],
      isCurrent: true,
      summary: "Add a referral, endorsement, or trusted letter to unlock this phase.",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => updated,
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<AgentBuilderWorkspace initialSnapshot={initial} />);

    fireEvent.click(screen.getByRole("button", { name: /self-reported/i }));
    fireEvent.change(screen.getByLabelText("Legal name"), {
      target: { value: "Stefano Caruso" },
    });
    fireEvent.change(screen.getByLabelText("Career headline"), {
      target: { value: "Verified operator" },
    });
    fireEvent.change(screen.getByLabelText("Target role"), {
      target: { value: "Founder" },
    });
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Chicago, IL" },
    });
    fireEvent.change(screen.getByLabelText("Core narrative"), {
      target: { value: "Building a verifiable career record." },
    });

    fireEvent.click(screen.getByRole("button", { name: /save self-reported foundation/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Saved to your Career ID.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("29%")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Self-reported foundation complete. Your Career ID can now level up with stronger proof.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders inline validation when self-reported foundation is missing a legal name", async () => {
    render(<AgentBuilderWorkspace initialSnapshot={createSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: /self-reported/i }));
    fireEvent.change(screen.getByLabelText("Career headline"), {
      target: { value: "Verified operator" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save self-reported foundation/i }));

    expect(
      await screen.findByText(
        "Legal name is required once you start the self-reported foundation.",
      ),
    ).toBeInTheDocument();
  });

  it("closes the modal on Escape when there are no unsaved changes", async () => {
    render(<AgentBuilderWorkspace initialSnapshot={createSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: /relationship-backed/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("rejects non-image driver's license uploads before save", async () => {
    render(<AgentBuilderWorkspace initialSnapshot={createSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: /institution-verified/i }));

    const frontInput = document.getElementById(
      "upload-drivers-license-front",
    ) as HTMLInputElement | null;

    expect(frontInput).not.toBeNull();

    fireEvent.change(frontInput!, {
      target: {
        files: [new File(["hello"], "license.txt", { type: "text/plain" })],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /save institution-verified evidence/i }));

    expect(
      await screen.findByText("Driver's license uploads must be image files."),
    ).toBeInTheDocument();
  });
});
