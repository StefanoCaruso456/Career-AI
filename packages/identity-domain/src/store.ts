import type { PrivacySettings, SoulRecord, TalentIdentity } from "@/packages/contracts/src";

type IdentityStore = {
  nextTalentSequence: number;
  identitiesById: Map<string, TalentIdentity>;
  identitiesByEmail: Map<string, string>;
  soulRecordsByIdentityId: Map<string, SoulRecord>;
  privacySettingsByIdentityId: Map<string, PrivacySettings>;
};

declare global {
  // eslint-disable-next-line no-var
  var __taidIdentityStore: IdentityStore | undefined;
}

function createStore(): IdentityStore {
  return {
    nextTalentSequence: 1,
    identitiesById: new Map(),
    identitiesByEmail: new Map(),
    soulRecordsByIdentityId: new Map(),
    privacySettingsByIdentityId: new Map(),
  };
}

export function getIdentityStore(): IdentityStore {
  if (!globalThis.__taidIdentityStore) {
    globalThis.__taidIdentityStore = createStore();
  }

  return globalThis.__taidIdentityStore;
}

export function resetIdentityStore() {
  globalThis.__taidIdentityStore = createStore();
}
