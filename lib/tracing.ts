import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import {
  fetchObservedSpansForRoot,
  flushBraintrust,
  getBraintrustLogger,
  runWithBraintrustRootSpan,
  runWithCurrentBraintrustSpan,
  type BraintrustSpanLike,
} from "@/lib/braintrust";

type TraceSpanType = "function" | "llm" | "task";

type JsonRecord = Record<string, unknown>;
type TraceMetricRecord = Record<string, number>;

export type RequestTraceContext = {
  actorType: string | null;
  braintrustRootSpanId: string | null;
  method: string;
  ownerId: string | null;
  path: string;
  requestId: string;
  routeName: string;
  runId: string | null;
  sessionId: string | null;
  traceDebugRequested: boolean;
  traceId: string;
  userId: string | null;
};

type TraceSpanOptions<TResult> = {
  input?: unknown;
  metadata?: JsonRecord;
  metrics?: TraceMetricRecord | ((result: TResult) => TraceMetricRecord | undefined);
  name: string;
  output?: unknown | ((result: TResult) => unknown);
  tags?: string[];
  type?: TraceSpanType;
};

type TracedRouteOptions = {
  name: string;
  tags?: string[];
  type?: TraceSpanType;
};

const requestTraceContextStorage = new AsyncLocalStorage<RequestTraceContext>();

function isPromiseLike<TResult>(value: TResult | Promise<TResult>): value is Promise<TResult> {
  return Boolean(value) && typeof (value as Promise<TResult>).then === "function";
}

function readHeader(request: Request, headerName: string) {
  const value = request.headers.get(headerName)?.trim();
  return value ? value : undefined;
}

function normalizeUrlPath(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function createTraceIdentifier() {
  return crypto.randomUUID();
}

function isTraceDebugRequested(request: Request) {
  const value = readHeader(request, "x-trace-debug")?.toLowerCase();
  return value === "1" || value === "true";
}

function serializeError(error: unknown): JsonRecord {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? null,
      type: error.name,
    };
  }

  return {
    message: String(error),
    type: typeof error,
  };
}

function buildTraceMetadata(metadata?: JsonRecord) {
  const context = getRequestTraceContext();

  return {
    actor_type: context?.actorType ?? null,
    braintrust_root_span_id: context?.braintrustRootSpanId ?? null,
    http_method: context?.method ?? null,
    http_path: context?.path ?? null,
    owner_id: context?.ownerId ?? null,
    request_id: context?.requestId ?? null,
    route_name: context?.routeName ?? null,
    run_id: context?.runId ?? null,
    session_id: context?.sessionId ?? null,
    trace_id: context?.traceId ?? null,
    user_id: context?.userId ?? null,
    ...(metadata ?? {}),
  };
}

function buildTraceTags(tags: string[] = []) {
  const context = getRequestTraceContext();
  const tagSet = new Set<string>(tags.filter(Boolean));

  if (context?.routeName) {
    tagSet.add(`route:${context.routeName}`);
  }

  if (context?.method) {
    tagSet.add(`method:${context.method.toLowerCase()}`);
  }

  if (context?.actorType) {
    tagSet.add(`actor:${context.actorType}`);
  }

  return [...tagSet];
}

function filterTraceMetrics(metrics?: Record<string, number | null | undefined>) {
  if (!metrics) {
    return undefined;
  }

  const normalizedEntries = Object.entries(metrics).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );

  if (!normalizedEntries.length) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

function logSpanOutput<TResult>(
  options: TraceSpanOptions<TResult>,
  span: BraintrustSpanLike,
  result: TResult,
) {
  const output =
    typeof options.output === "function"
      ? options.output(result)
      : options.output;
  const metrics =
    typeof options.metrics === "function"
      ? filterTraceMetrics(options.metrics(result))
      : filterTraceMetrics(options.metrics);

  if (output === undefined && metrics === undefined) {
    return result;
  }

  span.log({
    metadata: buildTraceMetadata(options.metadata),
    metrics,
    output,
    tags: buildTraceTags(options.tags),
  });

  return result;
}

function logSpanError<TResult>(
  options: TraceSpanOptions<TResult>,
  span: BraintrustSpanLike,
  error: unknown,
): never {
  span.log({
    error: serializeError(error),
    metadata: buildTraceMetadata(options.metadata),
    tags: buildTraceTags(options.tags),
  });

  throw error;
}

export function getRequestTraceContext() {
  return requestTraceContextStorage.getStore() ?? null;
}

export function updateRequestTraceContext(
  patch: Partial<
    Omit<
      RequestTraceContext,
      "method" | "path" | "requestId" | "routeName" | "traceDebugRequested" | "traceId"
    >
  >,
) {
  const context = getRequestTraceContext();

  if (!context) {
    return null;
  }

  Object.assign(context, patch);
  return context;
}

