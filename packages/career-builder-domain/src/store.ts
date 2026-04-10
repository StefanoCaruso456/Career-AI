import type { CareerEvidenceRecord, CareerProfileRecord } from "@/packages/contracts/src";

type CareerBuilderStore = {
  evidenceByTalentIdentityId: Map<string, Map<string, CareerEvidenceRecord>>;
  profileByTalentIdentityId: Map<string, CareerProfileRecord>;
};

declare global {
  // eslint-disable-next-line no-var
  var __careerBuilderStore: CareerBuilderStore | undefined;
}

function createStore(): CareerBuilderStore {
  return {
    evidenceByTalentIdentityId: new Map(),
    profileByTalentIdentityId: new Map(),
  };
}

export function getCareerBuilderStore(): CareerBuilderStore {
  if (!globalThis.__careerBuilderStore) {
    globalThis.__careerBuilderStore = createStore();
  }

  return globalThis.__careerBuilderStore;
}

export function resetCareerBuilderStore() {
  globalThis.__careerBuilderStore = createStore();
}

