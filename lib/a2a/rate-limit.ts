import type { InternalAgentRole, InternalAgentQuotaMetadata } from "@/packages/contracts/src";

type ExternalA2AQuotaState = {
  count: number;
  windowStartedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __careerAiExternalA2AQuotaStore: Map<string, ExternalA2AQuotaState> | undefined;
}

function getQuotaStore() {
  if (!globalThis.__careerAiExternalA2AQuotaStore) {
    globalThis.__careerAiExternalA2AQuotaStore = new Map();
  }

  return globalThis.__careerAiExternalA2AQuotaStore;
}

function parsePositiveInteger(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function readScopedLimit(agentType: InternalAgentRole | null) {
  if (agentType) {
    const scopedKey = `EXTERNAL_A2A_${agentType.toUpperCase()}_RATE_LIMIT_MAX_REQUESTS`;
    const scopedValue = parsePositiveInteger(process.env[scopedKey]);

    if (scopedValue) {
      return scopedValue;
    }
  }

  return parsePositiveInteger(process.env.EXTERNAL_A2A_RATE_LIMIT_MAX_REQUESTS) ?? 30;
}

function readScopedWindowMs(agentType: InternalAgentRole | null) {
  if (agentType) {
    const scopedKey = `EXTERNAL_A2A_${agentType.toUpperCase()}_RATE_LIMIT_WINDOW_MS`;
    const scopedValue = parsePositiveInteger(process.env[scopedKey]);

    if (scopedValue) {
      return scopedValue;
    }
  }

  return parsePositiveInteger(process.env.EXTERNAL_A2A_RATE_LIMIT_WINDOW_MS) ?? 60_000;
}

export function isExternalA2ARateLimitEnabled() {
  const configuredValue = process.env.EXTERNAL_A2A_RATE_LIMIT_ENABLED?.trim().toLowerCase();

  return configuredValue !== "0" && configuredValue !== "false";
}

export function resetExternalA2ARateLimitStore() {
  globalThis.__careerAiExternalA2AQuotaStore = new Map();
}

export function consumeExternalA2AQuota(args: {
  agentType: InternalAgentRole | null;
  callerId: string;
  callerName: string;
  now?: number;
  resource: string;
}) {
  const limit = readScopedLimit(args.agentType);
  const windowMs = readScopedWindowMs(args.agentType);
  const now = args.now ?? Date.now();

  if (!isExternalA2ARateLimitEnabled()) {
    return {
      allowed: true,
      quota: null,
    } as const;
  }

  const store = getQuotaStore();
  const key = [args.resource, args.callerName, args.callerId].join(":");
  const existing = store.get(key);

  if (!existing || now - existing.windowStartedAt >= windowMs) {
    const nextState: ExternalA2AQuotaState = {
      count: 1,
      windowStartedAt: now,
    };

    store.set(key, nextState);

    return {
      allowed: true,
      quota: {
        limit,
        remaining: Math.max(0, limit - nextState.count),
        resetAt: new Date(nextState.windowStartedAt + windowMs).toISOString(),
        windowMs,
      } satisfies InternalAgentQuotaMetadata,
    } as const;
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      quota: {
        limit,
        remaining: 0,
        resetAt: new Date(existing.windowStartedAt + windowMs).toISOString(),
        windowMs,
      } satisfies InternalAgentQuotaMetadata,
    } as const;
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    allowed: true,
    quota: {
      limit,
      remaining: Math.max(0, limit - existing.count),
      resetAt: new Date(existing.windowStartedAt + windowMs).toISOString(),
      windowMs,
    } satisfies InternalAgentQuotaMetadata,
  } as const;
}
