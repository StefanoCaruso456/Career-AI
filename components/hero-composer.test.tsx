import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { landingContentByPersona } from "@/components/chat-home-shell-content";
import { HeroComposer } from "@/components/hero-composer";
import type {
  ChatConversation,
  ChatMessage,
  ChatProject,
  ChatWorkspacePersistence,
  ChatWorkspaceSnapshot,
  EmployerCandidateSearchResponseDto,
  JobPostingDto,
  JobsPanelResponseDto,
} from "@/packages/contracts/src";

const useChatAttachmentDraftsMock = vi.fn();

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

vi.mock("@/components/attachment-button", () => ({
  AttachmentButton: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
    <button className={className} onClick={onClick} type="button">
      Attach
    </button>
  ),
}));

vi.mock("@/components/chat-message-attachments", () => ({
  ChatMessageAttachments: () => null,
}));

vi.mock("@/components/file-upload-dropzone", () => ({
  FileUploadDropzone: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/components/prompt-composer-attachments", () => ({
  PromptComposerAttachments: () => null,
}));

vi.mock("@/components/use-chat-attachment-drafts", () => ({
  useChatAttachmentDrafts: () => useChatAttachmentDraftsMock(),
}));

function createWorkspaceSnapshot(projects: ChatProject[], conversations: ChatConversation[] = []): ChatWorkspaceSnapshot {
  const persistence: ChatWorkspacePersistence = {
    checkpointCount: 0,
    lastCheckpointAt: null,
    lastSavedAt: null,
    pendingMemoryJobs: 0,
  };

  return {
    conversations,
    persistence,
    projectPersistence: {},
    projects,
  };
}

