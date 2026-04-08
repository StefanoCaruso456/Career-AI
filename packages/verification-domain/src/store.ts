import type { ProvenanceRecord, VerificationRecord } from "@/packages/contracts/src";

type VerificationStore = {
  recordsById: Map<string, VerificationRecord>;
  recordIdByClaimId: Map<string, string>;
  provenanceByVerificationId: Map<string, ProvenanceRecord[]>;
};

declare global {
  // eslint-disable-next-line no-var
  var __taidVerificationStore: VerificationStore | undefined;
}

function createStore(): VerificationStore {
  return {
    recordsById: new Map(),
    recordIdByClaimId: new Map(),
    provenanceByVerificationId: new Map(),
  };
}

export function getVerificationStore(): VerificationStore {
  if (!globalThis.__taidVerificationStore) {
    globalThis.__taidVerificationStore = createStore();
  }

  return globalThis.__taidVerificationStore;
}

export function resetVerificationStore() {
  globalThis.__taidVerificationStore = createStore();
}
