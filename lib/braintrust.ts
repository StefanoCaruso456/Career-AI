import "server-only";

import { flush, initLogger, type Logger } from "braintrust";
import OpenAI from "openai";

const defaultBraintrustApiUrl = "https://api.braintrust.dev";
const defaultBraintrustProjectName = "Career AI";
const defaultBraintrustOrgName = "Gauntlet_AI";

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const braintrustProjectName =
  readEnv("BRAINTRUST_PROJECT") ?? defaultBraintrustProjectName;

export const braintrustOrgName =
  readEnv("BRAINTRUST_ORG_NAME") ?? defaultBraintrustOrgName;

export const braintrustApiUrl =
  (readEnv("BRAINTRUST_API_URL") ?? defaultBraintrustApiUrl).replace(/\/+$/, "");

const braintrustApiKey = readEnv("BRAINTRUST_API_KEY");
const braintrustAppUrl = readEnv("BRAINTRUST_APP_URL");

let loggerSingleton: Logger<true> | null | undefined;
let openAISingleton: OpenAI | undefined;
let projectIdSingleton: Promise<string | null> | null | undefined;

type BraintrustProjectSummary = {
  id?: string;
  name?: string;
};

type BraintrustProjectListResponse = {
  objects?: BraintrustProjectSummary[];
};

type BraintrustBtqlResponse = {
  rows?: Array<Record<string, unknown>>;
};

export type BraintrustObservedSpan = {
  name: string;
  requestId: string | null;
  rootSpanId: string | null;
  spanId: string;
  spanParents: string[];
  type: string | null;
};

type FetchObservedSpansArgs = {
  maxAttempts?: number;
  requestId: string;
  retryDelayMs?: number;
  rootSpanId: string;
};

function getBraintrustAuthHeaders() {
  if (!braintrustApiKey) {
    throw new Error("BRAINTRUST_API_KEY is required for Braintrust API calls.");
  }

  return {
    Authorization: `Bearer ${braintrustApiKey}`,
    "Content-Type": "application/json",
  };
}

function escapeBtqlString(value: string) {
  return value.replace(/'/g, "''");
}

function normalizeObservedSpan(row: Record<string, unknown>): BraintrustObservedSpan | null {
  const spanId = typeof row.span_id === "string" ? row.span_id : null;
  const name = typeof row.name === "string" ? row.name : null;

  if (!spanId || !name) {
    return null;
  }

  const spanParents = Array.isArray(row.span_parents)
    ? row.span_parents.filter((value): value is string => typeof value === "string")
    : [];

  return {
    name,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    rootSpanId: typeof row.root_span_id === "string" ? row.root_span_id : null,
    spanId,
    spanParents,
    type: typeof row.type === "string" ? row.type : null,
  };
}

async function fetchBraintrustJson<TResult>(
  path: string,
  init?: RequestInit,
): Promise<TResult> {
  const response = await fetch(`${braintrustApiUrl}${path}`, {
    ...init,
    headers: {
      ...getBraintrustAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Braintrust API request failed (${response.status} ${response.statusText}) for ${path}.`,
    );
  }

  return (await response.json()) as TResult;
}

async function waitFor(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function isBraintrustEnabled() {
  return Boolean(braintrustApiKey);
}

export function getBraintrustLogger() {
  if (loggerSingleton !== undefined) {
    return loggerSingleton;
  }

  if (!braintrustApiKey) {
    loggerSingleton = null;
    return loggerSingleton;
  }

  loggerSingleton = initLogger({
    apiKey: braintrustApiKey,
    appUrl: braintrustAppUrl,
    asyncFlush: true,
    orgName: braintrustOrgName,
    projectName: braintrustProjectName,
  });

  return loggerSingleton;
}

export function getOpenAIClient(apiKey: string) {
  if (openAISingleton) {
    return openAISingleton;
  }

  getBraintrustLogger();
  openAISingleton = new OpenAI({ apiKey });

  return openAISingleton;
}

export const getTracedOpenAIClient = getOpenAIClient;

export async function flushBraintrust() {
  if (!isBraintrustEnabled()) {
    return;
  }

  await flush();
}

export async function getBraintrustProjectId() {
  if (!isBraintrustEnabled()) {
    return null;
  }

  if (projectIdSingleton !== undefined) {
    return projectIdSingleton;
  }

  projectIdSingleton = (async () => {
    const logger = getBraintrustLogger();
    const loggerProjectId = logger ? (await logger.id)?.trim() : null;

    if (loggerProjectId) {
      return loggerProjectId;
    }

    const payload = await fetchBraintrustJson<BraintrustProjectListResponse>("/v1/project");
    const match = payload.objects?.find(
      (project) => project.name?.trim() === braintrustProjectName,
    );

    return match?.id?.trim() ?? null;
  })().catch((error) => {
    projectIdSingleton = undefined;
    throw error;
  });

  return projectIdSingleton;
}

export async function fetchObservedSpansForRoot(args: FetchObservedSpansArgs) {
  if (!isBraintrustEnabled()) {
    return null;
  }

  const projectId = await getBraintrustProjectId();

  if (!projectId) {
    throw new Error(
      `Braintrust project "${braintrustProjectName}" could not be resolved for live trace verification.`,
    );
  }

  const maxAttempts = args.maxAttempts ?? 12;
  const retryDelayMs = args.retryDelayMs ?? 500;
  let latestSpans: BraintrustObservedSpan[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const payload = await fetchBraintrustJson<BraintrustBtqlResponse>("/btql", {
      body: JSON.stringify({
        brainstore_realtime: true,
        brainstore_skip_backfill_check: true,
        fmt: "json",
        query: `
          SELECT
            span_id,
            root_span_id,
            span_parents,
            span_attributes.name AS name,
            span_attributes.type AS type,
            metadata.request_id AS request_id
          FROM project_logs('${escapeBtqlString(projectId)}', shape => 'spans')
          WHERE root_span_id = '${escapeBtqlString(args.rootSpanId)}'
          ORDER BY created ASC
        `,
        query_source: "career-ai.trace-debug",
        scope_to_root_span_id: args.rootSpanId,
      }),
      method: "POST",
    });

    latestSpans = (payload.rows ?? [])
      .map(normalizeObservedSpan)
      .filter((span): span is BraintrustObservedSpan => Boolean(span))
      .filter((span) => span.rootSpanId === args.rootSpanId);

    const sawWorkflowOrLlm = latestSpans.some(
      (span) => span.name.startsWith("workflow.") || span.name.startsWith("llm."),
    );

    if (sawWorkflowOrLlm || latestSpans.length >= 4 || attempt === maxAttempts - 1) {
      break;
    }

    await waitFor(retryDelayMs);
  }

  return {
    projectId,
    spans: latestSpans,
  };
}
