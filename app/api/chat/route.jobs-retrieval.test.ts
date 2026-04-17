import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabasePool } from "@/packages/persistence/src/client";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import { persistSourcedJobs } from "@/packages/persistence/src";
import { createEnrichedJobPosting } from "@/packages/jobs-domain/src/metadata";

const SEEDED_AT = "2026-04-16T18:00:00.000Z";

const mocks = vi.hoisted(() => ({
  createAssistantChatMessage: vi.fn(),
  createUserChatMessage: vi.fn(),
  generateHomepageAssistantReply: vi.fn(),
  jsonChatErrorResponse: vi.fn(),
  jsonChatResponse: vi.fn(),
  requiresCurrentExternalSearch: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  runJobSeekerAgent: vi.fn(),
  searchEmployerCandidates: vi.fn(),
  summarizeChatAttachmentsForAssistant: vi.fn(),
  traceSpan: vi.fn(),
  updateRequestTraceContext: vi.fn(),
  withTracedRoute: vi.fn(
    (_options: unknown, handler: (request: Request) => Promise<Response>) => handler,
  ),
}));

vi.mock("@/packages/job-seeker-agent/src", () => ({
  requiresCurrentExternalSearch: mocks.requiresCurrentExternalSearch,
  runJobSeekerAgent: mocks.runJobSeekerAgent,
}));

vi.mock("@/packages/recruiter-read-model/src", () => ({
  searchEmployerCandidates: mocks.searchEmployerCandidates,
}));

vi.mock("@/packages/homepage-assistant/src", () => ({
  generateHomepageAssistantReply: mocks.generateHomepageAssistantReply,
}));

vi.mock("@/packages/chat-domain/src", () => ({
  createAssistantChatMessage: mocks.createAssistantChatMessage,
  createUserChatMessage: mocks.createUserChatMessage,
  summarizeChatAttachmentsForAssistant: mocks.summarizeChatAttachmentsForAssistant,
}));

vi.mock("./route-helpers", () => ({
  jsonChatErrorResponse: mocks.jsonChatErrorResponse,
  jsonChatResponse: mocks.jsonChatResponse,
  resolveChatRouteContext: mocks.resolveChatRouteContext,
  traceSpan: mocks.traceSpan,
  updateRequestTraceContext: mocks.updateRequestTraceContext,
  withTracedRoute: mocks.withTracedRoute,
}));

import { POST } from "./route";

function createSeedJob(args: {
  companyName: string;
  descriptionSnippet?: string;
  id: string;
  location: string;
  postedAt: string;
  salaryText?: string | null;
  sourceKey: string;
  title: string;
}) {
  return createEnrichedJobPosting({
    applyUrl: `https://careers.${args.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com/jobs/${args.id}`,
    canonicalJobUrl: `https://careers.${args.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com/jobs/${args.id}`,
    commitment: "Full Time",
    companyName: args.companyName,
    department: "Product",
    descriptionSnippet:
      args.descriptionSnippet ??
      `${args.title} role using Python, SQL, and strong product judgment.`,
    externalId: args.id,
    id: args.id,
    ingestedAt: SEEDED_AT,
    location: args.location,
    postedAt: args.postedAt,
    rawPayload: {
      description:
        args.descriptionSnippet ??
        `${args.title} role using Python, SQL, and strong product judgment.`,
      salary: args.salaryText ?? null,
    },
    salaryText: args.salaryText ?? null,
    sourceKey: args.sourceKey,
    sourceLabel: args.companyName,
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    title: args.title,
    updatedAt: args.postedAt,
  });
}