export function traceSpan<TResult>(
  options: TraceSpanOptions<TResult>,
  callback: (span: BraintrustSpanLike) => TResult,
): TResult;
export function traceSpan<TResult>(
  options: TraceSpanOptions<TResult>,
  callback: (span: BraintrustSpanLike) => Promise<TResult>,
): Promise<TResult>;
export function traceSpan<TResult>(
  options: TraceSpanOptions<TResult>,
  callback: (span: BraintrustSpanLike) => TResult | Promise<TResult>,
) {
  const eventMetadata = buildTraceMetadata(options.metadata);
  const eventTags = buildTraceTags(options.tags);

  return runWithCurrentBraintrustSpan(
    (span) => {
      try {
        const result = callback(span);

        if (isPromiseLike(result)) {
          return result
            .then((value) => logSpanOutput(options, span, value))
            .catch((error) => logSpanError(options, span, error));
        }

        return logSpanOutput(options, span, result);
      } catch (error) {
        return logSpanError(options, span, error);
      }
    },
    {
      event: {
        input: options.input,
        metadata: eventMetadata,
        tags: eventTags,
      },
      name: options.name,
      type: options.type ?? "task",
    },
  );
}

export function withTracedRoute(
  options: TracedRouteOptions,
  handler: (request: Request) => Promise<Response>,
) {
  return async function tracedRoute(request: Request) {
    getBraintrustLogger();

    const requestId = readHeader(request, "x-request-id") ?? createTraceIdentifier();
    const traceId = readHeader(request, "x-trace-id") ?? requestId;
    const traceDebugRequested = isTraceDebugRequested(request);
    const routeContext: RequestTraceContext = {
      actorType: null,
      braintrustRootSpanId: null,
      method: request.method.toUpperCase(),
      ownerId: null,
      path: normalizeUrlPath(request.url),
      requestId,
      routeName: options.name,
      runId: null,
      sessionId: null,
      traceDebugRequested,
      traceId,
      userId: null,
    };

    let response!: Response;

    try {
      response = await runWithBraintrustRootSpan(
        async (rootSpan) =>
          requestTraceContextStorage.run(
            Object.assign(routeContext, {
              braintrustRootSpanId: rootSpan.rootSpanId,
            }),
            async () => {
              rootSpan.log({
                input: {
                  content_type: request.headers.get("content-type"),
                  method: routeContext.method,
                  path: routeContext.path,
                  request_id: requestId,
                  trace_id: traceId,
                  user_agent: request.headers.get("user-agent"),
                },
                metadata: buildTraceMetadata(),
                tags: buildTraceTags(options.tags),
              });

              try {
                const response = await handler(request);

                rootSpan.log({
                  metadata: buildTraceMetadata(),
                  output: {
                    ok: response.ok,
                    status: response.status,
                  },
                  tags: buildTraceTags(options.tags),
                });

                return response;
              } catch (error) {
                rootSpan.log({
                  error: serializeError(error),
                  metadata: buildTraceMetadata(),
                  tags: buildTraceTags(options.tags),
                });
                throw error;
              }
            },
          ),
        {
          name: options.name,
          type: options.type ?? "task",
        },
      );
    } finally {
      try {
        await flushBraintrust();
      } catch (error) {
        console.error("Braintrust flush failed after route completion.", error);
      }
    }

    if (!traceDebugRequested) {
      return response;
    }

    try {
      if (!routeContext.braintrustRootSpanId) {
        response.headers.set("x-braintrust-observed-error", "missing_root_span_id");
        return response;
      }

      const observed = await fetchObservedSpansForRoot({
        requestId: routeContext.requestId,
        rootSpanId: routeContext.braintrustRootSpanId,
      });

      if (!observed) {
        response.headers.set("x-braintrust-observed-error", "braintrust_disabled");
        return response;
      }

      response.headers.set("x-braintrust-observed-root-span-id", routeContext.braintrustRootSpanId);
      response.headers.set("x-braintrust-observed-project-id", observed.projectId);
      response.headers.set("x-braintrust-observed-span-count", String(observed.spans.length));

      if (observed.spans.length > 0) {
        response.headers.set(
          "x-braintrust-observed-span-names",
          observed.spans.map((span) => span.name).join(","),
        );
      }

      return response;
    } catch (error) {
      console.error("Braintrust live trace verification failed.", error);
      response.headers.set("x-braintrust-observed-error", "trace_query_failed");
      return response;
    }
  };
}

export function applyTraceResponseHeaders<T extends Response>(response: T) {
  const context = getRequestTraceContext();

  if (!context) {
    return response;
  }

  response.headers.set("x-request-id", context.requestId);
  response.headers.set("x-trace-id", context.traceId);

  if (context.runId) {
    response.headers.set("x-run-id", context.runId);
  }

  if (context.braintrustRootSpanId) {
    response.headers.set("x-braintrust-root-span-id", context.braintrustRootSpanId);
  }

  return response;
}
