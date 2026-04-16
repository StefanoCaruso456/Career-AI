import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createResponseMock,
  createTranscriptionMock,
  createAuditEventRecordMock,
  countPersistedAuditEventsMock,
  findPersistentContextByTalentIdentityIdMock,
  findPersistentRecruiterCandidateProjectionByLookupMock,
  findPersistentSharedRecruiterCandidateProjectionByLookupMock,
  getPersistentCareerBuilderProfileMock,
  isDatabaseConfiguredMock,
  openAIConstructorMock,
  searchEmployerCandidatesMock,
  searchJobsCatalogMock,
  listPersistentCareerBuilderEvidenceMock,
  traceSpanMock,
} = vi.hoisted(() => ({
  createResponseMock: vi.fn(),
  createTranscriptionMock: vi.fn(),
  createAuditEventRecordMock: vi.fn(),
  countPersistedAuditEventsMock: vi.fn(),
  findPersistentContextByTalentIdentityIdMock: vi.fn(),
  findPersistentRecruiterCandidateProjectionByLookupMock: vi.fn(),
  findPersistentSharedRecruiterCandidateProjectionByLookupMock: vi.fn(),
  getPersistentCareerBuilderProfileMock: vi.fn(),
  isDatabaseConfiguredMock: vi.fn(),
  openAIConstructorMock: vi.fn(),
  searchEmployerCandidatesMock: vi.fn(),
  searchJobsCatalogMock: vi.fn(),
  listPersistentCareerBuilderEvidenceMock: vi.fn(),
  traceSpanMock: vi.fn(),
}));

vi.mock("@/lib/tracing", () => ({
  traceSpan: traceSpanMock,
}));

vi.mock("@/lib/braintrust", () => ({
  getOpenAIClient: (apiKey: string) => {
    openAIConstructorMock({ apiKey });

    return {
      audio: {
        transcriptions: {
          create: createTranscriptionMock,
        },
      },
      responses: {
        create: createResponseMock,
      },
    };
  },
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  searchJobsCatalog: searchJobsCatalogMock,
}));

vi.mock("@/packages/persistence/src", () => ({
  countPersistedAuditEvents: countPersistedAuditEventsMock,
  createAuditEventRecord: createAuditEventRecordMock,
  findPersistentContextByTalentIdentityId: findPersistentContextByTalentIdentityIdMock,
  findPersistentRecruiterCandidateProjectionByLookup:
    findPersistentRecruiterCandidateProjectionByLookupMock,
  findPersistentSharedRecruiterCandidateProjectionByLookup:
    findPersistentSharedRecruiterCandidateProjectionByLookupMock,
  getPersistentCareerBuilderProfile: getPersistentCareerBuilderProfileMock,
  isDatabaseConfigured: isDatabaseConfiguredMock,
  listPersistentCareerBuilderEvidence: listPersistentCareerBuilderEvidenceMock,
}));

vi.mock("@/packages/recruiter-read-model/src", () => ({
  searchEmployerCandidates: searchEmployerCandidatesMock,
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation((config: { apiKey: string }) => {
    openAIConstructorMock(config);

    return {
      audio: {
        transcriptions: {
          create: createTranscriptionMock,
        },
      },
      responses: {
        create: createResponseMock,
      },
    };
  }),
}));

import {
  generateHomepageAssistantReply,
  generateHomepageAssistantReplyDetailed,
  getFallbackHomepageReply,
  OpenAIConfigError,
  OpenAIResponseError,
  transcribeHomepageAssistantAudio,
} from "@/packages/homepage-assistant/src";
import type { AgentContext } from "@/packages/agent-runtime/src";

const agentContext: AgentContext = {
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
      requestId: "request-123",
      routeName: "http.route.chat.post",
      traceId: "trace-123",
    },
  },
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
  organizationContext: null,
  ownerId: "guest:guest_123",
  preferredPersona: "job_seeker",
  roleType: null,
  run: agentContext.run,
};