async function seedPersistedCatalog() {
  const jobs = [
    createSeedJob({
      companyName: "OpenAI",
      id: "job_openai_austin_product",
      location: "Austin, TX",
      postedAt: "2026-04-15T12:00:00.000Z",
      salaryText: "$185,000 - $230,000 yearly",
      sourceKey: "greenhouse:openai",
      title: "Senior Product Manager",
    }),
    createSeedJob({
      companyName: "NVIDIA",
      descriptionSnippet: "Hybrid Austin role leading data product workflows with Python and SQL.",
      id: "job_nvidia_austin_product",
      location: "Austin, TX Hybrid",
      postedAt: "2026-04-16T13:00:00.000Z",
      salaryText: "$190,000 - $220,000 yearly",
      sourceKey: "workday:nvidia",
      title: "Product Manager",
    }),
    createSeedJob({
      companyName: "Apple",
      id: "job_apple_product",
      location: "Cupertino, CA",
      postedAt: "2026-04-14T10:00:00.000Z",
      salaryText: "$200,000 - $240,000 yearly",
      sourceKey: "greenhouse:apple",
      title: "Product Manager",
    }),
    createSeedJob({
      companyName: "CrowdStrike",
      descriptionSnippet: "Remote product role focused on detection engineering and platform security.",
      id: "job_crowdstrike_remote_product",
      location: "Remote US",
      postedAt: "2026-04-16T15:00:00.000Z",
      salaryText: "$210,000 - $250,000 yearly",
      sourceKey: "greenhouse:crowdstrike",
      title: "Senior Security Product Manager",
    }),
    createSeedJob({
      companyName: "CrowdStrike",
      descriptionSnippet: "Remote engineering role for platform telemetry and threat detection.",
      id: "job_crowdstrike_remote_engineer",
      location: "Remote US",
      postedAt: "2026-04-15T09:00:00.000Z",
      salaryText: "$175,000 - $215,000 yearly",
      sourceKey: "greenhouse:crowdstrike",
      title: "Senior Software Engineer",
    }),
  ];
  const sources = [
    {
      endpointLabel: "OpenAI Greenhouse",
      jobCount: 1,
      key: "greenhouse:openai",
      label: "OpenAI",
      lane: "ats_direct" as const,
      lastSyncedAt: SEEDED_AT,
      message: "Connected.",
      quality: "high_signal" as const,
      status: "connected" as const,
    },
    {
      endpointLabel: "NVIDIA Workday",
      jobCount: 1,
      key: "workday:nvidia",
      label: "NVIDIA",
      lane: "ats_direct" as const,
      lastSyncedAt: SEEDED_AT,
      message: "Connected.",
      quality: "high_signal" as const,
      status: "connected" as const,
    },
    {
      endpointLabel: "Apple Greenhouse",
      jobCount: 1,
      key: "greenhouse:apple",
      label: "Apple",
      lane: "ats_direct" as const,
      lastSyncedAt: SEEDED_AT,
      message: "Connected.",
      quality: "high_signal" as const,
      status: "connected" as const,
    },
    {
      endpointLabel: "CrowdStrike Greenhouse",
      jobCount: 2,
      key: "greenhouse:crowdstrike",
      label: "CrowdStrike",
      lane: "ats_direct" as const,
      lastSyncedAt: SEEDED_AT,
      message: "Connected.",
      quality: "high_signal" as const,
      status: "connected" as const,
    },
  ];

  await persistSourcedJobs({
    jobs,
    sources,
    syncedAt: SEEDED_AT,
  });
}

