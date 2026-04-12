import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rootSpanLog = vi.fn();

  return {
    fetchObservedSpansForRoot: vi.fn(),
    flushBraintrust: vi.fn(),
    getBraintrustLogger: vi.fn(),
    rootSpanLog,
  };
});

vi.mock("braintrust", () => ({
  currentSpan: () => ({
    traced: (callback: (span: { log: ReturnType<typeof vi.fn> }) => unknown) =>
      callback({ log: vi.fn() }),
  }),
  traced: (
    callback: (span: { log: typeof mocks.rootSpanLog; rootSpanId: string }) => Promise<Response>,
  ) => callback({ log: mocks.rootSpanLog, rootSpanId: "root-span-123" }),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/braintrust", () => ({
  fetchObservedSpansForRoot: mocks.fetchObservedSpansForRoot,
  flushBraintrust: mocks.flushBraintrust,
  getBraintrustLogger: mocks.getBraintrustLogger,
}));

import { withTracedRoute } from "./tracing";

describe("withTracedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flushBraintrust.mockResolvedValue(undefined);
    mocks.fetchObservedSpansForRoot.mockResolvedValue({
      projectId: "project_123",
      spans: [
        {
          name: "http.route.chat.post",
          requestId: "req-123",
          rootSpanId: "root-span-123",
          spanId: "root-span-123",
          spanParents: [],
          type: "task",
        },
        {
          name: "workflow.homepage_assistant.reply",
          requestId: "req-123",
          rootSpanId: "root-span-123",
          spanId: "span-2",
          spanParents: ["root-span-123"],
          type: "task",
        },
      ],
    });
  });

  it("awaits flush before querying Braintrust when trace debug is requested", async () => {
    const steps: string[] = [];

    mocks.flushBraintrust.mockImplementation(async () => {
      steps.push("flush");
    });
    mocks.fetchObservedSpansForRoot.mockImplementation(async () => {
      steps.push("query");
      return {
        projectId: "project_123",
        spans: [
          {
            name: "http.route.chat.post",
            requestId: "req-123",
            rootSpanId: "root-span-123",
            spanId: "root-span-123",
            spanParents: [],
            type: "task",
          },
          {
            name: "workflow.homepage_assistant.reply",
            requestId: "req-123",
            rootSpanId: "root-span-123",
            spanId: "span-2",
            spanParents: ["root-span-123"],
            type: "task",
          },
        ],
      };
    });

    const tracedHandler = withTracedRoute(
      {
        name: "http.route.chat.post",
        type: "task",
      },
      async () => {
        steps.push("handler");
        return Response.json({ ok: true });
      },
    );

    const response = await tracedHandler(
      new Request("http://localhost/api/chat", {
        headers: {
          "x-request-id": "req-123",
          "x-trace-debug": "1",
          "x-trace-id": "trace-123",
        },
        method: "POST",
      }),
    );

    expect(steps).toEqual(["handler", "flush", "query"]);
    expect(response.headers.get("x-braintrust-observed-root-span-id")).toBe(
      "root-span-123",
    );
    expect(response.headers.get("x-braintrust-observed-span-count")).toBe("2");
    expect(response.headers.get("x-braintrust-observed-span-names")).toBe(
      "http.route.chat.post,workflow.homepage_assistant.reply",
    );
  });

  it("skips the Braintrust verification query when trace debug is not requested", async () => {
    const tracedHandler = withTracedRoute(
      {
        name: "http.route.chat.post",
        type: "task",
      },
      async () => Response.json({ ok: true }),
    );

    const response = await tracedHandler(
      new Request("http://localhost/api/chat", {
        headers: {
          "x-request-id": "req-123",
          "x-trace-id": "trace-123",
        },
        method: "POST",
      }),
    );

    expect(mocks.flushBraintrust).toHaveBeenCalledTimes(1);
    expect(mocks.fetchObservedSpansForRoot).not.toHaveBeenCalled();
    expect(response.headers.get("x-braintrust-observed-span-count")).toBeNull();
  });
});
