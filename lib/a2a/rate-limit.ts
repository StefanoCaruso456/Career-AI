import type { InternalAgentRole, InternalAgentQuotaMetadata } from "@/packages/contracts/src";
import { createInMemoryRateLimitProvider } from "@/lib/rate-limit/provider";

const provider = createInMemoryRateLimitProvider("external-a2a");

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
  provider.reset();
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

  const key = [args.resource, args.callerName, args.callerId].join(":");
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
