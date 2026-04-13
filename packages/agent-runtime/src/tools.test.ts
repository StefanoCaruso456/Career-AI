import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { searchJobsCatalogMock, traceSpanMock } = vi.hoisted(() => ({
  searchJobsCatalogMock: vi.fn(),
  traceSpanMock: vi.fn(),
}));

vi.mock("@/lib/tracing", () => ({
  traceSpan: traceSpanMock,
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  searchJobsCatalog: searchJobsCatalogMock,
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

describe("agent tools", () => {
  beforeEach(() => {
    searchJobsCatalogMock.mockReset();
    traceSpanMock.mockReset();
    traceSpanMock.mockImplementation(
      (_options: unknown, callback: () => Promise<unknown> | unknown) => callback(),
    );
  });

  it("builds OpenAI function definitions from the registry", () => {
    const definitions = listAgentToolsAsOpenAIFunctions(homepageAssistantToolRegistry);

    expect(definitions).toEqual([
      expect.objectContaining({
        name: "search_jobs",
        strict: true,
        type: "function",
      }),
    ]);
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
      agentContext,
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
    expect(traceSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "tool.search_jobs.execute",
        tags: expect.arrayContaining(["tool:search_jobs"]),
      }),
      expect.any(Function),
    );
  });

  it("rejects invalid tool arguments", async () => {
    await expect(
      executeAgentToolCall({
        agentContext,
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
        agentContext,
        registry: gatedRegistry,
        toolCall: {
          arguments: JSON.stringify({ query: "hello" }),
          name: "gated_tool",
        },
      }),
    ).rejects.toBeInstanceOf(AgentToolPermissionError);
  });
});