describe("homepage assistant service", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;

  beforeEach(() => {
    createResponseMock.mockReset();
    createTranscriptionMock.mockReset();
    createAuditEventRecordMock.mockReset();
    countPersistedAuditEventsMock.mockReset();
    findPersistentContextByTalentIdentityIdMock.mockReset();
    findPersistentRecruiterCandidateProjectionByLookupMock.mockReset();
    findPersistentSharedRecruiterCandidateProjectionByLookupMock.mockReset();
    getPersistentCareerBuilderProfileMock.mockReset();
    isDatabaseConfiguredMock.mockReset();
    openAIConstructorMock.mockReset();
    searchEmployerCandidatesMock.mockReset();
    searchJobsCatalogMock.mockReset();
    listPersistentCareerBuilderEvidenceMock.mockReset();
    traceSpanMock.mockReset();
    traceSpanMock.mockImplementation(
      (_options: unknown, callback: () => Promise<unknown> | unknown) => callback(),
    );
    isDatabaseConfiguredMock.mockReturnValue(false);
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_MODEL;
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalModel;
    }
  });

  it("uses the OpenAI SDK with the configured key and default model", async () => {
    createResponseMock.mockResolvedValue({ output_text: "  Verification summary  " });

    await expect(generateHomepageAssistantReply("Summarize the product"))
      .resolves.toBe("Verification summary");

    expect(openAIConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-openai-key",
    });
    expect(createResponseMock).toHaveBeenCalledWith({
      model: "gpt-5",
      instructions: expect.stringContaining("Ground every answer in the truth"),
      input: "Summarize the product",
      store: false,
    });
    expect(createResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("Next steps"),
      }),
    );
    expect(traceSpanMock.mock.calls.map(([options]) => options.name)).toEqual(
      expect.arrayContaining([
        "workflow.homepage_assistant.reply",
        "llm.openai.responses.create",
      ]),
    );
  });

  it("includes attachment metadata in the assistant input when files are attached", async () => {
    createResponseMock.mockResolvedValue({ output_text: "  Attachment-aware reply  " });

    await expect(
      generateHomepageAssistantReply("Review these uploads", [
        {
          mimeType: "application/pdf",
          name: "offer-letter.pdf",
          size: 512000,
        },
        {
          mimeType: "text/csv",
          name: "scorecard.csv",
          size: 2048,
        },
      ]),
    ).resolves.toBe("Attachment-aware reply");

    expect(createResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("offer-letter.pdf"),
      }),
    );
    expect(createResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("scorecard.csv"),
      }),
    );
  });

  it("returns a deterministic fallback reply when the OpenAI key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      generateHomepageAssistantReply("Summarize the product"),
    ).resolves.toContain("Career AI");
    expect(openAIConstructorMock).not.toHaveBeenCalled();
    expect(traceSpanMock.mock.calls.map(([options]) => options.name)).toEqual(
      expect.arrayContaining([
        "workflow.homepage_assistant.reply",
        "llm.homepage.fallback",
      ]),
    );
  });

  it("falls back when the SDK returns an empty reply", async () => {
    createResponseMock.mockResolvedValue({ output_text: "   " });

    await expect(generateHomepageAssistantReply("Hello")).resolves.toBe(
      getFallbackHomepageReply("Hello"),
    );
  });

  it("falls back when the SDK request throws", async () => {
    createResponseMock.mockRejectedValue(new Error("upstream exploded"));
    const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      generateHomepageAssistantReply("How is this different from a resume builder?"),
    ).resolves.toBe(getFallbackHomepageReply("How is this different from a resume builder?"));

    consoleErrorMock.mockRestore();
  });

  it("injects safe user context and recent history when agent context is provided", async () => {
    createResponseMock.mockResolvedValue({ output_text: "  Context-aware reply  " });

    await expect(
      generateHomepageAssistantReply("What does this product do?", [], {
        agentContext,
        conversationMessages: [
          { content: "Hello there", role: "user" },
          { content: "I can help with that.", role: "assistant" },
          { content: "What does this product do?", role: "user" },
        ],
      }),
    ).resolves.toBe("Context-aware reply");

    expect(createResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("User context:"),
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "search_jobs",
            type: "function",
          }),
          expect.objectContaining({
            name: "get_career_id_summary",
            type: "function",
          }),
          expect.objectContaining({
            name: "search_candidates",
            type: "function",
          }),
        ]),
      }),
    );
    expect(createResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Recent chat history:"),
      }),
    );
  });

  it("supports a single tool-call round for search_jobs", async () => {
    createResponseMock
      .mockResolvedValueOnce({
        id: "resp_1",
        output: [
          {
            arguments: JSON.stringify({
              limit: 2,
              location: "Austin, TX",
              query: "backend engineer",
            }),
            call_id: "call_1",
            name: "search_jobs",
            type: "function_call",
          },
        ],
        output_text: "",
      })
      .mockResolvedValueOnce({
        output_text: "  Here are a couple of strong matches.  ",
      });
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

    await expect(
      generateHomepageAssistantReply("Find backend engineer jobs", [], {
        agentContext,
      }),
    ).resolves.toBe("Here are a couple of strong matches.");

    expect(createResponseMock).toHaveBeenCalledTimes(2);
    expect(createResponseMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: [
          expect.objectContaining({
            call_id: "call_1",
            output: expect.stringContaining("\"query\":\"backend engineer\""),
            type: "function_call_output",
          }),
        ],
        previous_response_id: "resp_1",
      }),
    );
    expect(traceSpanMock.mock.calls.map(([options]) => options.name)).toEqual(
      expect.arrayContaining([
        "workflow.homepage_assistant.reply",
        "llm.openai.responses.create",
        "tool.search_jobs.execute",
        "llm.openai.responses.create.tool_follow_up",
      ]),
    );
  });

  it("falls back safely if the tool round fails", async () => {
    createResponseMock.mockResolvedValue({
      id: "resp_1",
      output: [
        {
          arguments: JSON.stringify({
            query: "backend engineer",
          }),
          call_id: "call_1",
          name: "search_jobs",
          type: "function_call",
        },
      ],
      output_text: "",
    });
    searchJobsCatalogMock.mockRejectedValue(new Error("jobs search exploded"));
    const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      generateHomepageAssistantReply("Find backend engineer jobs", [], {
        agentContext,
      }),
    ).resolves.toBe(getFallbackHomepageReply("Find backend engineer jobs"));

    consoleErrorMock.mockRestore();
  });

  it("passes known tool permission errors back through the model follow-up round", async () => {
    createResponseMock
      .mockResolvedValueOnce({
        id: "resp_1",
        output: [
          {
            arguments: JSON.stringify({}),
            call_id: "call_1",
            name: "get_career_id_summary",
            type: "function_call",
          },
        ],
        output_text: "",
      })
      .mockResolvedValueOnce({
        output_text: "  Please sign in to access your Career ID summary.  ",
      });

    await expect(
      generateHomepageAssistantReply("Summarize my Career ID", [], {
        agentContext: guestAgentContext,
      }),
    ).resolves.toBe("Please sign in to access your Career ID summary.");

    expect(createResponseMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: [
          expect.objectContaining({
            output: expect.stringContaining("\"code\":\"forbidden\""),
            type: "function_call_output",
          }),
        ],
      }),
    );
  });

  it("supports bounded multi-step orchestration when explicitly enabled", async () => {
    createResponseMock
      .mockResolvedValueOnce({
        id: "resp_1",
        output: [
          {
            arguments: JSON.stringify({
              query: "backend engineer",
            }),
            call_id: "call_1",
            name: "search_jobs",
            type: "function_call",
          },
        ],
        output_text: "",
      })
      .mockResolvedValueOnce({
        id: "resp_2",
        output: [
          {
            arguments: JSON.stringify({
              location: "Austin, TX",
              query: "backend engineer",
            }),
            call_id: "call_2",
            name: "search_jobs",
            type: "function_call",
          },
        ],
        output_text: "",
      })
      .mockResolvedValueOnce({
        id: "resp_3",
        output: [],
        output_text: "  Here is the bounded loop answer.  ",
      });
    searchJobsCatalogMock.mockResolvedValue({
      results: [],
      totalCandidateCount: 0,
    });

    await expect(
      generateHomepageAssistantReplyDetailed("Find backend engineer jobs", [], {
        agentContext,
        runtimeMode: "bounded_loop",
      }),
    ).resolves.toMatchObject({
      source: "openai_bounded_loop",
      stepsUsed: 3,
      stopReason: "completed",
      text: "Here is the bounded loop answer.",
      toolCallsUsed: 2,
    });

    expect(createResponseMock).toHaveBeenCalledTimes(3);
    expect(traceSpanMock.mock.calls.map(([options]) => options.name)).toEqual(
      expect.arrayContaining([
        "workflow.homepage_assistant.reply",
        "workflow.homepage_assistant.orchestration",
        "workflow.agent.orchestration.step",
      ]),
    );
  });

  it("mentions attached files in the fallback response", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      generateHomepageAssistantReply("How is this different from a resume builder?", [
        {
          mimeType: "application/pdf",
          name: "offer-letter.pdf",
          size: 512000,
        },
      ]),
    ).resolves.toContain("offer-letter.pdf");
  });

  it("uses the deterministic Career ID explanation for the starter prompt before calling OpenAI", async () => {
    createResponseMock.mockResolvedValue({ output_text: "  model output that should not be used  " });

    await expect(
      generateHomepageAssistantReply("What does the agent actually do?"),
    ).resolves.toContain("turns your Career ID into a recruiter-ready trust layer");
    await expect(
      generateHomepageAssistantReply("What does the agent actually do?"),
    ).resolves.toContain("Next steps:");

    expect(createResponseMock).not.toHaveBeenCalled();
    expect(openAIConstructorMock).not.toHaveBeenCalled();
  });

  it("uses the deterministic secure identity explanation for the homepage starter prompt", async () => {
    createResponseMock.mockResolvedValue({ output_text: "  model output that should not be used  " });

    await expect(
      generateHomepageAssistantReply("Why is this a secure career identity platform?"),
    ).resolves.toContain("permission-based sharing");
    await expect(
      generateHomepageAssistantReply("Why is this a secure career identity platform?"),
    ).resolves.toContain("Next steps:");

    expect(createResponseMock).not.toHaveBeenCalled();
    expect(openAIConstructorMock).not.toHaveBeenCalled();
  });

  it("transcribes uploaded audio with the default transcription model", async () => {
    const file = new File(["voice"], "voice-note.webm", { type: "audio/webm" });
    createTranscriptionMock.mockResolvedValue({ text: "  spoken summary  " });

    await expect(transcribeHomepageAssistantAudio(file)).resolves.toBe("spoken summary");

    expect(createTranscriptionMock).toHaveBeenCalledWith({
      file,
      model: "gpt-4o-mini-transcribe",
    });
  });

  it("throws a response error when the transcription is empty", async () => {
    const file = new File(["voice"], "voice-note.webm", { type: "audio/webm" });
    createTranscriptionMock.mockResolvedValue({ text: "   " });

    await expect(transcribeHomepageAssistantAudio(file)).rejects.toBeInstanceOf(
      OpenAIResponseError,
    );
  });

  it("still requires an OpenAI key for transcription", async () => {
    const file = new File(["voice"], "voice-note.webm", { type: "audio/webm" });
    delete process.env.OPENAI_API_KEY;

    await expect(transcribeHomepageAssistantAudio(file)).rejects.toBeInstanceOf(
      OpenAIConfigError,
    );
    expect(openAIConstructorMock).not.toHaveBeenCalled();
  });
});
