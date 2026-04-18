import type { RunnableConfig } from "@langchain/core/runnables";
import { RunnableLambda } from "@langchain/core/runnables";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { getAutonomousApplyLangSmithProjectName } from "@/packages/apply-domain/src";

export type ApplyTraceMetadata = {
  adapterId: string | null;
  atsFamily: string | null;
  companyName: string;
  failureCode: string | null;
  graphVersion: string;
  jobId: string;
  jobTitle: string;
  profileSnapshotId: string;
  runId: string;
  traceId: string;
  terminalState: string | null;
  userId: string;
};

function isLangSmithConfigured() {
  return Boolean(
    process.env.LANGSMITH_API_KEY?.trim() || process.env.LANGCHAIN_API_KEY?.trim(),
  );
}

function buildBaseTags(metadata: ApplyTraceMetadata) {
  return [
    "system:autonomous_apply",
    `run:${metadata.runId}`,
    `user:${metadata.userId}`,
    `job:${metadata.jobId}`,
    `company:${metadata.companyName}`,
    `title:${metadata.jobTitle}`,
    `trace:${metadata.traceId}`,
    `graph:${metadata.graphVersion}`,
    `ats:${metadata.atsFamily ?? "unknown"}`,
    `adapter:${metadata.adapterId ?? "unassigned"}`,
    `snapshot:${metadata.profileSnapshotId}`,
    `terminal:${metadata.terminalState ?? "pending"}`,
    `failure:${metadata.failureCode ?? "none"}`,
  ];
}

function normalizeMetadata(metadata: ApplyTraceMetadata) {
  return {
    adapterId: metadata.adapterId,
    atsFamily: metadata.atsFamily,
    companyName: metadata.companyName,
    failureCode: metadata.failureCode,
    graphVersion: metadata.graphVersion,
    jobId: metadata.jobId,
    jobTitle: metadata.jobTitle,
    profileSnapshotId: metadata.profileSnapshotId,
    runId: metadata.runId,
    traceId: metadata.traceId,
    terminalState: metadata.terminalState,
    userId: metadata.userId,
  };
}

export function buildApplyRunnableConfig(metadata: ApplyTraceMetadata): RunnableConfig {
  const config: RunnableConfig = {
    metadata: normalizeMetadata(metadata),
    tags: buildBaseTags(metadata),
  };

  if (isLangSmithConfigured()) {
    config.callbacks = [
      new LangChainTracer({
        projectName: getAutonomousApplyLangSmithProjectName(),
      }),
    ];
  }

  return config;
}

export function extendApplyRunnableConfig(
  baseConfig: RunnableConfig | undefined,
  args: {
    metadata?: Record<string, unknown>;
    name?: string;
    tags?: string[];
  },
) {
  return {
    ...baseConfig,
    metadata: {
      ...((baseConfig?.metadata as Record<string, unknown> | undefined) ?? {}),
      ...(args.metadata ?? {}),
    },
    runName: args.name ?? baseConfig?.runName,
    tags: [...(baseConfig?.tags ?? []), ...(args.tags ?? [])],
  } satisfies RunnableConfig;
}

export async function traceApplyTool<TInput, TResult>(args: {
  config?: RunnableConfig;
  input: TInput;
  invoke: (input: TInput) => Promise<TResult> | TResult;
  metadata?: Record<string, unknown>;
  name: string;
  tags?: string[];
}) {
  const runnable = RunnableLambda.from(args.invoke).withConfig({
    metadata: args.metadata,
    runName: args.name,
    tags: ["apply-tool", `tool:${args.name}`, ...(args.tags ?? [])],
  });

  return runnable.invoke(args.input, args.config);
}
