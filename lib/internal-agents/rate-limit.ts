import type { InternalAgentRole, InternalAgentQuotaMetadata } from "@/packages/contracts/src";
import { createInMemoryRateLimitProvider } from "@/lib/rate-limit/provider";

const provider = createInMemoryRateLimitProvider("internal-agent");

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
  provider.reset();
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

  const key = [
    args.agentType,
    args.operation,
    args.serviceName,
    args.serviceActorId,
  ].join(":");
  const result = provider.consume({
    key,
    limit,
    now,
    windowMs,
  });

  return {
    allowed: result.allowed,
    quota: result.quota satisfies InternalAgentQuotaMetadata,
  } as const;
}
