import type { InternalAgentRole, InternalAgentQuotaMetadata } from "@/packages/contracts/src";

type InternalAgentQuotaState = {
  count: number;
  windowStartedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __careerAiInternalAgentQuotaStore: Map<string, InternalAgentQuotaState> | undefined;
}

function getQuotaStore() {
  if (!globalThis.__careerAiInternalAgentQuotaStore) {
    globalThis.__careerAiInternalAgentQuotaStore = new Map();
  }

  return globalThis.__careerAiInternalAgentQuotaStore;
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

function readAgentScopedLimit(agentType: InternalAgentRole) {
  const scopedKey = `INTERNAL_AGENT_${agentType.toUpperCase()}_RATE_LIMIT_MAX_REQUESTS`;
  return (
    parsePositiveInteger(process.env[scopedKey]) ??
    parsePositiveInteger(process.env.INTERNAL_AGENT_RATE_LIMIT_MAX_REQUESTS) ??
    60
  );
}

function readAgentScopedWindowMs(agentType: InternalAgentRole) {
  const scopedKey = `INTERNAL_AGENT_${agentType.toUpperCase()}_RATE_LIMIT_WINDOW_MS`;
  return (
    parsePositiveInteger(process.env[scopedKey]) ??
    parsePositiveInteger(process.env.INTERNAL_AGENT_RATE_LIMIT_WINDOW_MS) ??
    60_000
  );
}

export function isInternalAgentRateLimitEnabled() {
  const configuredValue = process.env.INTERNAL_AGENT_RATE_LIMIT_ENABLED?.trim().toLowerCase();

  return configuredValue !== "0" && configuredValue !== "false";
}

export function resetInternalAgentRateLimitStore() {
  globalThis.__careerAiInternalAgentQuotaStore = new Map();
}

export function consumeInternalAgentQuota(args: {
  agentType: InternalAgentRole;
  now?: number;
  operation: string;
  serviceActorId: string;
  serviceName: string;
}) {
  const limit = readAgentScopedLimit(args.agentType);
  const windowMs = readAgentScopedWindowMs(args.agentType);
  const now = args.now ?? Date.now();

  if (!isInternalAgentRateLimitEnabled()) {
    return {
      allowed: true,
      quota: null,
    } as const;
  }

  const store = getQuotaStore();
  const key = [
    args.agentType,
    args.operation,
    args.serviceName,
    args.serviceActorId,
  ].join(":");
  const existing = store.get(key);

  if (!existing || now - existing.windowStartedAt >= windowMs) {
    const nextState: InternalAgentQuotaState = {
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