async function readLatestSearchEvent(prompt: string) {
  const result = await getDatabasePool().query<{
    candidate_counts_json: Record<string, number>;
    engine_version: string;
    latency_breakdown_ms_json: Record<string, number>;
    prompt: string;
    query_summary_json: Record<string, unknown>;
    result_count: number;
    result_job_ids_json: string[];
    widening_steps_json: string[];
    zero_result_reasons_json: string[];
  }>(
    `
      SELECT
        prompt,
        engine_version,
        query_summary_json,
        candidate_counts_json,
        widening_steps_json,
        zero_result_reasons_json,
        latency_breakdown_ms_json,
        result_count,
        result_job_ids_json
      FROM job_search_events
      WHERE prompt = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [prompt],
  );

  return result.rows[0] ?? null;
}

describe("POST /api/chat job-search retrieval integration", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.JOB_SEARCH_RETRIEVAL_V2_ENABLED = "true";

    await installTestDatabase();
    await seedPersistedCatalog();

    mocks.requiresCurrentExternalSearch.mockReturnValue(false);
    mocks.runJobSeekerAgent.mockRejectedValue(
      new Error("Force deterministic job-search fallback for integration coverage."),
    );
    mocks.searchEmployerCandidates.mockResolvedValue(null);
    mocks.generateHomepageAssistantReply.mockResolvedValue("generic homepage reply");
    mocks.summarizeChatAttachmentsForAssistant.mockReturnValue([]);
    mocks.resolveChatRouteContext.mockResolvedValue({
      actor: {
        actorType: "session_user",
        cookieValue: null,
        identity: {
          id: "user:test",
          kind: "authenticated_user",
          preferredPersona: "job_seeker",
          roleType: "candidate",
        },
        ownerId: "user:test",
        sessionId: "session:test",
        userId: "app_user_123",
      },
      agentContext: {
        ownerId: "user:test",
        run: {
          runId: "run_123",
        },
      },
      ownerId: "user:test",
      runContext: {
        runId: "run_123",
      },
      sessionId: "session:test",
      userId: "app_user_123",
    });
    mocks.createUserChatMessage.mockImplementation(
      async ({
        conversationId,
        message,
        projectId,
      }: {
        conversationId?: string | null;
        message: string;
        projectId: string;
      }) => ({
        assistantMessage: null,
        conversation: {
          id: conversationId ?? "conversation_123",
          messages: [{ content: message, role: "user" }],
          projectId,
        },
        userMessage: {
          attachments: [],
          content: message,
          createdAt: SEEDED_AT,
          id: "message_user_123",
          role: "user",
        },
        workspace: null,
      }),
    );
    mocks.createAssistantChatMessage.mockImplementation(
      async ({
        content,
        conversationId,
      }: {
        content: string;
        conversationId: string;
      }) => ({
        assistantMessage: {
          attachments: [],
          content,
          createdAt: SEEDED_AT,
          id: "message_assistant_123",
          role: "assistant",
        },
        conversation: {
          id: conversationId,
          messages: [],
          projectId: "project_123",
        },
        workspace: null,
      }),
    );
    mocks.jsonChatResponse.mockImplementation(
      (payload: unknown, _actor: unknown, init?: ResponseInit) => Response.json(payload, init),
    );
    mocks.jsonChatErrorResponse.mockImplementation(
      ({ fallbackMessage }: { fallbackMessage: string }) =>
        Response.json({ error: fallbackMessage }, { status: 500 }),
    );
    mocks.traceSpan.mockImplementation(
      async (_options: unknown, callback: () => Promise<unknown> | unknown) => callback(),
    );
    mocks.withTracedRoute.mockImplementation(
      (_options: unknown, handler: (request: Request) => Promise<Response>) => handler,
    );

    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        throw new Error("Unexpected live fetch during persisted-catalog retrieval.");
      });
  }, 30_000);

  afterEach(async () => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
    delete process.env.JOB_SEARCH_RETRIEVAL_V2_ENABLED;
    await resetTestDatabase();
  }, 30_000);

  it.each([
    {
      prompt: "find me new jobs in austin texas",
      verifyPanel: (jobsPanel: {
        jobs: Array<{ companyName: string; location: string | null }>;
        query: { filters: { location: string | null } };
      }) => {
        expect(jobsPanel.jobs.some((job) => job.location?.includes("Austin"))).toBe(true);
        expect(jobsPanel.query.filters.location?.toLowerCase()).toContain("austin");
      },
    },
    {
      prompt: "find product roles over 180k",
      verifyPanel: (jobsPanel: {
        jobs: Array<{ title: string }>;
        searchOutcome: { knownCompensationCount: number };
      }) => {
        expect(jobsPanel.jobs.length).toBeGreaterThan(0);
        expect(jobsPanel.jobs.some((job) => /product/i.test(job.title))).toBe(true);
        expect(jobsPanel.searchOutcome.knownCompensationCount).toBeGreaterThan(0);
      },
    },
    {
      prompt: "show me remote jobs at crowdstrike",
      verifyPanel: (jobsPanel: {
        jobs: Array<{ companyName: string; workplaceType: string | null }>;
        query: { filters: { companies: string[] } };
      }) => {
        expect(jobsPanel.jobs.length).toBeGreaterThan(0);
        expect(jobsPanel.jobs.every((job) => job.companyName === "CrowdStrike")).toBe(true);
        expect(jobsPanel.jobs.every((job) => job.workplaceType === "remote")).toBe(true);
        expect(jobsPanel.query.filters.companies).toContain("crowdstrike");
      },
    },
  ])("returns grounded jobsPanel results for '$prompt' through the chat route", async ({
    prompt,
    verifyPanel,
  }) => {
    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        body: JSON.stringify({
          attachmentIds: [],
          conversationId: null,
          message: prompt,
          persona: "job_seeker",
          projectId: "project_123",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = (await response.json()) as {
      assistantMessage: { content: string };
      jobsPanel: {
        agent: { resultQuality: string; selectedTool: string };
        assistantMessage: string;
        jobs: Array<{
          companyName: string;
          id: string;
          location: string | null;
          title: string;
          workplaceType?: string | null;
        }>;
        query: {
          filters: {
            companies: string[];
            location: string | null;
          };
        };
        querySummary: Record<string, unknown>;
        searchOutcome: {
          knownCompensationCount: number;
        };
      } | null;
    };

    expect(response.status).toBe(200);
    expect(mocks.runJobSeekerAgent).toHaveBeenCalledTimes(1);
    expect(payload.jobsPanel).not.toBeNull();
    expect(payload.jobsPanel?.jobs.length).toBeGreaterThan(0);
    expect(payload.jobsPanel?.querySummary).toBeTruthy();
    expect(payload.jobsPanel?.searchOutcome).toBeTruthy();
    expect(payload.jobsPanel?.agent.selectedTool).toBe("searchJobs");
    expect(payload.assistantMessage.content).toBe(payload.jobsPanel?.assistantMessage);
    verifyPanel(payload.jobsPanel as never);
    expect(fetchSpy).not.toHaveBeenCalled();

    const event = await readLatestSearchEvent(prompt);

    expect(event).not.toBeNull();
    expect(event?.engine_version).toBe("metadata_first_v2");
    expect(event?.result_count).toBeGreaterThan(0);
    expect(event?.query_summary_json).toEqual(expect.any(Object));
    expect(event?.candidate_counts_json).toEqual(expect.any(Object));
    expect(event?.latency_breakdown_ms_json).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
      }),
    );
    expect(Array.isArray(event?.widening_steps_json)).toBe(true);
    expect(Array.isArray(event?.zero_result_reasons_json)).toBe(true);
    expect(event?.result_job_ids_json).toEqual(
      payload.jobsPanel?.jobs.map((job) => job.id),
    );
  }, 35_000);
});
