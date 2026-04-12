type MetricRecord = Record<string, number>;

type OpenAIResponsesUsage = {
  input_tokens?: number | null;
  input_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
  output_tokens?: number | null;
  output_tokens_details?: {
    reasoning_tokens?: number | null;
  } | null;
  total_tokens?: number | null;
};

type LangChainUsageMetadata = {
  input_token_details?: {
    cache_creation?: number | null;
    cache_read?: number | null;
  } | null;
  input_tokens?: number | null;
  output_token_details?: {
    reasoning?: number | null;
  } | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
};

type LangChainMessageLike = {
  usage_metadata?: LangChainUsageMetadata | null;
};

function readMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readElapsedSeconds(startedAtMs?: number, endedAtMs?: number) {
  if (startedAtMs === undefined) {
    return undefined;
  }

  const resolvedEndedAtMs = endedAtMs ?? Date.now();
  const elapsedMs = resolvedEndedAtMs - startedAtMs;

  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return undefined;
  }

  return elapsedMs / 1000;
}

function finalizeMetrics(metrics: Record<string, number | undefined>) {
  const promptTokens = metrics.prompt_tokens;
  const completionTokens = metrics.completion_tokens;

  if (metrics.tokens === undefined && promptTokens !== undefined && completionTokens !== undefined) {
    metrics.tokens = promptTokens + completionTokens;
  }

  return Object.fromEntries(
    Object.entries(metrics).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  ) as MetricRecord;
}

type MetricTimingOptions = {
  endedAtMs?: number;
  estimatedCost?: number | null;
  startedAtMs?: number;
};

export function buildOpenAIResponseMetrics(
  usage?: OpenAIResponsesUsage | null,
  options: MetricTimingOptions = {},
) {
  const metrics: Record<string, number | undefined> = {
    completion_reasoning_tokens: readMetric(usage?.output_tokens_details?.reasoning_tokens),
    completion_tokens: readMetric(usage?.output_tokens),
    estimated_cost: readMetric(options.estimatedCost),
    prompt_cached_tokens: readMetric(usage?.input_tokens_details?.cached_tokens),
    prompt_tokens: readMetric(usage?.input_tokens),
    time_to_first_token: readElapsedSeconds(options.startedAtMs, options.endedAtMs),
    tokens: readMetric(usage?.total_tokens),
  };

  return finalizeMetrics(metrics);
}

export function buildLangChainUsageMetrics(
  message?: LangChainMessageLike | null,
  options: MetricTimingOptions = {},
) {
  const usage = message?.usage_metadata;
  const metrics: Record<string, number | undefined> = {
    completion_reasoning_tokens: readMetric(usage?.output_token_details?.reasoning),
    completion_tokens: readMetric(usage?.output_tokens),
    estimated_cost: readMetric(options.estimatedCost),
    prompt_cache_creation_tokens: readMetric(usage?.input_token_details?.cache_creation),
    prompt_cached_tokens: readMetric(usage?.input_token_details?.cache_read),
    prompt_tokens: readMetric(usage?.input_tokens),
    time_to_first_token: readElapsedSeconds(options.startedAtMs, options.endedAtMs),
    tokens: readMetric(usage?.total_tokens),
  };

  return finalizeMetrics(metrics);
}
