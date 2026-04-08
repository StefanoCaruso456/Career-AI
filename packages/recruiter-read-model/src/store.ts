import type { RecruiterTrustProfile, TrustSummary } from "@/packages/contracts/src";

type RecruiterReadModelStore = {
  profilesById: Map<string, RecruiterTrustProfile>;
  profileIdByToken: Map<string, string>;
  trustSummariesById: Map<string, TrustSummary>;
};

declare global {
  // eslint-disable-next-line no-var
  var __taidRecruiterReadModelStore: RecruiterReadModelStore | undefined;
}

function createStore(): RecruiterReadModelStore {
  return {
    profilesById: new Map(),
    profileIdByToken: new Map(),
    trustSummariesById: new Map(),
  };
}

export function getRecruiterReadModelStore(): RecruiterReadModelStore {
  if (!globalThis.__taidRecruiterReadModelStore) {
    globalThis.__taidRecruiterReadModelStore = createStore();
  }

  return globalThis.__taidRecruiterReadModelStore;
}

export function resetRecruiterReadModelStore() {
  globalThis.__taidRecruiterReadModelStore = createStore();
}
