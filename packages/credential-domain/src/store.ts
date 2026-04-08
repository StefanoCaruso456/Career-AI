import type { Claim, EmploymentRecord } from "@/packages/contracts/src";

type CredentialStore = {
  claimsById: Map<string, Claim>;
  employmentRecordsByClaimId: Map<string, EmploymentRecord>;
};

declare global {
  // eslint-disable-next-line no-var
  var __taidCredentialStore: CredentialStore | undefined;
}

function createStore(): CredentialStore {
  return {
    claimsById: new Map(),
    employmentRecordsByClaimId: new Map(),
  };
}

export function getCredentialStore(): CredentialStore {
  if (!globalThis.__taidCredentialStore) {
    globalThis.__taidCredentialStore = createStore();
  }

  return globalThis.__taidCredentialStore;
}

export function resetCredentialStore() {
  globalThis.__taidCredentialStore = createStore();
}
