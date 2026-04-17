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
    careerIdProfile: {
      userId: "tal_123",
      phases: [
        {
          key: "self_reported",
          title: "Self-reported",
          description: "Add your foundation profile details so the rest of your trust ladder has context.",
          status: "not_started",
          completedCount: 0,
          totalCount: 5,
          unlocked: true,
          evidence: [],
        },
        {
          key: "relationship_backed",
          title: "Relationship-backed",
          description: "Bring in referrals, endorsements, and trusted letters that add social proof.",
          status: "locked",
          completedCount: 0,
          totalCount: 3,
          unlocked: false,
          evidence: [],
        },
        {
          key: "document_backed",
          title: "Document-backed",
          description: "Verify a government ID or upload trusted documents to strengthen your Career ID.",
          status: "locked",
          completedCount: 0,
          totalCount: 8,
          unlocked: false,
          evidence: [],
        },
        {
          key: "signature_backed",
          title: "Signature-backed",
          description: "Add signed proof that carries stronger reviewer confidence.",
          status: "locked",
          completedCount: 0,
          totalCount: 4,
          unlocked: false,
          evidence: [],
        },
        {
          key: "institution_verified",
          title: "Institution-verified",
          description: "Anchor the profile to institution-issued verification and trusted identity providers.",
          status: "locked",
          completedCount: 0,
          totalCount: 4,
          unlocked: false,
          evidence: [],
        },
      ],
      badges: [],
    },
    documentVerification: {
      evidenceId: null,
      verificationId: null,
      status: "locked",
      unlocked: false,
      estimatedTimeLabel: "About 2 minutes",
      explanation:
        "We verify your government ID and compare it with a live selfie to strengthen your Career ID.",
      helperText: "Complete the earlier trust layers to unlock this phase.",
      ctaLabel: null,
      retryable: false,
      artifactLabel: null,
      recoveryHints: [
        "Use good lighting.",
        "Make sure your document is sharp and readable.",
        "Keep your full face visible during the live selfie.",
      ],
      result: null,
    },
  };
}

function unlockDocumentVerification(snapshot: CareerBuilderSnapshotDto) {
  snapshot.phaseProgress[0] = {
    ...snapshot.phaseProgress[0],
    completed: 5,
    started: 5,
    total: 5,
    isComplete: true,
    isCurrent: false,
    summary: "Self-reported foundation complete. Your Career ID can now level up with stronger proof.",
  };
  snapshot.phaseProgress[1] = {
    ...snapshot.phaseProgress[1],
    completed: 3,
    started: 3,
    total: 3,
    isComplete: true,
    isCurrent: false,
    summary: "Relationship-backed trust is now live inside your Career ID.",
  };
  snapshot.phaseProgress[2] = {
    ...snapshot.phaseProgress[2],
    isCurrent: true,
    summary:
      "We verify your government ID and compare it with a live selfie to strengthen your Career ID.",
  };
  snapshot.careerIdProfile.phases[0] = {
    ...snapshot.careerIdProfile.phases[0],
    status: "verified",
    completedCount: 5,
  };
  snapshot.careerIdProfile.phases[1] = {
    ...snapshot.careerIdProfile.phases[1],
    status: "verified",
    completedCount: 3,
    unlocked: true,
  };
  snapshot.careerIdProfile.phases[2] = {
    ...snapshot.careerIdProfile.phases[2],
    status: "not_started",
    unlocked: true,
  };
  snapshot.documentVerification = {
    ...snapshot.documentVerification,
    status: "not_started",
    unlocked: true,
    helperText:
      "We verify your government ID and compare it with a live selfie to strengthen your Career ID.",
    ctaLabel: "Verify your identity",
  };
}

describe("AgentBuilderWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the simplified hero without the summary cards", () => {
    render(<AgentBuilderWorkspace initialSnapshot={createSnapshot()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Career ID Badges" })).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Create the living credibility profile behind your verified career identity. Keep the progress rail in view, open the phase you want to strengthen, and save each trust signal directly into your Career ID.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("overall builder progress")).not.toBeInTheDocument();
    expect(screen.queryByText("uploaded evidence signals")).not.toBeInTheDocument();
    expect(screen.queryByText("strongest trust tier")).not.toBeInTheDocument();
    expect(screen.queryByText("Phase-based intake")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved to your Career ID")).not.toBeInTheDocument();
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

  it("uses pill navigation so a phase modal shows one evidence card at a time", async () => {
    render(<AgentBuilderWorkspace initialSnapshot={createSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: /relationship-backed/i }));

    const dialog = await screen.findByRole("dialog");

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).queryByText("Structured intake")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Relationship-backed")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Previous" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Referrals" })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "What hiring signal or opportunity context does this referral provide?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("What capability or outcome does this endorsement reinforce?"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Step 2: Endorsements" }));

    expect(screen.getByRole("heading", { level: 3, name: "Endorsements" })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("What capability or outcome does this endorsement reinforce?"),
    ).toBeInTheDocument();
  });

  it("shows education and certification uploads inside the document-backed modal", async () => {
    const snapshot = createSnapshot();
    unlockDocumentVerification(snapshot);

    render(<AgentBuilderWorkspace initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: /document-backed/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Education & certifications").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 3, name: "Diplomas and degrees" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", { name: "Step 3: Professional certifications" }),
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Professional certifications" }),
    ).toBeInTheDocument();
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
      expect(screen.getAllByText("5/5 ready").length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByRole("tab", { name: "Step 2: Driver's license" }));

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

  it("shows the government ID CTA once document-backed is unlocked", () => {
    const snapshot = createSnapshot();
    unlockDocumentVerification(snapshot);

    render(<AgentBuilderWorkspace initialSnapshot={snapshot} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Verify your identity" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verify your identity/i })).toBeInTheDocument();
    expect(screen.getAllByText("About 2 minutes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Driver's license + live selfie").length).toBeGreaterThan(0);
  });

  it("opens the guided verification modal from the document-backed CTA", async () => {
    const snapshot = createSnapshot();
    unlockDocumentVerification(snapshot);

    render(<AgentBuilderWorkspace initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: /verify your identity/i }));

    const dialog = await screen.findByRole("dialog");

    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { level: 2, name: "Strengthen your Career ID" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Driver's license + live selfie")).toBeInTheDocument();
  });

  it("renders the verified artifact inside the document-backed rail state", () => {
    const snapshot = createSnapshot();
    unlockDocumentVerification(snapshot);
    snapshot.careerIdProfile.phases[2] = {
      ...snapshot.careerIdProfile.phases[2],
      status: "verified",
      completedCount: 1,
    };
    snapshot.careerIdProfile.badges = [
      {
        id: "badge_gov_id",
        label: "Government ID verified",
        phase: "document_backed",
        status: "verified",
      },
    ];
    snapshot.documentVerification = {
      ...snapshot.documentVerification,
      status: "verified",
      ctaLabel: null,
      artifactLabel: "Government ID verified",
      helperText: "Government ID verified and added to your Career ID.",
      result: {
        verificationId: "career_id_ver_123",
        evidenceId: "career_id_evidence_123",
        status: "verified",
        checks: {
          documentAuthenticity: "pass",
          liveness: "pass",
          faceMatch: "pass",
        },
        confidenceBand: "high",
        provider: "persona",
        providerReferenceId: "inq_123",
        completedAt: "2026-04-10T12:00:00.000Z",
        retryable: false,
      },
    };

    render(<AgentBuilderWorkspace initialSnapshot={snapshot} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Government ID verified" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Government ID verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Webhook-confirmed from Persona").length).toBeGreaterThan(0);
  });
});