function createProject(id: string, label: string): ChatProject {
  return {
    createdAt: "2026-04-10T00:00:00.000Z",
    id,
    label,
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

function createMessage(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return {
    attachments: [],
    content,
    createdAt: "2026-04-10T00:00:00.000Z",
    id,
    role,
  };
}

function createConversation(id: string, projectId: string, messages: ChatMessage[]): ChatConversation {
  return {
    createdAt: "2026-04-10T00:00:00.000Z",
    id,
    label: "New conversation",
    labelSource: "auto",
    messages,
    projectId,
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

function createJsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    json: async () => body,
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
  };
}

function createDeferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function createJobPosting(id: string, companyName: string, title: string): JobPostingDto {
  return {
    applyUrl: `https://jobs.example.com/${id}`,
    commitment: "Full Time",
    companyName,
    department: "Engineering",
    descriptionSnippet: `${title} at ${companyName}`,
    externalId: id,
    id,
    location: "Remote",
    postedAt: "2026-04-10T00:00:00.000Z",
    sourceKey: "greenhouse:example",
    sourceLabel: "Example jobs",
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    title,
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

function createJobsPanelResponse(prompt: string, jobs: JobPostingDto[]): JobsPanelResponseDto {
  return {
    assistantMessage: "Here are a few live roles worth reviewing.",
    agent: {
      clarificationQuestion: null,
      intent: "job_search",
      intentConfidence: 1,
      loopCount: 0,
      maxLoops: 2,
      resultQuality: jobs.length > 0 ? "acceptable" : "empty",
      selectedTool:
        prompt.toLowerCase() === "find new jobs for me." ? "browseLatestJobs" : "searchJobs",
      terminationReason: jobs.length > 0 ? "grounded_results_ready" : "jobs_search_completed_empty",
    },
    debugTrace: [],
    diagnostics: {
      duplicateCount: 0,
      filteredOutCount: 0,
      invalidCount: 0,
      searchLatencyMs: 24,
      sourceCount: 1,
      staleCount: 0,
    },
    generatedAt: "2026-04-10T00:00:00.000Z",
    jobs,
    panelCount: jobs.length,
    profileContext: null,
    query: {
      careerIdSignals: [],
      conversationContext: null,
      effectivePrompt: prompt,
      filters: {
        companies: [],
        employmentType: null,
        exclusions: [],
        industries: [],
        keywords: [],
        location: null,
        locations: [],
        postedWithinDays: null,
        role: null,
        roleFamilies: [],
        rankingBoosts: [],
        remotePreference: null,
        salaryMax: null,
        salaryMin: null,
        seniority: null,
        skills: [],
        targetJobId: null,
        workplaceType: null,
      },
      normalizedPrompt: prompt.toLowerCase(),
      prompt,
      usedCareerIdDefaults: false,
    },
    rail: {
      cards: jobs.map((job) => ({
        applyUrl: job.applyUrl,
        company: job.companyName,
        jobId: job.id,
        location: job.location,
        matchReason: job.matchSummary ?? "Grounded match from the live jobs inventory.",
        relevanceScore: job.relevanceScore ?? null,
        salaryText: job.salaryText ?? null,
        summary: job.descriptionSnippet ?? null,
        title: job.title,
        workplaceType: job.workplaceType ?? null,
      })),
      emptyState: jobs.length > 0 ? null : "No grounded job matches were found from the live inventory for the current search.",
    },
    totalMatches: jobs.length,
  };
}

function createEmployerCandidateResponse(
  prompt: string,
): EmployerCandidateSearchResponseDto {
  return {
    assistantMessage:
      "I ranked aligned Career ID candidates by title fit, skill overlap, and credibility.",
    candidates: [
      {
        actions: {
          careerIdUrl: "/employer/candidates?careerId=TAID-000123",
          profileUrl: "/employer/candidates?candidateId=tal_123",
          trustProfileUrl: "/share/0f0d4b93-15d2-4a2e-8297-9dc6165ddf75",
        },
        candidateId: "tal_123",
        careerId: "TAID-000123",
        credibility: {
          evidenceCount: 3,
          label: "High credibility",
          score: 88,
          verificationSignal: "Verified experience",
          verifiedExperienceCount: 2,
        },
        currentEmployer: "Northstar SaaS",
        currentRole: "Senior Product Manager",
        experienceHighlights: [
          "Built AI workflow tooling for enterprise SaaS teams.",
          "Verified employer-backed offer letter on file.",
        ],
        fullName: "Alex Rivera",
        headline: "Senior Product Manager",
        location: "Austin, TX",
        matchReason:
          "Title overlap around Senior Product Manager. Skill overlap on AI, product, SaaS.",
        profileSummary: "Leads AI platform launches for B2B SaaS products.",
        ranking: {
          label: "Strong match",
          score: 91,
        },
        targetRole: "Senior Product Manager",
        topSkills: ["AI", "Product", "SaaS"],
      },
    ],
    diagnostics: {
      candidateCount: 6,
      filteredOutCount: 5,
      highCredibilityCount: 2,
      parsedSkillCount: 3,
      searchLatencyMs: 14,
    },
    generatedAt: "2026-04-10T00:00:00.000Z",
    panelCount: 1,
    query: {
      filters: {
        certifications: [],
        credibilityThreshold: null,
        education: null,
        industry: null,
        location: "Austin, TX",
        priorEmployers: [],
        skills: ["AI", "SaaS"],
        title: "Senior Product Manager",
        verificationStatus: [],
        verifiedExperienceOnly: false,
        workAuthorization: null,
        yearsExperienceMin: null,
      },
      inputMode: "free_text",
      normalizedPrompt: prompt.toLowerCase(),
      parsedCriteria: {
        industryHints: [],
        location: "Austin, TX",
        priorEmployers: [],
        seniority: "senior",
        skillKeywords: ["ai", "saas", "product"],
        titleHints: ["Senior Product Manager"],
        yearsExperienceMin: null,
      },
      prompt,
    },
    totalMatches: 1,
  };
}

function getRequestUrl(input: string | URL | Request) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

describe("HeroComposer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useChatAttachmentDraftsMock.mockReturnValue({
      addFiles: vi.fn(),
      attachments: [],
      clearAttachments: vi.fn(),
      clearSelectionError: vi.fn(),
      detachAttachments: vi.fn(() => []),
      removeAttachment: vi.fn(),
      releaseDetachedAttachments: vi.fn(),
      restoreAttachments: vi.fn(),
      retryAttachment: vi.fn(),
      selectionError: null,
    });

    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (handle: number) => window.clearTimeout(handle),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });

    class ResizeObserverMock {
      disconnect() {}
      observe() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("refreshes the workspace and retries when the server rejects a stale project id", async () => {
    const staleProject = createProject("project_stale", "Verified profile");
    const freshProject = createProject("project_fresh", "Verified profile");
    const successfulConversation = createConversation("conversation_123", freshProject.id, [
      createMessage("message_user_123", "user", "How long does it take?"),
      createMessage("message_assistant_123", "assistant", "Most candidates finish the first pass in a few minutes."),
    ]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(createWorkspaceSnapshot([staleProject])))
      .mockResolvedValueOnce(
        createJsonResponse(
          { error: "Project was not found.", errorCode: "NOT_FOUND" },
          { ok: false, status: 404 },
        ),
      )
      .mockResolvedValueOnce(createJsonResponse(createWorkspaceSnapshot([freshProject])))
      .mockResolvedValueOnce(
        createJsonResponse({
          assistantMessage: successfulConversation.messages[1],
          conversation: successfulConversation,
          userMessage: successfulConversation.messages[0],
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    const composer = await screen.findByRole("textbox", { name: "Message composer" });

    await waitFor(() => {
      expect(composer).not.toBeDisabled();
    });

    fireEvent.change(composer, {
      target: {
        value: "How long does it take?",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const firstSendBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      projectId?: string;
    };
    const secondSendBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body ?? "{}")) as {
      projectId?: string;
    };

    expect(firstSendBody.projectId).toBe("project_stale");
    expect(secondSendBody.projectId).toBe("project_fresh");
    expect(await screen.findByText("Most candidates finish the first pass in a few minutes.")).toBeInTheDocument();
    expect(screen.queryByText("Project was not found.")).not.toBeInTheDocument();
  });

  it("keeps the composer editable while a reply is pending without allowing a second send", async () => {
    const project = createProject("project_verified_profile", "Verified profile");
    const firstConversation = createConversation("conversation_123", project.id, [
      createMessage("message_user_123", "user", "How does the agent help me get hired faster?"),
      createMessage(
        "message_assistant_123",
        "assistant",
        "You can keep drafting while I finish this answer.",
      ),
    ]);
    const pendingReply = createDeferredValue<
      ReturnType<typeof createJsonResponse>
    >();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(createWorkspaceSnapshot([project])))
      .mockImplementationOnce(() => pendingReply.promise);
 
    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    const composer = await screen.findByRole("textbox", { name: "Message composer" });

    await waitFor(() => {
      expect(composer).not.toBeDisabled();
    });

    fireEvent.change(composer, {
      target: {
        value: "How does the agent help me get hired faster?",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("button", { name: "Generating reply" })).toBeDisabled();
    expect(composer).not.toBeDisabled();
    expect(composer).toHaveValue("");

    fireEvent.change(composer, {
      target: {
        value: "Can it help me prioritize what to verify next?",
      },
    });

    expect(composer).toHaveValue("Can it help me prioritize what to verify next?");

    fireEvent.keyDown(composer, { key: "Enter" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    pendingReply.resolve(
      createJsonResponse({
        assistantMessage: firstConversation.messages[1],
        conversation: firstConversation,
        userMessage: firstConversation.messages[0],
      }),
    );

    expect(
      await screen.findByText("You can keep drafting while I finish this answer."),
    ).toBeInTheDocument();
    expect(composer).toHaveValue("Can it help me prioritize what to verify next?");
    expect(await screen.findByRole("button", { name: "Send message" })).not.toBeDisabled();
  });

  it("lets the active project collapse and re-expand its chat list", async () => {
    const project = createProject("project_verified_profile", "Verified profile");
    const conversation = {
      ...createConversation("conversation_sidebar", project.id, [
        createMessage("message_sidebar_user", "user", "Show me the latest updates."),
      ]),
      label: "Hiring intro chat",
    };

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(createWorkspaceSnapshot([project], [conversation]));
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    fireEvent.click(await screen.findByRole("button", { name: "Expand conversation sidebar" }));

    expect(await screen.findByText("Recent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hiring intro chat" })).toBeInTheDocument();

    const toggle = screen.getByRole("button", {
      name: "Collapse Verified profile chats",
    });

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByText("Recent")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Hiring intro chat" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand Verified profile chats" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand Verified profile chats" }));

    expect(await screen.findByText("Recent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hiring intro chat" })).toBeInTheDocument();
  });

  it("opens project rename mode from the active project actions menu", async () => {
    const project = createProject("project_verified_profile", "Verified profile");
    const conversation = {
      ...createConversation("conversation_sidebar", project.id, [
        createMessage("message_sidebar_user", "user", "Show me the latest updates."),
      ]),
      label: "Hiring intro chat",
    };

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(createWorkspaceSnapshot([project], [conversation]));
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    fireEvent.click(await screen.findByRole("button", { name: "Expand conversation sidebar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Project actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename project" }));

    const renameInput = await screen.findByRole("textbox", {
      name: "Rename project",
    });

    expect(renameInput).toHaveValue("Verified profile");
  });

  it("shows Find NEW Jobs first in the landing pill stack and uses it to open jobs assist", async () => {
    const workspace = createWorkspaceSnapshot([createProject("project_jobs", "Verified profile")]);
    const conversation = createConversation("conversation_jobs", "project_jobs", [
      createMessage("message_user_jobs", "user", "Find new jobs for me."),
      createMessage(
        "message_assistant_jobs",
        "assistant",
        "Here are a few live roles worth reviewing.",
      ),
    ]);
    const jobs = [
      createJobPosting("job_1", "Figma", "Business Recruiter"),
      createJobPosting("job_2", "OpenAI", "Product Designer"),
    ];

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(workspace);
      }

      if (url === "/api/chat/latest-jobs") {
        return createJsonResponse({
          assistantMessage: conversation.messages[1],
          conversation,
          jobsPanel: createJobsPanelResponse("Find new jobs for me.", jobs),
          userMessage: conversation.messages[0],
          workspace: createWorkspaceSnapshot([createProject("project_jobs", "Verified profile")], [
            conversation,
          ]),
        });
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    const findJobsPill = await screen.findByRole("button", { name: "Find NEW Jobs" });
    const firstQuestionPill = screen.getByRole("button", {
      name: "What does the agent actually do?",
    });

    expect(
      Boolean(findJobsPill.compareDocumentPosition(firstQuestionPill) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    fireEvent.click(findJobsPill);

    expect(await screen.findAllByRole("button", { name: "Find NEW Jobs" })).toHaveLength(1);
    expect(await screen.findAllByRole("button", { name: "APPLY" })).toHaveLength(2);
    expect(await screen.findByText("Business Recruiter")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/chat/latest-jobs")).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/chat")).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/v1/jobs/search")).toBe(false);
  });

  it("shows the jobs side panel for job-related prompts and renders live listings", async () => {
    const workspace = createWorkspaceSnapshot([createProject("project_jobs", "Verified profile")]);
    const conversation = createConversation("conversation_jobs", "project_jobs", [
      createMessage("message_user_jobs", "user", "Find jobs for AI product designers"),
      createMessage("message_assistant_jobs", "assistant", "Here are a few live roles worth reviewing."),
    ]);
    const jobs = [
      createJobPosting("job_1", "Figma", "Business Recruiter"),
      createJobPosting("job_2", "OpenAI", "Product Designer"),
    ];

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(workspace);
      }

      if (url === "/api/chat") {
        return createJsonResponse({
          assistantMessage: conversation.messages[1],
          conversation,
          userMessage: conversation.messages[0],
        });
      }

      if (url === "/api/v1/jobs/search") {
        return createJsonResponse(createJobsPanelResponse("Find jobs for AI product designers", jobs));
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    const composer = await screen.findByRole("textbox", { name: "Message composer" });

    fireEvent.change(composer, {
      target: {
        value: "Find jobs for AI product designers",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByLabelText("Jobs assist panel")).toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: "APPLY" })).toHaveLength(2);
    expect(await screen.findByText("Figma")).toBeInTheDocument();
    expect(await screen.findByText("Business Recruiter")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close jobs panel" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Jobs assist panel")).not.toBeInTheDocument();
    });

    expect(fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/v1/jobs/search")).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/chat/latest-jobs")).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/v1/jobs/latest")).toBe(false);
  });

  it("refreshes latest-jobs starter results through the dedicated latest jobs endpoint", async () => {
    const workspace = createWorkspaceSnapshot([createProject("project_jobs", "Verified profile")]);
    const conversation = createConversation("conversation_jobs", "project_jobs", [
      createMessage("message_user_jobs", "user", "Find new jobs for me."),
      createMessage(
        "message_assistant_jobs",
        "assistant",
        "Here are the newest live jobs across all connected sources.",
      ),
    ]);
    const initialJobs = [createJobPosting("job_1", "Figma", "Business Recruiter")];
    const refreshedJobs = [createJobPosting("job_2", "OpenAI", "Product Designer")];

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(workspace);
      }

      if (url === "/api/chat/latest-jobs") {
        return createJsonResponse({
          assistantMessage: conversation.messages[1],
          conversation,
          jobsPanel: createJobsPanelResponse("Find new jobs for me.", initialJobs),
          userMessage: conversation.messages[0],
          workspace: createWorkspaceSnapshot([createProject("project_jobs", "Verified profile")], [
            conversation,
          ]),
        });
      }

      if (url === "/api/v1/jobs/latest") {
        return createJsonResponse(createJobsPanelResponse("Find new jobs for me.", refreshedJobs));
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    fireEvent.click(await screen.findByRole("button", { name: "Find NEW Jobs" }));
    expect(await screen.findByText("Business Recruiter")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Find NEW Jobs" })[0]!);

    expect(await screen.findByText("Product Designer")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/v1/jobs/latest")).toBe(true);
  });

  it("shows the employer candidate rail instead of the jobs rail for sourcing prompts", async () => {
    const workspace = createWorkspaceSnapshot([createProject("project_employer", "Candidate pipeline")]);
    const conversation = createConversation("conversation_employer", "project_employer", [
      createMessage(
        "message_user_employer",
        "user",
        "Find aligned candidates for a Senior Product Manager role in Austin, TX with AI, SaaS.",
      ),
      createMessage(
        "message_assistant_employer",
        "assistant",
        "I ranked aligned Career ID candidates by title fit, skill overlap, and credibility.",
      ),
    ]);
    const candidatesResponse = createEmployerCandidateResponse(
      "Find aligned candidates for a Senior Product Manager role in Austin, TX with AI, SaaS.",
    );

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(workspace);
      }

      if (url === "/api/chat") {
        return createJsonResponse({
          assistantMessage: conversation.messages[1],
          candidatePanel: candidatesResponse,
          conversation,
          userMessage: conversation.messages[0],
        });
      }

      if (url === "/api/v1/employer/candidates/search") {
        return createJsonResponse(candidatesResponse);
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <HeroComposer
        content={landingContentByPersona.employer.heroComposer}
        persona="employer"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Find aligned candidates" }));
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Senior Product Manager" },
    });
    fireEvent.change(screen.getByLabelText("Skills"), {
      target: { value: "AI, SaaS" },
    });
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Austin, TX" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use brief" }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByLabelText("Candidate sourcing panel")).toBeInTheDocument();
    expect(await screen.findByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Career ID TAID-000123")).toBeInTheDocument();
    expect(
      screen.queryByText("Built AI workflow tooling for enterprise SaaS teams."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Review trust profile" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Career ID" })).toHaveAttribute(
      "href",
      "/employer/candidates?careerId=TAID-000123",
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(await screen.findByRole("dialog", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(
      screen.queryByText("Title overlap around Senior Product Manager. Skill overlap on AI, product, SaaS."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Built AI workflow tooling for enterprise SaaS teams."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review trust profile" })).toHaveAttribute(
      "href",
      "/share/0f0d4b93-15d2-4a2e-8297-9dc6165ddf75",
    );
    expect(screen.queryByRole("button", { name: "APPLY" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input]) => getRequestUrl(input) === "/api/v1/employer/candidates/search",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/v1/jobs/search"),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Close candidate sourcing panel" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Candidate sourcing panel")).not.toBeInTheDocument();
    });
  });

  it("resolves direct Career ID lookups into the employer candidate rail", async () => {
    const workspace = createWorkspaceSnapshot([createProject("project_employer", "Candidate pipeline")]);
    const conversation = createConversation("conversation_lookup", "project_employer", [
      createMessage("message_lookup_user", "user", "TAID-000123"),
      createMessage(
        "message_lookup_assistant",
        "assistant",
        "I resolved Alex Rivera directly from the provided identifier and loaded the recruiter-safe Career ID result.",
      ),
    ]);
    const candidatesResponse = createEmployerCandidateResponse("TAID-000123");

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(workspace);
      }

      if (url === "/api/chat") {
        return createJsonResponse({
          assistantMessage: conversation.messages[1],
          candidatePanel: candidatesResponse,
          conversation,
          userMessage: conversation.messages[0],
        });
      }

      if (url === "/api/v1/employer/candidates/search") {
        return createJsonResponse(candidatesResponse);
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <HeroComposer
        content={landingContentByPersona.employer.heroComposer}
        persona="employer"
      />,
    );

    const composer = await screen.findByRole("textbox", { name: "Message composer" });

    fireEvent.change(composer, {
      target: {
        value: "TAID-000123",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByLabelText("Candidate sourcing panel")).toBeInTheDocument();
    expect(await screen.findByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "APPLY" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input]) => getRequestUrl(input) === "/api/v1/employer/candidates/search",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/v1/jobs/search"),
    ).toBe(false);
  });

  it("keeps employer structured filters hidden until the recruiter opens them", async () => {
    const workspace = createWorkspaceSnapshot([createProject("project_employer", "Candidate pipeline")]);

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(workspace);
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <HeroComposer
        content={landingContentByPersona.employer.heroComposer}
        persona="employer"
      />,
    );

    expect(screen.queryByText("Tighten the sourcing brief")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Find aligned candidates" }));

    expect(await screen.findByText("Tighten the sourcing brief")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/chat"),
    ).toBe(false);
  });

  it("applies the employer sourcing brief into the composer without submitting", async () => {
    const workspace = createWorkspaceSnapshot([createProject("project_employer", "Candidate pipeline")]);

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(workspace);
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <HeroComposer
        content={landingContentByPersona.employer.heroComposer}
        persona="employer"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Find aligned candidates" }));
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Software Engineer" },
    });
    fireEvent.change(screen.getByLabelText("Skills"), {
      target: { value: "Python, React" },
    });
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Austin, TX" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use brief" }));

    expect(screen.queryByText("Tighten the sourcing brief")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message composer" })).toHaveValue(
      "Find aligned candidates for a Software Engineer role in Austin, TX with Python, React.",
    );
    expect(
      fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/chat"),
    ).toBe(false);
  });

  it("does not show the jobs side panel for non-job prompts", async () => {
    const workspace = createWorkspaceSnapshot([createProject("project_general", "Verified profile")]);
    const conversation = createConversation("conversation_general", "project_general", [
      createMessage("message_user_general", "user", "What does the agent actually do?"),
      createMessage("message_assistant_general", "assistant", "It helps candidates build a verifiable Career ID."),
    ]);

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);

      if (url === "/api/chat/state") {
        return createJsonResponse(workspace);
      }

      if (url === "/api/chat") {
        return createJsonResponse({
          assistantMessage: conversation.messages[1],
          conversation,
          userMessage: conversation.messages[0],
        });
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    const composer = await screen.findByRole("textbox", { name: "Message composer" });

    fireEvent.change(composer, {
      target: {
        value: "What does the agent actually do?",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("It helps candidates build a verifiable Career ID.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Find NEW Jobs" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => getRequestUrl(input) === "/api/v1/jobs/search")).toBe(false);

    const chatRequest = fetchMock.mock.calls.find(
      ([input]) => getRequestUrl(input) === "/api/chat",
    ) as [string | URL | Request, RequestInit?] | undefined;
    const chatRequestInit = chatRequest?.[1];
    const chatHeaders = chatRequestInit?.headers as Record<string, string> | undefined;

    expect(chatHeaders?.["x-request-id"]).toEqual(expect.any(String));
    expect(chatHeaders?.["x-trace-id"]).toEqual(expect.any(String));
  });
});
