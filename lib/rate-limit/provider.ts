import type { InternalAgentQuotaMetadata } from "@/packages/contracts/src";

type InMemoryQuotaState = {
  count: number;
  windowStartedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __careerAiRateLimitProviderStores: Map<string, Map<string, InMemoryQuotaState>> | undefined;
}

export type RateLimitConsumeArgs = {
  key: string;
  limit: number;
  now?: number;
  windowMs: number;
};

export type RateLimitConsumeResult = {
  allowed: boolean;
  quota: InternalAgentQuotaMetadata;
};

export type RateLimitProvider = {
  consume(args: RateLimitConsumeArgs): RateLimitConsumeResult;
  reset(): void;
};

function getProviderStores() {
  if (!globalThis.__careerAiRateLimitProviderStores) {
    globalThis.__careerAiRateLimitProviderStores = new Map();
  }

  return globalThis.__careerAiRateLimitProviderStores;
}

function buildQuota(args: {
  count: number;
  limit: number;
  windowMs: number;
  windowStartedAt: number;
}) {
  return {
    limit: args.limit,
    remaining: Math.max(0, args.limit - args.count),
    resetAt: new Date(args.windowStartedAt + args.windowMs).toISOString(),
    windowMs: args.windowMs,
  } satisfies InternalAgentQuotaMetadata;
}

export function createInMemoryRateLimitProvider(namespace: string): RateLimitProvider {
  function getStore() {
    const stores = getProviderStores();
    const existing = stores.get(namespace);

    if (existing) {
      return existing;
    }

    const created = new Map<string, InMemoryQuotaState>();
    stores.set(namespace, created);
    return created;
  }

  return {
    consume(args) {
      const now = args.now ?? Date.now();
      const store = getStore();
      const existing = store.get(args.key);

      if (!existing || now - existing.windowStartedAt >= args.windowMs) {
        const nextState: InMemoryQuotaState = {
          count: 1,
          windowStartedAt: now,
        };

        store.set(args.key, nextState);

        return {
          allowed: true,
          quota: buildQuota({
            count: nextState.count,
            limit: args.limit,
            windowMs: args.windowMs,
            windowStartedAt: nextState.windowStartedAt,
          }),
        };
      }

      if (existing.count >= args.limit) {
        return {
          allowed: false,
          quota: buildQuota({
            count: existing.count,
            limit: args.limit,
            windowMs: args.windowMs,
            windowStartedAt: existing.windowStartedAt,
          }),
        };
      }

      existing.count += 1;
      store.set(args.key, existing);

      return {
        allowed: true,
        quota: buildQuota({
          count: existing.count,
          limit: args.limit,
          windowMs: args.windowMs,
          windowStartedAt: existing.windowStartedAt,
        }),
      };
    },
    reset() {
      getProviderStores().set(namespace, new Map());
    },
  };
}
